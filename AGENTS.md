# Session Continuity Guide

Use this file as the starting point for future coding sessions.

## Active Tech Debt Plan

- Primary plan: `docs/tech_debt_register.md`
- Related architecture hardening context: `docs/realtime_hardening_plan.md`

## Architecture Docs Map (Progressive Disclosure)

Start here when taking a new task:
1. `docs/architecture/README.md`
2. `docs/architecture/system-overview.md`
3. Load only the subsystem doc you need:
- Frontend runtime composition: `docs/architecture/frontend-runtime.md`
- Frontend realtime/PTT/session path: `docs/architecture/frontend-realtime-session.md`
- Frontend citations/dialogue/source panel path: `docs/architecture/frontend-citations-dialogue.md`
- Backend API gateway: `docs/architecture/backend-api.md`
- Retrieval service internals/policy: `docs/architecture/retrieval-service.md`
- Embedding service internals: `docs/architecture/embedding-service.md`
- Test/guard command map: `docs/architecture/testing-guardrails.md`

## Current Status (as of 2026-02-11)

- Tech debt register created and prioritized (top 15 items).
- Repository hygiene baseline completed:
  - removed tracked artifact files (`.bak`, test report XML),
  - added ignore guards (`*.bak`, `*.orig`, `test-results/`, `coverage/`),
  - added missing root script `lint:fix` in `package.json`.
- 2026-02-12: Milestone A in progress:
  - added root/docs drift guard (`npm run check:readme-scripts`) + CI step,
  - added embedding-service lint config/scripts + CI lint job,
  - aligned root scripts with README (`test:watch`, lint coverage across services).
- 2026-02-12: Milestone B started:
  - extracted citation remap + citation turn state from `shader-playground/src/main.js`
    into `shader-playground/src/realtime/citationState.js`,
  - added unit coverage for citation extraction/remap/commit behavior in
    `shader-playground/src/tests/ui/citation-state.test.js`.
- 2026-02-12: Milestone B continued:
  - extracted retrieval citation/telemetry orchestration into
    `shader-playground/src/realtime/retrievalCitationCoordinator.js`,
  - reduced `main.js` event-handler state by removing inline
    `aiStreamingTranscript` / `lastSearchTelemetry` management,
  - added unit coverage in
    `shader-playground/src/tests/ui/retrieval-citation-coordinator.test.js`.
- 2026-02-12: citation stability fix:
  - source identity now prefers URL+language (instead of URL+title+source+language),
    preventing re-citation renumbering when title text varies across turns,
  - regression test added in `src/tests/ui/source-panel.test.js`.
- 2026-02-12: citation marker fallback fix:
  - when final assistant text has no citation marker but pending citation remap
    exists for the turn, UI now appends fallback global markers (e.g. `[3]`)
    instead of dropping citations,
  - regression coverage added in
    `src/tests/ui/retrieval-citation-coordinator.test.js`.
- 2026-02-12: citation regression hardening:
  - prevent stale pending remaps from leaking into new retrieval turns,
  - fallback markers are now filtered to display indexes that actually exist
    in `SourcePanel` registry (prevents orphan markers like `[3]` with no entry).
- 2026-02-12: citation path integration coverage:
  - added E2E-style integration test
    `shader-playground/tests/integration/citation-path.e2e.test.js`
    that exercises full citation flow across turns (start/delta/result/final),
    including re-citation stability and missing-marker fallback.
- 2026-02-12: next Milestone B slice started:
  - extracted async word queue orchestration from `main.js` into
    `shader-playground/src/realtime/asyncWordQueue.js`,
  - added queue behavior tests in
    `shader-playground/src/tests/realtime/async-word-queue.test.js`.
