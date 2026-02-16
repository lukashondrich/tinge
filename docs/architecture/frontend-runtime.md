# Frontend Runtime Composition

## Scope

This doc covers scene/UI composition in `shader-playground/src/main.js`.

## Boot Sequence (`main.js`)

1. Guard against duplicate animation loop (`window.__ANIMATING__`).
2. Build UI primitives:
- `DialoguePanel`
- `TokenProgressBar`
- `BubbleManager`
- `SourcePanel`
- onboarding via `createOnboardingUI(...)`
3. Build citation state:
- `CitationTurnState`
- `RetrievalCitationCoordinator`
4. Create scene via `createScene()`.
5. Compose runtime controllers via `createSceneBootstrapController(...)` and `createSceneRuntimeController(...)`.
6. Initialize realtime facade with callbacks (`initOpenAIRealtime(...)`).
7. Start vocabulary hydration (`VocabularyHydrator.loadExistingVocabulary()`).
8. Start animation loop (`sceneRuntimeController.start()`).

## Module Ownership Map

- Scene bootstrap/composition: `shader-playground/src/realtime/sceneBootstrapController.js`
- Orbit interaction lifecycle: `shader-playground/src/realtime/sceneOrbitInteractionController.js`
- Pointer hover/raycast labels: `shader-playground/src/realtime/sceneInteractionController.js`
- Render loop and postprocessing: `shader-playground/src/realtime/sceneRuntimeController.js`
- Runtime math helpers: `shader-playground/src/realtime/sceneRuntimeMath.js`
- Remote audio element bootstrap in page: `shader-playground/src/realtime/remoteAudioController.js`
- Word hydration from persisted vocabulary: `shader-playground/src/realtime/vocabularyHydrator.js`
- Async ingestion queue: `shader-playground/src/realtime/asyncWordQueue.js`
- Word ingestion + embedding calls: `shader-playground/src/realtime/wordIngestionService.js`
- Ingestion health telemetry: `shader-playground/src/realtime/wordIngestionHealthReporter.js`

## Realtime Event Plumbing at Runtime Layer

- Incoming events from `openaiRealtime` are passed to `RealtimeEventCoordinator.handleEvent(...)`.
- `RealtimeEventCoordinator` updates active bubbles and word stream behavior.
- `UtteranceEventProcessor` handles finalized utterance rendering/playback enrichment.
- `addWord(...)` is the central bridge from transcript to 3D ingestion queue.

## Ingestion Reliability Controls

Implemented in `WordIngestionService`:
- Input guards:
  - non-string/empty words skipped,
  - oversized words skipped (`maxWordLength`, default `128`).
- Embedding fetch resilience:
  - timeout (`embeddingRequestTimeoutMs`, default `4000`),
  - retry with exponential backoff,
  - retry classification (retryable vs non-retryable HTTP statuses),
  - transient-failure circuit breaker.
- Fallback behavior:
  - random point when embedding unavailable,
  - health counters for timeouts/retries/fallbacks/circuit/recovery.

## Debug Targets

If UI shows transcript but no 3D points:
1. Check queue + ingestion tests:
- `shader-playground/src/tests/realtime/async-word-queue.test.js`
- `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
2. Inspect embedding endpoint reachability (`/embed-word`).
3. Check ingestion health events in browser:
- `tinge:word-ingestion-health`
- `tinge:word-ingestion-error`

If scene still renders but audio is missing:
1. Check `remoteAudioController` element creation and playback retry-on-gesture.
2. Check `remoteAudioStreamService` attachment path (see realtime session doc).
