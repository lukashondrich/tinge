# Testing and Guardrails

## Goal

Fast map of what to run after changes, by subsystem.

## High-Value Always-On Checks

- Realtime lifecycle guard suite:
- `npm --prefix shader-playground run test:realtime:guards`

- Root script contract checks:
- `npm run check:readme-scripts`
- `npm run check:root-test-contract`

- Retrieval data policy:
- `python3 retrieval-service/scripts/check_data_policy.py`

## Subsystem-Specific Runs

Frontend realtime/session changes:
- targeted realtime unit tests in `shader-playground/src/tests/realtime/*.test.js`
- integration:
  - `shader-playground/tests/integration/ptt-interrupt-path.integration.test.js`
  - `shader-playground/tests/integration/reconnect-ptt-path.integration.test.js`
  - `shader-playground/tests/integration/citation-path.e2e.test.js`

Frontend ingestion changes:
- `shader-playground/src/tests/realtime/word-ingestion-service.test.js`
- `shader-playground/src/tests/realtime/async-word-queue.test.js`
- `shader-playground/src/tests/realtime/word-ingestion-health-reporter.test.js`
- `shader-playground/src/tests/realtime/word-ingestion-telemetry-sink.test.js`

Backend route/module changes:
- `npm --prefix backend run test:modules`
- `npm --prefix backend test -- --runInBand`

Retrieval service changes:
- `cd retrieval-service && make test`
- plus `make data-policy`

Embedding service changes:
- `npm --prefix embedding-service test -- --runInBand`

## CI Expectations

Current CI (`.github/workflows/ci.yml`) includes:
- readme/root contract checks,
- retrieval data policy check,
- realtime guard integration tests,
- backend extracted-module tests,
- service lint/test/build steps.

Treat `test:realtime:guards` and retrieval data policy as release-blocking for realtime and corpus changes.
