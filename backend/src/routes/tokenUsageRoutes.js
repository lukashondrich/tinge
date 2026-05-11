import express from 'express';

function parseEphemeralKeyUsage(tokenCounter, ephemeralKey) {
  const usage = tokenCounter.getUsage(ephemeralKey);
  if (!usage) {
    return { error: { error: 'Token not found' } };
  }
  return { usage };
}

export function createTokenUsageRouter({
  tokenCounter,
  jsonParser = express.json()
} = {}) {
  if (!tokenCounter) {
    throw new Error('createTokenUsageRouter requires tokenCounter');
  }

  const router = express.Router();

  router.get('/token-usage/:ephemeralKey', (req, res) => {
    const { ephemeralKey } = req.params;
    const { usage, error } = parseEphemeralKeyUsage(tokenCounter, ephemeralKey);
    if (error) {
      return res.status(404).json(error);
    }
    return res.json(usage);
  });

  router.post('/token-usage/:ephemeralKey/estimate', jsonParser, (req, res) => {
    const { ephemeralKey } = req.params;
    const { text, audioDuration } = req.body;

    let estimatedTokens = 0;
    if (text) {
      estimatedTokens += tokenCounter.estimateTokensFromText(text);
    }
    if (audioDuration) {
      estimatedTokens += tokenCounter.estimateTokensFromAudio(audioDuration);
    }

    const usage = tokenCounter.updateEstimatedTokens(ephemeralKey, estimatedTokens);
    if (!usage) {
      return res.status(404).json({ error: 'Token not found' });
    }
    return res.json(usage);
  });

  router.post('/token-usage/:ephemeralKey/actual', jsonParser, (req, res) => {
    const { ephemeralKey } = req.params;
    const { usageData } = req.body;
    const usage = tokenCounter.updateActualUsage(ephemeralKey, usageData);
    if (!usage) {
      return res.status(404).json({ error: 'Token not found' });
    }
    return res.json(usage);
  });

  router.get('/token-stats', (req, res) => {
    const stats = tokenCounter.getAllUsageStats();
    return res.json(stats);
  });

  return router;
}
