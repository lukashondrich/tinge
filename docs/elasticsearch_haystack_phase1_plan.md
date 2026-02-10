# Elasticsearch + Haystack Integration Plan (Phase 1)

## Purpose

This document defines the first implementation phase for adding retrieval-augmented tutoring to the realtime voice language-learning app.

Phase 1 goals:
- Add a **separate Python retrieval service** using **Haystack**.
- Use **Elasticsearch** as the document store/retriever backend.
- Start with a **curated offline dataset** (no live crawling/fetching yet).
- Enable **tool-calling from Realtime** so the tutor can retrieve facts on demand.
- Require **citations** in factual responses.
- Keep the scope **local Docker** only for now.

## Status Snapshot (2026-02-09)

### Completed in this session
- `retrieval-service/` implemented (FastAPI + Haystack + Elasticsearch integration).
- Docker wiring added for `elasticsearch`, `retrieval-service`, and `backend`.
- Backend proxy endpoint `POST /knowledge/search` implemented with timeout/error mapping and tests.
- Realtime tool `search_knowledge` implemented end-to-end in `shader-playground/src/realtime/session.js`.
- Prompt updated for retrieval-first factual answers and strict citation behavior.
- Source UI panel implemented (`shader-playground/src/ui/sourcePanel.js`) with clickable links.
- Deterministic source numbering implemented:
  - same source keeps one number within a conversation,
  - numbering is contiguous `1..n` with no gaps,
  - only cited sources are committed to the panel.
- Streaming bubble citations now remap to global source numbers while response is still being generated.
- Source state now resets on refresh (conversation-scoped memory), no cross-refresh persistence by default.
- Regression tests added for source numbering/reset behavior:
  - `shader-playground/src/tests/ui/source-panel.test.js`
- Retrieval evaluation scaffold added:
  - `retrieval-service/data/eval_queries.json`
  - `retrieval-service/scripts/eval_retrieval.py`
  - `retrieval-service/data/eval_history.jsonl` (appended via eval history mode)
- Corpus scaling scaffold added:
  - `retrieval-service/scripts/merge_corpus.py`
  - `retrieval-service/data/import/.gitkeep`
  - `make rag-scale-loop` for merge -> validate -> index -> eval

### Partially complete
- Corpus target was ~300 documents; current curated baseline is 48 docs in `retrieval-service/data/corpus.jsonl`.

### Remaining for Phase 1 completion
- Expand corpus from 48 toward ~300 while preserving EN/ES balance and metadata quality.
- Add/expand fixed multilingual smoke scenarios for broader retrieval coverage.
- Optional: add an end-to-end regression test that exercises multi-turn citation numbering through the realtime flow.

### Key plan deltas (vs original draft)
- Added Phase 1F for citation UX determinism (not explicit in original draft).
- Shifted source rendering from "short list at end of answer" to dedicated Sources panel.
- Changed source state policy to conversation-scoped memory (resets on refresh).

## Why This Fits the Product

This project already has:
- realtime voice interaction,
- tutoring logic with tool-calling in `shader-playground/src/realtime/session.js`,
- local profile memory and vocabulary persistence,
- a backend service that can proxy external system calls.

Adding retrieval now creates a strong demo story for:
- trustworthy, citation-aware tutoring,
- practical RAG architecture knowledge,
- clear extension path to Kubernetes later.

## Scope and Non-Goals

### In Scope (Phase 1)
- New `retrieval-service` (Python, FastAPI, Haystack).
- Elasticsearch service in local Docker.
- Curated corpus ingestion/indexing (48 now, target ~300).
- Backend proxy endpoint for retrieval.
- New Realtime tool `search_knowledge`.
- Prompt updates to enforce citation behavior.
- Source panel UX for citations (separate from spoken answer).
- Deterministic citation numbering across turns in a conversation.
- Local validation loop + smoke scenarios.

### Out of Scope (Phase 1)
- Live web/Wikipedia fetching during runtime.
- Kubernetes deployment.
- Direct 3D visualization of retrieval source terms.
- Production hardening for high throughput.
- Multi-tenant auth/security model.

## High-Level Architecture

