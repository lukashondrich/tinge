const DEFAULT_REALTIME_SESSION_URL = 'https://api.openai.com/v1/realtime/sessions';
const DEFAULT_MODEL = 'gpt-4o-realtime-preview-2024-12-17';
const DEFAULT_VOICE = 'verse';

function mapOpenAiTokenError(status) {
  if (status === 401) {
    return 'Invalid API key. Please check your OpenAI API key.';
  }
  if (status === 403) {
    return "API key doesn't have access to the OpenAI Realtime API. Please check your OpenAI account permissions.";
  }
  if (status === 404) {
    return 'API endpoint not found. The Realtime API path may have changed.';
  }
  if (status === 429) {
    return 'Rate limit exceeded. Please try again later.';
  }
  return 'Failed to get token from OpenAI';
}

export function createTokenHandler({
  fetchImpl,
  apiKey,
  tokenCounter,
  logger = console,
  realtimeSessionUrl = DEFAULT_REALTIME_SESSION_URL,
  model = DEFAULT_MODEL,
  voice = DEFAULT_VOICE
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createTokenHandler requires fetchImpl');
  }
  if (!tokenCounter || typeof tokenCounter.initializeKey !== 'function') {
    throw new Error('createTokenHandler requires tokenCounter.initializeKey');
  }

  return async function tokenHandler(req, res) {
    try {
      if (!apiKey) {
        logger.error('Error: OPENAI_API_KEY not found in environment variables');
        return res.status(500).json({
          error: 'API key not configured',
          detail: 'Please set the OPENAI_API_KEY environment variable'
        });
      }

      logger.log('Requesting token from OpenAI...');
      const response = await fetchImpl(realtimeSessionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          voice
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`OpenAI API error (${response.status} ${response.statusText}): ${errorText}`);
        return res.status(response.status).json({
          error: mapOpenAiTokenError(response.status),
          detail: errorText
        });
      }

      const data = await response.json();
      logger.log('Token received successfully');

      if (!data.client_secret || !data.client_secret.value) {
        logger.error('Invalid response format from OpenAI:', data);
        return res.status(500).json({
          error: 'Invalid response format from OpenAI',
          detail: "The response didn't contain the expected client_secret fields"
        });
      }

      const ephemeralKey = data.client_secret.value;
      const usage = tokenCounter.initializeKey(ephemeralKey);
      return res.json({
        ...data,
        tokenUsage: usage
      });
    } catch (error) {
      logger.error('Token generation error:', error);
      return res.status(500).json({
        error: 'Failed to generate token',
        detail: error.message
      });
    }
  };
}