- 2026-02-12: Milestone B word ingestion extraction:
  - moved `processWord` ingestion logic from `main.js` into
    `shader-playground/src/realtime/wordIngestionService.js`,
  - `main.js` now wires `AsyncWordQueue` -> `WordIngestionService`,
  - added unit coverage in
    `shader-playground/src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-12: Milestone B vocabulary hydration extraction:
  - moved vocabulary load/batch logic from `main.js` into
    `shader-playground/src/realtime/vocabularyHydrator.js`,
  - `main.js` now delegates startup hydration to `VocabularyHydrator`,
  - added unit coverage in
    `shader-playground/src/tests/realtime/vocabulary-hydrator.test.js`.
- 2026-02-12: Milestone B animation-loop math extraction:
  - moved filament rebuild math + idle rotate speed math from `main.js` into
    `shader-playground/src/realtime/sceneRuntimeMath.js`,
  - `main.js` now delegates those computations through pure helpers,
  - added unit coverage in
    `shader-playground/src/tests/realtime/scene-runtime-math.test.js`.
- 2026-02-12: Milestone B utterance handler extraction:
  - moved `utterance.added`/`output_audio_buffer.stopped` branch logic from
    `main.js` into `shader-playground/src/realtime/utteranceEventProcessor.js`,
  - audio word mapping + utterance finalize scheduling + 3D label updates now
    flow through `UtteranceEventProcessor`,
  - added unit coverage in
    `shader-playground/src/tests/realtime/utterance-event-processor.test.js`.
- 2026-02-12: Milestone B onboarding extraction:
  - moved onboarding/demo-seed orchestration out of `main.js` into
    `shader-playground/src/ui/onboardingController.js`,
  - rewired hydration callbacks through `onboardingController` helpers
    (`shouldEnableDemoSeed`, `applyDemoSeedVocabulary`),
  - added unit coverage in
    `shader-playground/src/tests/ui/onboarding-controller.test.js`,
  - reduced `shader-playground/src/main.js` from 620 LOC to 446 LOC.
- 2026-02-12: Milestone B scene interaction extraction:
  - moved hover tooltip/raycast pointer interaction from `main.js` into
    `shader-playground/src/realtime/sceneInteractionController.js`,
  - added deterministic cleanup via `dispose()` on `beforeunload`,
  - added unit coverage in
    `shader-playground/src/tests/realtime/scene-interaction-controller.test.js`,
  - reduced `shader-playground/src/main.js` from 446 LOC to 412 LOC.
- 2026-02-12: Milestone B scene runtime extraction:
  - moved animation loop + post-processing setup from `main.js` into
    `shader-playground/src/realtime/sceneRuntimeController.js`,
  - `main.js` now delegates frame orchestration through
    `createSceneRuntimeController(...).start()`,
  - added unit coverage for runtime helper decisions in
    `shader-playground/src/tests/realtime/scene-runtime-controller.test.js`,
  - reduced `shader-playground/src/main.js` from 412 LOC to 299 LOC.
- 2026-02-12: logging policy cleanup (frontend runtime path):
  - added shared logger utility `shader-playground/src/utils/logger.js`,
  - debug/info/log now gated behind localStorage key
    `tinge-debug-logs=1`; warn/error remain always visible,
  - migrated `main.js` + extracted realtime modules to logger defaults:
    - `src/realtime/wordIngestionService.js`
    - `src/realtime/vocabularyHydrator.js`
    - `src/realtime/utteranceEventProcessor.js`
    - `src/realtime/realtimeEventCoordinator.js`
  - added unit coverage for logger behavior in
    `shader-playground/src/tests/utils/logger.test.js`,
  - reduced `shader-playground/src/main.js` from 299 LOC to 294 LOC.
- 2026-02-12: logging policy extension (`scene` + `realtime session`):
  - migrated `shader-playground/src/core/scene.js` to `createLogger`,
    removing direct `console.*` debug noise from label updates,
  - migrated `shader-playground/src/realtime/session.js` to `createLogger`,
    preserving warn/error visibility while gating debug/info/log output,
  - removed inline `eslint-disable-line no-console` suppressions in those files.
- 2026-02-12: Milestone C started (session token usage extraction):
  - extracted token usage batching/posting from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/tokenUsageTracker.js`,
  - `RealtimeSession` now delegates via
    `updateTokenUsageEstimate` / `updateTokenUsageActual` wrappers,
  - added unit coverage in
    `shader-playground/src/tests/realtime/token-usage-tracker.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 1124 LOC to 1077 LOC.
- 2026-02-12: Milestone C continued (knowledge search extraction):
  - extracted knowledge search request/timeout/telemetry + citation index mapping
    from `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/knowledgeSearchService.js`,
  - kept `RealtimeSession.searchKnowledge` / `attachCitationIndexes` as
    compatibility delegates,
  - added unit coverage in
    `shader-playground/src/tests/realtime/knowledge-search-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 1077 LOC to 1020 LOC.
- 2026-02-12: Milestone C continued (function-call extraction):
  - extracted function-call dispatch/output-send orchestration from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/functionCallService.js`,
  - `RealtimeSession.handleFunctionCall` now delegates to the service while
    preserving existing tool events and response output behavior,
  - added unit coverage in
    `shader-playground/src/tests/realtime/function-call-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 1020 LOC to 954 LOC.
- 2026-02-12: Milestone C continued (PTT orchestration extraction):
  - extracted PTT press/release + mic/button status orchestration from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/pttOrchestrator.js`,
  - `RealtimeSession` now keeps method compatibility (`handlePTTPress`,
    `handlePTTRelease`, `setPTTStatus`, `setPTTReadyStatus`,
    `enableMicrophone`, `disableMicrophone`) via delegates,
  - added unit coverage in
    `shader-playground/src/tests/realtime/ptt-orchestrator.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 954 LOC to 896 LOC.