1. User speaks (EN or ES) in the frontend.
2. Realtime model decides it needs facts and calls `search_knowledge`.
3. Frontend tool handler calls backend endpoint `/knowledge/search`.
4. Backend forwards request to `retrieval-service`.
5. `retrieval-service` queries Elasticsearch via Haystack and returns top chunks + metadata.
6. Tool output is sent back into Realtime conversation.
7. Model answers user with cited sources.

Services:
- `frontend` (existing, Vite/Three.js)
- `backend` (existing, Node/Express)
- `embedding-service` (existing)
- `retrieval-service` (new, Python/FastAPI/Haystack)
- `elasticsearch` (new, local Docker)

## Multilingual Strategy (Phase 1)

Decision: support **EN + ES** from day 1 with minimal added complexity.

Key points:
- The model can translate queries and generate bilingual answers, but retrieval quality still depends on indexed content.
- We keep a language field per document/chunk: `language: "en" | "es"`.
- Tool inputs include both:
  - `query_original`
  - `query_en` (LLM-translated helper query when needed)
- Retrieval service executes both queries, merges and de-duplicates by chunk/document id.

This gives practical multilingual behavior without major indexing complexity.

## Data Model

Corpus record (`data/corpus.jsonl`):
- `id` (stable unique id)
- `title`
- `url`
- `source` (publisher/reference name)
- `language` (`en`/`es`)
- `published_at` (ISO date if known)
- `content` (full text)

Chunk record (indexed):
- `chunk_id`
- `doc_id`
- `title`
- `url`
- `source`
- `language`
- `published_at`
- `content` (chunk text)
- `chunk_index`

## API Contracts

### Retrieval Service

`POST /index`
- Purpose: index curated corpus into Elasticsearch.
- Input:
  - `path` (optional path to jsonl)
  - `recreate_index` (bool)
- Output:
  - indexed doc/chunk counts
  - elapsed time

`POST /search`
- Purpose: retrieve top relevant chunks with citations.
- Input:
  - `query_original` (string)
  - `query_en` (string, optional)
  - `language` (`en`/`es`, optional)
  - `top_k` (int, default 5)
- Output:
  - `results`: array of
    - `chunk_id`, `doc_id`, `score`, `snippet`
    - `title`, `url`, `source`, `language`, `published_at`

### Backend Proxy

`POST /knowledge/search`
- Validates payload.
- Calls `retrieval-service /search` with timeout + error mapping.
- Returns retrieval results unchanged (or normalized minimal envelope).

## Realtime Tool Integration

Add tool in session config in `shader-playground/src/realtime/session.js`:
- `name`: `search_knowledge`
- `description`: retrieve factual knowledge snippets with source metadata for citation.
- Parameters:
  - `query_original` (required)
  - `query_en` (optional)
  - `language` (optional)
  - `top_k` (optional)

In `handleFunctionCall`:
- Route `search_knowledge` -> backend `/knowledge/search`.
- Return `function_call_output` payload with concise result list.
- Trigger `response.create` after tool output (same existing pattern).

## Prompt and Citation Behavior

Update `shader-playground/public/prompts/systemPrompt.yaml` with rules:
- Use `search_knowledge` for factual/cultural/location/history/travel questions.
- Do not present factual claims as certain without retrieval context when sources are needed.
- Cite 1-2 sources inline in response (numeric markers).
- Keep factual responses concise and tutoring-first (short fact + follow-up question).
- Do not read out source names/URLs in the spoken conversational response.
- If retrieval fails or has low-confidence/no results:
  - clearly say uncertainty,
  - ask clarifying follow-up,
  - avoid fabricated citations.

Citation style for Phase 1:
- Inline numeric markers only in assistant response text, e.g. `[1]`, `[2]`.
- Render full source details in a dedicated Sources panel UI (clickable links), not in spoken text.

## Citation Numbering and Source Panel Rules (Implemented)

- Retrieval tool returns per-turn local citation ids (`citation_index`).
- UI maps local ids to conversation-stable global ids.
- Same source key (`url|title|source|language`) keeps the same global number within the conversation.
- Global numbering is contiguous from `1..n` with no gaps.
- During streaming bubble generation, citations are remapped live to global ids.
- Final commit only includes sources actually cited in assistant text.
- Refresh starts a new conversation source registry (no persisted source numbering by default).

