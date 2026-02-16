# Transparent Tutoring Module (Correction Verifiability)

Status: In progress (Phase B and Phase C baseline implemented)
Last updated: 2026-02-16
Branch: `feature/transparent-tutoring-module`

Current defaults for v1:
- verifier provider: OpenAI-only,
- feedback taxonomy: `agree` / `disagree`,
- fallback detector: disabled (tool-call-only detection).

## 1. Objective

Add a transparent correction layer to the realtime tutor so language corrections are:
- visible,
- inspectable,
- challengeable by the learner,
- persisted for future adaptation.

The core design principle is independent verification: correction explanation quality should not depend on exposing chain-of-thought from the realtime tutor model.

## 2. v1 Scope and Non-Goals

### In Scope (v1)

- Detect correction events during assistant turns.
- Asynchronously verify each detected correction with a separate model call.
- Render correction indicator + expandable breakdown in the existing dialogue UI.
- Collect simple learner feedback (`agree` / `disagree`).
- Persist correction records in local browser storage.

### Out of Scope (v1)

- Post-session correction dashboard.
- Point-cloud correction trails.
- Multi-model arbitration beyond optional retry on disagreement.
- Automatic prompt retraining loop.

## 3. Existing Integration Points

The current codebase already has the right seams:

- Realtime tool schema: `shader-playground/src/realtime/sessionConfigurationBuilder.js`
- Tool-call dispatch: `shader-playground/src/realtime/functionCallService.js`
- Event routing to UI: `shader-playground/src/realtime/session.js`, `shader-playground/src/realtime/realtimeEventCoordinator.js`
- Bubble rendering: `shader-playground/src/ui/bubbleManager.js`, `shader-playground/src/ui/dialoguePanel.js`
- Learner memory/profile: `shader-playground/src/core/userProfile.js`
- Backend route composition: `backend/server.js` + `backend/src/routes/*`

## 4. Planned End-to-End Flow

1. Assistant turn includes a correction.
2. Assistant calls new realtime tool `log_correction`.
3. Frontend receives function call and emits local event `tool.log_correction.detected`.
4. Frontend triggers async verify request to backend `POST /corrections/verify`.
5. Backend calls verification model and returns structured explanation.
6. Frontend updates correction state from `verifying` -> `verified` (or `failed`).
7. Dialogue bubble shows indicator and expandable correction breakdown.
8. Learner feedback is persisted with correction record.

Conversation flow must remain uninterrupted even if verification is slow or fails.

## 5. Contracts

### 5.1 Realtime Tool Contract (`log_correction`)

Planned tool schema addition in session update payload:

```json
{
  "type": "function",
  "name": "log_correction",
  "description": "Call whenever you explicitly correct learner language. Emit one call per distinct correction.",
  "parameters": {
    "type": "object",
    "properties": {
      "original": { "type": "string" },
      "corrected": { "type": "string" },
      "correction_type": {
        "type": "string",
        "enum": ["grammar", "vocabulary", "pronunciation", "style_register"]
      },
      "assistant_excerpt": { "type": "string" },
      "learner_excerpt": { "type": "string" }
    },
    "required": ["original", "corrected", "correction_type"]
  }
}
```

Notes:
- Use `style_register` (not `style/register`) for strict JSON enum consistency.
- `assistant_excerpt` and `learner_excerpt` are optional but strongly recommended for matching to the correct bubble.

### 5.2 Frontend Event Contract

`FunctionCallService` should emit:

```json
{
  "type": "tool.log_correction.detected",
  "correction": {
    "id": "corr_<uuid>",
    "original": "...",
    "corrected": "...",
    "correction_type": "grammar",
    "assistant_excerpt": "...",
    "learner_excerpt": "...",
    "source": "tool_call",
    "status": "detected",
    "detected_at": "2026-02-16T12:00:00.000Z"
  }
}
```

Verification lifecycle events:

- `correction.verification.started`
- `correction.verification.succeeded`
- `correction.verification.failed`
- `correction.feedback.updated`

### 5.3 Backend Verification API Contract

Planned endpoint: `POST /corrections/verify`

Request:

