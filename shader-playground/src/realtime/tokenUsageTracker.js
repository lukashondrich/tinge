export class TokenUsageTracker {
  constructor({
    apiUrl,
    getEphemeralKey,
    onUsage,
    warn = () => {},
    fetchFn = (...args) => globalThis.fetch(...args),
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args)
  }) {
    this.apiUrl = apiUrl;
    this.getEphemeralKey = getEphemeralKey;
    this.onUsage = onUsage;
    this.warn = warn;
    this.fetchFn = fetchFn;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;

    this.tokenEstimationTimeout = null;
    this.accumulatedText = '';
    this.accumulatedAudioDuration = 0;
  }

  updateEstimate(text, audioDuration) {
    const ephemeralKey = this.getEphemeralKey();
    if (!ephemeralKey) return;

    if (text) this.accumulatedText += text;
    if (audioDuration) this.accumulatedAudioDuration += audioDuration;

    if (this.tokenEstimationTimeout) {
      this.clearScheduled(this.tokenEstimationTimeout);
    }

    this.tokenEstimationTimeout = this.schedule(async () => {
      try {
        const response = await this.fetchFn(`${this.apiUrl}/token-usage/${ephemeralKey}/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: this.accumulatedText,
            audioDuration: this.accumulatedAudioDuration
          })
        });

        if (response.ok) {
          const usage = await response.json();
          this.onUsage?.(usage);
          this.accumulatedText = '';
          this.accumulatedAudioDuration = 0;
          return usage;
        }
      } catch (error) {
        this.warn('Failed to update estimated token usage:', error);
      }
    }, 200);
  }

  async updateActual(usageData) {
    const ephemeralKey = this.getEphemeralKey();
    if (!ephemeralKey) return;

    try {
      const response = await this.fetchFn(`${this.apiUrl}/token-usage/${ephemeralKey}/actual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usageData })
      });

      if (response.ok) {
        const usage = await response.json();
        this.onUsage?.(usage);
        return usage;
      }
    } catch (error) {
      this.warn('Failed to update actual token usage:', error);
    }
  }

  reset() {
    if (this.tokenEstimationTimeout) {
      this.clearScheduled(this.tokenEstimationTimeout);
      this.tokenEstimationTimeout = null;
    }
    this.accumulatedText = '';
    this.accumulatedAudioDuration = 0;
  }
}
