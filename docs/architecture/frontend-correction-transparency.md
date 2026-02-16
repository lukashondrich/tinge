# Frontend Correction Transparency

## Scope

Correction verifiability flow for realtime tutoring:
- correction detection event capture,
- async verification orchestration,
- bubble-level correction rendering,
- learner feedback persistence.

Status:
- detection plumbing implemented,
- verification + UI rendering still planned.

## Module Ownership

Realtime/session layer:
- `shader-playground/src/realtime/sessionConfigurationBuilder.js`
  - contains `log_correction` tool schema.
- `shader-playground/src/realtime/functionCallService.js`
  - parses and dispatches `log_correction` tool calls.
- `shader-playground/src/realtime/realtimeEventCoordinator.js`
  - planned mediation of correction lifecycle events into bubble updates.

New frontend services (planned):
- `shader-playground/src/realtime/correctionVerificationService.js`
  - backend `POST /corrections/verify` client,
  - timeout/retry/cache policy.
- `shader-playground/src/core/correctionStore.js`
  - local persistence for correction history + feedback.

UI layer:
- `shader-playground/src/ui/dialoguePanel.js`
  - correction indicator,
  - expandable correction card,
  - feedback actions.

## Event Contract

Implemented:
- `tool.log_correction.detected`

Planned verification lifecycle:
- `correction.verification.started`
- `correction.verification.succeeded`
- `correction.verification.failed`

Planned feedback lifecycle:
- `correction.feedback.updated`

## Planned State Model

Per correction:
- `detected`
- `verifying`
- `verified`
- `failed`

Feedback flag:
- `user_feedback: agree | disagree | null`

## Planned Failure Policy

- Verification errors never block turn rendering/audio flow.
- Verification timeout transitions to `failed` and exposes retry.
- Ambiguous linguistic cases are displayed explicitly with lower confidence.
- Optional fallback detector may be feature-flagged if tool-call recall is insufficient.

## Planned Test Targets

- Function call dispatch tests for `log_correction`.
- Verification service unit tests (success/timeout/error).
- Dialogue UI tests for correction badge/card state transitions.
- Integration test for detected -> verified -> feedback path.