- 2026-02-12: Milestone C continued (connection bootstrap extraction):
  - extracted mobile mic bootstrap, backend reachability check, and token
    request flow from `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/connectionBootstrapService.js`,
  - `RealtimeSession` keeps compatibility via delegating wrappers:
    `initializeMobileMicrophone`, `verifyBackendReachable`,
    `requestEphemeralKey`,
  - added unit coverage in
    `shader-playground/src/tests/realtime/connection-bootstrap-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 896 LOC to 805 LOC.
- 2026-02-12: Milestone C continued (WebRTC transport extraction):
  - extracted peer-connection creation + SDP exchange from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/webrtcTransportService.js`,
  - kept session-level data-channel and message wiring in `session.js` to
    minimize behavioral risk while reducing transport complexity,
  - added unit coverage in
    `shader-playground/src/tests/realtime/webrtc-transport-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 805 LOC to 772 LOC.
- 2026-02-12: hotfix after extraction regression:
  - fixed browser runtime `Illegal invocation` errors caused by unbound globals
    (`fetch`, `setTimeout`, `clearTimeout`, `AbortController`) in extracted
    realtime services by routing defaults through `globalThis`,
  - touched:
    - `shader-playground/src/realtime/tokenUsageTracker.js`
    - `shader-playground/src/realtime/knowledgeSearchService.js`,
  - restored integration test compatibility for newer Node runtimes by defining
    `globalThis.navigator` via `Object.defineProperty` in
    `shader-playground/tests/integration/citation-path.e2e.test.js`.
- 2026-02-12: UI hotfix for user utterance finalization/playback:
  - fixed `DialoguePanel.add()` user-bubble selection to prefer exact
    `data-utterance-id` match before fallback to unfinalized placeholders,
    preventing enhancement of stale older user bubbles,
  - moved `DialoguePanel.resetCache` back to module scope (outside `add()`),
  - added regression coverage in
    `shader-playground/src/tests/audio/dialogue-panel.test.js`.
- 2026-02-12: realtime stabilization follow-up (post Milestone C extraction):
  - fixed first-press behavior in `shader-playground/src/openaiRealtime.js` so
    first PTT press establishes connection only (no immediate commit/response),
  - fixed remote-audio race in `shader-playground/src/realtime/session.js` by
    hydrating existing live audio receiver tracks after peer setup, so AI audio
    recording/playback does not depend solely on late `ontrack`,
  - added AI bubble finalize fallback in
    `shader-playground/src/realtime/realtimeEventCoordinator.js` for transcript
    `done` events when `output_audio_buffer.stopped` is missing,
  - suppressed tool-call JSON payloads from `response.text.delta/done` rendering
    in `shader-playground/src/realtime/realtimeEventCoordinator.js`,
  - kept runtime logs cleaner by removing temporary remote-track diagnostics from
    `shader-playground/src/main.js` and keeping attachment logs debug-gated.
- 2026-02-15: Milestone C continued (session message/transcription extraction + PTT interrupt hardening):
  - extracted data-channel event handling from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/dataChannelEventRouter.js`,
  - extracted user transcription reconciliation/enrichment from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/userTranscriptionService.js`,
  - `RealtimeSession` now delegates message routing and transcription lifecycle
    through the new services (session reduced from 851 LOC to 753 LOC),
  - added explicit PTT interruption wiring:
    - `response.cancel` is sent on PTT press via
      `shader-playground/src/realtime/pttOrchestrator.js`,
    - emitted `assistant.interrupted` UI event and finalized active AI bubble on
      interrupt in `shader-playground/src/realtime/realtimeEventCoordinator.js`,
    - reset in-progress AI local capture state on interrupt via
      `dataChannelEventRouter.abortAiTurnCapture()`,
  - added coverage:
    - `shader-playground/src/tests/realtime/data-channel-event-router.test.js`
    - `shader-playground/src/tests/realtime/user-transcription-service.test.js`
    - updated `ptt-orchestrator` and `realtime-event-coordinator` tests.
- 2026-02-15: Milestone C continued (connection-state hardening + interrupt race coverage):
  - added explicit connection state machine module
    `shader-playground/src/realtime/sessionConnectionState.js`
    (`idle` / `connecting` / `connected` / `reconnecting` / `failed`) and
    rewired `session.js` connection flags to transition through it,
  - updated session reconnect/failure transitions to flow through
    `transitionConnectionState(...)` (data-channel close/open, ICE
    disconnected/failed, connect errors, cleanup),
  - hardened interrupt path in realtime routing:
    - `DataChannelEventRouter` now suppresses stale assistant transcript events
      after interrupt until a drain signal (`output_audio_buffer.stopped` or
      `response.done`) or timeout,
    - `RealtimeEventCoordinator` now clears pending response-text buffers and
      marks interrupted AI bubbles with synthetic utterance IDs before finalize,
      preventing the next assistant turn from reusing the same bubble,
    - `RetrievalCitationCoordinator` adds `resetStreamingTranscript()` so
      interrupted turns do not leak stale streaming text/citation remaps.
  - added/updated coverage:
    - `shader-playground/src/tests/realtime/session-connection-state.test.js`
    - `shader-playground/tests/integration/ptt-interrupt-path.integration.test.js`
    - `shader-playground/src/tests/ui/retrieval-citation-coordinator.test.js`
      (stream reset assertion)
    - expanded router/coordinator interruption assertions.
- 2026-02-15: Milestone C continued (connection lifecycle extraction):
  - extracted connect/peer bootstrap orchestration from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/connectionLifecycleService.js`,
  - `RealtimeSession` now delegates:
    - `connect()`
    - `waitForDataChannelOpen()`
    - `establishPeerConnection()`
    through `connectionLifecycleService`,
  - preserved compatibility wrappers for mobile bootstrap/token request methods
    in `session.js` while removing inline connection orchestration,
  - added dedicated unit coverage in
    `shader-playground/src/tests/realtime/connection-lifecycle-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 770 LOC to 731 LOC.
- 2026-02-15: Milestone C continued (session config/prompt + remote audio extraction):
  - extracted session `session.update` payload/tool schema construction from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/sessionConfigurationBuilder.js`,
  - extracted system prompt YAML fetch/parse/send flow from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/systemPromptService.js`,
  - extracted remote audio track orchestration (ontrack wiring, live receiver
    hydration, dedupe, AI recorder attachment) into
    `shader-playground/src/realtime/remoteAudioStreamService.js`,
  - `RealtimeSession` now delegates:
    - `sendSessionConfiguration()`
    - `sendSystemPrompt()`
    - `setupPeerTrackHandling()`
    - `tryHydrateExistingRemoteAudioTrack()`
    - `handleIncomingRemoteStream()`
    via dedicated services,
  - added dedicated tests:
    - `shader-playground/src/tests/realtime/session-configuration-builder.test.js`
    - `shader-playground/src/tests/realtime/system-prompt-service.test.js`
    - `shader-playground/src/tests/realtime/remote-audio-stream-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 731 LOC to 490 LOC.
- 2026-02-15: Milestone C follow-up (interrupted AI bubble playback finalize):
  - wired a stable interrupted utterance id through PTT interrupt events in
    `shader-playground/src/realtime/pttOrchestrator.js` and
    `shader-playground/src/realtime/realtimeEventCoordinator.js`,
  - updated interrupt capture flow in
    `shader-playground/src/realtime/dataChannelEventRouter.js` to emit
    `utterance.added` from partial AI capture on interrupt (instead of dropping
    the record), allowing interrupted AI bubbles to receive playback controls
    when audio is available,
  - added/updated regression coverage:
    - `shader-playground/src/tests/realtime/data-channel-event-router.test.js`
    - `shader-playground/src/tests/realtime/ptt-orchestrator.test.js`
    - `shader-playground/src/tests/realtime/realtime-event-coordinator.test.js`
    - `shader-playground/tests/integration/ptt-interrupt-path.integration.test.js`.
- 2026-02-15: Milestone C continuation (token limit extraction):
  - extracted token limit preflight check from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/tokenLimitService.js`,
  - kept compatibility wrapper `RealtimeSession.checkTokenLimit()` as a
    delegate to `tokenLimitService`,
  - added dedicated coverage in
    `shader-playground/src/tests/realtime/token-limit-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 490 LOC to 478 LOC.
