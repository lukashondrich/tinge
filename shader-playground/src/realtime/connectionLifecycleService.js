import { CONNECTION_STATES } from './sessionConnectionState.js';

export class ConnectionLifecycleService {
  constructor({
    deviceType,
    getIsConnecting,
    getIsConfiguring = () => false,
    getIsConnected = () => false,
    getConnectionState = () => CONNECTION_STATES.IDLE,
    getPTTButton,
    setPTTStatus,
    setPTTReadyStatus,
    transitionConnectionState,
    initializeMobileMicrophone,
    verifyBackendReachable,
    requestEphemeralKey,
    setCurrentEphemeralKey,
    establishTransport,
    setTransport,
    teardownTransport = () => {},
    setupPeerTrackHandling,
    tryHydrateExistingRemoteAudioTrack,
    setupDataChannelEvents,
    sendSessionConfiguration,
    handleConnectError,
    getDataChannel,
    dataChannelOpenTimeoutMs = 10000,
    sessionConfigTimeoutMs = 10000,
    maxReconnectAttempts = 6,
    reconnectBackoffMs = [1000, 2000, 4000, 8000, 10000],
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    mobileDebug = () => {},
    log = () => {},
    warn = () => {},
    error = () => {}
  }) {
    this.deviceType = deviceType;
    this.getIsConnecting = getIsConnecting;
    this.getIsConfiguring = getIsConfiguring;
    this.getIsConnected = getIsConnected;
    this.getConnectionState = getConnectionState;
    this.getPTTButton = getPTTButton;
    this.setPTTStatus = setPTTStatus;
    this.setPTTReadyStatus = setPTTReadyStatus;
    this.transitionConnectionState = transitionConnectionState;
    this.initializeMobileMicrophone = initializeMobileMicrophone;
    this.verifyBackendReachable = verifyBackendReachable;
    this.requestEphemeralKey = requestEphemeralKey;
    this.setCurrentEphemeralKey = setCurrentEphemeralKey;
    this.establishTransport = establishTransport;
    this.setTransport = setTransport;
    this.teardownTransport = teardownTransport;
    this.setupPeerTrackHandling = setupPeerTrackHandling;
    this.tryHydrateExistingRemoteAudioTrack = tryHydrateExistingRemoteAudioTrack;
    this.setupDataChannelEvents = setupDataChannelEvents;
    this.sendSessionConfiguration = sendSessionConfiguration;
    this.handleConnectError = handleConnectError;
    this.getDataChannel = getDataChannel;
    this.dataChannelOpenTimeoutMs = dataChannelOpenTimeoutMs;
    this.sessionConfigTimeoutMs = sessionConfigTimeoutMs;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectBackoffMs = reconnectBackoffMs;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.mobileDebug = mobileDebug;
    this.log = log;
    this.warn = warn;
    this.error = error;
    this.pendingConnectPromise = null;
    this.sessionConfigTimeout = null;
    this.resolveSessionConfigured = null;
    this.rejectSessionConfigured = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
  }

  async connect() {
    if (this.getIsConnected()) return;
    if (this.pendingConnectPromise) {
      return this.pendingConnectPromise;
    }
    if (this.getIsConnecting() || this.getIsConfiguring()) return;

    this.pendingConnectPromise = this.runConnect();
    try {
      return await this.pendingConnectPromise;
    } finally {
      this.pendingConnectPromise = null;
    }
  }

  async runConnect() {
    this.transitionConnectionState(CONNECTION_STATES.CONNECTING, 'connect_requested');
    try {
      if (this.getPTTButton()) {
        this.setPTTStatus('Connecting...', '#666');
      }

      if (this.deviceType === 'mobile') {
        await this.initializeMobileMicrophone();
        await this.verifyBackendReachable();
      }

      const ephemeralKey = await this.requestEphemeralKey();
      this.setCurrentEphemeralKey(ephemeralKey);
      await this.establishPeerConnection(ephemeralKey);

      const channelReady = await this.waitForDataChannelOpen(this.dataChannelOpenTimeoutMs);
      if (!channelReady) {
        throw new Error('Data channel did not open in time');
      }

      this.transitionConnectionState(CONNECTION_STATES.CONFIGURING, 'data_channel_open');
      this.setPTTStatus('Configuring...', '#666');
      const sessionConfigured = this.createSessionConfiguredPromise();
      await this.sendSessionConfiguration();
      await sessionConfigured;

      this.log('OpenAI Realtime connection established');
      this.mobileDebug('🎉 OpenAI Realtime connection fully established!');
    } catch (err) {
      this.error(`OpenAI connection error: ${err.message}`);
      this.error('Error details:', err);
      this.clearSessionConfiguredWait();
      this.teardownTransport();
      if (this.getConnectionState() !== CONNECTION_STATES.RECONNECTING) {
        this.transitionConnectionState(CONNECTION_STATES.FAILED, 'connect_error');
      }
      // During an auto-reconnect cycle the reconnect engine owns the button
      // status ("Reconnecting…" / eventual "Reconnect"); skip the error UI so
      // it doesn't flash a misleading "Try Again" mid-cycle.
      if (this.reconnectAttempts === 0) {
        this.handleConnectError(err);
      }
      throw err;
    }
  }

