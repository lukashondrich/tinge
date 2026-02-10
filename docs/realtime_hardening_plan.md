# Realtime Voice Loop Hardening Plan

## Current Flow (High-Level)
- `openaiRealtime.js` mixes UI wiring, WebRTC session management, token usage telemetry, function-call plumbing, and mobile fallbacks in ~1400 LOC of shared state.
- Push-to-talk (PTT) presses trigger `startBubble` via synthetic `input_audio_buffer.speech_started` events. Release stores a pending `AudioManager` record and later reconciles it when the backend transcription arrives.
- `main.js` owns bubble placeholders, delta accumulation, word-queue ingestion, point-cloud updates, and frequently manipulates DOM nodes the `DialoguePanel` also mutates.

This coupling works but makes recovery from failures and future features (e.g., moving selected points) brittle because UI state, persistence, and audio/RTC state can diverge.

## Pain Points Observed
- **Global mutable state:** Connection flags, pending recordings, token timers, etc., are module globals with no lifecycle hooks. Errors leave them stale (e.g., `pendingUserRecordPromise` never cleared on failure).
- **PTT state machine ad-hoc:** No guard against overlapping presses/releases or late server transcripts; `setTimeout` buffers hide race conditions rather than model them.
- **Bubble lifecycle split across modules:** `main.js` creates/updates bubbles while `DialoguePanel` later replaces them, so invariants such as “one placeholder per speaker” are enforced by DOM scans and sets that never trim.
- **Mobile fallbacks embedded everywhere:** Device detection branches span hundreds of lines, diluting the core logic and complicating error recovery.
- **Point-cloud ingestion tightly coupled to bubble creation:** `processWord` both updates the DOM bubble and asynchronously mutates the optimizer, so failures in either piece can desync UI.
- **Deduplication is leaky:** `processedUtterances` and `deviceUtterances` keep growing; restarts or reconnects never reset them, so long sessions run with stale guards.

## Proposed Refactors (incremental, safe to land separately)

### 1. Encapsulate the Realtime Session
- Extract a `RealtimeSession` class (`src/realtime/session.js`) that owns connection state, PTT transitions, audio managers, and event dispatch.
- Represent state as an explicit state machine (`idle → connecting → connected → ready → recording`). Reject invalid transitions early and surface recoverable errors.
- Expose typed events via `EventTarget` or a tiny emitter to decouple UI (`main.js`) from transport details.
- Move token usage logic, mobile logging, and pending record reconciliation behind class methods with try/finally guarantees.

### 2. Normalize Bubble Lifecycle
- Introduce a `BubbleManager` with methods `beginTurn(speaker)`, `appendDelta`, `appendWord`, `finalize(record)`, `reset(speaker)`.
- Let `DialoguePanel` render bubbles exclusively; `main.js` should request actions through the manager instead of poking DOM.
- Track bubble IDs internally and clear cooldown sets when `finalize` succeeds to avoid unbounded growth.
- Store speaker turn metadata (`utteranceId`, timestamps) to aid upcoming point-cloud manipulations.

### 3. Decouple Word Processing from UI
- Split `processWord` into `bubbleManager.appendWordUI` (sync) and `wordIngestionQueue.enqueue` (async) so point-cloud failures do not block text updates.
- Persist queue progress; if embeddings service fails, retry with exponential backoff rather than suppressing with random positions.
- Cache embeddings per lowercase token to avoid repeated fetches in a session.

### 4. Harden Pending Recording Handling
- Wrap `AudioManager.stopRecording` in a timeout and resolve with a structured result `{ ok, record?, error? }` to prevent dangling promises.
- When transcription arrives without a matching pending record, emit a diagnostic and fall back to streaming download rather than re-recording.
- After any reconcile, always clear pending state in a finally block.

### 5. Reset Guards on Session Reconnect
- When RTC reconnects/restarts, clear `processedUtterances`, `deviceUtterances`, and `pendingDeltaText`; rebuild UI state from `StorageService` history if needed.
- Provide a `session.reset()` hook that UI can call on “Reconnect” button to bundle state cleanup.

### 6. Improve Error Surfacing
- Surface toast/log panel for mic, token, or SDP errors instead of only mutating the PTT button text.
- Emit structured telemetry events (e.g., `session:error`, `embedding:fallback`) to help track instability.

## Suggested Implementation Order
1. Land `RealtimeSession` class and migrate existing exports (`initOpenAIRealtime`, `connect`, `handlePTTPress/Release`) to use it without changing UI contract. **(✅ implemented: `src/realtime/session.js` now encapsulates the realtime loop and `openaiRealtime.js` is a thin facade.)**
2. Introduce `BubbleManager` and update `main.js` to use it while keeping `DialoguePanel` rendering. **(✅ implemented: `src/ui/bubbleManager.js` owns bubble lifecycle and `main.js` now delegates placeholder/delta handling to it.)**
3. Refactor word processing queue, add caching/backoff, and untangle from bubble DOM writes.
4. Add reconnection cleanup and improved error reporting.
5. Tackle secondary cleanups (dedupe set trimming, doc updates, tests).

## Testing Strategy
- Add unit coverage for `RealtimeSession` state transitions (mock WebRTC/audio).
- Extend existing Playwright e2e tests to cover rapid PTT toggles, reconnect flow, and AI delta + final transcript ordering.
- Add integration test for embedding queue fallback to ensure random positioning is the last resort.

## Open Questions
- Should mobile fallback code live in a separate adapter module (possibly loaded conditionally)?
- Do we need to persist bubble metadata across reloads for the upcoming point-cloud control feature?
- Can token usage API tolerate batching multiple utterances, or should we stream per delta as today?