- 2026-02-15: Milestone C continuation (utterance transcription extraction):
  - extracted transcription upload/word-timing enrichment flow from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/utteranceTranscriptionService.js`,
  - `RealtimeSession.fetchWordTimings()` and
    `RealtimeSession.stopAndTranscribe()` now delegate to the service while
    preserving compatibility for downstream modules,
  - added dedicated coverage in
    `shader-playground/src/tests/realtime/utterance-transcription-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 478 LOC to 465 LOC.
- 2026-02-15: Milestone C continuation (connect error presenter extraction):
  - extracted connect-error status mapping + delayed UI fallback from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/connectionErrorPresenter.js`,
  - `RealtimeSession.handleConnectError()` now delegates through the presenter
    while preserving existing lifecycle integration behavior,
  - added dedicated coverage in
    `shader-playground/src/tests/realtime/connection-error-presenter.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 465 LOC to 449 LOC.
- 2026-02-15: Milestone C continuation (reconnect integration coverage):
  - added integration test
    `shader-playground/tests/integration/reconnect-ptt-path.integration.test.js`
    covering:
    - data-channel close -> `reconnecting` state transition,
    - resumed PTT press triggering reconnect bootstrap,
    - successful post-reconnect PTT turn start (`response.cancel`,
      `input_audio_buffer.clear`, mic enable + speech-start event),
  - validated with targeted lifecycle/PTT/connection-state suite.
- 2026-02-15: Milestone C continuation (outbound text message extraction):
  - extracted `sendTextMessage` payload/send logic from
    `shader-playground/src/realtime/session.js` into
    `shader-playground/src/realtime/outboundMessageService.js`,
  - `RealtimeSession.sendTextMessage()` now delegates through the service while
    preserving API behavior,
  - added dedicated coverage in
    `shader-playground/src/tests/realtime/outbound-message-service.test.js`,
  - reduced `shader-playground/src/realtime/session.js` from 449 LOC to 431 LOC.
- 2026-02-15: Milestone B continuation (main remote-audio bootstrap extraction):
  - extracted remote AI audio element creation/playback gesture-retry lifecycle
    from `shader-playground/src/main.js` into
    `shader-playground/src/realtime/remoteAudioController.js`,
  - `main.js` now delegates remote stream attach + cleanup via
    `createRemoteAudioController(...)`,
  - added dedicated coverage in
    `shader-playground/src/tests/realtime/remote-audio-controller.test.js`,
  - reduced `shader-playground/src/main.js` from 332 LOC to 298 LOC.
- 2026-02-15: Milestone B continuation (main orbit interaction extraction):
  - extracted OrbitControls setup + user interaction tracking/listener cleanup
    from `shader-playground/src/main.js` into
    `shader-playground/src/realtime/sceneOrbitInteractionController.js`,
  - `main.js` now delegates controls init + interaction state getters + dispose
    through `createSceneOrbitInteractionController(...)`,
  - added dedicated coverage in
    `shader-playground/src/tests/realtime/scene-orbit-interaction-controller.test.js`,
  - reduced `shader-playground/src/main.js` from 298 LOC to 275 LOC.
- 2026-02-15: Milestone B continuation (scene bootstrap composition extraction):
  - extracted scene bootstrap composition from `shader-playground/src/main.js`
    into `shader-playground/src/realtime/sceneBootstrapController.js`, covering:
    - renderer + orbit interaction + scene interaction + remote audio bootstrap,
    - touch rotation hook wiring,
    - composed beforeunload cleanup registration/disposal,
  - `main.js` now delegates bootstrap and beforeunload cleanup through
    `createSceneBootstrapController(...)`,
  - added dedicated coverage in
    `shader-playground/src/tests/realtime/scene-bootstrap-controller.test.js`,
  - reduced `shader-playground/src/main.js` from 275 LOC to 248 LOC.
- 2026-02-15: Milestone B checkpoint decision (`main.js` composition root):
  - reviewed remaining `shader-playground/src/main.js` wiring after recent
    extractions (`remoteAudioController`, `sceneOrbitInteractionController`,
    `sceneBootstrapController`),
  - decision: keep `main.js` as composition root for now; further splitting
    would mostly move dependency wiring without reducing behavioral risk,
  - prioritize integration coverage + non-`main.js` debt unless new coupling
    emerges in future feature work.
- 2026-02-15: Milestone C/backend continuation (knowledge route extraction):
  - extracted `/knowledge/search` request normalization + timeout/proxy behavior
    from `backend/server.js` into
    `backend/src/routes/knowledgeSearchRoute.js`,
  - rewired `server.js` route registration to delegate through
    `createKnowledgeSearchHandler(...)`,
  - reduced `backend/server.js` from 340 LOC to 280 LOC,
  - validated behavior with backend tests/lint:
    - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
    - `npm --prefix backend run lint -- server.js src/routes/knowledgeSearchRoute.js`.
- 2026-02-15: Milestone C/backend continuation (token route extraction):
  - extracted `/token` request/response + OpenAI error mapping + token usage init
    from `backend/server.js` into `backend/src/routes/tokenRoute.js`,
  - rewired `server.js` token route registration to delegate through
    `createTokenHandler(...)`,
  - reduced `backend/server.js` from 280 LOC to 206 LOC,
  - validated behavior with backend tests/lint:
    - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
    - `npm --prefix backend run lint -- server.js src/routes/tokenRoute.js src/routes/knowledgeSearchRoute.js`.
- 2026-02-15: Milestone C/backend continuation (transcribe route extraction):
  - extracted `/transcribe` multipart/form-data OpenAI proxy flow from
    `backend/server.js` into `backend/src/routes/transcribeRoute.js`,
  - rewired `server.js` transcribe route registration to delegate through
    `createTranscribeHandler(...)`,
  - reduced `backend/server.js` from 206 LOC to 185 LOC,
  - validated behavior with backend tests/lint:
    - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
    - `npm --prefix backend run lint -- server.js src/routes/tokenRoute.js src/routes/transcribeRoute.js src/routes/knowledgeSearchRoute.js`.
