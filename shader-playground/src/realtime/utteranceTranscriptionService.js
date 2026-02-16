function defaultMakeFormData() {
  if (typeof globalThis.FormData !== 'function') {
    throw new Error('FormData is not available in this environment');
  }
  return new globalThis.FormData();
}

export class UtteranceTranscriptionService {
  constructor({
    apiUrl,
    fetchFn = (...args) => globalThis.fetch(...args),
    makeFormData = defaultMakeFormData,
    error = () => {}
  }) {
    this.apiUrl = apiUrl;
    this.fetchFn = fetchFn;
    this.makeFormData = makeFormData;
    this.error = error;
  }

  async fetchWordTimings(blob) {
    const fd = this.makeFormData();
    fd.append('file', blob, 'utterance.webm');
    const res = await this.fetchFn(`${this.apiUrl}/transcribe`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Transcription API error ${res.status}`);
    const { words, fullText } = await res.json();
    return { words, fullText };
  }

  async stopAndTranscribe(audioMgr, transcriptText) {
    return audioMgr.stopRecording(transcriptText)
      .then(async (record) => {
        if (!record) return null;
        try {
          const { words, fullText } = await this.fetchWordTimings(record.audioBlob);
          record.wordTimings = words;
          const normalizedFullText = typeof fullText === 'string' ? fullText.trim() : '';
          record.fullText = normalizedFullText || record.text;
          if ((!record.text || !String(record.text).trim()) && normalizedFullText) {
            record.text = normalizedFullText;
          }
        } catch (err) {
          this.error(`Word timing fetch failed: ${err.message}`);
          record.wordTimings = [];
          record.fullText = record.text;
        }
        return record;
      });
  }
}
