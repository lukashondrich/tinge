# Tech Debt Register

Prioritized from a quick repository review on 2026-02-11.

## Status Update (2026-02-15)

- 2026-02-16 transparent tutoring module planning kickoff:
  - created implementation-ready spec with explicit API/event/storage contracts:
    - `transparent_tutoring_module.md`
  - added architecture mapping for planned correction transparency flow:
    - `docs/architecture/frontend-correction-transparency.md`
    - updated `frontend-realtime-session`, `backend-api`, `system-overview`,
      and `testing-guardrails` docs to include planned correction pipeline.
- 2026-02-16 transparent tutoring module Phase B started (detection plumbing):
  - added realtime `log_correction` tool schema in
    `shader-playground/src/realtime/sessionConfigurationBuilder.js`,
  - extended function call dispatch to emit correction-detected events in
    `shader-playground/src/realtime/functionCallService.js`
    (`tool.log_correction.detected`),
  - updated tutor prompts to explicitly call `log_correction` on explicit
    language corrections:
    - `shader-playground/public/prompts/systemPrompt.yaml`
    - `shader-playground/public/prompts/systemPrompt_adapted.yaml`,
  - added/updated unit coverage:
    - `shader-playground/src/tests/realtime/session-configuration-builder.test.js`
    - `shader-playground/src/tests/realtime/function-call-service.test.js`.
- 2026-02-16 transparent tutoring module Phase C started (verification service):
  - added backend verification route:
    - `backend/src/routes/correctionVerifyRoute.js`
    - registered `POST /corrections/verify` in `backend/server.js`,
  - added frontend verifier client with timeout + cache:
    - `shader-playground/src/realtime/correctionVerificationService.js`,
  - wired async verify lifecycle from `log_correction` dispatch in
    `shader-playground/src/realtime/functionCallService.js` via
    `correction.verification.started/succeeded/failed` events,
  - added/updated coverage:
    - `backend/tests/modules/extracted-modules.test.mjs`
    - `shader-playground/src/tests/realtime/correction-verification-service.test.js`
    - `shader-playground/src/tests/realtime/function-call-service.test.js`.
- 2026-02-16 transparent tutoring module Phase D started (bubble UI + local persistence):
  - added local correction history store:
    - `shader-playground/src/core/correctionStore.js`,
  - wired correction lifecycle rendering into dialogue bubbles:
    - `shader-playground/src/ui/dialoguePanel.js`
    - `shader-playground/src/realtime/realtimeEventCoordinator.js`
    - `shader-playground/src/main.js`,
  - added correction badge/expandable details/feedback styling in:
    - `shader-playground/src/style.css`,
  - added/updated coverage:
    - `shader-playground/src/tests/audio/dialogue-panel.test.js`
    - `shader-playground/src/tests/realtime/realtime-event-coordinator.test.js`
    - `shader-playground/src/tests/realtime/correction-store.test.js`.
- Milestone A: largely completed
  - repo hygiene cleanup landed (artifact/backup removal + ignore guards),
  - root/docs script drift guard added (`check:readme-scripts`) and wired into CI,
  - embedding-service lint parity added and wired into CI.
