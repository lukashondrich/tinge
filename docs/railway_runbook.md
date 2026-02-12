# Railway Runbook (Frontend + Backend + Retrieval + Elasticsearch)

## Scope

This runbook captures the working production setup for:
- Frontend (shader-playground)
- Backend (Express API)
- Retrieval service (FastAPI + Haystack)
- Elasticsearch
- Optional embedding-service

## Current Live URLs

- Frontend: `https://tingefrontend-production.up.railway.app`
- Backend: `https://tingebackend-production.up.railway.app`
- Retrieval: `https://retrieval-service-production.up.railway.app`

## Service Order

Deploy in this order:
1. Elasticsearch
2. retrieval-service
3. backend
4. frontend
5. embedding-service (if used)

## Elasticsearch Service

Deploy as image (example): `elasticsearch:8.17.0`

Environment variables:

```env
discovery.type=single-node
xpack.security.enabled=false
xpack.license.self_generated.type=basic
ES_JAVA_OPTS=-Xms512m -Xmx512m
```

Port: `9200`

Note:
- For fastest demo stability, run without volume persistence first.
- If volume is enabled and startup fails with `node.lock` / permissions, remove volume for demo or fix ownership.

## Retrieval Service Variables

```env
PORT=3004
NODE_ENV=production
ELASTICSEARCH_URL=http://<ELASTICSEARCH_INTERNAL_HOST>:9200
ELASTICSEARCH_INDEX=tinge_knowledge_v1
DEFAULT_TOP_K=5
MAX_TOP_K=10
DEFAULT_CORPUS_PATH=/app/data/corpus.jsonl
RETRIEVAL_QUERY_JOIN_MODE=reciprocal_rank_fusion
RETRIEVAL_BRANCH_TOP_K=0
RETRIEVAL_LOG_TIMING=true
RETRIEVAL_DENSE_ENABLED=true
RETRIEVAL_WRITE_EMBEDDINGS=true
RETRIEVAL_EMBED_MODEL=sentence-transformers/all-MiniLM-L6-v2
RETRIEVAL_DENSE_TOP_K=8
```

One-time indexing after deploy:

```bash
curl -sS --max-time 1800 -X POST https://retrieval-service-production.up.railway.app/index \
  -H "Content-Type: application/json" \
  -d '{"recreate_index":true}'
```

Basic check:

```bash
curl -i https://retrieval-service-production.up.railway.app/health
```

Expected health field:
- `"elasticsearch_reachable": true`

## Backend Variables

```env
PORT=3000
NODE_ENV=production
OPENAI_API_KEY=<YOUR_OPENAI_API_KEY>
FRONTEND_URL=https://<YOUR_FRONTEND_RAILWAY_DOMAIN>
RETRIEVAL_SERVICE_URL=https://retrieval-service-production.up.railway.app
RETRIEVAL_FORCE_EN=true
RETRIEVAL_TIMEOUT_MS=8000
```

Backend checks:

```bash
curl -i https://tingebackend-production.up.railway.app/health
curl -i https://tingebackend-production.up.railway.app/token
curl -sS -X POST https://tingebackend-production.up.railway.app/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query_original":"Tell me about Barcelona architecture","top_k":5}'
```

## Frontend Variables

```env
VITE_API_URL=https://tingebackend-production.up.railway.app
VITE_EMBEDDING_URL=https://<YOUR_EMBEDDING_SERVICE_URL>
```

## Optional Embedding Service Variables

```env
PORT=3001
NODE_ENV=production
```

## End-to-End Acceptance

1. Open frontend URL.
2. Use push-to-talk for factual prompts (EN + ES).
3. Confirm:
- no network errors
- response is grounded
- sources panel is clickable
- citation numbering remains stable across turns

## Troubleshooting

### `elasticsearch_reachable:false`
- Elasticsearch not running, or `ELASTICSEARCH_URL` points to wrong host.
- Verify Railway internal hostname and port `9200`.

### `POST /index` returns `499`
- Request was interrupted/timed out before completion.
- Run one indexing request at a time and wait for completion.

### Elasticsearch startup fails with `node.lock` / access denied
- Volume permissions issue on `/usr/share/elasticsearch/data`.
- For demo: remove volume and redeploy.

### Backend returns `Cannot POST /knowledge/search`
- Backend is running older code/version.
- Redeploy backend from latest commit and verify startup logs include the knowledge route.

### Frontend shows `network`
- `VITE_API_URL` mismatch, backend down, or CORS mismatch.
- Verify frontend env points to live backend domain and backend `FRONTEND_URL` is set.
