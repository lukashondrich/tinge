const { chromium } = require('../shader-playground/node_modules/playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const log = [];

  await page.goto('http://localhost:5173/?textMode=1', { timeout: 60000 });
  await page.evaluate(() => window.__connectRealtime());

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

  for (const prompt of prompts) {
    log.push({ role: 'user', text: prompt });
    const prev = await page.evaluate(() => window.__pageLog.length);
    await page.evaluate(t => window.__sendTestMessage(t), prompt);
    await page.waitForFunction(
      prevLen => window.__pageLog.length > prevLen,
      prev,
      { timeout: 60000 }
    );
  }

  await browser.close();
  fs.writeFileSync('conversation_log.json', JSON.stringify(log, null, 2));
})();
