# Retrieval Service

FastAPI + Haystack retrieval service for citation-grounded knowledge lookups.

Current default profile: EN-only retrieval corpus. Multilingual queries should
include `query_en` as an English translation/paraphrase.

## Endpoints

- `GET /health`
- `POST /index`
- `POST /search`

## Retrieval Pipeline (Phase 2B)

Current default search path uses explicit Haystack pipelines:
- single query: BM25 retriever node via `Pipeline`
- dual query (`query_original` + `query_en`): two BM25 retriever branches + `DocumentJoiner` rank fusion

Runtime flags:
- `RETRIEVAL_QUERY_JOIN_MODE` (default: `reciprocal_rank_fusion`)
- `RETRIEVAL_BRANCH_TOP_K` (default: `0`, meaning use final `top_k` for each branch)
- `RETRIEVAL_LOG_TIMING` (default: `true`)
- `RETRIEVAL_DENSE_ENABLED` (default: `false`)
- `RETRIEVAL_WRITE_EMBEDDINGS` (default: `true`)
- `RETRIEVAL_EMBED_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)
- `RETRIEVAL_DENSE_TOP_K` (default: `8`)

If pipeline graph initialization or execution fails, service falls back to direct
BM25 retrieval to keep `/search` available.

Dense mode notes:
- When `RETRIEVAL_DENSE_ENABLED=true`, indexing tries to write document embeddings.
- Search runs dense retrieval and fuses BM25 + dense rankings with RRF.
- If embedding model init/run fails, service logs a warning and continues in BM25-only mode.

Demo default profile:
- `hybrid_k8` (enabled in local Make defaults)
- Dense on, BM25+dense fusion on, `RETRIEVAL_DENSE_TOP_K=8`
- Recommended command: `make rag-local-run` then `make rag-local-loop`

## Local Run (without Docker)

```bash
cd retrieval-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3004
```

## Developer Task Contract

From `retrieval-service/`, use the local task surface:

```bash
make format
make lint
make test
make typecheck
make check
```

Dev tooling dependencies:

```bash
pip install -r requirements-dev.txt
```

## Data Asset Policy

Repository policy keeps retrieval data reproducible without letting generated
large assets sprawl in git history.

- Run policy check:

```bash
cd retrieval-service
make data-policy
```

- Policy guardrails are enforced by:
  - `scripts/check_data_policy.py`
  - `data/data_asset_allowlist.txt`
  - `data/CORPUS_STORAGE_POLICY.md`

Current default limits:
- `data/corpus.jsonl`: up to 15MB
- `data/import/*`: up to 0.5MB unless explicitly allowlisted
- other `data/*`: up to 1MB unless explicitly allowlisted

Recommended workflow for large generated batches:
- write generated files outside repo (for example `/tmp/tinge-rag-data/`),
- merge into canonical corpus via explicit path input,
- keep allowlist entries minimal and intentional.

## Example

```bash
curl -X POST http://localhost:3004/index \
  -H "Content-Type: application/json" \
  -d '{"recreate_index":true}'

curl -X POST http://localhost:3004/search \
  -H "Content-Type: application/json" \
  -d '{"query_original":"Tell me about Barcelona","top_k":3}'
```

## Corpus Quality Loop

Validate corpus before indexing:

```bash
cd retrieval-service
python3 scripts/validate_corpus.py --path data/corpus.jsonl
```

Run smoke retrieval tests after indexing:

```bash
cd retrieval-service
python3 scripts/smoke_test.py --base-url http://localhost:3004 --queries data/smoke_queries.json
```

## Corpus Scaling Pipeline

Drop additional JSON/JSONL files into `data/import/` and run merge:

```bash
cd retrieval-service
python3 scripts/merge_corpus.py \
  --inputs data/corpus.jsonl data/import \
  --output data/corpus.jsonl \
  --overwrite
```

Notes:
- Accepts files, folders, or glob patterns for `--inputs`.
- Normalizes fields and language (`en`/`es`), removes invalid/short records.
- Deduplicates by `url+language` by default and keeps best-quality record.
- Regenerates stable IDs and enforces uniqueness.

Fetch real EN Wikipedia articles into import batch:

```bash
cd retrieval-service
python3 scripts/fetch_wikipedia_en.py \
  --output /tmp/tinge-rag-data/wiki_en_articles.jsonl \
  --seed-profile iberia_latam \
  --target-docs 10000 \
  --fallback-single-page \
  --fetch-batch-size 40 \
  --overwrite
```

For top-level Make targets, generated wiki batch output defaults to:
- `/tmp/tinge-rag-data/wiki_en_articles.jsonl`

Override explicitly for repo-local output only when intentional:

```bash
make rag-fetch-wiki-en \
  WIKI_EN_TARGET_DOCS=10000 \
  WIKI_EN_OUTPUT=retrieval-service/data/import/wiki_en_articles.jsonl
```

Available seed profiles:
- `spain_core`: Spain/Barcelona-focused
- `iberia_latam`: Spain + Latin America (default)

Robustness tip:
- Keep `--fallback-single-page` enabled to recover pages where batch responses
  omit extract text.

Full local scaling loop:

```bash
make rag-scale-loop
```

Rebuild corpus directly from real EN Wikipedia batch (fetch + merge + validate + reindex + smoke + eval):

```bash
make rag-scale-wiki-en WIKI_EN_TARGET_DOCS=10000
```

Switch profile (example):

```bash
make rag-scale-wiki-en WIKI_EN_TARGET_DOCS=10000 WIKI_EN_SEED_PROFILE=spain_core
```

If your import batch intentionally contains multiple cards pointing to the same
canonical URL, run with ID-based dedupe for that loop:

```bash
make rag-scale-loop DEDUPE_KEY=id
```

This runs:
1. corpus merge
2. corpus validation
3. re-index
4. retrieval eval metrics
5. append one-line history to `data/eval_history.jsonl`

Run retrieval evaluation metrics (hit@k, MRR, language-match, latency):

```bash
cd retrieval-service
python3 scripts/eval_retrieval.py \
  --base-url http://localhost:3004 \
  --queries data/eval_broad_wiki.json \
  --ignore-doc-id-checks \
  --min-pass-rate 0.90
```

`--min-pass-rate` is percentage-style gating (0.0 to 1.0). Example: `0.90` means
at least 90% of eval cases must pass.

Eval suites:
- `data/eval_broad_wiki.json`: broad corpus checks (recommended for large Wikipedia corpora)
- `data/eval_precision_local.json`: stricter local precision checks (best for curated/local corpora with stable IDs)

Optional JSON report:

```bash
python3 scripts/eval_retrieval.py \
  --base-url http://localhost:3004 \
  --queries data/eval_broad_wiki.json \
  --ignore-doc-id-checks \
  --output-json data/eval_report.json
```

Append summary history (with corpus size context):

```bash
python3 scripts/eval_retrieval.py \
  --base-url http://localhost:3004 \
  --queries data/eval_broad_wiki.json \
  --ignore-doc-id-checks \
  --min-pass-rate 0.90 \
  --corpus-path data/corpus.jsonl \
  --history-jsonl data/eval_history.jsonl \
  --label batch_03
```

For Make targets (`rag-eval`, `rag-eval-log`, `rag-scale-loop`), tune this via:

```bash
make rag-scale-loop RAG_MIN_PASS_RATE=0.90
```

Run strict suite:

```bash
make rag-eval-strict
```

Benchmark local retrieval presets (BM25 vs hybrid variants):

```bash
make rag-local-benchmark
```

Optional preset selection:

```bash
make rag-local-benchmark RAG_BENCH_CONFIGS=bm25,hybrid_k5
```

Suggested repeatable workflow:

1. Update `data/corpus.jsonl`.
2. Add new source files under `data/import/`.
3. Merge and dedupe with `merge_corpus.py`.
4. Run `validate_corpus.py`.
5. Re-index:
   `curl -X POST http://localhost:3004/index -H "Content-Type: application/json" -d '{"recreate_index":true}'`
6. Run `smoke_test.py`.
7. Run `eval_retrieval.py` and track metrics as corpus grows.
8. Append to `data/eval_history.jsonl` (or use `make rag-eval-log` / `make rag-scale-loop`).
