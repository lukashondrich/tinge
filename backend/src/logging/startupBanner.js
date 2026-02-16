export function logServerStartup({
  logger = console,
  port,
  hasApiKey
} = {}) {
  logger.log('┌────────────────────────────────────┐');
  logger.log(`│    Express server running on ${port}    │`);
  logger.log('└────────────────────────────────────┘');
  logger.log(`API Key: ${hasApiKey ? '✓ Found' : '✗ Missing'}`);
  logger.log(`Health check: http://localhost:${port}/health`);
  logger.log(`Token endpoint: http://localhost:${port}/token`);
  logger.log(`Transcribe endpoint: http://localhost:${port}/transcribe`);
  logger.log(`Knowledge search endpoint: http://localhost:${port}/knowledge/search`);
}