## Docker and Local Runtime

Update `docker-compose.yml` with:
- `elasticsearch` service
- `retrieval-service` service
- network wiring so `backend` can reach retrieval service and retrieval can reach Elasticsearch

Expected local ports (example):
- frontend: `5173` (dev) or `8080` (docker)
- backend: `3000`/`3002`
- embedding-service: `3001`/`3003`
- retrieval-service: `3004`
- elasticsearch: `9200`

Environment variables (new):
- backend:
  - `RETRIEVAL_SERVICE_URL=http://retrieval-service:3004`
- retrieval-service:
  - `ELASTICSEARCH_URL=http://elasticsearch:9200`
  - `ELASTICSEARCH_INDEX=tinge_knowledge_v1`

Recommended local run path:
- `make dev-rag` (starts stack, waits for health, indexes corpus, runs smoke tests)
- `make rag-status` (quick container state check)

## Detailed Implementation Phases

### Phase 1A: Retrieval Service Skeleton
- Status: **Done**
- Create `retrieval-service/` with:
  - `app/main.py` (FastAPI app)
  - `app/search.py` (Haystack pipeline functions)
  - `app/indexing.py` (chunk + index helpers)
  - `requirements.txt`
  - `Dockerfile`
- Add `/health`, `/index`, `/search`.

Exit criteria:
- Service starts.
- `/health` returns OK.
- `/search` responds with structured empty result before indexing.

### Phase 1B: Data and Indexing
- Status: **In progress**
- Current corpus: `retrieval-service/data/corpus.jsonl` with 48 EN/ES docs.
- Next target: expand toward ~300 docs EN+ES.
- Add index script callable via `/index` and CLI.
- Implement chunking policy (simple paragraph/size-based chunks).

Exit criteria:
- Index command loads all docs.
- Elasticsearch contains expected chunk count.
- Search returns relevant snippets for sample queries.

### Phase 1C: Backend Proxy
- Status: **Done**
- Add `POST /knowledge/search` in `backend/server.js`.
- Validate input, apply timeout, map errors.
- Add tests in `backend/tests`.

Exit criteria:
- Backend endpoint returns retrieval results.
- Controlled timeout behavior is verified.

### Phase 1D: Realtime Tool Wiring
- Status: **Done**
- Add tool definition in `sendSessionConfiguration`.
- Extend `handleFunctionCall` with `search_knowledge`.
- Ensure tool output shape is compact and model-friendly.

Exit criteria:
- Tool call roundtrip works in active Realtime session.
- Assistant response includes retrieved citations.

### Phase 1E: Prompt and UX Behavior
- Status: **Done for Phase 1 scope**
- Update system prompt with retrieval and citation rules.
- Keep current transcript UI behavior; no 3D source injection in this phase.

Exit criteria:
- For factual prompts, assistant consistently uses sources.
- No fabricated citation IDs/URLs in tested scenarios.

### Phase 1F: Citation UX Determinism (Added During Implementation)
- Status: **Done**
- Add Sources panel UI with clickable references near PTT.
- Keep source numbering stable and contiguous across turns.
- Remap citations during streaming and finalize with cited-only commit.
- Reset source registry on refresh (conversation-scoped state).

Exit criteria:
- Streaming and finalized bubbles show the same citation numbers.
- Same source keeps same number across turns.
- Sources panel includes only cited sources.

## Build-and-Verify Loop (During Implementation)

For each phase, run this loop before proceeding:
1. Implement smallest viable increment.
2. Run focused checks (unit/integration/manual).
3. Fix defects immediately.
4. Record what passed/failed.
5. Proceed only when phase exit criteria are met.

### Checkpoints

Checkpoint A:
- Retrieval smoke:
  - `python3 retrieval-service/scripts/smoke_test.py --base-url http://localhost:3004 --queries retrieval-service/data/smoke_queries.json`
- Status: **Passing on current corpus**.