- 2026-02-15: Milestone C/backend continuation (middleware/config extraction):
  - extracted backend CORS policy builder to
    `backend/src/config/corsOptions.js`,
  - extracted request logging middleware to
    `backend/src/middleware/requestLogger.js`,
  - extracted startup banner logging to
    `backend/src/logging/startupBanner.js`,
  - rewired `backend/server.js` to compose these modules while preserving
    existing behavior.
- 2026-02-15: Milestone C/backend continuation (token usage route extraction):
  - extracted `/token-usage/*` + `/token-stats` endpoints from
    `backend/server.js` into `backend/src/routes/tokenUsageRoutes.js`,
  - rewired `server.js` via `app.use(createTokenUsageRouter(...))`,
  - reduced `backend/server.js` from 185 LOC to 96 LOC,
  - validated behavior with backend tests/lint:
    - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
    - `npm --prefix backend run lint -- server.js src/config/corsOptions.js src/middleware/requestLogger.js src/logging/startupBanner.js src/routes/tokenRoute.js src/routes/transcribeRoute.js src/routes/knowledgeSearchRoute.js src/routes/tokenUsageRoutes.js`.
- 2026-02-15: realtime AI-bubble visibility hotfix (live transcript gaps):
  - added AI capture fallback start on `output_audio_buffer.started` in
    `shader-playground/src/realtime/dataChannelEventRouter.js` so AI clip
    recording/transcription still proceeds when transcript deltas are delayed or
    missing,
  - added AI bubble-start fallback on `output_audio_buffer.started` in
    `shader-playground/src/realtime/realtimeEventCoordinator.js`,
  - updated `shader-playground/src/realtime/utteranceTranscriptionService.js`
    to promote transcription `fullText` into `record.text` when initial text is
    empty, ensuring rendered AI bubble text after fallback capture,
  - added/updated coverage:
    - `src/tests/realtime/data-channel-event-router.test.js`
    - `src/tests/realtime/realtime-event-coordinator.test.js`
    - `src/tests/realtime/utterance-transcription-service.test.js`.
- 2026-02-15: Milestone C/backend continuation (logging policy extension):
  - added backend shared logger utility:
    `backend/src/utils/logger.js` with env-gated debug/info/log
    (`TINGE_BACKEND_DEBUG_LOGS=1`) while keeping warn/error always visible,
  - rewired `backend/server.js` extracted modules to use shared logger
    (`corsOptions`, request logger, startup banner, token/transcribe/knowledge
    routes),
  - migrated `backend/src/services/tokenCounter.js` off direct `console.*` to
    shared logger methods,
  - `backend/server.js` now 98 LOC and remains composition root,
  - validated behavior with backend tests/lint:
    - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
    - `npm --prefix backend run lint -- server.js src/utils/logger.js src/services/tokenCounter.js src/config/corsOptions.js src/middleware/requestLogger.js src/logging/startupBanner.js src/routes/tokenRoute.js src/routes/transcribeRoute.js src/routes/knowledgeSearchRoute.js src/routes/tokenUsageRoutes.js`.
- 2026-02-15: Milestone C/auxiliary continuation (embedding logger policy extension):
  - added shared logger utility to `embedding-service/logger.js` with
    env-gated debug/info/log (`TINGE_EMBEDDING_DEBUG_LOGS=1`) while keeping
    warn/error always visible,
  - migrated `embedding-service/server.js` off direct `console.*` to shared
    logger methods,
  - validated with:
    - `npm --prefix embedding-service test -- --runInBand`
    - `npm --prefix embedding-service run lint -- server.js logger.js`.
- 2026-02-15: Milestone C/backend continuation (extracted module coverage):
  - added focused module-level tests for extracted backend modules in
    `backend/tests/modules/extracted-modules.test.mjs`, covering:
    - `src/utils/logger.js`
    - `src/config/corsOptions.js`
    - `src/middleware/requestLogger.js`
    - `src/logging/startupBanner.js`
    - `src/routes/tokenRoute.js`
    - `src/routes/transcribeRoute.js`
    - `src/routes/knowledgeSearchRoute.js`
    - `src/routes/tokenUsageRoutes.js`,
  - added backend script:
    - `npm --prefix backend run test:modules`,
  - validated with:
    - `npm --prefix backend run test:modules`
    - `npm --prefix backend test -- --runInBand tests/api.test.js tests/server.test.js`
    - `npm --prefix backend run lint -- tests/modules/extracted-modules.test.mjs`.
- 2026-02-15: Milestone C/auxiliary continuation (retrieval runtime logger extension):
  - added retrieval runtime logger utility:
    `retrieval-service/app/logger.py` with env-gated info/debug
    (`TINGE_RETRIEVAL_DEBUG_LOGS=1`) and always-visible warnings,
  - migrated runtime retrieval instrumentation from `print(...)` to logger
    calls in `retrieval-service/app/search.py`,
  - validated module syntax with:
    - `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m compileall retrieval-service/app`.
- 2026-02-15: frontend test-runner consolidation (Vitest + Playwright):
  - removed remaining Jest usage from `shader-playground` script surface:
    - `test:audio:integration` now uses Vitest
      (`vitest run tests/integration/audio-integration.test.js`),
    - updated `shader-playground/scripts/run-audio-tests.js` integration path
      from Jest to Vitest and switched runner commands to `npx` for
      PATH-independent execution,
  - validated with:
    - `npm --prefix shader-playground run test:audio:integration`
    - `node shader-playground/scripts/run-audio-tests.js integration`.
