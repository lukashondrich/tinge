import { CONNECTION_STATES } from './sessionConnectionState.js';

export class ConnectionLifecycleService {
  constructor({
    deviceType,
    getIsConnecting,
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
    setupPeerTrackHandling,
    tryHydrateExistingRemoteAudioTrack,
    setupDataChannelEvents,
    sendSystemPrompt,
    sendSessionConfiguration,
    handleConnectError,
    getDataChannel,
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    mobileDebug = () => {},
    log = () => {},
    error = () => {}
  }) {
    this.deviceType = deviceType;
    this.getIsConnecting = getIsConnecting;
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
    this.setupPeerTrackHandling = setupPeerTrackHandling;
    this.tryHydrateExistingRemoteAudioTrack = tryHydrateExistingRemoteAudioTrack;
    this.setupDataChannelEvents = setupDataChannelEvents;
    this.sendSystemPrompt = sendSystemPrompt;
    this.sendSessionConfiguration = sendSessionConfiguration;
    this.handleConnectError = handleConnectError;
    this.getDataChannel = getDataChannel;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.mobileDebug = mobileDebug;
    this.log = log;
    this.error = error;
  }

  async connect() {
    if (this.getIsConnecting()) return;

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

      this.log('OpenAI Realtime connection established');
      this.mobileDebug('🎉 OpenAI Realtime connection fully established!');
      this.transitionConnectionState(CONNECTION_STATES.CONNECTED, 'peer_established');
      this.setPTTReadyStatus();
    } catch (err) {
      this.error(`OpenAI connection error: ${err.message}`);
      this.error('Error details:', err);
      this.transitionConnectionState(CONNECTION_STATES.FAILED, 'connect_error');
      this.handleConnectError(err);
      throw err;
    }
  }

  async establishPeerConnection(ephemeralKey) {
    const { peerConnection, dataChannel, audioTrack } =
      await this.establishTransport(ephemeralKey);
    this.setTransport({ peerConnection, dataChannel, audioTrack });

    dataChannel.onclose = () => {
      this.transitionConnectionState(CONNECTION_STATES.RECONNECTING, 'data_channel_close');
      this.setPTTStatus('Reconnect', '#888');
    };

    dataChannel.onopen = async () => {
      this.transitionConnectionState(CONNECTION_STATES.CONNECTED, 'data_channel_open');
      this.setPTTReadyStatus();
      await this.sendSystemPrompt();
      await this.sendSessionConfiguration();
    };

    this.setupPeerTrackHandling();
    await this.tryHydrateExistingRemoteAudioTrack();
    this.setupDataChannelEvents();
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
