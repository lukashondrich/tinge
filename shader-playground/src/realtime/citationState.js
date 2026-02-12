export function remapCitationMarkers(text, localToGlobalMap) {
  if (!text || !localToGlobalMap || localToGlobalMap.size === 0) return text;

  let rewritten = text.replace(/\[(\d+)\]/g, (match, n) => {
    const local = Number(n);
    if (!Number.isFinite(local) || !localToGlobalMap.has(local)) return match;
    return `[${localToGlobalMap.get(local)}]`;
  });

  rewritten = rewritten.replace(/\((\d+)\)/g, (match, n) => {
    const local = Number(n);
    if (!Number.isFinite(local) || !localToGlobalMap.has(local)) return match;
    return `[${localToGlobalMap.get(local)}]`;
  });

  rewritten = rewritten.replace(/(?:source|fuente)\s*#?\s*(\d+)/gi, (match, n) => {
    const local = Number(n);
    if (!Number.isFinite(local) || !localToGlobalMap.has(local)) return match;
    return `[${localToGlobalMap.get(local)}]`;
  });

  return rewritten;
}

export function extractCitationIndexesInOrder(text = '') {
  if (!text) return [];
  const ordered = [];
  const seen = new Set();
  const citationPattern = /\[(\d+)\]|\((\d+)\)|(?:source|fuente)\s*#?\s*(\d+)/gi;
  let match = citationPattern.exec(text);
  while (match !== null) {
    const raw = match[1] || match[2] || match[3];
    const citationIndex = Number(raw);
    if (Number.isFinite(citationIndex) && citationIndex > 0 && !seen.has(citationIndex)) {
      seen.add(citationIndex);
      ordered.push(citationIndex);
    }
    match = citationPattern.exec(text);
  }
  return ordered;
}

export class CitationTurnState {
  constructor(sourcePanel) {
    this.sourcePanel = sourcePanel;
    this.pendingRetrievedSources = new Map();
    this.pendingLocalToGlobalCitations = new Map();
    this.pendingProvisionalBySourceKey = new Map();
    this.pendingAiCitationRemap = new Map();
    this.pendingProvisionalNextIndex = sourcePanel.getNextDisplayIndex();
  }

  getLocalToGlobalMap() {
    return this.pendingLocalToGlobalCitations;
  }

  getPendingAiCitationRemap() {
    return this.pendingAiCitationRemap;
  }

  clearPendingAiCitationRemap() {
    this.pendingAiCitationRemap = new Map();
  }

  resetPendingState() {
    this.pendingRetrievedSources.clear();
    this.pendingLocalToGlobalCitations.clear();
    this.pendingProvisionalBySourceKey.clear();
    this.pendingProvisionalNextIndex = this.sourcePanel.getNextDisplayIndex();
  }

  registerRetrievedSources(results = []) {
    results.forEach((item) => {
      const index = Number(item?.citation_index);
      if (Number.isFinite(index) && index > 0) {
        this.pendingRetrievedSources.set(index, item);
      }
    });
  }

  assignStreamingCitationIndexes(transcript = '') {
    const citedIndexes = extractCitationIndexesInOrder(transcript);
    citedIndexes.forEach((localIndex) => {
      if (this.pendingLocalToGlobalCitations.has(localIndex)) return;
      if (!this.pendingRetrievedSources.has(localIndex)) return;

      const source = this.pendingRetrievedSources.get(localIndex);
      const existingIndex = this.sourcePanel.getExistingDisplayIndexForSource(source);
      if (Number.isFinite(existingIndex)) {
        this.pendingLocalToGlobalCitations.set(localIndex, existingIndex);
        return;
      }

      const sourceKey = this.sourcePanel.getSourceKey(source);
      if (this.pendingProvisionalBySourceKey.has(sourceKey)) {
        this.pendingLocalToGlobalCitations.set(localIndex, this.pendingProvisionalBySourceKey.get(sourceKey));
        return;
      }

      const provisionalIndex = this.pendingProvisionalNextIndex;
      this.pendingProvisionalNextIndex += 1;
      this.pendingProvisionalBySourceKey.set(sourceKey, provisionalIndex);
      this.pendingLocalToGlobalCitations.set(localIndex, provisionalIndex);
    });
    return citedIndexes;
  }