- 2026-02-15: Milestone C/frontend continuation (device profile adapter):
  - added shared realtime device profile adapter:
    `shader-playground/src/realtime/deviceProfile.js`,
  - rewired `shader-playground/src/openaiRealtime.js` mobile-specific timings
    and debug wiring through `resolveRealtimeDeviceProfile(...)`,
  - removed unused touch-event counter state from `openaiRealtime.js`,
  - added unit coverage:
    - `shader-playground/src/tests/realtime/device-profile.test.js`,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/device-profile.test.js tests/integration/ptt-interrupt-path.integration.test.js tests/integration/reconnect-ptt-path.integration.test.js`
    - `npx eslint src/openaiRealtime.js src/realtime/deviceProfile.js src/tests/realtime/device-profile.test.js` (run from `shader-playground`).
- 2026-02-15: retrieval Python task contract (format/lint/test/typecheck):
  - added `retrieval-service/Makefile` command surface:
    - `make format`
    - `make lint`
    - `make test`
    - `make typecheck`
    - `make check`,
  - added `retrieval-service/requirements-dev.txt` for dev tooling
    (`black`, `ruff`, `mypy`),
  - added baseline unit tests in `retrieval-service/tests/`:
    - `test_settings.py`
    - `test_logger.py`,
  - updated `retrieval-service/README.md` with task-contract usage,
  - validated with:
    - `cd retrieval-service && make test`
    - `PYTHONPYCACHEPREFIX=/tmp/pycache python3 -m compileall retrieval-service/app retrieval-service/tests`.
- 2026-02-15: script/doc contract cleanup:
  - updated `embedding-service/package.json` lint scripts to prefer local
    `eslint` binaries with temporary backend-path fallback for environments
    missing local eslint installs,
  - removed root `package.json` Jest scope config and kept root integration
    ownership explicit via `test:integration`,
  - refreshed `docs/realtime_hardening_plan.md` to current architecture and
    remaining follow-up work only.
- 2026-02-15: Milestone E start (word-ingestion retry/backoff hardening):
  - added bounded embedding retry/backoff behavior to
    `shader-playground/src/realtime/wordIngestionService.js` with injectable
    fetch/timer hooks for deterministic tests,
  - fallback behavior now explicitly retries before random-point degrade path,
  - added failure-mode coverage in
    `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
    (retry success + retry exhaustion fallback),
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
    - `npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js` (from `shader-playground`).
- 2026-02-15: Milestone E continuation (word-ingestion circuit-breaker):
  - added fail-fast circuit-breaker window to
    `shader-playground/src/realtime/wordIngestionService.js` after repeated
    embedding failures,
  - added embedding health counters and `getEmbeddingHealthStats()` to track
    retry/fallback/circuit-open/short-circuit/recovery/success transitions,
  - added deterministic tests in
    `shader-playground/src/tests/realtime/word-ingestion-service.test.js` for
    circuit-open short-circuiting and post-cooldown recovery,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
    - `npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js` (from `shader-playground`).
- 2026-02-15: Milestone F start (retrieval data-asset policy guardrails):
  - added enforceable retrieval data policy checker:
    `retrieval-service/scripts/check_data_policy.py`,
  - added explicit allowlist for intentional oversized assets:
    `retrieval-service/data/data_asset_allowlist.txt`,
  - wired policy into retrieval task contract:
    - `retrieval-service/Makefile` `data-policy`
    - `retrieval-service/Makefile` `check` includes `data-policy`,
  - added unittest coverage:
    - `retrieval-service/tests/test_data_asset_policy.py`,
  - updated data workflow docs:
    - `retrieval-service/README.md`
    - `retrieval-service/data/import/README.md`,
  - validated with:
    - `cd retrieval-service && make data-policy`
    - `cd retrieval-service && make test`.
- 2026-02-15: Milestone E completion (word-ingestion health diagnostics wiring):
  - added debug diagnostics helper:
    `shader-playground/src/realtime/wordIngestionHealthReporter.js`,
  - wired ingestion health snapshots + error-context stats into
    `shader-playground/src/main.js` queue processing flow (debug logs only),
  - added dedicated tests:
    - `shader-playground/src/tests/realtime/word-ingestion-health-reporter.test.js`,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
    - `npx eslint src/main.js src/realtime/wordIngestionHealthReporter.js src/tests/realtime/word-ingestion-health-reporter.test.js src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js` (from `shader-playground`).
- 2026-02-15: Milestone E continuation (word-ingestion browser telemetry events):
  - extended `shader-playground/src/realtime/wordIngestionHealthReporter.js`
    with telemetry event constants + callback plumbing,
  - wired `shader-playground/src/main.js` queue diagnostics to emit:
    - `tinge:word-ingestion-health`
    - `tinge:word-ingestion-error`
    via `window.dispatchEvent(new CustomEvent(...))`,
  - expanded telemetry assertions in
    `shader-playground/src/tests/realtime/word-ingestion-health-reporter.test.js`,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
    - `cd shader-playground && npx eslint src/main.js src/realtime/wordIngestionHealthReporter.js src/tests/realtime/word-ingestion-health-reporter.test.js`.
