# Retrieval Service

## Scope

FastAPI retrieval backend in `retrieval-service/app/**`.

## Entry Points

- API app: `retrieval-service/app/main.py`
- Retrieval engine: `retrieval-service/app/search.py`
- Corpus load/chunk build: `retrieval-service/app/indexing.py`
- Config/env: `retrieval-service/app/config.py`
- DTO models: `retrieval-service/app/models.py`
- Logger: `retrieval-service/app/logger.py`

## API Contract

- `GET /health`
- returns service status and Elasticsearch reachability.

- `POST /index`
- loads corpus JSONL,
- chunks documents,
- optionally hard-resets index,
- writes chunks to Elasticsearch-backed Haystack store.

- `POST /search`
- accepts `query_original`, optional `query_en`, optional `language`, optional `top_k`.
- returns ranked snippets + `used_queries` + `index_name`.

## Search Pipeline Behavior

`RetrievalService` initializes BM25 and optional dense retrieval.

BM25 modes:
- single query pipeline,
- dual query pipeline (`query_original` + `query_en`) with `DocumentJoiner`.

Dense mode (optional):
- sentence-transformer embedders,
- embedding retriever,
- BM25 + dense fusion via reciprocal rank fusion.

Fallback behavior:
- if pipeline graph init fails, fall back to direct BM25 run,
- if dense init/run fails, continue BM25-only,
- service stays available unless base document store is unavailable.

## Data and Corpus Policy

Canonical corpus policy is documented in:
- `retrieval-service/data/CORPUS_STORAGE_POLICY.md`

Policy enforcement:
- `retrieval-service/scripts/check_data_policy.py`
- allowlist: `retrieval-service/data/data_asset_allowlist.txt`
- CI check in `.github/workflows/ci.yml`

## Important Runtime Flags

- `ELASTICSEARCH_URL`
- `ELASTICSEARCH_INDEX`
- `DEFAULT_TOP_K`
- `MAX_TOP_K`
- `DEFAULT_CORPUS_PATH`
- `RETRIEVAL_QUERY_JOIN_MODE`
- `RETRIEVAL_BRANCH_TOP_K`
- `RETRIEVAL_LOG_TIMING`
- `RETRIEVAL_DENSE_ENABLED`
- `RETRIEVAL_WRITE_EMBEDDINGS`
- `RETRIEVAL_EMBED_MODEL`
- `RETRIEVAL_DENSE_TOP_K`
- `TINGE_RETRIEVAL_DEBUG_LOGS`

## Developer Surface

From `retrieval-service/`:
- `make format`
- `make lint`
- `make test`
- `make typecheck`
- `make check`
- `make data-policy`

Also see retrieval runbook and corpus workflows in:
- `retrieval-service/README.md`

## Key Tests

- `retrieval-service/tests/test_data_asset_policy.py`
- `retrieval-service/tests/test_logger.py`
- `retrieval-service/tests/test_settings.py`
