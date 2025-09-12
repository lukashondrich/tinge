const { chromium } = require('../shader-playground/node_modules/playwright');
const fs = require('fs');

(async () => {
  const log = [];
  let browser;
  let page;
  let heartbeat;
  let lastHeartbeat = { ready: null, ts: Date.now() };
  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: false });
    console.log('Creating page...');
    page = await browser.newPage();

    browser.on('disconnected', () => {
      const msg = { event: 'browser.disconnected' };
      console.error('Browser disconnected');
      log.push(msg);
    });

    page.on('close', () => {
      const msg = { event: 'page.close' };
      console.error('Page closed');
      log.push(msg);
    });

    page.on('crash', () => {
      const msg = { event: 'page.crash' };
      console.error('Page crashed');
      log.push(msg);
    });

    page.on('pageerror', (err) => {
      const msg = { event: 'page.error', message: err.message, stack: err.stack };
      console.error('Page error:', err);
      log.push(msg);
    });

    page.on('console', msg => {
      console.log('PAGE:', msg.text());
      log.push({ type: 'console', text: msg.text() });
    });

    page.on('requestfailed', req => {
      log.push({
        type: 'requestfailed',
        url: req.url(),
        error: req.failure() ? req.failure().errorText : undefined
      });
    });

    page.on('response', res => {
      const entry = { type: 'response', url: res.url(), status: res.status() };
      log.push(entry);
      if (!res.ok()) console.error('HTTP error', entry);
    });

    console.log('Navigating to page...');
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await page.goto('http://localhost:5173/?textMode=1', { timeout: 60000 });
      if (response && response.ok()) {
        try {
          const body = await response.body();
          if (body && body.length) break;
        } catch (_) {}
      }
      const entry = {
        type: 'navigation.error',
        status: response ? response.status() : 'no_response',
        attempt
      };
      log.push(entry);
      console.error('Navigation failed', entry);
      if (attempt === 1) return;
    }
    console.log('Page loaded, connecting realtime...');
    await page.evaluate(() => window.__connectRealtime());

    heartbeat = setInterval(async () => {
      if (page.isClosed()) return;
      const ready = await page.evaluate(() => window.__isDataChannelReady());
      lastHeartbeat = { ready, ts: Date.now() };
      log.push({ type: 'heartbeat', ...lastHeartbeat });
      if (!ready) {
        console.error('Data channel not ready; reconnecting');
        try {
          await page.evaluate(() => window.__connectRealtime());
        } catch (_) {}
      }
    }, 5000);

    console.log('Waiting for data channel to be ready...');
    await page.waitForFunction(() => window.__isDataChannelReady(), { timeout: 30000 });
    console.log('Data channel is ready!');

    console.log('Setting up logging and handlers...');
    await page.exposeBinding('recordMsg', (_src, msg) => log.push(msg));
    await page.evaluate(() => {
      window.__pageLog = [];
      window.__registerTranscriptHandler((m) => {
        window.__pageLog.push(m);
        window.recordMsg(m);
      });
    });

    const prompts = [
      'Hello there!',
      'Can you tell me a joke?'
    ];

    console.log('Starting conversation...');
    for (const prompt of prompts) {
      if (page.isClosed() || !browser.isConnected()) {
        const entry = {
          type: 'connection.lost',
          pageClosed: page.isClosed(),
          browserConnected: browser.isConnected()
        };
        log.push(entry);
        console.error('Connection issue', entry);
        break;
      }
      console.log(`Sending: "${prompt}"`);
      const prevAiMessages = await page.evaluate(() =>
        window.__pageLog.filter(msg => msg.speaker === 'ai').length
      );
      console.log(`Previous AI message count: ${prevAiMessages}`);
      await page.evaluate(t => window.__sendTestMessage(t), prompt);
      console.log('Waiting for AI response...');
      try {
        await page.waitForFunction(
          prevAiCount => window.__pageLog.filter(msg => msg.speaker === 'ai').length > prevAiCount,
          prevAiMessages,
          { timeout: 60000 }
        );
        console.log('AI response received!');
      } catch (err) {
        const entry = {
          type: 'waitForFunction.timeout',
          responses: log.filter(e => e.type === 'response'),
          lastHeartbeat
        };
        log.push(entry);
        console.error('waitForFunction timeout', entry);
        throw err;
      }
    }

    console.log('Conversation complete. Keeping browser open for 10 seconds...');
    await page.waitForTimeout(10000);
  } catch (err) {
    console.error(err.stack);
    log.push({ type: 'error', message: err.message, stack: err.stack });
    if (page) {
      try {
        await page.screenshot({ path: 'error_screenshot.png' });
        const pageLog = await page.evaluate(() => window.__pageLog || []);
        fs.writeFileSync('page_log.json', JSON.stringify(pageLog, null, 2));
      } catch (e) {
        console.error('Failed to capture diagnostics:', e);
      }
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (heartbeat) clearInterval(heartbeat);
    console.log('Writing conversation log...');
    fs.writeFileSync('conversation_log.json', JSON.stringify(log, null, 2));
    console.log('Done!');
  }
})();
