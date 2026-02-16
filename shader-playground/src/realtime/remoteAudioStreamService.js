function defaultCreateMediaStream(tracks) {
  if (typeof globalThis.MediaStream !== 'function') {
    return null;
  }
  return new globalThis.MediaStream(tracks);
}

function defaultCreateAudioElement() {
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== 'function') {
    return null;
  }
  return doc.createElement('audio');
}

function defaultAppendElement(element) {
  const doc = globalThis.document;
  if (!doc?.body || typeof doc.body.appendChild !== 'function') {
    return;
  }
  doc.body.appendChild(element);
}

export class RemoteAudioStreamService {
  constructor({
    aiAudioMgr,
    dataChannelEventRouter,
    getOnRemoteStreamCallback,
    setAiAudioReady,
    createMediaStream = defaultCreateMediaStream,
    createAudioElement = defaultCreateAudioElement,
    appendElement = defaultAppendElement,
    log = () => {},
    error = () => {}
  }) {
    this.aiAudioMgr = aiAudioMgr;
    this.dataChannelEventRouter = dataChannelEventRouter;
    this.getOnRemoteStreamCallback = getOnRemoteStreamCallback;
    this.setAiAudioReady = setAiAudioReady;
    this.createMediaStream = createMediaStream;
    this.createAudioElement = createAudioElement;
    this.appendElement = appendElement;
    this.log = log;
    this.error = error;
    this.seenRemoteAudioTrackIds = new Set();
  }

  reset() {
    this.seenRemoteAudioTrackIds.clear();
    this.setAiAudioReady(false);
  }

  setupPeerTrackHandling(peerConnection) {
    if (!peerConnection) return;

    peerConnection.ontrack = async (event) => {
      const remoteStream = event.streams?.[0]
        || (event.track ? this.createMediaStream([event.track]) : null);
      if (!remoteStream) {
        this.error('Received track event without a usable remote stream');
        return;
      }
      await this.handleIncomingRemoteStream(remoteStream);
    };
  }

  async tryHydrateExistingRemoteAudioTrack(peerConnection) {
    if (!peerConnection || typeof peerConnection.getReceivers !== 'function') {
      return;
    }

    const receiver = peerConnection
      .getReceivers()
      .find((r) => r?.track && r.track.kind === 'audio' && r.track.readyState === 'live');
    if (!receiver?.track) {
      return;
    }

    const stream = this.createMediaStream([receiver.track]);
    if (!stream) return;
    await this.handleIncomingRemoteStream(stream);
  }

  async handleIncomingRemoteStream(remoteStream) {
    if (!remoteStream) return false;

    const track = remoteStream.getAudioTracks?.()[0] || null;
    if (track?.id && this.seenRemoteAudioTrackIds.has(track.id)) {
      return false;
    }
    if (track?.id) {
      this.seenRemoteAudioTrackIds.add(track.id);
    }

    const onRemoteStream = this.getOnRemoteStreamCallback?.();
    if (onRemoteStream) {
      onRemoteStream(remoteStream);
    } else {
      const remoteAudio = this.createAudioElement();
      if (remoteAudio) {
        remoteAudio.srcObject = remoteStream;
        remoteAudio.autoplay = true;
        this.appendElement(remoteAudio);
      }
    }

    this.aiAudioMgr.stream = remoteStream;
    try {
      await this.aiAudioMgr.init();
      this.setAiAudioReady(true);
      this.dataChannelEventRouter?.resetAiAudioWarning?.();
      this.log('AI audio recorder attached to remote stream');
    } catch (err) {
      this.setAiAudioReady(false);
      this.error(`AI AudioManager init error: ${err}`);
    }

    return true;
  }
}
