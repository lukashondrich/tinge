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
      this.handleConnectError(err);
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
      this.transitionConnectionState(CONNECTION_STATES.RECONNECTING, 'data_channel_close');
      this.setPTTStatus('Reconnect', '#888');
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
    this.pendingConnectPromise = null;
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
