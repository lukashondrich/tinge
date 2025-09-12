const { chromium } = require('../shader-playground/node_modules/playwright');
const fs = require('fs');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  console.log('Creating page...');
  const page = await browser.newPage();
  const log = [];

  console.log('Navigating to page...');
  await page.goto('http://localhost:5173/?textMode=1', { timeout: 60000 });
  console.log('Page loaded, connecting realtime...');
  await page.evaluate(() => window.__connectRealtime());

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

  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('console', msg => log.push({ type: 'console', text: msg.text() }));

  page.on('requestfailed', request => {
    const failure = request.failure();
    console.error('REQUEST FAILED:', request.url(), failure && failure.errorText);
    log.push({
      type: 'requestfailed',
      url: request.url(),
      error: failure && failure.errorText
    });
  });

  const prompts = [
    'Hello there!',
    'Can you tell me a joke?'
  ];

  console.log('Starting conversation...');
  for (const prompt of prompts) {
    console.log(`Sending: "${prompt}"`);
    const prevAiMessages = await page.evaluate(() => 
      window.__pageLog.filter(msg => msg.speaker === 'ai').length
    );
    console.log(`Previous AI message count: ${prevAiMessages}`);
    await page.evaluate(t => window.__sendTestMessage(t), prompt);
    console.log('Waiting for AI response...');
    await page.waitForFunction(
      prevAiCount => window.__pageLog.filter(msg => msg.speaker === 'ai').length > prevAiCount,
      prevAiMessages,
      { timeout: 60000 }
    );
    console.log('AI response received!');
  }

  console.log('Conversation complete. Keeping browser open for 10 seconds...');
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('Writing conversation log...');
  fs.writeFileSync('conversation_log.json', JSON.stringify(log, null, 2));
  console.log('Done!');
})();
