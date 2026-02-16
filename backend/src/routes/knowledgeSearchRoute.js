const DEFAULT_RETRIEVAL_TIMEOUT_MS = 8000;
const VALID_LANGUAGES = new Set(['en', 'es']);

export function createKnowledgeSearchHandler({
  fetchImpl,
  retrievalServiceUrl = 'http://localhost:3004',
  retrievalTimeoutMs = DEFAULT_RETRIEVAL_TIMEOUT_MS,
  retrievalForceEn = true,
  abortControllerFactory = () => new AbortController(),
  setTimeoutImpl = globalThis.setTimeout.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout.bind(globalThis),
  logger = console
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createKnowledgeSearchHandler requires fetchImpl');
  }

  return async function knowledgeSearchHandler(req, res) {
    const { query_original, query_en, language, top_k } = req.body || {};

    if (!query_original || typeof query_original !== 'string' || !query_original.trim()) {
      return res.status(400).json({
        error: 'Invalid request',
        detail: 'query_original must be a non-empty string'
      });
    }

    const normalizedOriginal = query_original.trim();
    const normalizedQueryEn = typeof query_en === 'string' && query_en.trim()
      ? query_en.trim()
      : normalizedOriginal;
    const normalizedTopK = Number.isInteger(top_k) ? Math.min(Math.max(top_k, 1), 10) : undefined;
    const normalizedLanguage = typeof language === 'string' ? language.trim().toLowerCase() : undefined;

    if (!retrievalForceEn && normalizedLanguage && !VALID_LANGUAGES.has(normalizedLanguage)) {
      return res.status(400).json({
        error: 'Invalid request',
        detail: 'language must be either "en" or "es"'
      });
    }

    const payload = {
      query_original: normalizedOriginal,
      query_en: normalizedQueryEn,
      ...(retrievalForceEn ? { language: 'en' } : (normalizedLanguage ? { language: normalizedLanguage } : {})),
      ...(normalizedTopK ? { top_k: normalizedTopK } : {})
    };

    const abortController = abortControllerFactory();
    const timeoutId = setTimeoutImpl(() => abortController.abort(), retrievalTimeoutMs);

    try {
      const response = await fetchImpl(`${retrievalServiceUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          error: 'Knowledge search failed',
          detail: errorText
        });
      }

      const result = await response.json();
      return res.json(result);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return res.status(504).json({
          error: 'Knowledge search timed out',
          detail: `Retrieval service did not respond within ${retrievalTimeoutMs}ms`
        });
      }

      logger.error('Knowledge search proxy error:', error);
      return res.status(502).json({
        error: 'Knowledge search service unavailable',
        detail: error.message
      });
    } finally {
      clearTimeoutImpl(timeoutId);
    }
  };
}