Checkpoint B:
- Backend test: `/knowledge/search` success + timeout + service-down cases.
- Command:
  - `npm --prefix backend test -- --runInBand`
- Status: **Implemented and exercised during session**.

Checkpoint C:
- Realtime tool test: function call event -> output event -> follow-up response.
- Status: **Working; included fix to always send `response.create` after tool output**.

Checkpoint D:
- Manual smoke (10 fixed prompts, EN+ES):
  - factual query retrieval,
  - citation presence,
  - no citation hallucination when no results.
- Status: **Partially done; expand prompt set as corpus grows**.

Checkpoint E:
- Regression quick pass:
  - push-to-talk flow still works,
  - transcript bubbles still render,
  - 3D vocabulary update unaffected.
- Status: **Passing in manual checks**.

Checkpoint F:
- Citation UX determinism tests:
  - `npm --prefix shader-playground run test:run -- src/tests/ui/source-panel.test.js src/tests/ui/bubble-manager.test.js`
  - verify refresh clears sources, stable contiguous numbering, live remap during streaming.
- Status: **Passing**.

## Risk Register and Mitigations

### R1: Citation hallucination (high)
Risk:
- Model may fabricate source claims or mismatch source list.
Mitigation:
- Return structured source list from tool with stable ids.
- Prompt rule: cite only returned sources.
- Add smoke checks explicitly validating citation URLs/titles come from tool output.
- Commit only cited sources into Sources panel (avoid showing uncited retrieval hits).

### R2: Weak multilingual retrieval (high)
Risk:
- ES queries may retrieve poor results if index/corpus is EN-heavy.
Mitigation:
- Keep bilingual corpus balance targets.
- Search both `query_original` and `query_en`, merge results.
- Add EN and ES sample evaluation queries.

### R3: Retrieval latency hurts conversation flow (medium)
Risk:
- Tool call may add noticeable delay in voice interaction.
Mitigation:
- Set backend timeout budgets and return graceful fallback.
- Limit `top_k`.
- Keep chunk size moderate to reduce ES load.

### R4: Over-scoped initial corpus work (medium)
Risk:
- Building 300 high-quality docs may stall implementation.
Mitigation:
- Start with first 80-120 docs to validate pipeline.
- Expand to 300 after pipeline is stable.
- Maintain a corpus curation checklist.

### R5: Service orchestration complexity (medium)
Risk:
- New services break local startup reliability.
Mitigation:
- Add health checks and startup documentation.
- Keep compose defaults minimal.
- Add explicit dependency and readiness checks.

### R6: Function-call schema drift (medium)
Risk:
- Tool schema mismatch leads to runtime errors.
Mitigation:
- Keep strict JSON schema in `session.update`.
- Validate args server-side.
- Add logs for failed argument parsing and fallback responses.

### R7: Data quality/trustworthiness issues (medium)
Risk:
- Outdated or low-quality source content reduces credibility.
Mitigation:
- Require source metadata and publication date when available.
- Keep corpus provenance notes.
- Tag known-confidence tiers if needed later.

### R8: Regression in existing voice features (high)
Risk:
- New tool logic may destabilize core realtime path.
Mitigation:
- Keep changes isolated to tool config/handler paths.
- Run existing audio tests and manual PTT checks after each phase.
- Avoid touching unrelated 3D/audio code in phase 1.

### R9: Source number drift between streaming and final bubble (high)
Risk:
- During live streaming, local per-turn citation ids can diverge from conversation-global ids.
Mitigation:
- Build deterministic local->global remap during streaming.
- Finalize commit using cited-only source set in citation order.
- Keep regression tests for contiguous numbering and refresh reset behavior.

## Acceptance Criteria (Phase 1)

Functional:
- User asks factual EN or ES question (e.g., Barcelona/Spain context).
- Assistant calls `search_knowledge`.
- Response includes relevant information with numeric citations.
- Sources panel shows clickable references for cited items only.

Reliability:
- If retrieval service is down or timeout occurs, assistant degrades gracefully without fake citations.
- Existing voice conversation flow remains operational.
- Source numbering remains stable/contiguous across multi-turn conversations.
- Refresh starts a clean source registry for a new conversation.