- Milestone B: in progress
  - citation state extracted from `main.js` into dedicated modules:
    - `src/realtime/citationState.js`
    - `src/realtime/retrievalCitationCoordinator.js`
  - citation regression hardening landed:
    - stable URL-first source identity for re-citation,
    - fallback citation markers only for existing source indexes,
    - stale pending remap cleared at start of new retrieval turn.
  - integration guard added:
    - `tests/integration/citation-path.e2e.test.js`
  - onboarding/demo-seed logic extracted to:
    - `src/ui/onboardingController.js`
  - scene hover/raycast interaction extracted to:
    - `src/realtime/sceneInteractionController.js`
  - scene runtime (animation loop + post-processing) extracted to:
    - `src/realtime/sceneRuntimeController.js`
  - runtime logging policy baseline introduced:
    - `src/utils/logger.js` with debug/info/log gating via `tinge-debug-logs=1`
    - `main.js` and extracted realtime modules migrated off direct `console.*`
  - logging policy extended to major remaining frontend hotspots:
    - `src/core/scene.js`
    - `src/realtime/session.js`
  - Milestone C kickoff:
    - token usage batching/posting extracted from `src/realtime/session.js` to
      `src/realtime/tokenUsageTracker.js` with dedicated tests.
    - knowledge search/citation-indexing extracted from
      `src/realtime/session.js` to `src/realtime/knowledgeSearchService.js`
      with dedicated tests.
    - function-call dispatch/output-send extracted from
      `src/realtime/session.js` to `src/realtime/functionCallService.js`
      with dedicated tests.
    - PTT press/release + mic/button orchestration extracted from
      `src/realtime/session.js` to `src/realtime/pttOrchestrator.js`
      with dedicated tests.
    - mobile bootstrap/connect preflight extracted from
      `src/realtime/session.js` to `src/realtime/connectionBootstrapService.js`
      with dedicated tests.
    - WebRTC peer-connection + SDP exchange extracted from
      `src/realtime/session.js` to `src/realtime/webrtcTransportService.js`
      with dedicated tests.
  - 2026-02-12 realtime stabilization follow-up:
    - fixed first-press PTT behavior so initial press only connects (no unintended
      `response.create`/AI turn),
    - fixed missed remote audio-track race by hydrating existing receiver audio
      tracks after peer setup (covers cases where `ontrack` fires before handler
      attachment),
    - added AI bubble finalize fallback on transcript `done` events when
      `output_audio_buffer.stopped` is absent,
    - filtered tool-call JSON payloads from `response.text.*` so they do not
      render into assistant bubbles.
  - 2026-02-15 Milestone C continuation:
    - extracted data-channel message routing from
      `src/realtime/session.js` to `src/realtime/dataChannelEventRouter.js`,
    - extracted user transcription reconciliation/enrichment from
      `src/realtime/session.js` to `src/realtime/userTranscriptionService.js`,
    - added explicit interruption-on-PTT behavior:
      - send `response.cancel` on press in `src/realtime/pttOrchestrator.js`,
      - emit `assistant.interrupted` and finalize active AI bubble in
        `src/realtime/realtimeEventCoordinator.js`,
      - abort active local AI capture in `dataChannelEventRouter` to prevent
        stale transcript carry-over between turns,
    - added dedicated unit coverage:
      - `src/tests/realtime/data-channel-event-router.test.js`
      - `src/tests/realtime/user-transcription-service.test.js`
      - updated `ptt-orchestrator` and `realtime-event-coordinator` tests.
  - 2026-02-15 Milestone C continuation (connection-state hardening + interrupt race coverage):
    - added connection state machine module:
      - `src/realtime/sessionConnectionState.js`
    - rewired `RealtimeSession` connection flags through explicit transitions
      (`idle`/`connecting`/`connected`/`reconnecting`/`failed`) for connect,
      data-channel close/open, ICE transitions, and cleanup,
    - hardened post-interrupt stale event handling:
      - suppress stale assistant transcript events after `response.cancel` until
        drain (`output_audio_buffer.stopped` / `response.done`) or timeout in
        `src/realtime/dataChannelEventRouter.js`,
      - clear pending text-mode buffer and force interrupted AI bubble closure
        in `src/realtime/realtimeEventCoordinator.js`,
      - reset citation streaming state on interruption via
        `src/realtime/retrievalCitationCoordinator.js`,
    - added integration guard:
      - `tests/integration/ptt-interrupt-path.integration.test.js`
        (PTT during AI speech keeps stale deltas out and starts a fresh bubble),
    - added connection-state unit coverage:
      - `src/tests/realtime/session-connection-state.test.js`.
  - 2026-02-15 Milestone C continuation (connection lifecycle extraction):
    - extracted connect and peer bootstrap orchestration to
      `src/realtime/connectionLifecycleService.js`,
    - `RealtimeSession` now delegates `connect`, `waitForDataChannelOpen`, and
      `establishPeerConnection` to the service while preserving existing API
      compatibility,
    - added dedicated tests:
      - `src/tests/realtime/connection-lifecycle-service.test.js`,
    - `src/realtime/session.js` reduced to 731 LOC.
  - 2026-02-15 Milestone C continuation (session config/prompt + remote audio extraction):
    - extracted session update payload/tool schema construction to
      `src/realtime/sessionConfigurationBuilder.js`,
    - extracted system prompt fetch/parse/send flow to
      `src/realtime/systemPromptService.js`,
    - extracted remote audio track handling (ontrack wiring, receiver hydration,
      dedupe, AI recorder attachment) to
      `src/realtime/remoteAudioStreamService.js`,
    - `RealtimeSession` delegates session config/prompt and remote stream flows
      through dedicated services while preserving external method compatibility,
    - added dedicated tests:
      - `src/tests/realtime/session-configuration-builder.test.js`
      - `src/tests/realtime/system-prompt-service.test.js`
      - `src/tests/realtime/remote-audio-stream-service.test.js`,
    - `src/realtime/session.js` reduced to 490 LOC.
  - 2026-02-15 Milestone C follow-up (interrupted AI playback finalize):
    - added stable interrupted utterance-id propagation across interrupt path:
      `src/realtime/pttOrchestrator.js` ->
      `src/realtime/dataChannelEventRouter.js` ->
      `src/realtime/realtimeEventCoordinator.js`,
    - interruption now emits `utterance.added` from partial AI capture (when
      available) instead of discarding it, so interrupted AI bubbles can still
      be enhanced with playback controls,
    - added/updated tests:
      - `src/tests/realtime/data-channel-event-router.test.js`
      - `src/tests/realtime/ptt-orchestrator.test.js`
      - `src/tests/realtime/realtime-event-coordinator.test.js`
      - `tests/integration/ptt-interrupt-path.integration.test.js`.
  - 2026-02-15 Milestone C continuation (token limit extraction):
    - extracted token limit preflight logic to
      `src/realtime/tokenLimitService.js`,
    - `RealtimeSession.checkTokenLimit()` now delegates through the service while
      preserving existing API compatibility,
    - added dedicated tests:
      - `src/tests/realtime/token-limit-service.test.js`,
    - `src/realtime/session.js` reduced to 478 LOC.
  - 2026-02-15 Milestone C continuation (utterance transcription extraction):
    - extracted transcription upload + word timing/full-text enrichment to
      `src/realtime/utteranceTranscriptionService.js`,
    - `RealtimeSession.fetchWordTimings()` and
      `RealtimeSession.stopAndTranscribe()` now delegate through the service
      while preserving existing APIs,
    - added dedicated tests:
      - `src/tests/realtime/utterance-transcription-service.test.js`,
    - `src/realtime/session.js` reduced to 465 LOC.
  - 2026-02-15 Milestone C continuation (connect error presenter extraction):
    - extracted connect-error message mapping and delayed PTT/mobile-help UI
      fallback to `src/realtime/connectionErrorPresenter.js`,
    - `RealtimeSession.handleConnectError()` now delegates through the presenter
      while preserving connection lifecycle behavior,
    - added dedicated tests:
      - `src/tests/realtime/connection-error-presenter.test.js`,
    - `src/realtime/session.js` reduced to 449 LOC.
  - 2026-02-15 Milestone C continuation (reconnect integration coverage):
    - added integration guard:
      - `tests/integration/reconnect-ptt-path.integration.test.js`
        (data-channel close -> reconnect -> resumed PTT turn succeeds),
    - validated with targeted lifecycle/PTT/connection-state tests to protect
      reconnect behavior while continuing session decomposition.
  - 2026-02-15 Milestone C continuation (outbound text message extraction):
    - extracted text send payload orchestration to
      `src/realtime/outboundMessageService.js`,
    - `RealtimeSession.sendTextMessage()` now delegates through the service
      while preserving message contract (`conversation.item.create` +
      `response.create`),
    - added dedicated tests:
      - `src/tests/realtime/outbound-message-service.test.js`,
    - `src/realtime/session.js` reduced to 431 LOC.
  - 2026-02-15 Milestone B continuation (main remote-audio bootstrap extraction):
    - extracted remote AI audio element bootstrap + playback retry-on-gesture
      behavior to `src/realtime/remoteAudioController.js`,
    - `main.js` now delegates remote stream attach + cleanup through the
      controller,
    - added dedicated tests:
      - `src/tests/realtime/remote-audio-controller.test.js`,
    - `src/main.js` reduced to 298 LOC.
  - 2026-02-15 Milestone B continuation (main orbit interaction extraction):
    - extracted OrbitControls setup + interaction-state tracking/listener
      lifecycle to `src/realtime/sceneOrbitInteractionController.js`,
    - `main.js` now delegates controls + interaction state access + cleanup
      through the controller,
    - added dedicated tests:
      - `src/tests/realtime/scene-orbit-interaction-controller.test.js`,
    - `src/main.js` reduced to 275 LOC.
  - 2026-02-15 Milestone B continuation (scene bootstrap composition extraction):
    - extracted scene bootstrap composition to
      `src/realtime/sceneBootstrapController.js`, including renderer/controller
      setup, touch rotation wiring, and beforeunload cleanup composition,
    - `main.js` now delegates bootstrap + cleanup registration through
      `createSceneBootstrapController(...)`,
    - added dedicated tests:
      - `src/tests/realtime/scene-bootstrap-controller.test.js`,
    - `src/main.js` reduced to 248 LOC.
  - 2026-02-15 Milestone B checkpoint decision (`main.js` composition root):
    - reviewed remaining `main.js` wiring after controller extractions and
      determined additional splitting is low-yield right now,
    - keep `main.js` as composition root and prioritize behavior coverage + next
      higher-priority debt items unless new coupling appears.
  - 2026-02-15 Milestone C/backend continuation (knowledge route extraction):
    - extracted `/knowledge/search` request normalization + timeout/proxy flow
      from `backend/server.js` into
      `backend/src/routes/knowledgeSearchRoute.js`,
    - rewired `server.js` route registration to delegate through
      `createKnowledgeSearchHandler(...)`,
    - validated behavior with backend tests/lint:
      - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
      - `npm --prefix backend run lint -- server.js src/routes/knowledgeSearchRoute.js`,
    - reduced `backend/server.js` from 340 LOC to 280 LOC.
  - 2026-02-15 Milestone C/backend continuation (token route extraction):
    - extracted `/token` request/response + OpenAI error mapping + token usage
      initialization flow from `backend/server.js` into
      `backend/src/routes/tokenRoute.js`,
    - rewired `server.js` token route registration to delegate through
      `createTokenHandler(...)`,
    - validated behavior with backend tests/lint:
      - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
      - `npm --prefix backend run lint -- server.js src/routes/tokenRoute.js src/routes/knowledgeSearchRoute.js`,
    - reduced `backend/server.js` from 280 LOC to 206 LOC.
  - 2026-02-15 Milestone C/backend continuation (transcribe route extraction):
    - extracted `/transcribe` multipart/form-data OpenAI proxy flow from
      `backend/server.js` into `backend/src/routes/transcribeRoute.js`,
    - rewired `server.js` transcribe route registration to delegate through
      `createTranscribeHandler(...)`,
    - validated behavior with backend tests/lint:
      - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
      - `npm --prefix backend run lint -- server.js src/routes/tokenRoute.js src/routes/transcribeRoute.js src/routes/knowledgeSearchRoute.js`,
    - reduced `backend/server.js` from 206 LOC to 185 LOC.
  - 2026-02-15 Milestone C/backend continuation (middleware/config extraction):
    - extracted CORS policy builder to `backend/src/config/corsOptions.js`,
    - extracted request logging middleware to
      `backend/src/middleware/requestLogger.js`,
    - extracted startup banner logging to
      `backend/src/logging/startupBanner.js`,
    - rewired `backend/server.js` to compose extracted config/middleware/logging
      modules while preserving behavior.
  - 2026-02-15 Milestone C/backend continuation (token usage route extraction):
    - extracted `/token-usage/*` + `/token-stats` endpoints from
      `backend/server.js` into `backend/src/routes/tokenUsageRoutes.js`,
    - rewired `server.js` through `app.use(createTokenUsageRouter(...))`,
    - validated behavior with backend tests/lint:
      - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
      - `npm --prefix backend run lint -- server.js src/config/corsOptions.js src/middleware/requestLogger.js src/logging/startupBanner.js src/routes/tokenRoute.js src/routes/transcribeRoute.js src/routes/knowledgeSearchRoute.js src/routes/tokenUsageRoutes.js`,
    - reduced `backend/server.js` from 185 LOC to 96 LOC.
  - 2026-02-15 Milestone C/backend continuation (logging policy extension):
    - added shared backend logger utility in `backend/src/utils/logger.js`,
    - debug/info/log are now gated by env var `TINGE_BACKEND_DEBUG_LOGS=1`;
      warn/error remain always visible,
    - migrated extracted backend runtime wiring + token counter to shared logger:
      - `backend/server.js`
      - `backend/src/services/tokenCounter.js`
    - validated behavior with backend tests/lint:
      - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
      - `npm --prefix backend run lint -- server.js src/utils/logger.js src/services/tokenCounter.js src/config/corsOptions.js src/middleware/requestLogger.js src/logging/startupBanner.js src/routes/tokenRoute.js src/routes/transcribeRoute.js src/routes/knowledgeSearchRoute.js src/routes/tokenUsageRoutes.js`,
    - `backend/server.js` now 98 LOC (composition root).
  - 2026-02-15 Milestone C/auxiliary continuation (embedding logger policy extension):
    - added shared logger utility in `embedding-service/logger.js`,
    - debug/info/log are now gated by env var
      `TINGE_EMBEDDING_DEBUG_LOGS=1`; warn/error remain always visible,
    - migrated `embedding-service/server.js` off direct `console.*` to shared
      logger methods,
    - validated with:
      - `npm --prefix embedding-service test -- --runInBand`
      - `npm --prefix embedding-service run lint -- server.js logger.js`.
  - 2026-02-15 Milestone C/backend continuation (extracted module coverage):
    - added focused module-level coverage in
      `backend/tests/modules/extracted-modules.test.mjs` for extracted backend
      logger/config/middleware/route modules,
    - added backend script:
      - `npm --prefix backend run test:modules`,
    - validated with:
      - `npm --prefix backend run test:modules`
      - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
      - `npm --prefix backend run lint -- tests/modules/extracted-modules.test.mjs`.
  - 2026-02-15 Milestone C/auxiliary continuation (retrieval runtime logger extension):
    - added retrieval runtime logger utility in `retrieval-service/app/logger.py`,
    - migrated runtime retrieval logging from `print(...)` to logger calls in
      `retrieval-service/app/search.py`,
    - info/debug logs are now env-gated by
      `TINGE_RETRIEVAL_DEBUG_LOGS=1`; warnings remain visible,
    - validated module syntax with:
      - `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m compileall retrieval-service/app`.
  - 2026-02-15 frontend test-runner consolidation:
    - removed remaining Jest-based frontend integration invocation from
      `shader-playground/package.json` (`test:audio:integration` now uses Vitest),
    - updated `shader-playground/scripts/run-audio-tests.js` integration runner
      to Vitest and switched test commands to `npx` for consistent execution
      outside npm PATH context,
    - validated with:
      - `npm --prefix shader-playground run test:audio:integration`
      - `node shader-playground/scripts/run-audio-tests.js integration`.
  - 2026-02-15 Milestone C/frontend continuation (device profile adapter):
    - added shared realtime device profile adapter in
      `src/realtime/deviceProfile.js`,
    - rewired `src/openaiRealtime.js` device-specific timings/debug wiring
      through adapter output (`isMobile`, `deviceType`, debounce/release
      buffers, connect feedback),
    - removed unused touch-event counter state from `openaiRealtime.js`,
    - added coverage:
      - `src/tests/realtime/device-profile.test.js`,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/device-profile.test.js tests/integration/ptt-interrupt-path.integration.test.js tests/integration/reconnect-ptt-path.integration.test.js`
      - `npx eslint src/openaiRealtime.js src/realtime/deviceProfile.js src/tests/realtime/device-profile.test.js` (from `shader-playground`).
  - 2026-02-15 retrieval Python task contract:
    - added `retrieval-service/Makefile` with explicit `format`, `lint`,
      `test`, `typecheck`, and `check` targets,
    - added `retrieval-service/requirements-dev.txt` for dev tooling
      (`black`, `ruff`, `mypy`),
    - added baseline unittest coverage in `retrieval-service/tests/`:
      - `test_settings.py`
      - `test_logger.py`,
    - updated `retrieval-service/README.md` with task-contract usage,
    - validated with:
      - `cd retrieval-service && make test`
      - `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m compileall retrieval-service/app retrieval-service/tests`.
  - 2026-02-15 realtime stabilization hotfix (AI bubble visibility):
    - added AI capture fallback on `output_audio_buffer.started` in
      `src/realtime/dataChannelEventRouter.js` so AI utterance records still
      finalize when transcript deltas are missing,
    - added AI bubble-start fallback on `output_audio_buffer.started` in
      `src/realtime/realtimeEventCoordinator.js`,
    - updated `src/realtime/utteranceTranscriptionService.js` to promote
      transcription `fullText` into `record.text` when initial transcript text
      is empty,
    - added/updated tests:
      - `src/tests/realtime/data-channel-event-router.test.js`
      - `src/tests/realtime/realtime-event-coordinator.test.js`
      - `src/tests/realtime/utterance-transcription-service.test.js`
      - validated with `tests/integration/ptt-interrupt-path.integration.test.js`.
  - 2026-02-15 script/doc contract cleanup:
    - updated `embedding-service/package.json` lint scripts to prefer local
      `eslint` with a temporary backend-path fallback for environments with
      stale embedding lockfiles,
    - removed root `package.json` Jest config to avoid ambiguous repository-wide
      test ownership; root integration execution remains explicit via
      `test:integration`,
    - refreshed `docs/realtime_hardening_plan.md` to current architecture and
      remaining hardening actions only.
  - 2026-02-15 Milestone E start (word-ingestion retry/backoff hardening):
    - added explicit embedding retry/backoff policy in
      `src/realtime/wordIngestionService.js` with injectable fetch/timer hooks,
    - retry strategy: bounded exponential backoff with capped delay and
      deterministic fallback to random point after attempts are exhausted,
    - added coverage for repeated failure paths in
      `src/tests/realtime/word-ingestion-service.test.js`:
      - retries then eventual success,
      - exhausted retries fallback behavior,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
      - `npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js` (from `shader-playground`).
  - 2026-02-15 Milestone E continuation (word-ingestion circuit-breaker):
    - added fail-fast circuit-breaker window to
      `src/realtime/wordIngestionService.js` after configurable consecutive
      embedding failures,
    - added embedding health counters + `getEmbeddingHealthStats()` for retry,
      fallback, circuit-open, short-circuit, recovery, and success tracking,
    - added deterministic outage/recovery coverage in
      `src/tests/realtime/word-ingestion-service.test.js`:
      - circuit opens after consecutive failures and short-circuits requests,
      - circuit cooldown recovery resumes embedding fetch and resets failure state,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
      - `npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js` (from `shader-playground`).
  - 2026-02-15 Milestone F start (retrieval data-asset policy guardrails):
    - added enforceable data policy checker:
      `retrieval-service/scripts/check_data_policy.py`,
    - added explicit allowlist for intentional oversized tracked assets:
      `retrieval-service/data/data_asset_allowlist.txt`,
    - wired policy check into retrieval task contract:
      - `retrieval-service/Makefile` target `data-policy`,
      - `retrieval-service/Makefile` `check` now includes `data-policy`,
    - added script coverage:
      - `retrieval-service/tests/test_data_asset_policy.py`,
    - updated retrieval docs/workflow:
      - `retrieval-service/README.md`
      - `retrieval-service/data/import/README.md`,
    - validated with:
      - `cd retrieval-service && make data-policy`
      - `cd retrieval-service && make test`.
  - 2026-02-15 Milestone E completion (word-ingestion health diagnostics wiring):
    - added debug diagnostics helper:
      `src/realtime/wordIngestionHealthReporter.js`,
    - wired health snapshots + error-context stats into `main.js` word queue
      processing path without changing ingestion behavior,
    - added dedicated coverage:
      - `src/tests/realtime/word-ingestion-health-reporter.test.js`,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
      - `npx eslint src/main.js src/realtime/wordIngestionHealthReporter.js src/tests/realtime/word-ingestion-health-reporter.test.js src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js` (from `shader-playground`).
  - 2026-02-15 Milestone F continuation (externalized large-batch defaults):
    - changed top-level RAG wiki batch defaults in `Makefile` to write generated
      large files outside repository tree:
      - `RAG_LARGE_DATA_DIR=/tmp/tinge-rag-data`
      - `WIKI_EN_OUTPUT=$(RAG_LARGE_DATA_DIR)/wiki_en_articles.jsonl`,
    - updated retrieval workflow docs to match externalized default output:
      - `retrieval-service/README.md`
      - `retrieval-service/data/import/README.md`,
    - validated with dry-run commands:
      - `make -n rag-fetch-wiki-en`
      - `make -n rag-scale-wiki-en`
      - `python3 retrieval-service/scripts/check_data_policy.py`.
  - 2026-02-15 Milestone F continuation (legacy generated import cleanup):
    - removed tracked generated batch artifact:
      `retrieval-service/data/import/wiki_en_articles.jsonl`,
    - reduced allowlist footprint to intentional long-lived corpus artifact only:
      `retrieval-service/data/data_asset_allowlist.txt`,
    - validated with:
      - `python3 retrieval-service/scripts/check_data_policy.py`.
  - 2026-02-15 Milestone F continuation (CI policy enforcement):
    - added non-optional CI guard in `.github/workflows/ci.yml`:
      - `python3 retrieval-service/scripts/check_data_policy.py`,
    - data policy violations now fail CI early on push/PR instead of relying
      only on local task discipline.
  - 2026-02-15 Milestone D continuation (realtime guard test contract):
    - added explicit frontend script for reconnect/PTT interruption guard tests:
      - `shader-playground/package.json` -> `test:realtime:guards`,
    - wired non-optional CI step in `.github/workflows/ci.yml`:
      - `cd shader-playground && npm run test:realtime:guards`,
    - validated with:
      - `npm --prefix shader-playground run test:realtime:guards`.
  - 2026-02-15 Milestone D continuation (guard contract expansion):
    - expanded `test:realtime:guards` to include citation path integration:
      - `tests/integration/citation-path.e2e.test.js`,
    - CI guard step now enforces reconnect/PTT interruption + citation-path
      regressions through a single required command.
  - 2026-02-15 Milestone D continuation (reconnect timeout edge-case guard):
    - expanded `tests/integration/reconnect-ptt-path.integration.test.js`
      with reconnect-timeout coverage where the new data channel remains in
      `connecting` state and never opens before `waitForDataChannelOpen` timeout,
    - guard now asserts safe-fail behavior (`data_channel_not_open`) with no
      recording start and no `response.cancel`/`input_audio_buffer.clear` sends,
    - validated with:
      - `npm --prefix shader-playground run test:run -- tests/integration/reconnect-ptt-path.integration.test.js`
      - `npm --prefix shader-playground run test:realtime:guards`
      - `cd shader-playground && npx eslint tests/integration/reconnect-ptt-path.integration.test.js`.
  - 2026-02-15 Milestone D continuation (reconnect double-press race hardening):
    - added reconnect race integration coverage in
      `tests/integration/reconnect-ptt-path.integration.test.js` for rapid
      double PTT press while reconnect token bootstrap is still pending,
    - hardened `src/realtime/pttOrchestrator.js` to return `connecting` after
      `connect()` when session bootstrap is still in-flight (instead of falling
      through to `not_connected`),
    - added deterministic unit coverage in
      `src/tests/realtime/ptt-orchestrator.test.js`,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/ptt-orchestrator.test.js tests/integration/reconnect-ptt-path.integration.test.js`
      - `npm --prefix shader-playground run test:realtime:guards`
      - `cd shader-playground && npx eslint src/realtime/pttOrchestrator.js src/tests/realtime/ptt-orchestrator.test.js tests/integration/reconnect-ptt-path.integration.test.js`.
  - 2026-02-15 Milestone A continuation (root test contract guard):
    - added root contract checker script:
      - `scripts/verify-root-test-contract.js`,
    - added root script:
      - `npm run check:root-test-contract`,
    - wired non-optional CI step in `.github/workflows/ci.yml`:
      - `npm run check:root-test-contract`,
    - validates explicit root test ownership contract:
      - required root `test:*` scripts exist,
      - root `test` composes service + integration scripts,
      - root `test:integration` explicitly targets `tests/integration.test.js`,
      - root does not reintroduce broad `package.json` `jest` scope config,
    - validated with:
      - `npm run check:root-test-contract`.
  - 2026-02-15 Milestone A continuation (README contract sync):
    - updated root README development script section to include:
      - reconnect/PTT guard integration command,
      - `check:readme-scripts` and `check:root-test-contract` contract checks,
    - validated with:
      - `npm run check:readme-scripts`
      - `npm run check:root-test-contract`.
  - 2026-02-15 Milestone C continuation (backend module guard in CI):
    - added non-optional backend extracted-module coverage step in
      `.github/workflows/ci.yml`:
      - `cd backend && npm run test:modules`,
    - keeps route/config/middleware extraction contract protected in CI,
    - validated with:
      - `npm --prefix backend run test:modules`.
  - 2026-02-15 Milestone A continuation (embedding lint decoupling complete):
    - installed local embedding dev dependencies and normalized lint scripts to
      local eslint only in `embedding-service/package.json`:
      - `lint`: `eslint .`
      - `lint:fix`: `eslint . --fix`,
    - removed temporary backend-binary fallback coupling from embedding lint
      contract,
    - validated with:
      - `npm --prefix embedding-service run lint`
      - `npm --prefix embedding-service test -- --runInBand`.
  - 2026-02-15 Milestone F continuation (canonical corpus policy documented):
    - added policy decision record:
      - `retrieval-service/data/CORPUS_STORAGE_POLICY.md`,
    - policy now explicitly states current in-repo corpus decision with
      trigger-based externalization criteria.
  - 2026-02-15 Milestone B continuation (citation/source-panel integration hardening):
    - expanded `tests/integration/citation-path.e2e.test.js` assertions to
      verify source-panel rendering details on re-citation:
      - stable index label,
      - updated source title text,
      - canonical source URL,
      - source metadata label.
  - 2026-02-15 Milestone F continuation (reintroduction guard):
    - added ignore guard for removed generated import artifact:
      - `retrieval-service/data/import/wiki_en_articles.jsonl` in `.gitignore`,
    - prevents accidental re-tracking of large generated wiki batch files.
  - 2026-02-15 Milestone E continuation (word-ingestion telemetry sink):
    - extended `src/realtime/wordIngestionHealthReporter.js` with telemetry
      event constants + callback wiring,
    - wired `src/main.js` queue diagnostics to emit browser events:
      - `tinge:word-ingestion-health`
      - `tinge:word-ingestion-error`,
    - expanded tests:
      - `src/tests/realtime/word-ingestion-health-reporter.test.js`
        (health + error telemetry assertions),
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
      - `cd shader-playground && npx eslint src/main.js src/realtime/wordIngestionHealthReporter.js src/tests/realtime/word-ingestion-health-reporter.test.js`.
  - 2026-02-15 Milestone E continuation (telemetry sink extraction hardening):
    - extracted browser-event dispatch/filtering from `src/main.js` into
      `src/realtime/wordIngestionTelemetrySink.js`,
    - `main.js` now delegates reporter telemetry emission through
      `createWordIngestionTelemetrySink().emit`,
    - added dedicated sink coverage:
      - `src/tests/realtime/word-ingestion-telemetry-sink.test.js`
        (allowed-event dispatch, unknown-event filtering, Event fallback),
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-telemetry-sink.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
      - `cd shader-playground && npx eslint src/main.js src/realtime/wordIngestionTelemetrySink.js src/realtime/wordIngestionHealthReporter.js src/tests/realtime/word-ingestion-telemetry-sink.test.js src/tests/realtime/word-ingestion-health-reporter.test.js`.
  - 2026-02-15 Milestone E continuation (retry policy hardening for non-retryable failures):
    - updated `src/realtime/wordIngestionService.js` retry policy to fail fast
      on non-retryable embedding HTTP statuses (e.g. 400) while keeping retry
      behavior for transient statuses (408/429/5xx),
    - improved diagnostics to report actual attempts made (instead of always
      configured max attempts) in fallback warnings,
    - expanded `src/tests/realtime/word-ingestion-service.test.js` coverage:
      - no retry on HTTP 400,
      - retries remain enabled for HTTP 429 before success,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
  - 2026-02-15 Milestone E continuation (embedding payload validation hardening):
    - added embedding response payload validation in
      `src/realtime/wordIngestionService.js` so malformed `200` payloads
      (missing/non-numeric coordinates) fail fast to fallback instead of
      propagating invalid scene coordinates,
    - preserved compatibility for numeric-string coordinates by normalizing with
      numeric coercion before scene writes,
    - expanded `src/tests/realtime/word-ingestion-service.test.js` coverage:
      - fail-fast fallback on malformed `200` payload,
      - successful ingestion for numeric-string coordinate payloads,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
  - 2026-02-15 Milestone E continuation (circuit-signal classification hardening):
    - updated `src/realtime/wordIngestionService.js` to classify non-retryable
      failures (`4xx` non-transient + malformed `200` payloads) as fallback-only
      signals that do not contribute to outage circuit-breaker opening,
    - circuit breaker now only tracks retryable/transient failure signals;
      non-retryable failures reset failure streak to avoid cross-request
      contamination,
    - expanded `src/tests/realtime/word-ingestion-service.test.js` coverage:
      - non-retryable and malformed failures keep `failureStreak` at `0`,
      - repeated `400` responses do not open/short-circuit circuit breaker,
      - added stats assertions for `nonRetryableFailures` and
        `malformedPayloads`,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
  - 2026-02-15 Milestone E continuation (strict coordinate parsing hardening):
    - tightened coordinate parsing in
      `src/realtime/wordIngestionService.js` to reject `null`/`undefined`/empty
      string coordinate values instead of coercing them to `0`,
    - kept numeric-string support (`"1.5"`) while rejecting blank/invalid
      values, preventing silent bad payload acceptance,
    - expanded `src/tests/realtime/word-ingestion-service.test.js` coverage:
      - `null` coordinate payload is treated as malformed and falls back,
      - empty-string coordinate payload is treated as malformed and falls back,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
  - 2026-02-15 Milestone E continuation (embedding request timeout hardening):
    - added bounded embedding request timeout support in
      `src/realtime/wordIngestionService.js` via abortable fetch flow with
      injectable timeout/AbortController/timer hooks for deterministic tests,
    - timeout failures are now tracked in health stats (`timeouts`) and treated
      as retryable/transient failures,
    - expanded `src/tests/realtime/word-ingestion-service.test.js` coverage:
      - timeout on first attempt triggers retry and then success,
      - timeout count is included in health stats assertions,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
  - 2026-02-15 Milestone E continuation (empty-token ingestion guard):
    - added defensive early-return in
      `src/realtime/wordIngestionService.js` to skip empty/whitespace-only word
      payloads before bubble/render/embedding side effects,
    - prevents empty tokens from polluting `usedWords`, bubble content, and 3D
      point state during noisy transcript splits,
    - expanded `src/tests/realtime/word-ingestion-service.test.js` with
      whitespace/empty input coverage asserting no fetch/bubble/scene writes,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
  - 2026-02-15 Milestone E continuation (invalid input-type ingestion guard):
    - tightened `src/realtime/wordIngestionService.js` input validation to skip
      non-string word payloads (instead of coercing objects/numbers into text),
    - added `skippedWords` health stat counter for empty/non-string drops to
      improve ingestion diagnostics visibility,
    - expanded `src/tests/realtime/word-ingestion-service.test.js` coverage:
      - non-string payloads are ignored with no fetch/bubble/scene writes,
      - skipped-word stats increment for both empty and non-string inputs,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
  - 2026-02-15 Milestone E continuation (oversized-token ingestion guard):
    - added defensive max word length policy in
      `src/realtime/wordIngestionService.js` (`maxWordLength`, default `128`)
      to skip malformed oversized tokens before bubble/embedding/scene writes,
    - expanded health diagnostics with `oversizedWords` counter,
    - expanded `src/tests/realtime/word-ingestion-service.test.js` coverage for
      oversized token skip behavior and diagnostics assertions,
    - validated with:
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
  - 2026-02-16 close-out checkpoint (maintenance mode):
    - re-ran maintenance guard checks without adding new refactor scope:
      - `npm --prefix shader-playground run test:realtime:guards`
      - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
      - `python3 retrieval-service/scripts/check_data_policy.py`,
    - all checks passed; active tech-debt stream is now maintenance-only unless
      a concrete runtime incident appears.
  - 2026-02-16 architecture documentation baseline:
    - added progressive-disclosure subsystem docs under `docs/architecture/`,
    - linked architecture map from `AGENTS.md` for targeted context loading,
    - documented composition roots, ownership boundaries, and guard test map
      for future agent sessions.
  - `src/main.js` currently 248 LOC.

