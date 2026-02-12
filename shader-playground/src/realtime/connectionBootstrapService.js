export class ConnectionBootstrapService {
  constructor({
    apiUrl,
    mobileDebug = () => {},
    deviceType = 'desktop',
    onTokenUsage = null,
    fetchFn = (...args) => globalThis.fetch(...args),
    createAbortController = () => new globalThis.AbortController(),
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    getUserMedia = (...args) => globalThis.navigator.mediaDevices.getUserMedia(...args)
  }) {
    this.apiUrl = apiUrl;
    this.mobileDebug = mobileDebug;
    this.deviceType = deviceType;
    this.onTokenUsage = onTokenUsage;
    this.fetchFn = fetchFn;
    this.createAbortController = createAbortController;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.getUserMedia = getUserMedia;
  }

  async initializeMobileMicrophone() {
    try {
      this.mobileDebug('Starting mobile audio initialization...');
      const mobileStream = await this.getUserMedia({ audio: true });
      this.mobileDebug('Mobile microphone access granted successfully');
      const audioTrack = mobileStream.getAudioTracks()[0];
      mobileStream.getTracks().forEach((track) => track.stop());
      this.mobileDebug('Mobile audio track stored and test stream stopped');
      return audioTrack;
    } catch (mobileAudioError) {
      this.mobileDebug(`Mobile audio failed: ${mobileAudioError.name} - ${mobileAudioError.message}`);
      throw new Error(`Mobile microphone error: ${mobileAudioError.message}`);
    }
  }

  async verifyBackendReachable() {
    try {
      this.mobileDebug('Testing backend connectivity...');
      this.mobileDebug(`Backend URL: ${this.apiUrl}`);
      const healthResponse = await this.fetchFn(`${this.apiUrl}/health`, {
        method: 'GET',
        signal: globalThis.AbortSignal.timeout(8000),
        mode: 'cors',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      if (healthResponse.ok) {
        this.mobileDebug('Backend health check passed');
        const healthData = await healthResponse.text();
        this.mobileDebug(`Health response: ${healthData.substring(0, 50)}...`);
      } else {
        this.mobileDebug(`Backend health check failed: ${healthResponse.status}`);
        throw new Error(`Backend health check failed: ${healthResponse.status}`);
      }
    } catch (healthError) {
      this.mobileDebug(`Backend unreachable: ${healthError.name} - ${healthError.message}`);
      this.mobileDebug('Mobile browser can reach backend, trying simplified fetch...');
      try {
        const simpleResponse = await this.fetchFn(`${this.apiUrl}/health`, {
          signal: globalThis.AbortSignal.timeout(5000)
        });
        if (simpleResponse.ok) {
          this.mobileDebug('Simplified fetch succeeded!');
        } else {
          throw new Error(`Simplified fetch failed: ${simpleResponse.status}`);
        }
      } catch (simpleError) {
        this.mobileDebug(`Simplified fetch failed: ${simpleError.message}`);
        this.mobileDebug('Continuing despite fetch failure since browser access works...');
      }
      this.mobileDebug('Proceeding with token request despite connectivity test failures...');
    }
  }

  async requestEphemeralKey() {
    this.mobileDebug('Requesting OpenAI token...');
    const tokenController = this.createAbortController();
    const tokenTimeout = this.schedule(() => {
      tokenController.abort();
      this.mobileDebug('Token request timed out after 10 seconds');
    }, 10000);

    try {
      let tokenResponse;
      try {
        this.mobileDebug('Trying minimal token fetch...');
        tokenResponse = await this.fetchFn(`${this.apiUrl}/token`, {
          signal: tokenController.signal
        });
      } catch (minimalError) {
        this.mobileDebug(`Minimal fetch failed: ${minimalError.message}`);
        this.mobileDebug('Trying CORS-explicit token fetch...');
        tokenResponse = await this.fetchFn(`${this.apiUrl}/token`, {
          signal: tokenController.signal,
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: { Accept: '*/*' }
        });
      }

      this.clearScheduled(tokenTimeout);

      if (!tokenResponse.ok) {
        this.mobileDebug(`Token request failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
        throw new Error(`Failed to get token: ${tokenResponse.status}`);
      }

      this.mobileDebug('Token response received, parsing JSON...');
      const data = await tokenResponse.json();
      const ephemeralKey = data.client_secret.value;
      if (this.onTokenUsage && data.tokenUsage) {
        this.onTokenUsage(data.tokenUsage);
      }
      this.mobileDebug('OpenAI token received and parsed successfully');
      return ephemeralKey;
    } catch (tokenError) {
      this.clearScheduled(tokenTimeout);
      if (tokenError.name === 'AbortError') {
        this.mobileDebug('Token request was aborted due to timeout');
        throw new Error('Token request timed out - check network connection');
      } else {
        this.mobileDebug(`Token request failed: ${tokenError.name} - ${tokenError.message}`);
        if (this.deviceType === 'mobile') {
          this.mobileDebug('MOBILE WORKAROUND: Try opening the backend URL directly in browser and copying the token manually if needed');
          this.mobileDebug(`Backend token URL: ${this.apiUrl}/token`);
        }
        throw new Error(`Token request failed: ${tokenError.message}`);
      }
    }
  }
}
