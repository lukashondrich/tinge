# System Overview

## Runtime Topology

- Frontend app (`shader-playground`) owns UI, scene rendering, realtime voice session orchestration, citation rendering, and local vocabulary state.
- Backend (`backend`) is an API gateway for OpenAI session token creation, transcription proxying, retrieval proxying, and token usage accounting.
- Retrieval service (`retrieval-service`) is a FastAPI + Haystack service backed by Elasticsearch for citation-grounded knowledge search.
- Embedding service (`embedding-service`) provides per-word 3D coordinates for words that are not already in local vocabulary storage.

## End-to-End Voice Turn (PTT)

1. User presses PTT in `shader-playground/src/openaiRealtime.js`.
2. `RealtimeSession` (`shader-playground/src/realtime/session.js`) delegates to `PttOrchestrator`.
3. On first press, connection is established only. On later presses:
- `response.cancel` + `input_audio_buffer.clear` are sent first.
- User recording starts; mic track is enabled.
4. On release:
- User audio is stopped and buffered.
- `input_audio_buffer.commit` + `response.create` are sent.
5. OpenAI events arrive over data channel and are routed by `DataChannelEventRouter`.
6. UI rendering/citation behavior is coordinated in `RealtimeEventCoordinator` and `RetrievalCitationCoordinator`.
7. Final utterances are enriched with audio/timestamps and rendered in `DialoguePanel`.

## End-to-End Retrieval Citation Path

1. Model issues `search_knowledge` function call.
2. `FunctionCallService` calls frontend `KnowledgeSearchService`.
3. Frontend calls backend `POST /knowledge/search`.
4. Backend calls retrieval service `POST /search`.
5. Results return to frontend and are emitted as `tool.search_knowledge.result`.
6. `RetrievalCitationCoordinator` updates citation mapping + `SourcePanel` registry.
7. Assistant transcript markers are remapped to global source indexes.

## Planned End-to-End Correction Transparency Path

1. Assistant emits `log_correction` tool call for explicit learner correction.
2. Frontend function-call dispatch emits correction-detected event.
3. Frontend asynchronously calls backend `POST /corrections/verify`.
4. Backend queries verifier model and returns structured rule/confidence payload.
5. Frontend updates AI bubble with correction indicator and expandable breakdown.
6. Learner feedback is persisted in local correction history storage.

## End-to-End Embedding Path (Word Ingestion)

1. Realtime transcript words are queued in `AsyncWordQueue`.
2. `WordIngestionService` validates token payload and decides whether to ingest.
3. New words call `GET {apiUrl}/embed-word?word=...`.
4. Embedding service either returns cached coordinate or computes one via Python worker.
5. Frontend writes point into optimizer/mesh + vocabulary storage.

## Primary Composition Roots

- Frontend scene/runtime root: `shader-playground/src/main.js`
- Frontend realtime facade: `shader-playground/src/openaiRealtime.js`
- Frontend realtime session root: `shader-playground/src/realtime/session.js`
- Backend composition root: `backend/server.js`
- Retrieval composition root: `retrieval-service/app/main.py`
- Embedding composition root: `embedding-service/server.js`

## Cross-Cutting Policies

- Frontend debug/info/log gating: localStorage `tinge-debug-logs=1`.
- Backend debug/info/log gating: env `TINGE_BACKEND_DEBUG_LOGS=1`.
- Embedding debug/info/log gating: env `TINGE_EMBEDDING_DEBUG_LOGS=1`.
- Retrieval debug/info/log gating: env `TINGE_RETRIEVAL_DEBUG_LOGS=1`.
- Retrieval data policy enforcement: `retrieval-service/scripts/check_data_policy.py`.
