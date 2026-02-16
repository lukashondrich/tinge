export class UserTranscriptionService {
  constructor({
    deviceType,
    userAudioMgr,
    fetchWordTimings,
    stopAndTranscribe,
    updateTokenUsageEstimate,
    onEvent,
    addUtterance,
    getPendingUserRecord,
    setPendingUserRecord,
    getPendingUserRecordPromise,
    setPendingUserRecordPromise,
    now = () => Date.now(),
    createObjectURL = (...args) => globalThis.URL.createObjectURL(...args),
    error = () => {}
  }) {
    this.deviceType = deviceType;
    this.userAudioMgr = userAudioMgr;
    this.fetchWordTimings = fetchWordTimings;
    this.stopAndTranscribe = stopAndTranscribe;
    this.updateTokenUsageEstimate = updateTokenUsageEstimate;
    this.onEvent = onEvent;
    this.addUtterance = addUtterance;
    this.getPendingUserRecord = getPendingUserRecord;
    this.setPendingUserRecord = setPendingUserRecord;
    this.getPendingUserRecordPromise = getPendingUserRecordPromise;
    this.setPendingUserRecordPromise = setPendingUserRecordPromise;
    this.now = now;
    this.createObjectURL = createObjectURL;
    this.error = error;
  }

  buildTranscriptKey(transcript) {
    return `${this.deviceType}-user-${transcript.substring(0, 20)}-${this.now()}`;
  }

  emitTranscriptWords(transcript, transcriptKey) {
    const words = transcript.split(/\s+/);
    for (const word of words) {
      this.onEvent?.({
        type: 'transcript.word',
        word,
        speaker: 'user',
        deviceType: this.deviceType,
        transcriptKey
      });
    }
  }

  async enrichRecord(record, transcript, transcriptKey) {
    if (!record) return null;

    record.text = transcript;
    record.deviceType = this.deviceType;
    if (record.audioBlob && !record.audioURL) {
      record.audioURL = this.createObjectURL(record.audioBlob);
    }

    try {
      const { words, fullText } = await this.fetchWordTimings(record.audioBlob);
      record.wordTimings = words;
      record.fullText = fullText;
    } catch (err) {
      this.error(`Word timing fetch failed: ${err.message}`);
      record.wordTimings = [];
      record.fullText = transcript;
    }

    this.addUtterance(record);
    this.onEvent?.({
      type: 'utterance.added',
      record,
      deviceType: this.deviceType,
      transcriptKey
    });
    return record;
  }

  async resolveRecordForTranscript(transcript) {
    const pendingRecord = this.getPendingUserRecord();
    if (pendingRecord) {
      this.setPendingUserRecord(null);
      this.setPendingUserRecordPromise(null);
      return pendingRecord;
    }

    const pendingPromise = this.getPendingUserRecordPromise();
    if (pendingPromise) {
      this.setPendingUserRecordPromise(null);
      try {
        const record = await pendingPromise;
        if (record) {
          this.setPendingUserRecord(null);
          return record;
        }
        this.error('pendingUserRecordPromise resolved to null');
      } catch (err) {
        this.error(`User transcription promise error: ${err}`);
      }
    }

    return this.stopAndTranscribe(this.userAudioMgr, transcript)
      .catch((err) => {
        this.error(`User transcription fallback error: ${err}`);
        return null;
      });
  }

  async handleTranscriptionCompleted(event) {
    const transcript = String(event?.transcript || '').trim();
    if (!transcript) return;

    const transcriptKey = this.buildTranscriptKey(transcript);
    this.emitTranscriptWords(transcript, transcriptKey);
    this.updateTokenUsageEstimate(transcript);

    const record = await this.resolveRecordForTranscript(transcript);
    if (!record) {
      this.error('Unable to resolve user record for transcription event');
      return;
    }

    await this.enrichRecord(record, transcript, transcriptKey)
      .catch((err) => this.error(`User record enhancement error: ${err}`));
  }
}
