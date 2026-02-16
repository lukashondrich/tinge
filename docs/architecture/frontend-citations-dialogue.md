# Frontend Citations and Dialogue

## Scope

Citation numbering, source registry, bubble lifecycle, and utterance rendering.

## Primary Modules

- Citation marker parsing/remap state:
- `shader-playground/src/realtime/citationState.js`
- Retrieval + streaming transcript citation coordination:
- `shader-playground/src/realtime/retrievalCitationCoordinator.js`
- Source registry/render panel:
- `shader-playground/src/ui/sourcePanel.js`
- Bubble turn lifecycle:
- `shader-playground/src/ui/bubbleManager.js`
- Final utterance rendering + per-word playback:
- `shader-playground/src/ui/dialoguePanel.js`
- Final utterance orchestration:
- `shader-playground/src/realtime/utteranceEventProcessor.js`
- Event-level mediation:
- `shader-playground/src/realtime/realtimeEventCoordinator.js`

## Citation Flow

1. `tool.search_knowledge.started`
- reset pending citation state,
- set source panel telemetry to `loading`.

2. Streaming assistant deltas
- append raw stream transcript,
- assign local citation indexes from stream markers,
- remap local indexes to global source display indexes.

3. `tool.search_knowledge.result`
- register sources in global source registry,
- preserve stable display indexes by source identity,
- update source panel telemetry,
- optionally re-render current streaming bubble text with remapped citations.

4. Final assistant transcript
- commit final transcript and citation remap,
- remap citation markers into stable global indexes,
- fallback: if final text has no marker but pending citations exist, append valid global markers.

## Source Identity Rules

`SourcePanel` source key strategy:
- preferred identity: `url + language` (stable across title changes),
- fallback identity: title/source/language when URL missing.

This prevents renumbering when retrieval title text varies between turns.

## Bubble Lifecycle Rules

`BubbleManager`:
- starts bubbles on speech start/output audio start,
- streams deltas into active AI bubble,
- finalizes with delayed timers,
- supports utterance id assignment for robust matching.

Interruption path:
- interrupted AI bubble gets forced finalize and unique utterance id,
- next AI turn must open a new bubble.

## DialoguePanel Contract

`DialoguePanel.add(record)`:
- enhances existing bubble by utterance id when possible,
- user bubble fallback prefers latest unfinalized/placeholder bubble,
- adds utterance-level play button when audio exists,
- supports per-word click playback when timings exist.

Note:
- this file still has direct `console.*` and complex enhancement logic; treat changes here as higher regression risk.

## Key Tests

- `shader-playground/src/tests/ui/citation-state.test.js`
- `shader-playground/src/tests/ui/retrieval-citation-coordinator.test.js`
- `shader-playground/src/tests/ui/source-panel.test.js`
- `shader-playground/src/tests/audio/dialogue-panel.test.js`
- `shader-playground/tests/integration/citation-path.e2e.test.js`
- `shader-playground/tests/integration/ptt-interrupt-path.integration.test.js`
