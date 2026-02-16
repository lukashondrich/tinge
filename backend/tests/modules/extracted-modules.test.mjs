import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createLogger } from '../../src/utils/logger.js';
import { createCorsOptions } from '../../src/config/corsOptions.js';
import { createRequestLogger } from '../../src/middleware/requestLogger.js';
import { logServerStartup } from '../../src/logging/startupBanner.js';
import { createTokenHandler } from '../../src/routes/tokenRoute.js';
import { createTranscribeHandler } from '../../src/routes/transcribeRoute.js';
import { createKnowledgeSearchHandler } from '../../src/routes/knowledgeSearchRoute.js';
import { createCorrectionVerifyHandler } from '../../src/routes/correctionVerifyRoute.js';
import { createTokenUsageRouter } from '../../src/routes/tokenUsageRoutes.js';

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

async function invokeRouterRoute({
  router,
  method,
  path,
  params = {},
  body = {}
}) {
  const routeLayer = router.stack.find((layer) => (
    layer.route
    && layer.route.path === path
    && layer.route.methods[method.toLowerCase()]
  ));
  if (!routeLayer) {
    throw new Error(`Route not found for ${method.toUpperCase()} ${path}`);
  }

  const req = {
    method: method.toUpperCase(),
    url: path,
    params,
    body,
    headers: {}
  };
  const res = createMockRes();

  let index = 0;
  const stack = routeLayer.route.stack;
  const next = (err) => {
    if (err) throw err;
    const layer = stack[index];
    index += 1;
    if (!layer) return;
    return layer.handle(req, res, next);
  };

  await next();
  return res;
}

