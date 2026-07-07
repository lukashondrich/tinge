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
 *   node scripts/validate-realtime.mjs [--target=local|prod]
 *                                      [--scenario=connect|reconnect|audio|all|full]
 *                                      [--transport=webrtc|websocket|both] [--hostile]
 *
 * 'all' (default) = connect + reconnect: deterministic transport mechanics.
 * 'full' also runs the audio scenario (PTT → model audio response), which
 * depends on model behavior and may occasionally flake — run it when touching
 * the audio pipeline, not as the routine regression gate.
 *
 * --hostile launches Chrome with WebRTC's non-proxied UDP disabled — a rough
 * stand-in for the UDP-hostile user network. It cannot mimic that network's
 * blocked TURN relay path, but it verifies the websocket transport works when
 * direct UDP media is unavailable.
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
const TRANSPORT_ALIASES = { webrtc: 'webrtc', rtc: 'webrtc', websocket: 'websocket', ws: 'websocket' };
const TRANSPORTS = args.transport === 'both' || !args.transport
  ? ['webrtc', 'websocket']
  : [TRANSPORT_ALIASES[args.transport]];
if (TRANSPORTS.some((t) => !t)) {
  console.error(`Unknown --transport=${args.transport}; use webrtc|websocket|both`);
  process.exit(1);
}

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
      '--autoplay-policy=no-user-gesture-required',
      ...(args.hostile ? ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] : [])
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

    // Track realtime WebSockets so scenarios can force-drop the transport.
    window.__wss = [];
    const OrigWS = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
      if (String(url).includes('api.openai.com')) window.__wss.push(ws);
      return ws;
    };
    window.WebSocket.prototype = OrigWS.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      window.WebSocket[key] = OrigWS[key];
    }
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

// webrtc runs load the BARE url on purpose: webrtc is the app default, so
// those runs also cover the no-query-param transport resolution every real
// user hits. Only the websocket runs need the explicit param.
function transportUrl(url, transport) {
  if (transport === 'webrtc') return url;
  return `${url}${url.includes('?') ? '&' : '?'}transport=${transport}`;
}

async function scenarioConnect(url, transport) {
  return withPage(async (page, logs) => {
    const ok = await loadAndConnect(page, logs, transportUrl(url, transport));
    const carriers = transport === 'websocket'
      ? await page.evaluate(() => window.__wss.length)
      : await page.evaluate(() => window.__dcs.length);
    return {
      name: `connect[${transport}]`,
      pass: ok && carriers >= 1,
      detail: `established=${ok} ${transport === 'websocket' ? 'sockets' : 'dataChannels'}=${carriers}`
    };
  });
}

async function scenarioReconnect(url, transport) {
  return withPage(async (page, logs) => {
    const name = `reconnect[${transport}]`;
    const connected = await loadAndConnect(page, logs, transportUrl(url, transport));
    if (!connected) return { name, pass: false, detail: 'initial connect failed' };
    // Force-drop the live transport and confirm auto-reconnect with no input.
    if (transport === 'websocket') {
      await page.evaluate(() => window.__wss[window.__wss.length - 1].close());
    } else {
      await page.evaluate(() => window.__dcs[window.__dcs.length - 1].close());
    }
    const deadline = Date.now() + 25000;
    while (countEstablished(logs) < 2 && Date.now() < deadline) await sleep(250);
    const reconnected = countEstablished(logs) >= 2;
    const sawAuto = logs.some((l) => l.includes('Auto-reconnect attempt'));
    return {
      name,
      pass: reconnected && sawAuto,
      detail: `autoReconnectFired=${sawAuto} reEstablished=${reconnected}`
    };
  });
}

// End-to-end voice loop: PTT press (fake mic tone) → release → model audio
// streams back. Over websocket this exercises the manual PCM16 capture path
// and proves the API accepted our encoded audio; over webrtc the model audio
// rides the media track, so transcript deltas on the data channel are the proxy.
async function scenarioAudio(url, transport) {
  return withPage(async (page, logs) => {
    const name = `audio[${transport}]`;
    const connected = await loadAndConnect(page, logs, transportUrl(url, transport));
    if (!connected) return { name, pass: false, detail: 'initial connect failed' };

    await page.evaluate((t) => {
      window.__modelAudioEvents = 0;
      const marker = t === 'websocket'
        ? '"response.output_audio.delta"'
        : '"response.output_audio_transcript';
      const carrier = t === 'websocket'
        ? window.__wss[window.__wss.length - 1]
        : window.__dcs[window.__dcs.length - 1];
      carrier.addEventListener('message', (e) => {
        if (typeof e.data === 'string' && e.data.includes(marker)) window.__modelAudioEvents += 1;
      });
    }, transport);

    await page.dispatchEvent('#ptt-button', 'mousedown');
    await sleep(2500);
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup')));

    const deadline = Date.now() + 30000;
    let events = 0;
    while (events === 0 && Date.now() < deadline) {
      await sleep(500);
      events = await page.evaluate(() => window.__modelAudioEvents);
    }
    return { name, pass: events > 0, detail: `modelAudioEvents=${events}` };
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
  for (const transport of TRANSPORTS) {
    const wants = (s) => SCENARIO === s || SCENARIO === 'all' || SCENARIO === 'full';
    if (wants('connect')) results.push(await scenarioConnect(url, transport));
    if (wants('reconnect')) results.push(await scenarioReconnect(url, transport));
    // audio depends on the model responding to the fake-mic tone, so it is
    // excluded from the default gate ('all') to keep pass/fail deterministic.
    if (SCENARIO === 'audio' || SCENARIO === 'full') results.push(await scenarioAudio(url, transport));
  }

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
