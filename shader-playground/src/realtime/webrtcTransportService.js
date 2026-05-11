const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DEFAULT_ICE_SERVERS = Object.freeze([
  { urls: 'stun:stun.l.google.com:19302' }
]);

function isValidIceServer(server) {
  return Boolean(server && server.urls);
}

export class WebRtcTransportService {
  constructor({
    mobileDebug = () => {},
    onIceDisconnected = () => {},
    onIceFailed = () => {},
    fetchFn = (...args) => globalThis.fetch(...args),
    getUserMedia = (...args) => globalThis.navigator.mediaDevices.getUserMedia(...args),
    createPeerConnection = (config) => new globalThis.RTCPeerConnection(config),
    getIceServers = async () => DEFAULT_ICE_SERVERS,
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    iceGatheringTimeoutMs = 5000,
    iceDisconnectedGraceMs = 8000
  }) {
    this.mobileDebug = mobileDebug;
    this.onIceDisconnected = onIceDisconnected;
    this.onIceFailed = onIceFailed;
    this.fetchFn = fetchFn;
    this.getUserMedia = getUserMedia;
    this.createPeerConnection = createPeerConnection;
    this.getIceServers = getIceServers;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.iceGatheringTimeoutMs = iceGatheringTimeoutMs;
    this.iceDisconnectedGraceMs = iceDisconnectedGraceMs;
    this.iceDisconnectTimer = null;
  }

  async establishPeerConnection(ephemeralKey) {
    this.clearIceDisconnectTimer();
    this.mobileDebug('Creating WebRTC PeerConnection...');
    const iceServers = await this.resolveIceServers();
    const peerConnection = this.createPeerConnection({
      iceServers
    });
    peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
    this.mobileDebug(`PeerConnection created with ${iceServers.length} ICE server entries and audio transceiver added`);

    peerConnection.oniceconnectionstatechange = () => {
      this.handleIceConnectionStateChange(peerConnection);
    };

    const mediaStream = await this.getUserMedia({ audio: true });
    const audioTrack = mediaStream.getTracks()[0];
    audioTrack.enabled = false;
    peerConnection.addTrack(audioTrack);
    const dataChannel = peerConnection.createDataChannel('oai-events');

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await this.waitForIceGatheringComplete(peerConnection);

    const sdpResponse = await this.fetchFn(
      OPENAI_REALTIME_CALLS_URL,
      {
        method: 'POST',
        body: peerConnection.localDescription.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp'
        }
      }
    );

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      this.mobileDebug(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
      this.mobileDebug(`Error details: ${errorText.substring(0, 100)}...`);
      throw new Error(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
    }

    const sdpText = await sdpResponse.text();
    await peerConnection.setRemoteDescription({ type: 'answer', sdp: sdpText });
    this.mobileDebug('Remote SDP description set successfully');

    return { peerConnection, dataChannel, audioTrack };
  }

  async resolveIceServers() {
    try {
      const iceServers = await this.getIceServers();
      if (Array.isArray(iceServers) && iceServers.some(isValidIceServer)) {
        return iceServers.filter(isValidIceServer);
      }
    } catch (err) {
      this.mobileDebug(`RTC ICE config load failed: ${err.message}`);
    }
    this.mobileDebug('Using default STUN-only ICE config');
    return DEFAULT_ICE_SERVERS.map((server) => ({ ...server }));
  }

  handleIceConnectionStateChange(peerConnection) {
    const state = peerConnection.iceConnectionState;
    this.mobileDebug(`ICE connection state: ${state}`);

    if (state === 'disconnected') {
      try {
        peerConnection.restartIce?.();
      } catch (err) {
        this.mobileDebug(`ICE restart failed: ${err.message}`);
      }
      this.scheduleIceDisconnectCheck(peerConnection);
      return;
    }

    if (state === 'connected' || state === 'completed' || state === 'closed') {
      this.clearIceDisconnectTimer();
      return;
    }

    if (state === 'failed') {
      this.clearIceDisconnectTimer();
      this.onIceFailed();
    }
  }

  scheduleIceDisconnectCheck(peerConnection) {
    if (this.iceDisconnectTimer) return;

    this.iceDisconnectTimer = this.schedule(() => {
      this.iceDisconnectTimer = null;
      if (peerConnection.iceConnectionState === 'disconnected') {
        this.onIceDisconnected();
      }
    }, this.iceDisconnectedGraceMs);
  }

  clearIceDisconnectTimer() {
    if (!this.iceDisconnectTimer) return;
    this.clearScheduled(this.iceDisconnectTimer);
    this.iceDisconnectTimer = null;
  }

  async waitForIceGatheringComplete(peerConnection) {
    if (peerConnection.iceGatheringState === 'complete') return;
    if (
      typeof peerConnection.addEventListener !== 'function'
      || typeof peerConnection.removeEventListener !== 'function'
    ) {
      return;
    }

    await new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) {
          this.clearScheduled(timer);
        }
        peerConnection.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => {
        if (peerConnection.iceGatheringState === 'complete') {
          finish();
        }
      };
      peerConnection.addEventListener('icegatheringstatechange', check);
      check();
      if (!settled) {
        timer = this.schedule(finish, this.iceGatheringTimeoutMs);
      }
    });
  }
}
