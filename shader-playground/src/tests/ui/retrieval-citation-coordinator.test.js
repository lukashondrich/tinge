import { describe, it, expect } from 'vitest';
import { RetrievalCitationCoordinator } from '../../realtime/retrievalCitationCoordinator.js';

class MockCitationTurnState {
  constructor() {
    this.localToGlobal = new Map([[1, 4]]);
    this.pendingAiRemap = new Map([[2, 9]]);
    this.assignCalls = [];
    this.registerCalls = [];
    this.commitCalls = [];
    this.resetCalls = 0;
    this.clearPendingCalls = 0;
  }

  assignStreamingCitationIndexes(transcript) {
    this.assignCalls.push(transcript);
    return [];
  }

  getLocalToGlobalMap() {
    return this.localToGlobal;
  }

  getPendingAiCitationRemap() {
    return this.pendingAiRemap;
  }

  clearPendingAiCitationRemap() {
    this.clearPendingCalls += 1;
    this.pendingAiRemap = new Map();
  }

  commitFinalTranscript(payload) {
    this.commitCalls.push(payload);
    return { localToGlobalMap: new Map([[1, 4]]) };
  }

  registerRetrievedSources(results) {
    this.registerCalls.push(results);
  }

  resetPendingState() {
    this.resetCalls += 1;
  }
}

class MockSourcePanel {
  constructor() {
    this.telemetry = null;
    this.displayIndexes = new Set([1, 2, 3, 4, 5, 9]);
  }

  updateTelemetry(telemetry) {
    this.telemetry = telemetry;
  }

  hasDisplayIndex(index) {
    return this.displayIndexes.has(Number(index));
  }
}

describe('RetrievalCitationCoordinator', () => {
  it('appends streaming deltas and remaps citations', () => {
    const citationTurnState = new MockCitationTurnState();
    const sourcePanel = new MockSourcePanel();
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    const remapped = coordinator.appendStreamingDelta('See [1]');
    expect(remapped).toBe('See [4]');
    expect(coordinator.getStreamingTranscript()).toBe('See [1]');
    expect(citationTurnState.assignCalls).toEqual(['See [1]']);
  });

  it('handles tool started/result telemetry and remaps active streaming text', () => {
    const citationTurnState = new MockCitationTurnState();
    const sourcePanel = new MockSourcePanel();
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    coordinator.appendStreamingDelta('Answer [1]');
    const remapped = coordinator.handleToolSearchResult({
      results: [{ citation_index: 1, title: 'Doc' }],
      telemetry: { status: 'ok', resultCount: 1, durationMs: 33 }
    });

    expect(remapped).toBe('Answer [4]');
    expect(citationTurnState.registerCalls).toHaveLength(1);
    expect(sourcePanel.telemetry.status).toBe('ok');

    coordinator.handleToolSearchStarted({ query_original: 'hola', top_k: 5 });
    expect(citationTurnState.resetCalls).toBe(1);
    expect(coordinator.getStreamingTranscript()).toBe('');
    expect(sourcePanel.telemetry).toMatchObject({
      queryOriginal: 'hola',
      topK: 5,
      status: 'loading'
    });
  });

  it('commits final transcript with last telemetry and clears streaming buffer', () => {
    const citationTurnState = new MockCitationTurnState();
    const sourcePanel = new MockSourcePanel();
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    coordinator.handleToolSearchResult({
      telemetry: { status: 'ok', resultCount: 2, durationMs: 80 }
    });

    const normalized = coordinator.handleFinalTranscript('  Done [1]  ');
    expect(normalized).toBe('Done [4]');
    expect(coordinator.getStreamingTranscript()).toBe('');
    expect(citationTurnState.commitCalls).toHaveLength(1);
    expect(citationTurnState.commitCalls[0]).toMatchObject({
      transcript: 'Done [1]',
      searchTelemetry: { status: 'ok', resultCount: 2, durationMs: 80 }
    });
  });

  it('returns unchanged final transcript when commit has no local-to-global map', () => {
    const citationTurnState = new MockCitationTurnState();
    citationTurnState.commitFinalTranscript = (payload) => {
      citationTurnState.commitCalls.push(payload);
      return {};
    };
    const sourcePanel = new MockSourcePanel();
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    const normalized = coordinator.handleFinalTranscript('  No markers here  ');
    expect(normalized).toBe('No markers here');
  });

  it('appends fallback global citations when assistant text has none', () => {
    const citationTurnState = new MockCitationTurnState();
    citationTurnState.pendingAiRemap = new Map([[1, 3], [2, 3]]);
    const sourcePanel = new MockSourcePanel();
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    const remapped = coordinator.remapAssistantTextWithPendingCitations(
      'This is based on the same source as before.'
    );
    expect(remapped).toBe('This is based on the same source as before. [3]');
  });

  it('does not append fallback citations when markers already exist', () => {
    const citationTurnState = new MockCitationTurnState();
    citationTurnState.pendingAiRemap = new Map([[1, 5]]);
    const sourcePanel = new MockSourcePanel();
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    const remapped = coordinator.remapAssistantTextWithPendingCitations('Evidence [1].');
    expect(remapped).toBe('Evidence [5].');
  });

  it('clears stale pending remap when a new retrieval turn starts', () => {
    const citationTurnState = new MockCitationTurnState();
    citationTurnState.pendingAiRemap = new Map([[1, 7]]);
    const sourcePanel = new MockSourcePanel();
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    coordinator.handleToolSearchStarted({ query_original: 'new question' });
    const remapped = coordinator.remapAssistantTextWithPendingCitations('Fresh answer with no markers.');
    expect(remapped).toBe('Fresh answer with no markers.');
    expect(citationTurnState.clearPendingCalls).toBe(1);
  });

  it('does not append fallback marker for unknown display indexes', () => {
    const citationTurnState = new MockCitationTurnState();
    citationTurnState.pendingAiRemap = new Map([[1, 3], [2, 42]]);
    const sourcePanel = new MockSourcePanel();
    sourcePanel.displayIndexes = new Set([3]); // 42 does not exist in panel registry
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    const remapped = coordinator.remapAssistantTextWithPendingCitations('Answer without explicit marker.');
    expect(remapped).toBe('Answer without explicit marker. [3]');
  });

  it('resets streaming transcript and clears pending remap on interruption reset', () => {
    const citationTurnState = new MockCitationTurnState();
    const sourcePanel = new MockSourcePanel();
    const coordinator = new RetrievalCitationCoordinator({ citationTurnState, sourcePanel });

    coordinator.appendStreamingDelta('Partial [1]');
    expect(coordinator.getStreamingTranscript()).toBe('Partial [1]');

    coordinator.resetStreamingTranscript();
    expect(coordinator.getStreamingTranscript()).toBe('');
    expect(citationTurnState.clearPendingCalls).toBe(1);
  });
});