describe('backend extracted modules', () => {
  test('createLogger gates debug/log/info while keeping warn/error', () => {
    const calls = [];
    const sink = {
      log: (...args) => calls.push(['log', args]),
      info: (...args) => calls.push(['info', args]),
      debug: (...args) => calls.push(['debug', args]),
      warn: (...args) => calls.push(['warn', args]),
      error: (...args) => calls.push(['error', args])
    };

    const logger = createLogger('test-logger', {
      env: { TINGE_BACKEND_DEBUG_LOGS: '0' },
      sink
    });
    logger.log('hidden');
    logger.info('hidden');
    logger.debug('hidden');
    logger.warn('visible');
    logger.error('visible');
    assert.deepEqual(calls.map(([level]) => level), ['warn', 'error']);
  });

  test('createCorsOptions allows localhost and blocks unknown domains', () => {
    const logs = [];
    const corsOptions = createCorsOptions({
      frontendUrl: 'https://app.example.com',
      logger: { log: (...args) => logs.push(args) }
    });

    corsOptions.origin('http://localhost:5173', (err, allowed) => {
      assert.equal(err, null);
      assert.equal(allowed, true);
    });

    corsOptions.origin('https://evil.example.com', (err) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'Not allowed by CORS');
    });
    assert.equal(logs.length, 1);
  });

  test('createRequestLogger emits request line', () => {
    const logs = [];
    const middleware = createRequestLogger({
      logger: { log: (...args) => logs.push(args) },
      now: () => new Date('2026-02-15T12:00:00.000Z')
    });

    let called = false;
    middleware({ method: 'GET', url: '/health' }, {}, () => {
      called = true;
    });

    assert.equal(called, true);
    assert.equal(logs.length, 1);
    assert.match(logs[0][0], /^\[2026-02-15T12:00:00\.000Z\] GET \/health$/);
  });

  test('logServerStartup emits expected endpoint lines', () => {
    const lines = [];
    logServerStartup({
      logger: { log: (line) => lines.push(line) },
      port: 3000,
      hasApiKey: true
    });
    assert.ok(lines.some((line) => line.includes('Express server running on 3000')));
    assert.ok(lines.some((line) => line.includes('/health')));
    assert.ok(lines.some((line) => line.includes('/token')));
    assert.ok(lines.some((line) => line.includes('/transcribe')));
    assert.ok(lines.some((line) => line.includes('/knowledge/search')));
    assert.ok(lines.some((line) => line.includes('/corrections/verify')));
  });

  test('createTokenHandler maps missing API key to 500', async () => {
    const handler = createTokenHandler({
      fetchImpl: async () => ({ ok: true }),
      apiKey: '',
      tokenCounter: { initializeKey: () => ({}) },
      logger: { log: () => {}, error: () => {} }
    });
    const res = createMockRes();
    await handler({}, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.payload.error, 'API key not configured');
  });

  test('createTokenHandler returns mapped auth error', async () => {
    const handler = createTokenHandler({
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'bad key'
      }),
      apiKey: 'key',
      tokenCounter: { initializeKey: () => ({}) },
      logger: { log: () => {}, error: () => {} }
    });
    const res = createMockRes();
    await handler({}, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.payload.error, /Invalid API key/i);
  });

  test('createTokenHandler returns token payload with usage', async () => {
    const tokenUsage = { currentTokens: 0 };
    const handler = createTokenHandler({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ client_secret: { value: 'ephemeral-123' } })
      }),
      apiKey: 'key',
      tokenCounter: { initializeKey: () => tokenUsage },
      logger: { log: () => {}, error: () => {} }
    });
    const res = createMockRes();
    await handler({}, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.tokenUsage, tokenUsage);
  });

  test('createTranscribeHandler builds multipart request and responds with words/fullText', async () => {
    const appended = [];
    class FormDataCtor {
      append(...args) {
        appended.push(args);
      }
    }

    const handler = createTranscribeHandler({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          words: [{ word: 'hola', start: 0, end: 1 }],
          text: 'hola'
        })
      }),
      FormDataCtor,
      apiKeyProvider: () => 'key',
      logger: { error: () => {} }
    });
    const res = createMockRes();
    await handler({ file: { buffer: Buffer.from('audio') } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      words: [{ word: 'hola', start: 0, end: 1 }],
      fullText: 'hola'
    });
    assert.equal(appended.length, 4);
  });

  test('createKnowledgeSearchHandler validates query and maps timeout to 504', async () => {
    const handler = createKnowledgeSearchHandler({
      fetchImpl: async () => {
        const err = new Error('timeout');
        err.name = 'AbortError';
        throw err;
      },
      retrievalServiceUrl: 'http://retrieval',
      retrievalTimeoutMs: 1234,
      logger: { error: () => {} }
    });

    const badRes = createMockRes();
    await handler({ body: {} }, badRes);
    assert.equal(badRes.statusCode, 400);

    const timeoutRes = createMockRes();
    await handler({ body: { query_original: 'Barcelona' } }, timeoutRes);
    assert.equal(timeoutRes.statusCode, 504);
    assert.match(timeoutRes.payload.detail, /1234ms/);
  });

  test('createCorrectionVerifyHandler validates payload and maps timeout to 504', async () => {
    const handler = createCorrectionVerifyHandler({
      fetchImpl: async () => {
        const err = new Error('timeout');
        err.name = 'AbortError';
        throw err;
      },
      apiKeyProvider: () => 'test-key',
      verifyTimeoutMs: 2222,
      logger: { error: () => {} }
    });

    const badRes = createMockRes();
    await handler({ body: {} }, badRes);
    assert.equal(badRes.statusCode, 400);
    assert.match(badRes.payload.detail, /required non-empty strings/);

    const timeoutRes = createMockRes();
    await handler({
      body: {
        original: 'tengo hambre mucho',
        corrected: 'tengo mucha hambre',
        correction_type: 'grammar'
      }
    }, timeoutRes);
    assert.equal(timeoutRes.statusCode, 504);
    assert.match(timeoutRes.payload.detail, /2222ms/);
  });

  test('createCorrectionVerifyHandler returns structured verification payload', async () => {
    const handler = createCorrectionVerifyHandler({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  mistake: 'tengo hambre mucho',
                  correction: 'tengo mucha hambre',
                  rule: 'In Spanish this adjective agrees and comes before the noun.',
                  category: 'agreement + word order',
                  confidence: 0.95,
                  is_ambiguous: false
                })
              }
            }
          ]
        })
      }),
      apiKeyProvider: () => 'test-key',
      model: 'gpt-4o',
      nowIso: () => '2026-02-16T12:00:00.000Z',
      logger: { error: () => {} }
    });

    const res = createMockRes();
    await handler({
      body: {
        correction_id: 'corr-1',
        original: 'tengo hambre mucho',
        corrected: 'tengo mucha hambre',
        correction_type: 'grammar',
        learner_level: 'beginner',
        conversation_context: ['user: tengo hambre mucho', 'assistant: mejor seria...']
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.correction_id, 'corr-1');
    assert.equal(res.payload.model, 'gpt-4o');
    assert.equal(res.payload.verified_at, '2026-02-16T12:00:00.000Z');
    assert.equal(res.payload.confidence, 0.95);
    assert.equal(res.payload.is_ambiguous, false);
  });

  test('createTokenUsageRouter serves usage and updates estimated usage', async () => {
    const tokenCounter = {
      getUsage: (key) => (key === 'known' ? { currentTokens: 10 } : null),
      estimateTokensFromText: (text) => text.length,
      estimateTokensFromAudio: (seconds) => seconds,
      updateEstimatedTokens: (key, delta) => (key === 'known' ? { delta } : null),
      updateActualUsage: () => ({ ok: true }),
      getAllUsageStats: () => ({ totalKeys: 1 })
    };

    const router = createTokenUsageRouter({
      tokenCounter,
      jsonParser: (req, res, next) => next()
    });

    const usageRes = await invokeRouterRoute({
      router,
      method: 'get',
      path: '/token-usage/:ephemeralKey',
      params: { ephemeralKey: 'known' }
    });
    assert.equal(usageRes.statusCode, 200);
    assert.equal(usageRes.payload.currentTokens, 10);

    const missingRes = await invokeRouterRoute({
      router,
      method: 'get',
      path: '/token-usage/:ephemeralKey',
      params: { ephemeralKey: 'unknown' }
    });
    assert.equal(missingRes.statusCode, 404);

    const estimateRes = await invokeRouterRoute({
      router,
      method: 'post',
      path: '/token-usage/:ephemeralKey/estimate',
      params: { ephemeralKey: 'known' },
      body: { text: 'hola', audioDuration: 2 }
    });
    assert.equal(estimateRes.statusCode, 200);
    assert.equal(estimateRes.payload.delta, 6);

    const statsRes = await invokeRouterRoute({
      router,
      method: 'get',
      path: '/token-stats'
    });
    assert.equal(statsRes.statusCode, 200);
    assert.equal(statsRes.payload.totalKeys, 1);
  });
});