  commitFinalTranscript({ transcript = '', searchTelemetry = null } = {}) {
    const citedIndexes = this.assignStreamingCitationIndexes(transcript);
    const sourceKeysInCitationOrder = [];
    const sourceByKey = new Map();
    const provisionalIndexByKey = new Map();

    citedIndexes.forEach((localIndex) => {
      if (!this.pendingRetrievedSources.has(localIndex)) return;
      const source = this.pendingRetrievedSources.get(localIndex);
      const sourceKey = this.sourcePanel.getSourceKey(source);
      if (!sourceByKey.has(sourceKey)) {
        sourceByKey.set(sourceKey, source);
        sourceKeysInCitationOrder.push(sourceKey);
      }
      if (!provisionalIndexByKey.has(sourceKey)) {
        const existing = this.sourcePanel.getExistingDisplayIndexForSource(source);
        if (Number.isFinite(existing)) {
          provisionalIndexByKey.set(sourceKey, existing);
        } else if (this.pendingLocalToGlobalCitations.has(localIndex)) {
          provisionalIndexByKey.set(sourceKey, this.pendingLocalToGlobalCitations.get(localIndex));
        }
      }
    });

    const committedIndexBySourceKey = new Map();
    sourceKeysInCitationOrder.forEach((sourceKey) => {
      const source = sourceByKey.get(sourceKey);
      const existing = this.sourcePanel.getExistingDisplayIndexForSource(source);
      if (Number.isFinite(existing)) {
        committedIndexBySourceKey.set(sourceKey, existing);
      }
    });

    sourceKeysInCitationOrder
      .filter((sourceKey) => !committedIndexBySourceKey.has(sourceKey))
      .sort((a, b) => {
        const aIdx = provisionalIndexByKey.get(a);
        const bIdx = provisionalIndexByKey.get(b);
        const aNum = Number.isFinite(aIdx) ? aIdx : Number.MAX_SAFE_INTEGER;
        const bNum = Number.isFinite(bIdx) ? bIdx : Number.MAX_SAFE_INTEGER;
        return aNum - bNum;
      })
      .forEach((sourceKey) => {
        const source = sourceByKey.get(sourceKey);
        const committed = this.sourcePanel.getDisplayIndexForSource(source);
        committedIndexBySourceKey.set(sourceKey, committed);
      });

    const localToGlobalMap = new Map();
    const usedSourcesByKey = new Map();
    citedIndexes.forEach((localIndex) => {
      if (!this.pendingRetrievedSources.has(localIndex)) return;
      const source = this.pendingRetrievedSources.get(localIndex);
      const sourceKey = this.sourcePanel.getSourceKey(source);
      if (!committedIndexBySourceKey.has(sourceKey)) return;
      const globalIndex = committedIndexBySourceKey.get(sourceKey);
      localToGlobalMap.set(localIndex, globalIndex);
      if (!usedSourcesByKey.has(sourceKey)) {
        usedSourcesByKey.set(sourceKey, {
          ...source,
          display_index: globalIndex
        });
      }
    });

    const usedSources = Array.from(usedSourcesByKey.values())
      .sort((a, b) => (a.display_index || 0) - (b.display_index || 0));

    this.pendingAiCitationRemap = localToGlobalMap;
    this.sourcePanel.updateFromSearchResults(usedSources);
    if (searchTelemetry) {
      this.sourcePanel.updateTelemetry({
        ...searchTelemetry,
        citedCount: usedSources.length
      });
    }
    this.resetPendingState();

    return { citedIndexes, usedSources, localToGlobalMap };
  }
}
