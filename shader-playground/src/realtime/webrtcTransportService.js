const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DEFAULT_ICE_SERVERS = Object.freeze([
  { urls: 'stun:stun.l.google.com:19302' }
]);
const VALID_ICE_TRANSPORT_POLICIES = new Set(['all', 'relay']);

function isValidIceServer(server) {
  return Boolean(server && server.urls);
}

function normalizeIceTransportPolicy(policy) {
  const normalized = String(policy || 'all').trim().toLowerCase();
  return VALID_ICE_TRANSPORT_POLICIES.has(normalized) ? normalized : 'all';
}

export class WebRtcTransportService {
  constructor({
    mobileDebug = () => {},
    onIceDisconnected = () => {},
    onIceFailed = () => {},
    fetchFn = (...args) => globalThis.fetch(...args),
    getUserMedia = (...args) => globalThis.navigator.mediaDevices.getUserMedia(...args),
    createPeerConnection = (config) => new globalThis.RTCPeerConnection(config),
    getRtcConfig = null,
    getIceServers = async () => DEFAULT_ICE_SERVERS,
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    iceGatheringTimeoutMs = 5000,
    iceDisconnectedGraceMs = 8000,
    connectionDiagnosticsDelayMs = 8000
  }) {
    this.mobileDebug = mobileDebug;
    this.onIceDisconnected = onIceDisconnected;
    this.onIceFailed = onIceFailed;
    this.fetchFn = fetchFn;
    this.getUserMedia = getUserMedia;
    this.createPeerConnection = createPeerConnection;
    this.getRtcConfig = getRtcConfig;
    this.getIceServers = getIceServers;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.iceGatheringTimeoutMs = iceGatheringTimeoutMs;
    this.iceDisconnectedGraceMs = iceDisconnectedGraceMs;
    this.connectionDiagnosticsDelayMs = connectionDiagnosticsDelayMs;
    this.iceDisconnectTimer = null;
    this.activePeerConnection = null;
  }

  async establishPeerConnection(ephemeralKey) {
    this.clearIceDisconnectTimer();
    this.mobileDebug('Creating WebRTC PeerConnection...');
    const { iceServers, iceTransportPolicy } = await this.resolveRtcConfig();
    const peerConnection = this.createPeerConnection({
      iceServers,
      iceTransportPolicy
    });
    this.activePeerConnection = peerConnection;
    let audioTrack = null;

    try {
      peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
      this.mobileDebug(`PeerConnection created with ${iceServers.length} ICE server entries (${iceTransportPolicy} policy) and audio transceiver added`);

      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection !== this.activePeerConnection) return;
        this.handleIceConnectionStateChange(peerConnection);
      };
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection !== this.activePeerConnection) return;
        this.mobileDebug(`Peer connection state: ${peerConnection.connectionState}`);
      };
      peerConnection.onicecandidateerror = (event) => {
        this.handleIceCandidateError(event);
      };

      // Tally gathered candidate types so the logs show whether a relay
      // candidate was actually obtained on the user's network.
      const candidateTally = { host: 0, srflx: 0, relay: 0 };
      peerConnection.onicecandidate = (event) => {
        const candidate = event?.candidate?.candidate;
        if (!candidate) return;
        const match = candidate.match(/ typ (\w+)/);
        if (match) candidateTally[match[1]] = (candidateTally[match[1]] || 0) + 1;
      };

      const mediaStream = await this.getUserMedia({ audio: true });
      audioTrack = mediaStream.getTracks()[0];
      audioTrack.enabled = false;
      peerConnection.addTrack(audioTrack);
      const dataChannel = peerConnection.createDataChannel('oai-events');

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await this.waitForIceGatheringComplete(peerConnection);
      this.mobileDebug(`ICE candidates gathered: ${JSON.stringify(candidateTally)}`);

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

      this.scheduleConnectionDiagnostics(peerConnection);

      return { peerConnection, dataChannel, audioTrack };
    } catch (err) {
      this.abandonPeerConnection(peerConnection, audioTrack);
      throw err;
    }
  }

  // One-shot stats dump during the ICE checking phase so the logs reveal
  // whether candidate pairs are progressing (slow path) or failing (blocked
  // path) when a connection won't complete.
  scheduleConnectionDiagnostics(peerConnection) {
    if (typeof peerConnection.getStats !== 'function') return;
    this.schedule(async () => {
      if (peerConnection !== this.activePeerConnection) return;
      try {
        const stats = await peerConnection.getStats();
        const pairStates = [];
        let selectedState = null;
        stats.forEach((report) => {
          if (report.type === 'candidate-pair') {
            pairStates.push(report.state);
            if (report.selected || report.nominated) selectedState = report.state;
          }
        });
        this.mobileDebug(
          `ICE diagnostics @${this.connectionDiagnosticsDelayMs}ms: iceState=${peerConnection.iceConnectionState} `
          + `pairs=${JSON.stringify(pairStates)} selected=${selectedState}`
        );
      } catch (err) {
        this.mobileDebug(`ICE diagnostics error: ${err.message}`);
      }
    }, this.connectionDiagnosticsDelayMs);
  }

  abandonPeerConnection(peerConnection, audioTrack) {
    if (audioTrack) {
      try {
        audioTrack.stop();
      } catch (err) {
        // ignore track stop errors
      }
    }
    try {
      peerConnection.close();
    } catch (err) {
      // ignore close errors on abandoned peer connections
    }
    if (this.activePeerConnection === peerConnection) {
      this.activePeerConnection = null;
    }
  }

  async resolveIceServers() {
    const { iceServers } = await this.resolveRtcConfig();
    return iceServers;
  }

  async resolveRtcConfig() {
    try {
      const config = this.getRtcConfig
        ? await this.getRtcConfig()
        : { iceServers: await this.getIceServers() };
      const remoteConfig = Array.isArray(config) ? { iceServers: config } : config;
      if (Array.isArray(remoteConfig?.iceServers) && remoteConfig.iceServers.some(isValidIceServer)) {
        return {
          iceServers: remoteConfig.iceServers.filter(isValidIceServer),
          iceTransportPolicy: normalizeIceTransportPolicy(remoteConfig.iceTransportPolicy)
        };
      }
    } catch (err) {
      this.mobileDebug(`RTC ICE config load failed: ${err.message}`);
    }
    this.mobileDebug('Using default STUN-only ICE config');
    return {
      iceServers: DEFAULT_ICE_SERVERS.map((server) => ({ ...server })),
      iceTransportPolicy: 'all'
    };
  }

  handleIceCandidateError(event) {
    const url = event?.url || 'unknown-url';
    const errorCode = event?.errorCode || 'unknown-code';
    const errorText = event?.errorText || 'unknown ICE candidate error';
    this.mobileDebug(`ICE candidate error: url=${url} code=${errorCode} text=${errorText}`);
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
      if (peerConnection !== this.activePeerConnection) return;
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
