export class TokenLimitService {
  constructor({
    apiUrl,
    getEphemeralKey,
    fetchFn = (...args) => globalThis.fetch(...args),
    warn = () => {}
  }) {
    this.apiUrl = apiUrl;
    this.getEphemeralKey = getEphemeralKey;
    this.fetchFn = fetchFn;
    this.warn = warn;
  }

  async checkTokenLimit() {
    const ephemeralKey = this.getEphemeralKey();
    if (!ephemeralKey) return { allowed: true, reason: 'no_key' };

    try {
      const response = await this.fetchFn(`${this.apiUrl}/token-usage/${ephemeralKey}`);
      if (response.ok) {
        const usage = await response.json();
        if (usage.isAtLimit) {
          return {
            allowed: false,
            reason: 'token_limit_exceeded',
            usage
          };
        }
        return { allowed: true, usage };
      }
    } catch (error) {
      this.warn('Failed to check token limit:', error);
      return { allowed: true, reason: 'check_failed' };
    }

    return { allowed: true, reason: 'unknown' };
  }
}
