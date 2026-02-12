import { extractCitationIndexesInOrder, remapCitationMarkers } from './citationState.js';

export class RetrievalCitationCoordinator {
  constructor({ citationTurnState, sourcePanel }) {
    this.citationTurnState = citationTurnState;
    this.sourcePanel = sourcePanel;
    this.aiStreamingTranscript = '';
    this.lastSearchTelemetry = null;
  }

  appendStreamingDelta(delta = '') {
    this.aiStreamingTranscript += delta;
    this.citationTurnState.assignStreamingCitationIndexes(this.aiStreamingTranscript);
    return remapCitationMarkers(
      this.aiStreamingTranscript,
      this.citationTurnState.getLocalToGlobalMap()
    );
  }

  getStreamingTranscript() {
    return this.aiStreamingTranscript;
  }

  remapAssistantTextWithPendingCitations(text = '') {
    const pendingMap = this.citationTurnState.getPendingAiCitationRemap();
    const remapped = remapCitationMarkers(text, pendingMap);
    if (!pendingMap || pendingMap.size === 0) return remapped;

    if (extractCitationIndexesInOrder(remapped).length > 0) {
      return remapped;
    }

    const fallbackGlobalCitations = Array.from(new Set(
      Array.from(pendingMap.values()).filter((value) => Number.isFinite(value) && value > 0)
    ))
      .filter((value) => {
        if (typeof this.sourcePanel?.hasDisplayIndex === 'function') {
          return this.sourcePanel.hasDisplayIndex(value);
        }
        return true;
      })
      .sort((a, b) => a - b);
    if (fallbackGlobalCitations.length === 0) return remapped;

    const suffix = fallbackGlobalCitations.map((index) => `[${index}]`).join(' ');
    return `${remapped} ${suffix}`.trim();
  }

  clearPendingAssistantCitationRemap() {
    this.citationTurnState.clearPendingAiCitationRemap();
  }

  handleFinalTranscript(transcript = '') {
    const normalized = String(transcript || '').trim();
    this.aiStreamingTranscript = normalized;
    const commitResult = this.citationTurnState.commitFinalTranscript({
      transcript: normalized,
      searchTelemetry: this.lastSearchTelemetry
    });
    this.aiStreamingTranscript = '';
    return remapCitationMarkers(normalized, commitResult?.localToGlobalMap);
  }

  handleToolSearchResult({ results = [], telemetry = null } = {}) {
    this.citationTurnState.registerRetrievedSources(results);

    let remappedStreamingTranscript = null;
    if (this.aiStreamingTranscript) {
      this.citationTurnState.assignStreamingCitationIndexes(this.aiStreamingTranscript);
      remappedStreamingTranscript = remapCitationMarkers(
        this.aiStreamingTranscript,
        this.citationTurnState.getLocalToGlobalMap()
      );
    }

    this.lastSearchTelemetry = telemetry || null;
    this.sourcePanel.updateTelemetry(this.lastSearchTelemetry);
    return remappedStreamingTranscript;
  }

  handleToolSearchStarted(args = {}) {
    this.citationTurnState.resetPendingState();
    this.citationTurnState.clearPendingAiCitationRemap();
    this.aiStreamingTranscript = '';
    this.sourcePanel.updateTelemetry({
      queryOriginal: args.query_original || '',
      queryEn: args.query_en || '',
      language: args.language || '',
      topK: args.top_k || '',
      durationMs: 0,
      resultCount: 0,
      status: 'loading'
    });
  }
}
