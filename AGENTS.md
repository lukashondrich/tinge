# Session Continuity Guide

Use this file as the starting point for future coding sessions.

## Active Tech Debt Plan

- Primary plan: `docs/tech_debt_register.md`
- Related architecture hardening context: `docs/realtime_hardening_plan.md`

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

## Recommended Next Work Order

1. Milestone A: script/test/lint consistency across services.
2. Milestone B: split `shader-playground/src/main.js` by domain boundaries.
3. Milestone C: split `shader-playground/src/realtime/session.js` and harden reconnect/race handling.

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