Demo readiness:
- One command path to run local stack.
- Repeatable test script with expected outputs and citations.

## Suggested Demo Scenarios

1. EN prompt:
- "Tell me about Barcelona neighborhoods for a language learner."
Expected:
- concise explanation + citations.

2. ES prompt:
- "Quiero aprender sobre la historia de Barcelona en español."
Expected:
- Spanish response, sourced citations.

3. Failure mode:
- Temporarily stop retrieval service, ask factual question.
Expected:
- transparent fallback (no fabricated sources).

4. Multi-turn citation consistency:
- Ask two related factual questions that reuse one source and add one new source.
Expected:
- Reused source keeps same number.
- New source gets next contiguous number.
- Streaming bubble and final bubble show matching citation numbers.

## Deliverables Checklist

- [x] `retrieval-service/` implementation (FastAPI + Haystack).
- [x] Elasticsearch compose wiring.
- [x] Curated corpus files + indexing script.
- [ ] Corpus expansion from 48 to ~300 docs.
- [x] Backend `/knowledge/search` endpoint + tests.
- [x] Realtime tool integration + tests/logging.
- [x] Prompt update for retrieval/citation behavior.
- [x] Sources panel UI with deterministic citation numbering.
- [x] Local runbook + smoke test doc (`Makefile` + retrieval scripts).

## Future Phase Ideas (Not in Phase 1)

- Live source ingestion (Wikipedia/API pull jobs).
- Ranking improvements (hybrid BM25 + dense retrieval).
- Citation UI enhancements in transcript bubbles.
- Kubernetes manifests and horizontal scaling.
- Evaluation dashboard for retrieval quality and latency.

---

## Phase 2 Plan: Retrieval Quality + Haystack Signaling

### Why Phase 2 now

Current system state (2026-02-10):
- EN Wikipedia corpus ingestion is now robust (example run: 9,468 indexed docs).
- Smoke checks pass on broad factual prompts.
- Eval gate fails on broad corpus due strict keyword checks (`expected_terms_any`) and BM25-only ranking limits.
- Haystack is used, but mostly as a thin BM25 wrapper. CV signaling can be stronger with explicit Haystack pipeline orchestration.

Phase 2A implementation status (this session):
- Added dual eval suite files:
  - `retrieval-service/data/eval_broad_wiki.json`
  - `retrieval-service/data/eval_precision_local.json`
- Updated Make targets:
  - `rag-eval` / `rag-eval-log` now target broad suite.
  - Added `rag-eval-strict` / `rag-eval-log-strict`.
  - `rag-scale-wiki-en` now gates on broad suite.
- Updated retrieval README with suite usage guidance.
- Verification run on 9k+ Wikipedia corpus:
  - Broad suite: passed at gate threshold (`14/16`, `87.5%`).
  - Strict suite: expected to fail on broad corpus due fixed `expected_doc_ids_any` checks.

Phase 2B implementation status (this session):
- Refactored `retrieval-service/app/search.py` to explicit Haystack pipelines:
  - single-query BM25 pipeline,
  - dual-query BM25 + `DocumentJoiner` fusion pipeline.
- Added runtime controls:
  - `RETRIEVAL_QUERY_JOIN_MODE`
  - `RETRIEVAL_BRANCH_TOP_K`
  - `RETRIEVAL_LOG_TIMING`
- Added safe fallback to direct BM25 if pipeline init/run fails.
- Wired defaults in `docker-compose.yml` and documented in `retrieval-service/README.md`.
- Validation pending in this environment due temporary Docker registry/proxy DNS failure during rebuild.

Phase 2C implementation status (this session):
- Added dense retrieval feature flags and config surface:
  - `RETRIEVAL_DENSE_ENABLED`
  - `RETRIEVAL_WRITE_EMBEDDINGS`
  - `RETRIEVAL_EMBED_MODEL`
  - `RETRIEVAL_DENSE_TOP_K`
- Implemented optional dense path in `retrieval-service/app/search.py`:
  - query embedding via sentence-transformers text embedder,
  - Elasticsearch dense retriever pipeline (single and dual query variants),
  - BM25+dense fusion using reciprocal-rank-fusion (RRF).
