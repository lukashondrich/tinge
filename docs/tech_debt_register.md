# Tech Debt Register

Prioritized from a quick repository review on 2026-02-11.

## Status Update (2026-02-12)

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
  - `src/main.js` reduced to 294 LOC (from 620 LOC at latest checkpoint).

Severity scale: `P0` critical, `P1` high, `P2` medium, `P3` low.  
Effort scale: `S` (<=1 day), `M` (2-4 days), `L` (1+ week).

| Priority | Debt Item | Severity | Effort | Evidence | Recommended Next Step |
|---|---|---|---|---|---|
| 1 | Frontend orchestration is concentrated in one file | P1 | L | `shader-playground/src/main.js` (294 LOC, down from 1215 baseline) | Continue split by bounded concerns: initialization wiring. |
| 2 | Realtime session class is still too large and multi-responsibility | P1 | L | `shader-playground/src/realtime/session.js` (772 LOC after token + knowledge + function-call + PTT + bootstrap + WebRTC transport extraction) | Continue split: data-channel message handling and transcription lifecycle. |
| 3 | High log noise in production paths | P1 | M | Frontend runtime (`main`/`scene`/`realtime session`) now gated via `shader-playground/src/utils/logger.js`; backend still has direct logs in `backend/server.js` | Extend logger policy to backend hotspots and keep debug logs behind a flag. |
| 4 | Test runner fragmentation in frontend | P1 | M | `shader-playground/package.json` uses Vitest + Jest + Playwright | Standardize unit/integration on Vitest; keep Playwright for e2e only. |
| 5 | Backend server file mixes routing, infra config, proxying and token logic | P1 | M | `backend/server.js` (340 LOC) | Extract route modules (`/token`, `/transcribe`, `/knowledge`) and middleware/config modules. |
| 6 | Root scripts and docs can drift | P2 | S | `README.md` references root `lint:fix`, previously missing in `package.json` | Keep root scripts as canonical contract and add CI check for documented commands. |
| 7 | Tracked backup and test artifacts in repo history | P2 | S | Removed: `shader-playground/src/openaiRealtime.js.bak`, `shader-playground/test-results/audio-tests.xml` | Keep ignore guards (`*.bak`, `test-results/`, `coverage/`) and avoid committing generated files. |
| 8 | Mixed style of mobile/realtime branching increases complexity | P2 | M | `shader-playground/src/openaiRealtime.js`, `shader-playground/src/realtime/session.js` | Move device-specific behavior into adapter modules with one interface. |
| 9 | Citation remapping logic in UI runtime is complex and stateful | P2 | M | `shader-playground/src/main.js` citation state maps and remap functions | Extract a dedicated citation state service with unit tests for turn lifecycle. |
| 10 | Word ingestion couples UI updates and embedding retrieval concerns | P2 | M | `shader-playground/src/main.js` `processWord` handles bubbles + embedding + optimizer writes | Split sync UI path from async embedding ingestion queue with retry policy. |
| 11 | Large data assets are committed in working repo | P2 | M | `retrieval-service/data/corpus.jsonl`, `retrieval-service/data/import/wiki_en_articles.jsonl` | Define data versioning policy and move bulky/generated datasets out of default dev path where possible. |
| 12 | Python service lacks explicit lint/type/test command surface | P2 | M | `retrieval-service` has scripts but no package-level lint/test runner contract | Add make/poetry/uv task contract for `format`, `lint`, `test`, `typecheck`. |
| 13 | Embedding service lacks lint script parity with other JS services | P3 | S | `embedding-service/package.json` has tests but no lint/lint:fix | Add ESLint config + lint scripts for consistency. |
| 14 | Root jest config is scoped to `tests/` only while repo has many test locations | P3 | S | Root `package.json` jest config vs service-local test trees | Ensure root test entrypoints explicitly delegate to service scripts; avoid ambiguous test ownership. |
| 15 | Existing hardening docs are partially stale after recent refactors | P3 | S | `docs/realtime_hardening_plan.md` includes completed steps but not current follow-ups | Refresh docs to reflect current architecture and next actionable tasks only. |

## Suggested First 3 Milestones

1. Milestone A (1 week): repository hygiene + script/test consistency
- Remove tracked artifacts and backup files.
- Normalize root scripts and CI checks for documented commands.
- Add missing lint contracts where absent.

2. Milestone B (1-2 weeks): frontend modularization
- Break down `main.js` and citation/word-ingestion state.
- Add targeted tests for extracted modules.

3. Milestone C (1-2 weeks): realtime/backend hardening
- Split `RealtimeSession` and backend routes into bounded modules.
- Add reconnect/race-condition tests around PTT and transcript finalization.