- 2026-02-15: Milestone E continuation (word-ingestion telemetry sink extraction):
  - extracted browser event dispatch/filtering from
    `shader-playground/src/main.js` into
    `shader-playground/src/realtime/wordIngestionTelemetrySink.js`,
  - `main.js` now delegates ingestion telemetry emission via
    `createWordIngestionTelemetrySink().emit`,
  - added dedicated tests:
    - `shader-playground/src/tests/realtime/word-ingestion-telemetry-sink.test.js`,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-telemetry-sink.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js`
    - `cd shader-playground && npx eslint src/main.js src/realtime/wordIngestionTelemetrySink.js src/realtime/wordIngestionHealthReporter.js src/tests/realtime/word-ingestion-telemetry-sink.test.js src/tests/realtime/word-ingestion-health-reporter.test.js`.
- 2026-02-15: Milestone E continuation (non-retryable embedding failure hardening):
  - updated `shader-playground/src/realtime/wordIngestionService.js` to fail
    fast on non-retryable embedding HTTP statuses (e.g. 400) while retaining
    retries for transient statuses (408/429/5xx),
  - improved fallback warning diagnostics to report actual attempts made,
  - expanded `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
    with:
    - no retry on HTTP 400,
    - retry-once and success flow for HTTP 429,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-15: Milestone E continuation (embedding payload validation hardening):
  - added embedding payload validation in
    `shader-playground/src/realtime/wordIngestionService.js` so malformed `200`
    coordinate payloads fail fast to fallback instead of writing invalid scene
    positions,
  - retained compatibility for numeric-string coordinates by coercing validated
    values before scene writes,
  - expanded `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
    with malformed-payload fallback and numeric-string acceptance coverage,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-15: Milestone E continuation (circuit signal classification hardening):
  - updated `shader-playground/src/realtime/wordIngestionService.js` to treat
    non-retryable failures (`4xx` non-transient + malformed `200` payloads) as
    fallback-only signals that do not open or feed the outage circuit breaker,
  - non-retryable failure path now resets failure streak to prevent stale
    transient-failure carryover into later words,
  - expanded `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
    with assertions that:
    - non-retryable/malformed failures keep `failureStreak` at `0`,
    - repeated `400` responses do not trigger circuit open/short-circuit,
    - `nonRetryableFailures`/`malformedPayloads` stats are tracked,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-15: Milestone E continuation (strict coordinate parsing hardening):
  - tightened coordinate parsing in
    `shader-playground/src/realtime/wordIngestionService.js` to reject
    `null`/`undefined`/empty-string coordinate values (instead of coercing to
    `0`) while still accepting numeric-string values,
  - expanded `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
    with malformed payload coverage for:
    - `null` coordinates,
    - empty-string coordinates,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-15: Milestone E continuation (embedding request timeout hardening):
  - added bounded request-timeout support in
    `shader-playground/src/realtime/wordIngestionService.js` using abortable
    fetch handling with injectable timeout/AbortController/timer hooks,
  - timeout failures are now tracked in ingestion health stats (`timeouts`) and
    handled as retryable transient failures,
  - expanded `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
    with timeout-retry coverage and timeout stats assertions,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-15: Milestone E continuation (empty-token ingestion guard):
  - added defensive early-return in
    `shader-playground/src/realtime/wordIngestionService.js` for empty or
    whitespace-only word payloads before bubble/embedding/scene writes,
  - prevents noisy transcript tokenization artifacts from polluting `usedWords`,
    dialogue bubbles, and 3D point registry,
  - expanded `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
    with empty/whitespace payload assertions (no fetch, no bubble, no scene write),
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-15: Milestone E continuation (invalid input-type ingestion guard):
  - tightened `shader-playground/src/realtime/wordIngestionService.js` input
    validation to skip non-string word payloads instead of coercing values like
    numbers/objects into ingestion tokens,
  - added `skippedWords` diagnostics counter to embedding health stats so
    dropped empty/non-string tokens are visible in snapshots,
  - expanded `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
    with non-string input coverage and skipped-word counter assertions,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-15: Milestone E continuation (oversized-token ingestion guard):
  - added max token-length guard in
    `shader-playground/src/realtime/wordIngestionService.js`
    (`maxWordLength`, default `128`) to skip malformed oversized tokens before
    bubble/embedding/scene side effects,
  - expanded ingestion health stats with `oversizedWords` counter,
  - added oversized-token coverage in
    `shader-playground/src/tests/realtime/word-ingestion-service.test.js`,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `cd shader-playground && npx eslint src/realtime/wordIngestionService.js src/tests/realtime/word-ingestion-service.test.js`.
- 2026-02-15: Milestone F continuation (externalized large-batch defaults):
  - changed top-level Make defaults for generated wiki batch output to external
    storage path:
    - `RAG_LARGE_DATA_DIR=/tmp/tinge-rag-data`
    - `WIKI_EN_OUTPUT=$(RAG_LARGE_DATA_DIR)/wiki_en_articles.jsonl`,
  - updated retrieval docs to reflect externalized default output and explicit
    repo-local override:
    - `retrieval-service/README.md`
    - `retrieval-service/data/import/README.md`,
  - validated with:
    - `make -n rag-fetch-wiki-en`
    - `make -n rag-scale-wiki-en`
    - `python3 retrieval-service/scripts/check_data_policy.py`.
- 2026-02-15: Milestone F continuation (legacy generated import cleanup):
  - removed tracked generated batch artifact:
    `retrieval-service/data/import/wiki_en_articles.jsonl`,
  - reduced `retrieval-service/data/data_asset_allowlist.txt` to intentional
    long-lived corpus artifact only,
  - validated with:
    - `python3 retrieval-service/scripts/check_data_policy.py`.
- 2026-02-15: Milestone F continuation (CI policy enforcement):
  - added non-optional CI guard in `.github/workflows/ci.yml`:
    - `python3 retrieval-service/scripts/check_data_policy.py`,
  - retrieval data policy violations now fail PR/push CI early.
- 2026-02-15: Milestone D continuation (realtime guard test contract):
  - added explicit frontend script:
    - `shader-playground/package.json` -> `test:realtime:guards`,
  - wired non-optional CI step in `.github/workflows/ci.yml`:
    - `cd shader-playground && npm run test:realtime:guards`,
  - validated with:
    - `npm --prefix shader-playground run test:realtime:guards`.
- 2026-02-15: Milestone D continuation (guard contract expansion):
  - expanded `test:realtime:guards` to include citation integration guard:
    - `tests/integration/citation-path.e2e.test.js`,
  - validated with:
    - `npm --prefix shader-playground run test:realtime:guards`.
