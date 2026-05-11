# Realtime Voice Loop Hardening Plan

## Current Architecture (2026-02-15)
- `shader-playground/src/openaiRealtime.js` is now a UI facade (~302 LOC) that wires the PTT button and delegates session concerns.
- `shader-playground/src/realtime/session.js` is now a composition root (~431 LOC) with most transport/feature concerns extracted into focused modules.
- `shader-playground/src/main.js` is now a frontend composition root (~248 LOC) with scene/runtime/audio controllers extracted.
- Backend `backend/server.js` is now a composition root (~98 LOC) with routing/config/middleware split into dedicated modules.

## Completed Hardening Slices
- Session decomposition landed across token usage, knowledge search, function calls, PTT orchestration, bootstrap, WebRTC transport, message routing, transcription, connection lifecycle/state, session config/prompt, remote audio stream handling, outbound text sends, token-limit checks, and connect-error presentation.
- PTT interrupt behavior is hardened:
  - `response.cancel` sent on press while assistant audio is active,
  - stale assistant deltas are suppressed after cancel until drain/timeout,
  - interrupted assistant bubbles finalize cleanly and next turns start fresh bubbles.
- Reconnect lifecycle is covered with integration tests around data-channel close/reopen and resumed PTT turns.
- Main-scene orchestration was split into controllers for runtime, interaction, orbit, remote audio bootstrap, and scene bootstrap composition.
- Runtime logging policy is standardized with gated debug/info/log output across frontend, backend, embedding service, and retrieval runtime.

## Remaining Hardening Focus
1. Keep reconnect/interrupt integration guards current when lifecycle/PTT wiring changes.
- Primary guards:
  - `shader-playground/tests/integration/ptt-interrupt-path.integration.test.js`
  - `shader-playground/tests/integration/reconnect-ptt-path.integration.test.js`

2. Keep composition roots thin and module contracts explicit.
- `shader-playground/src/realtime/session.js`
- `shader-playground/src/main.js`
- `backend/server.js`

3. Keep docs and debt register synchronized with shipped refactors.
- Update `docs/tech_debt_register.md` and `AGENTS.md` in each session where priorities shift.

4. Track remaining non-runtime debt explicitly (outside realtime loop code).
- data asset/versioning policy for retrieval corpora,
- any remaining test contract inconsistencies,
- script-level logging noise only if operationally problematic.

## Validation Baseline (when touching realtime lifecycle)
- Unit targets:
  - `shader-playground/src/tests/realtime/*.test.js`
- Integration targets:
  - `shader-playground/tests/integration/ptt-interrupt-path.integration.test.js`
  - `shader-playground/tests/integration/reconnect-ptt-path.integration.test.js`
- Backend extracted module guard:
  - `npm --prefix backend run test:modules`

## Open Questions
- Should retrieval citation source-lookup reliability be hardened with a dedicated integration test path that includes source-panel rendering verification?
- Do we want explicit session telemetry counters for interruptions/reconnect attempts to track runtime stability over time?
