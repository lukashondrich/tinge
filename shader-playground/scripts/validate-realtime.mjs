/**
 * Realtime connection validation harness.
 *
 * Boots the backend + frontend locally (or targets a running URL), drives the
 * app in a headless browser, and validates the realtime connection lifecycle
 * without manual input. Use it to self-check connection + auto-reconnect logic
 * and catch regressions before asking a human to test on a real network.
 *
 * SCOPE: runs from this machine's network, which is not representative of a
 * UDP/relay-hostile network. It validates connection logic, the reconnect
 * state machine, and regressions — it cannot reproduce network-specific ICE
 * failures. Those still require a real device on the affected network.
 *
 * Usage:
 *   node scripts/validate-realtime.mjs [--target=local|prod] [--scenario=connect|reconnect|all]
 *   npm run validate:realtime
 *
 * Exit code 0 = all scenarios passed, 1 = a scenario failed or setup broke.
 */
/* eslint-disable no-console -- this is a CLI validation tool; console is its output */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const FRONTEND_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(REPO, 'backend');

const BACKEND_PORT = 3100; // off the default 3000 to avoid clashing with a dev server
const FRONTEND_PORT = 5199;
const PROD_URL = 'https://tingefrontend-production.up.railway.app';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const TARGET = args.target || 'local';
const SCENARIO = args.scenario || 'all';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const children = [];
function spawnProc(label, cmd, cmdArgs, opts) {
  const child = spawn(cmd, cmdArgs, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push({ label, child });
  const tag = (line) => line.split('\n').filter(Boolean).forEach((l) => log(`  (${label}) ${l}`));
  if (args.verbose) {
    child.stdout.on('data', (d) => tag(String(d)));
    child.stderr.on('data', (d) => tag(String(d)));
  }
  return child;
}
function cleanup() {
  for (const { child } of children) {
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
  }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

async function waitForHttp(url, timeoutMs, { expectStatus } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!expectStatus || res.status === expectStatus) return true;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  return false;
}

async function startLocalServers() {
  log('Starting backend on :' + BACKEND_PORT);
  spawnProc('backend', 'node', ['server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(BACKEND_PORT) }
  });
  if (!(await waitForHttp(`http://localhost:${BACKEND_PORT}/health`, 30000))) {
    throw new Error('backend did not become healthy on :' + BACKEND_PORT);
  }
  log('Backend healthy. Starting vite on :' + FRONTEND_PORT);
  spawnProc('vite', 'npx', ['vite', '--port', String(FRONTEND_PORT), '--strictPort'], {
    cwd: FRONTEND_DIR,
    env: { ...process.env, VITE_API_URL: `http://localhost:${BACKEND_PORT}` }
  });
  if (!(await waitForHttp(`http://localhost:${FRONTEND_PORT}/`, 30000, { expectStatus: 200 }))) {
    throw new Error('vite did not serve on :' + FRONTEND_PORT);
  }
  log('Frontend up.');
  return `http://localhost:${FRONTEND_PORT}/`;
}

async function withPage(fn) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });
  const context = await browser.newContext({ permissions: ['microphone'] });
  await context.addInitScript(() => {
    window.__dcs = [];
    const OrigPC = window.RTCPeerConnection;
    window.RTCPeerConnection = function (...a) {
      const pc = new OrigPC(...a);
      const origCreate = pc.createDataChannel.bind(pc);
      pc.createDataChannel = (...d) => { const dc = origCreate(...d); window.__dcs.push(dc); return dc; };
      return pc;
    };
    window.RTCPeerConnection.prototype = OrigPC.prototype;
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  try {
    return await fn(page, logs);
  } finally {
    await browser.close();
  }
}

const countEstablished = (logs) =>
  logs.filter((l) => l.includes('OpenAI Realtime connection fully established')).length;

async function loadAndConnect(page, logs, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#ptt-button', { timeout: 45000 });
  if (await page.$('#onboardingOverlay')) {
    await page.click('#onboardingDismiss').catch(() => {});
    await sleep(400);
  }
  // #sourcePanel can overlap the PTT button; dispatch the events the app binds.
  const press = async () => {
    await page.dispatchEvent('#ptt-button', 'mousedown');
    await sleep(120);
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup')));
  };
  await press();
  const deadline = Date.now() + 35000;
  while (countEstablished(logs) < 1 && Date.now() < deadline) await sleep(250);
  return countEstablished(logs) >= 1;
}

async function scenarioConnect(url) {
  return withPage(async (page, logs) => {
    const ok = await loadAndConnect(page, logs, url);
    const dcs = await page.evaluate(() => window.__dcs.length);
    return { name: 'connect', pass: ok, detail: `established=${ok} dataChannels=${dcs}` };
  });
}

async function scenarioReconnect(url) {
  return withPage(async (page, logs) => {
    const connected = await loadAndConnect(page, logs, url);
    if (!connected) return { name: 'reconnect', pass: false, detail: 'initial connect failed' };
    // Force-close the live data channel and confirm auto-reconnect with no input.
    await page.evaluate(() => window.__dcs[window.__dcs.length - 1].close());
    const deadline = Date.now() + 25000;
    while (countEstablished(logs) < 2 && Date.now() < deadline) await sleep(250);
    const reconnected = countEstablished(logs) >= 2;
    const sawAuto = logs.some((l) => l.includes('Auto-reconnect attempt'));
    return {
      name: 'reconnect',
      pass: reconnected && sawAuto,
      detail: `autoReconnectFired=${sawAuto} reEstablished=${reconnected}`
    };
  });
}

async function main() {
  let url;
  if (TARGET === 'prod') {
    url = PROD_URL;
    log('Target: production ' + url);
  } else {
    url = await startLocalServers();
    log('Target: local ' + url);
  }

  const results = [];
  if (SCENARIO === 'connect' || SCENARIO === 'all') results.push(await scenarioConnect(url));
  if (SCENARIO === 'reconnect' || SCENARIO === 'all') results.push(await scenarioReconnect(url));

  console.log('\n===== VALIDATION REPORT =====');
  let allPass = true;
  for (const r of results) {
    allPass = allPass && r.pass;
    console.log(`  ${r.pass ? '✅ PASS' : '❌ FAIL'}  ${r.name}  —  ${r.detail}`);
  }
  console.log('=============================');
  return allPass;
}

main()
  .then((ok) => { cleanup(); process.exit(ok ? 0 : 1); })
  .catch((err) => { console.error('VALIDATION ERROR:', err.message); cleanup(); process.exit(1); });
