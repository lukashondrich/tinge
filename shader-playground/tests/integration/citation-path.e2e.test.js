import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { SourcePanel } from '../../src/ui/sourcePanel.js';
import { CitationTurnState } from '../../src/realtime/citationState.js';
import { RetrievalCitationCoordinator } from '../../src/realtime/retrievalCitationCoordinator.js';

function source(overrides = {}) {
  return {
    title: 'Barcelona',
    url: 'https://en.wikipedia.org/wiki/Barcelona',
    source: 'Wikipedia',
    language: 'en',
    ...overrides
  };
}

describe('Citation path E2E (integration)', () => {
  let dom;
  let panel;
  let citationTurnState;
  let coordinator;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost'
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    Object.defineProperty(globalThis, 'navigator', {
      value: dom.window.navigator,
      configurable: true,
      writable: true
    });
    globalThis.sessionStorage = dom.window.sessionStorage;

    panel = new SourcePanel({ maxVisible: 4 });
    citationTurnState = new CitationTurnState(panel);
    coordinator = new RetrievalCitationCoordinator({
      citationTurnState,
      sourcePanel: panel
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    try {
      sessionStorage.clear();
    } catch (error) {
      // ignore
    }
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.navigator;
    delete globalThis.sessionStorage;
  });

  it('keeps stable numbering and re-cites existing sources across turns', () => {
    // Turn 1: search starts, streaming references local [1], results arrive, final transcript emitted.
    coordinator.handleToolSearchStarted({
      query_original: 'Tell me about Barcelona',
      top_k: 3
    });
    coordinator.appendStreamingDelta('Barcelona is a major city [1].');
    coordinator.handleToolSearchResult({
      results: [
        { ...source(), citation_index: 1 }
      ],
      telemetry: { status: 'ok', resultCount: 1, durationMs: 55 }
    });
    coordinator.handleFinalTranscript('Barcelona is a major city [1].');

    // Simulate utterance text path where model dropped markers: fallback should recover [1].
    const turn1Text = coordinator.remapAssistantTextWithPendingCitations(
      'Barcelona is a major city in Catalonia.'
    );
    expect(turn1Text).toContain('[1]');
    coordinator.clearPendingAssistantCitationRemap();

    // Turn 2: same URL recited with changed title text.
    coordinator.handleToolSearchStarted({
      query_original: 'And what about its architecture?',
      top_k: 3
    });
    coordinator.appendStreamingDelta('Its architecture is world famous [1].');
    coordinator.handleToolSearchResult({
      results: [
        {
          ...source({
            title: 'Barcelona - architecture overview'
          }),
          citation_index: 1
        }
      ],
      telemetry: { status: 'ok', resultCount: 1, durationMs: 48 }
    });
    coordinator.handleFinalTranscript('Its architecture is world famous [1].');

    const turn2Text = coordinator.remapAssistantTextWithPendingCitations(
      'Its architecture is world famous.'
    );

    // Re-citation should remain [1] and no orphan/gapped citation should appear.
    expect(turn2Text).toContain('[1]');
    expect(turn2Text).not.toContain('[2]');
    expect(turn2Text).not.toContain('[3]');

    const labels = Array.from(panel.list.querySelectorAll('.source-panel-link'))
      .map((node) => node.textContent.trim());
    expect(labels.length).toBe(1);
    expect(labels[0].startsWith('1.')).toBe(true);
    expect(labels[0]).toContain('architecture overview');

    const link = panel.list.querySelector('.source-panel-link');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Barcelona');

    const meta = panel.list.querySelector('.source-panel-meta');
    expect(meta).not.toBeNull();
    expect(meta.textContent.trim()).toBe('Wikipedia');
  });
});