Severity scale: `P0` critical, `P1` high, `P2` medium, `P3` low.  
Effort scale: `S` (<=1 day), `M` (2-4 days), `L` (1+ week).

| Priority | Debt Item | Severity | Effort | Evidence | Recommended Next Step |
|---|---|---|---|---|---|
| 1 | Frontend orchestration is concentrated in one file | P1 | L | `shader-playground/src/main.js` (248 LOC, down from 1215 baseline) | Keep as composition root for now; only extract further when new feature work introduces coupling/instability. |
| 2 | Realtime session class is still multi-responsibility but guarded by explicit integration contract | P1 | L | `shader-playground/src/realtime/session.js` (431 LOC after major extractions) + explicit CI guard `test:realtime:guards` for reconnect/PTT interruption and citation-path flows | Keep `session.js` as composition root and maintain integration guard coverage when lifecycle/PTT/citation wiring changes. |
| 3 | High log noise in production paths | P3 | S | Frontend/runtime paths are logger-gated (`shader-playground`, `backend`, `embedding-service`, `retrieval-service` app runtime); remaining noisy logs are mainly offline/dev scripts | Keep runtime logger policies stable; only reduce script verbosity if CLI output becomes operationally noisy. |
| 4 | Test runner fragmentation in frontend | P3 | S | `shader-playground` now uses Vitest for unit/integration and Playwright for e2e; legacy Jest invocations removed from script surface | Keep this contract stable (Vitest + Playwright) and avoid adding Jest-only paths. |
| 5 | Backend composition root is decomposed and now CI-guarded by module tests | P3 | S | `backend/server.js` (98 LOC, composition root) + `backend/tests/modules/extracted-modules.test.mjs` enforced in CI | Keep composition-root pattern and update module tests with wiring changes. |
| 6 | Root scripts and docs can drift | P2 | S | `README.md` references root `lint:fix`, previously missing in `package.json` | Keep root scripts as canonical contract and add CI check for documented commands. |
| 7 | Tracked backup and test artifacts in repo history | P2 | S | Removed: `shader-playground/src/openaiRealtime.js.bak`, `shader-playground/test-results/audio-tests.xml` | Keep ignore guards (`*.bak`, `test-results/`, `coverage/`) and avoid committing generated files. |
| 8 | Mixed style of mobile/realtime branching increases complexity | P3 | S | `shader-playground/src/openaiRealtime.js` now uses shared `src/realtime/deviceProfile.js`; `session.js` receives normalized `deviceType` | Keep device-specific policy centralized in adapter modules and avoid reintroducing inline branching. |
| 9 | Citation/source wiring remains stateful but now has stronger integration guard coverage | P2 | M | Citation state is extracted and realtime guard suite now covers citation path + source-panel rendering assertions in `tests/integration/citation-path.e2e.test.js` | Keep citation integration guard coverage current when retrieval/source mapping flow changes. |
| 10 | Word ingestion diagnostics are local-runtime only (browser event sink, no backend aggregation) | P3 | S | `src/realtime/wordIngestionHealthReporter.js` emits health/error telemetry and `src/realtime/wordIngestionTelemetrySink.js` dispatches `tinge:word-ingestion-health` / `tinge:word-ingestion-error`; no backend/central metrics bridge is wired | Keep browser-event telemetry contract stable; add backend aggregation only if operational monitoring requirements increase. |
| 11 | Canonical corpus policy is documented and now in monitor-only mode | P3 | S | `retrieval-service/data/CORPUS_STORAGE_POLICY.md` defines current in-repo decision and explicit externalization triggers; guardrails are enforced in CI | Monitor corpus size/perf over time and revisit only if policy triggers are hit. |
| 12 | Python service lacks explicit lint/type/test command surface | P3 | S | `retrieval-service/Makefile` now defines `format/lint/test/typecheck/check`; baseline tests in `retrieval-service/tests/` | Keep Makefile task contract stable and extend coverage incrementally as app logic evolves. |
| 13 | Embedding lint contract parity is restored | P3 | S | `embedding-service/package.json` now uses local eslint scripts only; backend-binary fallback removed | Keep embedding lint scripts service-local and avoid reintroducing cross-service binary coupling. |
| 14 | Root integration-test ownership is now explicitly guarded | P3 | S | Root contract is enforced via `scripts/verify-root-test-contract.js` + CI step `npm run check:root-test-contract` | Keep the contract script updated if root test script structure intentionally changes. |
| 15 | Hardening docs can drift from shipped architecture | P3 | S | `docs/realtime_hardening_plan.md` is refreshed to current-state composition roots and remaining follow-ups | Keep docs synced in each session that changes priorities/architecture. |

## Suggested Next 3 Milestones

1. Feature work priority (near-term)
- Keep tech-debt stream in maintenance mode; only touch these areas when feature work changes the same paths.

2. Milestone D/E guard maintenance (incident-driven)
- Run `test:realtime:guards` and focused ingestion tests when lifecycle/PTT/citation or ingestion code changes.
- Add targeted fixes only for observed regressions/incidents.

3. Milestone F policy monitoring (monitor-only)
- Keep `check_data_policy.py` green and revisit corpus policy only if `CORPUS_STORAGE_POLICY.md` triggers are hit.
