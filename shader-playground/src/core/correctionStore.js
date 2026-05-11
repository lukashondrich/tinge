const SCHEMA_VERSION = 1;
const DEFAULT_USER_ID = 'student_001';
const DEFAULT_MAX_RECORDS = 500;
const VALID_FEEDBACK_VALUES = new Set(['agree', 'disagree']);

function getDefaultStorage() {
  if (typeof globalThis === 'undefined') return null;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function normalizeCorrectionRecord(correction = {}, nowIso = () => new Date().toISOString()) {
  const correctionId = typeof correction.id === 'string' ? correction.id.trim() : '';
  if (!correctionId) return null;

  const now = nowIso();
  return {
    id: correctionId,
    timestamp: correction.detected_at || correction.timestamp || now,
    original: correction.original || '',
    corrected: correction.corrected || '',
    correction_type: correction.correction_type || '',
    status: correction.status || 'detected',
    source: correction.source || 'tool_call',
    learner_excerpt: correction.learner_excerpt || '',
    assistant_excerpt: correction.assistant_excerpt || '',
    rule: correction.rule || '',
    confidence: typeof correction.confidence === 'number' ? correction.confidence : null,
    category: correction.category || '',
    is_ambiguous: Boolean(correction.is_ambiguous),
    model: correction.model || '',
    error: correction.error || '',
    verified_at: correction.verified_at || '',
    user_feedback: correction.user_feedback || null
  };
}

function mergeDefinedFields(target, patch = {}) {
  Object.keys(patch).forEach((key) => {
    if (patch[key] !== undefined) {
      target[key] = patch[key];
    }
  });
  return target;
}

export class CorrectionStore {
  constructor({
    userId = DEFAULT_USER_ID,
    storage = getDefaultStorage(),
    maxRecords = DEFAULT_MAX_RECORDS,
    nowIso = () => new Date().toISOString(),
    warn = () => {}
  } = {}) {
    this.userId = userId;
    this.storage = storage;
    this.maxRecords = maxRecords;
    this.nowIso = nowIso;
    this.warn = warn;
  }

  getStorageKey() {
    return `correction_history_${this.userId}`;
  }

  load() {
    if (!this.storage) {
      return {
        schema_version: SCHEMA_VERSION,
        corrections: []
      };
    }

    try {
      const raw = this.storage.getItem(this.getStorageKey());
      if (!raw) {
        return {
          schema_version: SCHEMA_VERSION,
          corrections: []
        };
      }

      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.corrections)) {
        return {
          schema_version: SCHEMA_VERSION,
          corrections: []
        };
      }

      return {
        schema_version: SCHEMA_VERSION,
        corrections: parsed.corrections
      };
    } catch (error) {
      this.warn('Failed to load correction history from storage:', error);
      return {
        schema_version: SCHEMA_VERSION,
        corrections: []
      };
    }
  }

  save(payload) {
    if (!this.storage) return false;

    try {
      this.storage.setItem(this.getStorageKey(), JSON.stringify(payload));
      return true;
    } catch (error) {
      this.warn('Failed to save correction history to storage:', error);
      return false;
    }
  }

  upsertCorrection(correction) {
    const normalized = normalizeCorrectionRecord(correction, this.nowIso);
    if (!normalized) return null;

    const payload = this.load();
    const existingIndex = payload.corrections.findIndex((item) => item.id === normalized.id);
    if (existingIndex === -1) {
      payload.corrections.push(normalized);
    } else {
      payload.corrections[existingIndex] = mergeDefinedFields(
        payload.corrections[existingIndex],
        normalized
      );
    }

    if (payload.corrections.length > this.maxRecords) {
      payload.corrections = payload.corrections.slice(payload.corrections.length - this.maxRecords);
    }

    this.save(payload);
    return normalized;
  }

  upsertVerification(correctionId, {
    status,
    verification,
    error = ''
  } = {}) {
    if (!correctionId) return false;

    const payload = this.load();
    const index = payload.corrections.findIndex((item) => item.id === correctionId);
    if (index === -1) return false;

    const record = payload.corrections[index];
    record.status = status || record.status;
    record.error = error || '';

    if (verification && typeof verification === 'object') {
      mergeDefinedFields(record, {
        rule: verification.rule,
        confidence: verification.confidence,
        category: verification.category,
        is_ambiguous: verification.is_ambiguous,
        model: verification.model,
        verified_at: verification.verified_at
      });
    }

    this.save(payload);
    return true;
  }

  setFeedback(correctionId, feedback) {
    if (!correctionId || !VALID_FEEDBACK_VALUES.has(feedback)) return false;

    const payload = this.load();
    const index = payload.corrections.findIndex((item) => item.id === correctionId);
    if (index === -1) return false;

    payload.corrections[index].user_feedback = feedback;
    this.save(payload);
    return true;
  }
}