- Implemented optional index-time document embedding write when dense mode is enabled.
- Added fail-safe behavior: if dense init/run fails, retrieval continues BM25-only.
- Runtime validation with dense mode still pending (to be executed in local non-Docker loop first).

Demo profile lock (this session):
- Default local profile is now `hybrid_k8`:
  - `RETRIEVAL_DENSE_ENABLED=true`
  - `RETRIEVAL_DENSE_TOP_K=8`
- Docker compose retrieval defaults aligned to hybrid profile for demo parity.

Phase 2 objective:
- Improve retrieval quality on large corpus.
- Increase explicit Haystack usage visibility (pipeline, hybrid retrieval, reranking option).
- Keep latency acceptable for realtime voice interaction.

### Phase 2 Success Criteria

Functional:
- Retrieval pipeline runs through explicit Haystack `Pipeline` graph.
- Query path supports hybrid retrieval (BM25 + dense embeddings) with deterministic fallback to BM25-only if dense path is unavailable.
- Citations remain stable and grounded in returned source metadata.

Quality:
- Smoke tests remain passing.
- Eval gate updated for broad corpus and passes target threshold.
- Relative improvement vs BM25 baseline on at least one ranking metric (`hit@3`, `hit@5`, or `mrr`).

Performance:
- `/search` p95 latency stays within agreed local demo budget (target <= 350ms; stretch <= 500ms with reranker enabled).

CV Signaling:
- README and plan clearly show Haystack components used:
  - pipeline graph
  - retriever composition
  - rank fusion
  - optional reranker

### Non-Goals for Phase 2

- No Kubernetes deployment in this phase.
- No production auth/multi-tenant architecture.
- No live web crawl during user conversation.

## Phase 2A: Baseline + Eval Hardening

### Goal
Make evaluation robust for large, diverse corpora so gating reflects real quality.

### Work
- Freeze a baseline report from current BM25-only pipeline:
  - pass rate, hit@k, mrr, latency.
- Reduce brittle `expected_terms_any` reliance for broad corpus checks.
- Add URL/domain or source-level relevance expectations where possible.
- Split eval suites:
  - `eval_precision_local.json` (strict, small curated subset).
  - `eval_broad_wiki.json` (larger, tolerant, multilingual prompts with EN retrieval).
- Add explicit eval mode flag(s) for strict vs broad gating.

### Exit Criteria
- Eval output clearly distinguishes strict and broad suites.
- Gate thresholds are realistic and documented.

### Check Loop
- Run broad suite after each retrieval change.
- Run strict suite before merge/final demo.

## Phase 2B: Haystack Pipeline Refactor (No Behavior Change First)

### Goal
Refactor retrieval code to explicit Haystack `Pipeline` while keeping BM25 behavior equivalent.

### Work
- Introduce pipeline builder in retrieval service:
  - query input node
  - BM25 retriever node
  - normalization/formatter node
- Keep API contract of `/search` unchanged.
- Add logs/telemetry for component-level timing.

### Exit Criteria
- BM25-only quality metrics are not worse than baseline beyond small tolerance.
- Service still passes smoke tests and backend integration.

### Risk
- Refactor regression without quality gain.

### Mitigation
- Do this as behavior-preserving step before adding dense/hybrid.

## Phase 2C: Dense Embedding Path

### Goal
Add dense retrieval path for semantic recall.

### Work
- Add embedding model config and index-time embedding write.
- Store embeddings in Elasticsearch document store.
- Add dense retriever component in Haystack pipeline.
- Gate with feature flags:
  - `RETRIEVAL_DENSE_ENABLED`
  - `RETRIEVAL_EMBED_MODEL`

### Exit Criteria
- Indexing can run with embeddings enabled and completes successfully.
- Dense-only trial mode returns plausible results for semantic/paraphrased queries.

### Failure Modes to Anticipate
- Embedding dimension mismatch after model changes.
- Memory pressure during embedding generation.
- Significant indexing time increase.

### Mitigations
- Validate embedding dimension before write.
- Batch embeddings.
- Keep BM25-only mode available as emergency fallback.

