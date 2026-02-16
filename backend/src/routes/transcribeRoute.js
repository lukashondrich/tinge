const DEFAULT_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-1';

export function createTranscribeHandler({
  fetchImpl,
  FormDataCtor,
  apiKeyProvider = () => process.env.OPENAI_API_KEY,
  logger = console,
  transcribeUrl = DEFAULT_TRANSCRIBE_URL,
  model = DEFAULT_MODEL
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createTranscribeHandler requires fetchImpl');
  }
  if (typeof FormDataCtor !== 'function') {
    throw new Error('createTranscribeHandler requires FormDataCtor');
  }

  return async function transcribeHandler(req, res) {
    try {
      const form = new FormDataCtor();
      form.append('file', req.file.buffer, 'utterance.webm');
      form.append('model', model);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');

      const apiKey = typeof apiKeyProvider === 'function' ? apiKeyProvider() : apiKeyProvider;
      const aiRes = await fetchImpl(transcribeUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      });

      if (!aiRes.ok) {
        const errorText = await aiRes.text();
        throw new Error(errorText);
      }

      const json = await aiRes.json();
      return res.json({
        words: json.words,
        fullText: json.text
      });
    } catch (error) {
      logger.error('Transcription error:', error);
      return res.status(500).json({ error: error.message });
    }
  };
}
