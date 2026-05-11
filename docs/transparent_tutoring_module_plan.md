# Transparent Tutoring Module Plan

Status: In progress (feature branch checkpoint)  
Last updated: 2026-02-18  
Branch: `feature/transparent-tutoring-module`

## Scope

Implement transparent correction handling for realtime tutoring:
- detect or manually trigger correction checks,
- verify corrections via backend model call,
- show inspectable correction UI on dialogue bubbles,
- collect learner feedback (`agree` / `disagree`),
- keep conversation flow non-blocking when verification fails.

## Checkpoint Completed

1. Backend correction verification route is wired and covered.
2. Verification response schema now requires `category` (fixes prior upstream schema error path).
3. Manual correction trigger (`Check`) is available on user bubbles for hybrid testing mode.
4. Correction panel behavior is toggle-based (open/close) with per-bubble state.
5. Bubble lifecycle hardening landed to reduce duplicate/mis-bound utterance bubbles.
6. Prompt guidance updated to encourage more frequent correction behavior.
7. Frontend/backend tests were expanded around correction and bubble state handling.

## Current Behavior Contract

1. Default mode remains hybrid/manual-friendly:
- no fully automatic correction detector rollout yet,
- operator/tester can trigger correction verification from user bubble UI.
2. Correction detail panel should be collapsed by default and expandable on demand.
3. Repeated checks should not spam duplicate verification requests for the same pending correction state.

## Remaining Work

1. Stabilize UX edge cases in live runs:
- correction toggle consistency (`Check` / `Hide correction`),
- bubble placement and alignment under rapid turn changes,
- verify AI bubble rendering is unaffected by correction panel updates.
2. Finalize hybrid strategy:
- keep manual trigger as fallback,
- add bounded auto-trigger heuristic/flag for broader coverage.
3. Add integration coverage for full correction lifecycle:
- detection/manual trigger -> verify -> render -> feedback persistence.
4. Confirm docs parity across architecture docs after v1 behavior is locked.

## Validation Commands

```bash
npm --prefix shader-playground run test:run -- src/tests/ui/bubble-manager.test.js src/tests/audio/dialogue-panel.test.js
npm --prefix backend run test:modules
```