## Phase 2D: Hybrid Retrieval + Rank Fusion

### Goal
Combine lexical precision (BM25) and semantic recall (dense retrieval).

### Work
- Add two retriever branches in pipeline:
  - BM25 branch
  - Dense branch
- Merge with explicit fusion strategy (start with Reciprocal Rank Fusion).
- Add tunable knobs:
  - `top_k_bm25`
  - `top_k_dense`
  - final `top_k`
  - optional weighted fusion.

### Exit Criteria
- Broad eval metrics improve vs BM25 baseline.
- Latency remains within target budget.

### Failure Modes to Anticipate
- One branch dominates and harms relevance.
- Duplicate-heavy merged results.
- Latency spikes.

### Mitigations
- Deduplicate by `chunk_id` before final rank.
- Add branch-level and merged timing logs.
- Tune branch `top_k` down first before disabling any branch.

## Phase 2E: Optional Reranker Stage

### Goal
Improve top-1/top-3 precision for final citations.

### Work
- Add optional reranker node after fusion (cross-encoder or Haystack-compatible reranker).
- Keep behind `RETRIEVAL_RERANK_ENABLED`.
- Limit reranker input set (e.g. rerank top 20 only).

### Exit Criteria
- Precision improvement on strict suite.
- Latency still acceptable for local demo with reranker on.

### Failure Modes to Anticipate
- Latency too high for voice UX.
- Heavy model dependency complexity.

### Mitigations
- Keep reranker optional and default-off for normal runs.
- Provide two documented modes:
  - `demo_fast` (hybrid no reranker)
  - `demo_quality` (hybrid + reranker)

## Phase 2F: Relevance Controls for Corpus Breadth

### Goal
Keep large corpus diverse but still useful for Spain/Latin-America tutoring prompts.

### Work
- Keep current seed profile diversity (`iberia_latam`) but add relevance controls:
  - category allowlist/boost tags
  - title/content topic tags at ingest time
  - optional query-time metadata filters/boosting.
- Track topic coverage metrics:
  - Spain terms
  - Latin America terms
  - travel/culture/history distributions.

### Exit Criteria
- Broad corpus remains diverse.
- Core tutoring topics stay easy to retrieve at top-k.

## Verification Loop (Build-as-you-go)

For each Phase 2 milestone:
1. Implement smallest increment behind a feature flag if behavior changes.
2. Reindex only what is needed for that increment.
3. Run smoke tests.
4. Run broad eval and compare against last baseline.
5. If broad eval regresses, revert/tune immediately before continuing.

Suggested command sequence per iteration:
1. `make rag-index`
2. `make rag-smoke`
3. `make rag-eval-log`
4. Save comparison note in planning doc status log.

## Phase 2 Risk Register

R10: Eval mismatch with broad corpora
- Risk: strict keyword checks under-report quality.
- Mitigation: dual-suite eval strategy (strict + broad), URL/source expectations, manual spot checks.

R11: Hybrid complexity without quality gain
- Risk: extra components increase complexity and latency but not results.
- Mitigation: stage rollout (BM25 pipeline refactor first), baseline comparison after each phase.

R12: Embedding pipeline fragility
- Risk: model/version drift causes indexing failures.
- Mitigation: embedding model pinning, dimension checks, fallback BM25 mode.

R13: Reranker latency hurts voice UX
- Risk: response delays become noticeable.
- Mitigation: reranker optional, capped rerank depth, separate fast/quality runtime profiles.

R14: Corpus topical drift
- Risk: huge corpus returns generic but not tutoring-relevant pages.
- Mitigation: seed profile governance, metadata tagging, topic-focused boosts/filters.

## Deliverables for Phase 2

- [ ] Haystack pipeline-based retrieval path implemented.
- [ ] Hybrid retrieval mode (BM25 + dense) with configurable fusion.
- [ ] Optional reranker mode with documented latency tradeoff.
- [ ] Dual eval suites (strict + broad) with sensible gates.
- [ ] Updated runbook for fast demo mode vs quality demo mode.
- [ ] CV-ready architecture summary in docs (Haystack components + rationale).