  async establishPeerConnection(ephemeralKey) {
    this.teardownTransport();
    const { peerConnection, dataChannel, audioTrack } =
      await this.establishTransport(ephemeralKey);
    this.setTransport({ peerConnection, dataChannel, audioTrack });

    dataChannel.onclose = (event = {}) => {
      if (this.getDataChannel() !== dataChannel) return;
      this.warn('Realtime data channel closed; reconnect required', {
        readyState: dataChannel.readyState,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
      this.rejectPendingSessionConfigured(new Error('Data channel closed during session configuration'));
      this.handleConnectionDropped('data_channel_close');
    };

    dataChannel.onerror = (event) => {
      if (this.getDataChannel() !== dataChannel) return;
      this.warn('Realtime data channel error', event?.error || event);
    };

    dataChannel.onopen = () => {
      this.mobileDebug('Realtime data channel open');
    };

    this.setupPeerTrackHandling();
    await this.tryHydrateExistingRemoteAudioTrack();
    this.setupDataChannelEvents();
  }

  createSessionConfiguredPromise() {
    this.clearSessionConfigTimeout();

    return new Promise((resolve, reject) => {
      this.resolveSessionConfigured = resolve;
      this.rejectSessionConfigured = reject;
      this.sessionConfigTimeout = this.schedule(() => {
        const err = new Error('Session configuration timed out');
        this.rejectPendingSessionConfigured(err);
        this.transitionConnectionState(CONNECTION_STATES.FAILED, 'session_config_timeout');
      }, this.sessionConfigTimeoutMs);
    });
  }

  handleSessionConfigured() {
    if (this.getConnectionState() === CONNECTION_STATES.CONNECTED) {
      return false;
    }
    if (this.getConnectionState() !== CONNECTION_STATES.CONFIGURING) {
      return false;
    }

    this.clearSessionConfigTimeout();
    this.clearReconnect();
    this.transitionConnectionState(CONNECTION_STATES.CONNECTED, 'session_updated');
    this.setPTTReadyStatus();
    if (this.resolveSessionConfigured) {
      this.resolveSessionConfigured();
    }
    this.resolveSessionConfigured = null;
    this.rejectSessionConfigured = null;
    return true;
  }

  rejectPendingSessionConfigured(error) {
    this.clearSessionConfigTimeout();
    if (this.rejectSessionConfigured) {
      this.rejectSessionConfigured(error);
    }
    this.resolveSessionConfigured = null;
    this.rejectSessionConfigured = null;
  }

  clearSessionConfigTimeout() {
    if (this.sessionConfigTimeout) {
      this.clearScheduled(this.sessionConfigTimeout);
      this.sessionConfigTimeout = null;
    }
  }

  clearSessionConfiguredWait() {
    this.clearSessionConfigTimeout();
    this.resolveSessionConfigured = null;
    this.rejectSessionConfigured = null;
  }

  reset() {
    this.rejectPendingSessionConfigured(new Error('Connection lifecycle reset'));
    this.clearReconnect();
    this.pendingConnectPromise = null;
  }

  // Entry point for both data-channel close and ICE-disconnect drops. ICE
  // restart can't recover an OpenAI Realtime call (there's no signaling channel
  // to renegotiate), so a dropped transport is healed by a full reconnect.
  handleConnectionDropped(reason) {
    this.transitionConnectionState(CONNECTION_STATES.RECONNECTING, reason);
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.warn(`Auto-reconnect gave up after ${this.reconnectAttempts} attempts`);
      this.transitionConnectionState(CONNECTION_STATES.FAILED, 'reconnect_exhausted');
      this.setPTTStatus('Reconnect', '#888');
      return;
    }

    const backoff = this.reconnectBackoffMs;
    const delay = backoff[Math.min(this.reconnectAttempts, backoff.length - 1)];
    this.reconnectAttempts += 1;
    this.setPTTStatus('Reconnecting…', '#888');
    this.mobileDebug(`Auto-reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    this.reconnectTimer = this.schedule(() => {
      this.reconnectTimer = null;
      this.attemptReconnect();
    }, delay);
  }

  async attemptReconnect() {
    // A user PTT press may have already restored the connection.
    if (this.getIsConnected() || this.getIsConnecting() || this.getIsConfiguring()) {
      return;
    }
    const state = this.getConnectionState();
    if (state !== CONNECTION_STATES.RECONNECTING && state !== CONNECTION_STATES.FAILED) {
      return;
    }

    try {
      await this.connect();
    } catch (err) {
      // runConnect already logged and transitioned to FAILED; queue the next try.
      this.scheduleReconnect();
    }
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      this.clearScheduled(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  async waitForDataChannelOpen(timeoutMs = 5000) {
    const dataChannel = this.getDataChannel();
    if (!dataChannel) return false;
    if (dataChannel.readyState === 'open') return true;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        this.clearScheduled(timer);
        dataChannel.removeEventListener('open', onOpen);
        dataChannel.removeEventListener('close', onCloseOrError);
        dataChannel.removeEventListener('error', onCloseOrError);
        resolve(value);
      };
      const onOpen = () => finish(true);
      const onCloseOrError = () => finish(false);
      const timer = this.schedule(() => finish(false), timeoutMs);

      dataChannel.addEventListener('open', onOpen, { once: true });
      dataChannel.addEventListener('close', onCloseOrError, { once: true });
      dataChannel.addEventListener('error', onCloseOrError, { once: true });
    });
  }
}