```json
{
  "correction_id": "corr_123",
  "original": "tengo hambre mucho",
  "corrected": "tengo mucha hambre",
  "correction_type": "grammar",
  "learner_level": "beginner",
  "conversation_context": [
    "user: ...",
    "assistant: ..."
  ]
}
```

Response:

```json
{
  "correction_id": "corr_123",
  "mistake": "tengo hambre mucho",
  "correction": "tengo mucha hambre",
  "rule": "In Spanish, mucho/mucha agrees with the noun and precedes it here.",
  "category": "adjective-noun agreement + word order",
  "confidence": 0.95,
  "is_ambiguous": false,
  "verified_at": "2026-02-16T12:00:01.200Z",
  "model": "gpt-4o"
}
```

Error behavior:
- `400`: invalid request payload.
- `429`: verifier rate limited.
- `504`: verifier timeout.
- `502`: upstream provider/service unavailable.

### 5.4 Local Storage Contract

Use a dedicated store key (instead of expanding profile blob directly):

- `correction_history_<userId>`

Schema:

```json
{
  "schema_version": 1,
  "corrections": [
    {
      "id": "corr_123",
      "timestamp": "2026-02-16T12:00:00.000Z",
      "session_id": "sess_abc",
      "original": "...",
      "corrected": "...",
      "correction_type": "grammar",
      "status": "verified",
      "rule": "...",
      "confidence": 0.95,
      "category": "...",
      "user_feedback": "agree"
    }
  ]
}
```

## 6. State Model (Frontend)

Per correction record:

- `detected`
- `verifying`
- `verified`
- `failed`
- `feedback_recorded` (orthogonal flag)

UI expectations:
- `detected`/`verifying`: subtle badge + loading affordance.
- `verified`: expandable detail card.
- `failed`: non-blocking fallback badge with retry action.

## 7. Failure Modes and Safeguards

1. Missing tool call despite correction text.
- Mitigation: add optional fallback detector (small model or heuristics) behind feature flag.

2. Tool call emitted but verification times out.
- Mitigation: keep `failed` state and offer manual retry; do not block conversation.

3. Ambiguous/regionally valid correction.
- Mitigation: verifier must set `is_ambiguous=true` and lower confidence.

4. Excessive correction spam.
- Mitigation: dedupe by normalized `(original, corrected, correction_type)` in a short time window.

5. Bubble mismatch (wrong correction attached).
- Mitigation: carry assistant excerpt + timestamp and bind to latest matching AI utterance ID.

## 8. Rollout Plan

### Phase A: Planning and Contracts (this branch, docs-first)

- Freeze schemas/events/endpoint contract.
- Align architecture docs and test expectations.

### Phase B: Detection Plumbing

- Add `log_correction` tool schema.
- Add function dispatch path and frontend detected events.
- Add baseline unit tests for dispatch/events.

### Phase C: Verification Service

- Add backend route module `backend/src/routes/correctionVerifyRoute.js`.
- Add frontend verification client with timeout + retry + cache.
- Add tests for success/timeout/error mapping.

### Phase D: Bubble UI

- Add correction badge + expandable card to dialogue bubbles.
- Add feedback controls and persistence.
- Add UI behavior tests.

### Phase E: Stabilization

- Add fallback detector flag.
- Tune prompt and confidence thresholds.
- Add integration test for full correction lifecycle.

## 9. Acceptance Criteria (v1)

1. A realtime correction can be detected and represented as structured data.
2. Verification request runs asynchronously without blocking PTT turn flow.
3. Verified correction appears in bubble UI with original, corrected, and rule fields.
4. Failure states are visible and recoverable (retry), with no session breakage.
5. User feedback is persisted and reload-safe.
6. Automated tests cover:
- tool dispatch,
- verify API contract,
- UI state transitions,
- at least one integration path.

## 10. Open Product/Policy Decisions

1. Verifier provider policy:
- OpenAI-only for v1, or provider-pluggable from day one?

2. Retention policy:
- unlimited local history or rolling window (for example, last 500 corrections)?

3. Feedback taxonomy:
- binary `agree/disagree` only, or include `not sure` in v1?

4. Fallback detector:
- enable in v1 or defer to v1.1 after baseline reliability metrics?
