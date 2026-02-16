const DEFAULT_VERIFY_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_VERIFY_MODEL = 'gpt-4o';
const DEFAULT_VERIFY_TIMEOUT_MS = 8000;
const VALID_CORRECTION_TYPES = new Set([
  'grammar',
  'vocabulary',
  'pronunciation',
  'style_register'
]);

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeContext(rawContext) {
  if (!Array.isArray(rawContext)) return [];
  return rawContext
    .filter((entry) => typeof entry === 'string' && entry.trim())
    .map((entry) => entry.trim())
    .slice(0, 4);
}

function normalizeRequest(body = {}) {
  const original = typeof body.original === 'string' ? body.original.trim() : '';
  const corrected = typeof body.corrected === 'string' ? body.corrected.trim() : '';
  const correctionType = typeof body.correction_type === 'string'
    ? body.correction_type.trim()
    : '';
  const learnerLevel = typeof body.learner_level === 'string'
    ? body.learner_level.trim()
    : '';
  const correctionId = typeof body.correction_id === 'string'
    ? body.correction_id.trim()
    : '';

  if (!original || !corrected || !correctionType) {
    return {
      error: 'original, corrected, and correction_type are required non-empty strings'
    };
  }
  if (!VALID_CORRECTION_TYPES.has(correctionType)) {
    return {
      error: 'correction_type must be one of grammar, vocabulary, pronunciation, style_register'
    };
  }

  return {
    correction_id: correctionId || null,
    original,
    corrected,
    correction_type: correctionType,
    learner_level: learnerLevel || null,
    conversation_context: normalizeContext(body.conversation_context)
  };
}

function buildVerifyMessages(input) {
  return [
    {
      role: 'system',
      content: [
        'You are a language-correction verifier.',
        'Return compact JSON only.',
        'Explain rule clearly for learner level when provided.',
        'If correction is ambiguous or regional, set is_ambiguous=true and lower confidence.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify(input)
    }
  ];
}

function extractMessageContent(completionPayload = {}) {
  const content = completionPayload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const merged = content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('');
    return merged || null;
  }
  return null;
}

function parseVerifierPayload(completionPayload, normalizedInput) {
  const rawContent = extractMessageContent(completionPayload);
  if (!rawContent) {
    throw new Error('Verifier response missing content');
  }

  const parsed = JSON.parse(rawContent);
  const confidence = clampConfidence(parsed?.confidence);

  return {
    correction_id: normalizedInput.correction_id,
    mistake: typeof parsed?.mistake === 'string' && parsed.mistake.trim()
      ? parsed.mistake.trim()
      : normalizedInput.original,
    correction: typeof parsed?.correction === 'string' && parsed.correction.trim()
      ? parsed.correction.trim()
      : normalizedInput.corrected,
    rule: typeof parsed?.rule === 'string' && parsed.rule.trim()
      ? parsed.rule.trim()
      : 'No rule explanation provided.',
    category: typeof parsed?.category === 'string' ? parsed.category.trim() : '',
    confidence,
    is_ambiguous: typeof parsed?.is_ambiguous === 'boolean'
      ? parsed.is_ambiguous
      : confidence < 0.6
  };
}

export function createCorrectionVerifyHandler({
  fetchImpl,
  apiKeyProvider = () => process.env.OPENAI_API_KEY,
  logger = console,
  verifyUrl = DEFAULT_VERIFY_URL,
  model = DEFAULT_VERIFY_MODEL,
  verifyTimeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
  abortControllerFactory = () => new AbortController(),
  setTimeoutImpl = globalThis.setTimeout.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout.bind(globalThis),
  nowIso = () => new Date().toISOString()
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createCorrectionVerifyHandler requires fetchImpl');
  }

  return async function correctionVerifyHandler(req, res) {
    const normalized = normalizeRequest(req.body || {});
    if (normalized.error) {
      return res.status(400).json({
        error: 'Invalid request',
        detail: normalized.error
      });
    }

    const apiKey = typeof apiKeyProvider === 'function' ? apiKeyProvider() : apiKeyProvider;
    if (!apiKey) {
      return res.status(500).json({
        error: 'API key not configured',
        detail: 'Please set the OPENAI_API_KEY environment variable'
      });
    }

    const requestPayload = {
      model,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'correction_verification',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              mistake: { type: 'string' },
              correction: { type: 'string' },
              rule: { type: 'string' },
              category: { type: 'string' },
              confidence: { type: 'number' },
              is_ambiguous: { type: 'boolean' }
            },
            required: ['mistake', 'correction', 'rule', 'confidence', 'is_ambiguous'],
            additionalProperties: false
          }
        }
      },
      messages: buildVerifyMessages(normalized)
    };

    const abortController = abortControllerFactory();
    const timeoutId = setTimeoutImpl(() => abortController.abort(), verifyTimeoutMs);

    try {
      const response = await fetchImpl(verifyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          return res.status(429).json({
            error: 'Correction verification rate limited',
            detail: errorText
          });
        }

        logger.error('Correction verification upstream error:', response.status, errorText);
        return res.status(502).json({
          error: 'Correction verification failed',
          detail: errorText,
          upstream_status: response.status
        });
      }

      const completionPayload = await response.json();
      let verified;
      try {
        verified = parseVerifierPayload(completionPayload, normalized);
      } catch (parseError) {
        logger.error('Failed to parse verifier payload:', parseError);
        return res.status(502).json({
          error: 'Correction verification failed',
          detail: 'Invalid verifier response format'
        });
      }

      return res.json({
        ...verified,
        verified_at: nowIso(),
        model
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return res.status(504).json({
          error: 'Correction verification timed out',
          detail: `Verifier did not respond within ${verifyTimeoutMs}ms`
        });
      }

      logger.error('Correction verification request failed:', error);
      return res.status(502).json({
        error: 'Correction verification service unavailable',
        detail: error.message
      });
    } finally {
      clearTimeoutImpl(timeoutId);
    }
  };
}
