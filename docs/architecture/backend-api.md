# Backend API Gateway

## Scope

Backend runtime in `backend/server.js` and extracted route/config modules in `backend/src/**`.

## Composition Root

`backend/server.js` responsibilities:
- load env and express app,
- apply CORS + request logging middleware,
- register feature routes,
- start HTTP listener.

Routes are intentionally delegated to extracted modules.

## Exposed Endpoints

- `GET /health`
- `GET /token`
- `POST /transcribe`
- `POST /knowledge/search`
- `GET /token-usage/:ephemeralKey`
- `POST /token-usage/:ephemeralKey/estimate`
- `POST /token-usage/:ephemeralKey/actual`
- `GET /token-stats`

## Route Modules

- Token endpoint:
- `backend/src/routes/tokenRoute.js`
- Transcribe proxy:
- `backend/src/routes/transcribeRoute.js`
- Retrieval proxy:
- `backend/src/routes/knowledgeSearchRoute.js`
- Token usage router:
- `backend/src/routes/tokenUsageRoutes.js`

Supporting modules:
- CORS policy builder: `backend/src/config/corsOptions.js`
- Request logger middleware: `backend/src/middleware/requestLogger.js`
- Startup banner: `backend/src/logging/startupBanner.js`
- Token accounting singleton: `backend/src/services/tokenCounter.js`
- Logger utility: `backend/src/utils/logger.js`

## Token Accounting Model

`tokenCounter` tracks per-ephemeral-key usage:
- estimated token deltas (fast feedback),
- actual usage (cumulative session usage from OpenAI events),
- per-key limit checks,
- rough cost estimation,
- periodic cleanup of inactive entries.

Important behavior:
- actual usage updates are treated as cumulative session totals, not additive deltas.

## Retrieval Proxy Normalization

`createKnowledgeSearchHandler(...)`:
- validates `query_original`,
- normalizes `query_en`, `language`, `top_k`,
- applies timeout with abort controller,
- maps timeout to HTTP 504,
- maps upstream failures to appropriate 4xx/5xx/502 responses.

## Operational Flags

- `OPENAI_API_KEY`
- `PORT`
- `FRONTEND_URL`
- `RETRIEVAL_SERVICE_URL`
- `RETRIEVAL_TIMEOUT_MS`
- `RETRIEVAL_FORCE_EN`
- `TOKEN_LIMIT_ENABLED`
- `MAX_TOKENS_PER_KEY`
- `TINGE_BACKEND_DEBUG_LOGS`

## Key Tests

- Module contract suite: `backend/tests/modules/extracted-modules.test.mjs`
- Legacy API suite: `backend/tests/api.test.js`, `backend/tests/server.test.js`
- Run via: `npm --prefix backend run test:modules`
