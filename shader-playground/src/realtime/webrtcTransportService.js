const OPENAI_REALTIME_BASE_URL = 'https://api.openai.com/v1/realtime';
const OPENAI_REALTIME_MODEL = 'gpt-4o-mini-realtime-preview-2024-12-17';

export class WebRtcTransportService {
  constructor({
    mobileDebug = () => {},
    onIceDisconnected = () => {},
    onIceFailed = () => {},
    fetchFn = (...args) => globalThis.fetch(...args),
    getUserMedia = (...args) => globalThis.navigator.mediaDevices.getUserMedia(...args),
    createPeerConnection = (config) => new globalThis.RTCPeerConnection(config)
  }) {
    this.mobileDebug = mobileDebug;
    this.onIceDisconnected = onIceDisconnected;
    this.onIceFailed = onIceFailed;
    this.fetchFn = fetchFn;
    this.getUserMedia = getUserMedia;
    this.createPeerConnection = createPeerConnection;
  }

  async establishPeerConnection(ephemeralKey) {
    this.mobileDebug('Creating WebRTC PeerConnection...');
    const peerConnection = this.createPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
    this.mobileDebug('PeerConnection created and audio transceiver added');

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      if (state === 'disconnected') {
        peerConnection.restartIce();
        this.onIceDisconnected();
      }
      if (state === 'failed') {
        this.onIceFailed();
      }
    };

    const mediaStream = await this.getUserMedia({ audio: true });
    const audioTrack = mediaStream.getTracks()[0];
    audioTrack.enabled = false;
    peerConnection.addTrack(audioTrack);
    const dataChannel = peerConnection.createDataChannel('oai-events');

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sdpResponse = await this.fetchFn(
      `${OPENAI_REALTIME_BASE_URL}?model=${OPENAI_REALTIME_MODEL}`,
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
}
