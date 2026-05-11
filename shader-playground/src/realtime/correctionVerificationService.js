const DEFAULT_VERIFY_TIMEOUT_MS = 8000;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const VALID_CORRECTION_TYPES = new Set([
  'grammar',
  'vocabulary',
  'pronunciation',
  'style_register'
]);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export class CorrectionVerificationService {
  constructor({
    apiUrl,
    fetchFn = (...args) => globalThis.fetch(...args),
    createAbortController = () => new globalThis.AbortController(),
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    verifyTimeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    nowMs = () => Date.now(),
    warn = () => {}
  }) {
    this.apiUrl = apiUrl;
    this.fetchFn = fetchFn;
    this.createAbortController = createAbortController;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.verifyTimeoutMs = verifyTimeoutMs;
    this.cacheTtlMs = cacheTtlMs;
    this.nowMs = nowMs;
    this.warn = warn;
    this.cache = new Map();
  }

  normalizeRequest(payload = {}) {
    const original = normalizeString(payload.original);
    const corrected = normalizeString(payload.corrected);
    const correctionType = normalizeString(payload.correction_type);
    const learnerLevel = normalizeString(payload.learner_level);
    const correctionId = normalizeString(payload.correction_id);
    const context = Array.isArray(payload.conversation_context)
      ? payload.conversation_context.filter((item) => typeof item === 'string' && item.trim())
        .map((item) => item.trim())
      : undefined;

    if (!original || !corrected || !correctionType) {
      throw new Error('Correction verification requires original, corrected, and correction_type');
    }
    if (!VALID_CORRECTION_TYPES.has(correctionType)) {
      throw new Error(`Invalid correction_type: ${correctionType}`);
    }

    return {
      ...(correctionId ? { correction_id: correctionId } : {}),
      original,
      corrected,
      correction_type: correctionType,
      ...(learnerLevel ? { learner_level: learnerLevel } : {}),
      ...(context && context.length > 0 ? { conversation_context: context.slice(0, 4) } : {})
    };
  }

  buildCacheKey(payload) {
    const learnerLevel = payload.learner_level || '';
    return [
      payload.original,
      payload.corrected,
      payload.correction_type,
      learnerLevel
    ].join('||');
  }

  getCached(cacheKey) {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    if ((this.nowMs() - entry.storedAt) > this.cacheTtlMs) {
      this.cache.delete(cacheKey);
      return null;
    }
    return entry.value;
  }

  setCached(cacheKey, value) {
    this.cache.set(cacheKey, {
      value,
      storedAt: this.nowMs()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  async verifyCorrection(payload, { forceRefresh = false } = {}) {
    const normalized = this.normalizeRequest(payload);
    const cacheKey = this.buildCacheKey(normalized);

    if (!forceRefresh) {
      const cached = this.getCached(cacheKey);
      if (cached) {
        return { data: cached, cached: true };
      }
    }

    const controller = this.createAbortController();
    const timeoutId = this.schedule(() => controller.abort(), this.verifyTimeoutMs);

    let response;
    try {
      response = await this.fetchFn(`${this.apiUrl}/corrections/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error(`Correction verification timed out after ${this.verifyTimeoutMs}ms`);
      }
      this.warn('Correction verification request failed:', error);
      throw error;
    } finally {
      this.clearScheduled(timeoutId);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errorPayload = await response.json();
        detail = String(errorPayload?.detail || errorPayload?.error || '');
      } catch {
        try {
          detail = await response.text();
        } catch {
          detail = '';
        }
      }
      const suffix = detail ? `: ${detail}` : '';
      const err = new Error(`Correction verification failed (${response.status})${suffix}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    this.setCached(cacheKey, data);
    return {
      data,
      cached: false
    };
  }
}
