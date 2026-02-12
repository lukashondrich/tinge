export class KnowledgeSearchService {
  constructor({
    apiUrl,
    fetchFn = (...args) => globalThis.fetch(...args),
    nowFn = () => performance.now(),
    createAbortController = () => new globalThis.AbortController(),
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args)
  }) {
    this.apiUrl = apiUrl;
    this.fetchFn = fetchFn;
    this.nowFn = nowFn;
    this.createAbortController = createAbortController;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
  }

  attachCitationIndexes(results = []) {
    return results.map((item, idx) => ({
      ...item,
      citation_index: idx + 1
    }));
  }

  async searchKnowledge(args) {
    const queryOriginal = String(args?.query_original || '').trim();
    const queryEn = String(args?.query_en || queryOriginal).trim();
    const payload = {
      query_original: queryOriginal,
      query_en: queryEn,
      language: 'en',
      ...(args?.top_k ? { top_k: args.top_k } : {})
    };

    const controller = this.createAbortController();
    const timeoutMs = 8000;
    const timeoutId = this.schedule(() => controller.abort(), timeoutMs);

    const startedAt = this.nowFn();
    let response;
    try {
      response = await this.fetchFn(`${this.apiUrl}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error(`Knowledge search timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      this.clearScheduled(timeoutId);
    }

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        detail = 'No error detail available';
      }
      throw new Error(`Knowledge search failed (${response.status}): ${detail}`);
    }

    const data = await response.json();
    if (Array.isArray(data.results)) {
      data.results = this.attachCitationIndexes(data.results);
    }
    const durationMs = Math.round(this.nowFn() - startedAt);
    return {
      data,
      telemetry: {
        queryOriginal: payload.query_original || '',
        queryEn: payload.query_en || '',
        language: payload.language || '',
        topK: payload.top_k || '',
        durationMs,
        resultCount: Array.isArray(data.results) ? data.results.length : 0,
        status: 'ok'
      }
    };
  }
}