- 2026-02-15: Milestone D continuation (reconnect timeout integration guard):
  - expanded `shader-playground/tests/integration/reconnect-ptt-path.integration.test.js`
    with reconnect timeout coverage where the new data channel remains
    `connecting` and never opens before `waitForDataChannelOpen` timeout,
  - guard now asserts safe-fail behavior (`data_channel_not_open`) with no
    recording start and no `response.cancel`/`input_audio_buffer.clear` sends,
  - validated with:
    - `npm --prefix shader-playground run test:run -- tests/integration/reconnect-ptt-path.integration.test.js`
    - `npm --prefix shader-playground run test:realtime:guards`
    - `cd shader-playground && npx eslint tests/integration/reconnect-ptt-path.integration.test.js`.
- 2026-02-15: Milestone D continuation (reconnect double-press race hardening):
  - expanded `shader-playground/tests/integration/reconnect-ptt-path.integration.test.js`
    to cover rapid double-press during pending reconnect bootstrap,
  - hardened `shader-playground/src/realtime/pttOrchestrator.js` to return
    `connecting` after `connect()` when bootstrap is still in-flight,
    preventing fallback `not_connected` classification in this race window,
  - added dedicated unit coverage in
    `shader-playground/src/tests/realtime/ptt-orchestrator.test.js`,
  - validated with:
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/ptt-orchestrator.test.js tests/integration/reconnect-ptt-path.integration.test.js`
    - `npm --prefix shader-playground run test:realtime:guards`
    - `cd shader-playground && npx eslint src/realtime/pttOrchestrator.js src/tests/realtime/ptt-orchestrator.test.js tests/integration/reconnect-ptt-path.integration.test.js`.
- 2026-02-15: Milestone A continuation (root test contract guard):
  - added root contract checker:
    - `scripts/verify-root-test-contract.js`,
  - added root script:
    - `npm run check:root-test-contract`,
  - wired non-optional CI step in `.github/workflows/ci.yml`:
    - `npm run check:root-test-contract`,
  - validated with:
    - `npm run check:root-test-contract`.
- 2026-02-15: Milestone A continuation (README contract sync):
  - updated root README development script section with:
    - reconnect/PTT guard integration command,
    - `check:readme-scripts` and `check:root-test-contract` checks,
  - validated with:
    - `npm run check:readme-scripts`
    - `npm run check:root-test-contract`.
- 2026-02-15: Milestone C continuation (backend module guard in CI):
  - added non-optional CI step in `.github/workflows/ci.yml`:
    - `cd backend && npm run test:modules`,
  - validated with:
    - `npm --prefix backend run test:modules`.
- 2026-02-15: Milestone A continuation (embedding lint decoupling complete):
  - normalized `embedding-service/package.json` lint scripts to local eslint:
    - `lint`: `eslint .`
    - `lint:fix`: `eslint . --fix`,
  - removed temporary backend-binary lint fallback coupling,
  - validated with:
    - `npm --prefix embedding-service run lint`
    - `npm --prefix embedding-service test -- --runInBand`.
- 2026-02-15: Milestone F continuation (canonical corpus policy documented):
  - added canonical corpus decision record:
    - `retrieval-service/data/CORPUS_STORAGE_POLICY.md`,
  - policy now explicitly defines in-repo corpus decision + trigger-based
    externalization criteria.
- 2026-02-15: Milestone B continuation (citation/source-panel integration hardening):
  - expanded `shader-playground/tests/integration/citation-path.e2e.test.js`
    assertions to verify source-panel rendering behavior on re-citation
    (index/title/url/meta),
  - validated with:
    - `npm --prefix shader-playground run test:run -- tests/integration/citation-path.e2e.test.js`
    - `npm --prefix shader-playground run test:realtime:guards`.
- 2026-02-15: Milestone F continuation (reintroduction guard):
  - added `.gitignore` guard for removed generated import artifact:
    - `retrieval-service/data/import/wiki_en_articles.jsonl`,
  - prevents accidental re-tracking of oversized generated wiki batch output.
- 2026-02-16: tech-debt stream close-out checkpoint (maintenance mode):
  - re-ran maintenance guard suite:
    - `npm --prefix shader-playground run test:realtime:guards`
    - `npm --prefix shader-playground run test:run -- src/tests/realtime/word-ingestion-service.test.js src/tests/realtime/async-word-queue.test.js src/tests/realtime/word-ingestion-health-reporter.test.js src/tests/realtime/word-ingestion-telemetry-sink.test.js`
    - `python3 retrieval-service/scripts/check_data_policy.py`
  - all checks passed; further work is now incident-driven/maintenance-only
    unless new concrete regressions appear.
- 2026-02-16: architecture documentation baseline added for future agents:
  - created progressive-disclosure architecture docs under `docs/architecture/`,
  - linked subsystem docs from this file so agents can load only relevant context,
  - documented composition roots, service ownership boundaries, and guard test map.

## Recommended Next Work Order

1. Feature work first: keep this tech-debt stream in maintenance mode.
2. Runtime guard maintenance: run `test:realtime:guards` + focused ingestion tests when touching realtime/ingestion paths.
3. Data workflow policy monitoring: keep `check_data_policy.py` green; revisit only if `CORPUS_STORAGE_POLICY.md` triggers are hit.

## Handoff Notes

- Respect existing local/uncommitted changes before editing.
- Update `docs/tech_debt_register.md` whenever priorities or status change.
- Keep this file short and current; this is the first file to check in a new session.

## Branch Safety Policy

- Do not do development work directly on `main`.
- For tech debt/refactor work, create or reuse a dedicated branch first.
- Recommended branch naming:
  - `chore/tech-debt-*` for cleanup/refactors
  - `feat/*` for new features
  - `fix/*` for bug fixes
- Merge to `main` only via reviewed pull requests after checks pass.

## Session Update Protocol

At the end of each coding session, update this file with:

1. `Current Status`:
- Add a short date-stamped bullet describing what was completed.

2. `Recommended Next Work Order`:
- Adjust the top 1-3 next actions if priorities changed.

3. Plan synchronization:
- If priorities/severity changed, also update `docs/tech_debt_register.md` in the same session.
