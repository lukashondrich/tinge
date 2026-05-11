# Embedding Service

## Scope

Word embedding coordinate service in `embedding-service/**`.

## Runtime Model

- Node process (`embedding-service/server.js`) exposes HTTP endpoints.
- On startup, Node spawns a persistent Python process (`compute_embedding.py --server`).
- Python keeps model/PCA state in memory and returns one JSON line per word request.
- Node keeps an in-memory + file-backed cache of embeddings.

## Endpoints

- `GET /health`
- `GET /embed-word?word=<token>`

`/embed-word` behavior:
1. check existing cache (`shader-playground/public/embedding.json`),
2. if present, return cached coordinates,
3. if not, forward word to Python worker,
4. append returned coordinate to cache file,
5. return coordinate payload.

## Python Worker Behavior

`compute_embedding.py`:
- attempts to load `gensim` GloVe model + sklearn PCA,
- precomputes PCA projection from `words.txt` seed list,
- for each input token, returns `{label, x, y, z}`.

Fallback behavior:
- if model/libs unavailable or word OOV in model, returns deterministic hash-based pseudo-random coordinates.

## Logging

Logger utility: `embedding-service/logger.js`.
- debug/info/log gated by `TINGE_EMBEDDING_DEBUG_LOGS=1`.
- warn/error always emitted.

## Operational Notes

- Python process exit drains pending requests with errors.
- Cache file path is shared with frontend public assets:
- `shader-playground/public/embedding.json`
- Endpoint currently uses `GET` query param contract (not JSON body).

## Test Coverage

- Current test file: `embedding-service/tests/embedding.test.js`
- This suite is mostly a mocked express app contract and not a full integration test of `server.js` + Python worker.
