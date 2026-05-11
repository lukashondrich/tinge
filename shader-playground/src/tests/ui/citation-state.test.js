import { describe, it, expect } from 'vitest';
import {
  CitationTurnState,
  extractCitationIndexesInOrder,
  remapCitationMarkers
} from '../../realtime/citationState.js';

function createSource(overrides = {}) {
  return {
    title: 'Barcelona',
    url: 'https://en.wikipedia.org/wiki/Barcelona',
    source: 'Wikipedia',
    language: 'en',
    ...overrides
  };
}

class MockSourcePanel {
  constructor() {
    this.sourcesByKey = new Map();
    this.nextDisplayIndex = 1;
    this.lastUpdatedSources = [];
    this.telemetry = null;
  }

  getSourceKey(item = {}) {
    const url = String(item.url || '').trim().toLowerCase();
    const title = String(item.title || '').trim().toLowerCase();
    const source = String(item.source || '').trim().toLowerCase();
    const language = String(item.language || '').trim().toLowerCase();
    if (url) return `url:${url}|lang:${language}`;
    return `meta:${title}|${source}|${language}`;
  }

  getExistingDisplayIndexForSource(item = {}) {
    const key = this.getSourceKey(item);
    const existing = this.sourcesByKey.get(key);
    return existing ? existing.display_index : null;
  }

  getDisplayIndexForSource(item = {}) {
    const key = this.getSourceKey(item);
    const existing = this.sourcesByKey.get(key);
    if (existing) return existing.display_index;

    const displayIndex = this.nextDisplayIndex++;
    this.sourcesByKey.set(key, { ...item, display_index: displayIndex });
    return displayIndex;
  }

  getNextDisplayIndex() {
    return this.nextDisplayIndex;
  }

  updateFromSearchResults(results = []) {
    this.lastUpdatedSources = results;
    results.forEach((item) => {
      const key = this.getSourceKey(item);
      this.sourcesByKey.set(key, item);
      if (item.display_index >= this.nextDisplayIndex) {
        this.nextDisplayIndex = item.display_index + 1;
      }
    });
  }

  updateTelemetry(telemetry = null) {
    this.telemetry = telemetry;
  }
}

describe('citationState helpers', () => {
  it('extracts unique citation indexes in encounter order', () => {
    expect(extractCitationIndexesInOrder('A [2], B (1), C source 2, D fuente #3, E [1]'))
      .toEqual([2, 1, 3]);
  });

  it('remaps bracket, paren, and source/fuente markers', () => {
    const remap = new Map([[1, 7], [2, 9]]);
    const text = 'See [1], (2), source 1, fuente #2, and [3].';
    expect(remapCitationMarkers(text, remap))
      .toBe('See [7], [9], [7], [9], and [3].');
  });
});

describe('CitationTurnState', () => {
  it('assigns one provisional index for duplicate source keys in streaming transcript', () => {
    const panel = new MockSourcePanel();
    panel.nextDisplayIndex = 4;
    const state = new CitationTurnState(panel);

    const source = createSource();
    state.registerRetrievedSources([
      { ...source, citation_index: 1 },
      { ...source, citation_index: 2 }
    ]);

    state.assignStreamingCitationIndexes('Fact [1] and [2].');
    const map = state.getLocalToGlobalMap();
    expect(map.get(1)).toBe(4);
    expect(map.get(2)).toBe(4);
  });

  it('commits cited sources with stable global numbering and telemetry', () => {
    const panel = new MockSourcePanel();
    const existingSource = createSource({ title: 'Parque Guell', url: 'https://example.com/a' });
    const newSource = createSource({ title: 'Sagrada Familia', url: 'https://example.com/b' });

    expect(panel.getDisplayIndexForSource(existingSource)).toBe(1);
    const state = new CitationTurnState(panel);
    state.registerRetrievedSources([
      { ...existingSource, citation_index: 1 },
      { ...newSource, citation_index: 2 }
    ]);

    const result = state.commitFinalTranscript({
      transcript: 'Answer uses [2] and [1].',
      searchTelemetry: { status: 'ok', resultCount: 2, durationMs: 42 }
    });

    expect(result.localToGlobalMap.get(1)).toBe(1);
    expect(result.localToGlobalMap.get(2)).toBe(2);
    expect(result.usedSources.map((item) => item.display_index)).toEqual([1, 2]);
    expect(panel.telemetry.citedCount).toBe(2);

    expect(state.getPendingAiCitationRemap().get(1)).toBe(1);
    expect(state.getPendingAiCitationRemap().get(2)).toBe(2);
    expect(state.getLocalToGlobalMap().size).toBe(0);
  });
});
