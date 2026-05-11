# Architecture Docs Map

This folder is the progressive-disclosure entry point for agents and engineers.

Read order:
1. `docs/architecture/system-overview.md`
2. The one subsystem doc that matches your task.
3. `docs/architecture/testing-guardrails.md` before finalizing changes.

Subsystem docs:
- Frontend runtime composition: `docs/architecture/frontend-runtime.md`
- Frontend realtime session and PTT lifecycle: `docs/architecture/frontend-realtime-session.md`
- Frontend citations/dialogue/source rendering: `docs/architecture/frontend-citations-dialogue.md`
- Frontend correction transparency (planned): `docs/architecture/frontend-correction-transparency.md`
- Backend API gateway and token accounting: `docs/architecture/backend-api.md`
- Retrieval service and corpus/index policy: `docs/architecture/retrieval-service.md`
- Embedding service (Node + Python worker): `docs/architecture/embedding-service.md`

Companion planning docs:
- `docs/tech_debt_register.md`
- `docs/realtime_hardening_plan.md`
- `shader-playground/docs/push_to_talk_flow.mmd`

Maintenance rule:
- When module ownership or API contracts change, update the matching doc in this folder in the same PR.
