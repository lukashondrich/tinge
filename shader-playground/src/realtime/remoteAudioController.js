const REMOTE_AUDIO_STYLE = {
  position: 'fixed',
  width: '1px',
  height: '1px',
  left: '-9999px',
  top: '0',
  opacity: '0',
  pointerEvents: 'none'
};

export function createRemoteAudioController({
  documentRef = document,
  windowRef = window,
  elementId = 'remoteAiAudio',
  error = () => {}
} = {}) {
  let remoteAudioEl = null;

  function ensureElement() {
    if (!remoteAudioEl) {
      remoteAudioEl = documentRef.getElementById(elementId);
    }

    if (!remoteAudioEl) {
      remoteAudioEl = documentRef.createElement('audio');
      remoteAudioEl.id = elementId;
      remoteAudioEl.preload = 'auto';
      Object.assign(remoteAudioEl.style, REMOTE_AUDIO_STYLE);
      documentRef.body.appendChild(remoteAudioEl);
    }

    remoteAudioEl.autoplay = true;
    remoteAudioEl.playsInline = true;
    remoteAudioEl.muted = false;
    remoteAudioEl.volume = 1.0;
    return remoteAudioEl;
  }

  function tryPlay(element) {
    try {
      const playResult = element.play?.();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch((err) => error('Audio play error:', err));
      }
    } catch (err) {
      error('Audio play error:', err);
    }
  }

  function attachRemoteStream(remoteStream) {
    const element = ensureElement();
    element.srcObject = remoteStream;

    const retryOnGesture = () => {
      tryPlay(element);
      windowRef.removeEventListener('pointerdown', retryOnGesture);
      windowRef.removeEventListener('touchstart', retryOnGesture);
      windowRef.removeEventListener('keydown', retryOnGesture);
    };

    tryPlay(element);
    windowRef.addEventListener('pointerdown', retryOnGesture, { once: true });
    windowRef.addEventListener('touchstart', retryOnGesture, { once: true });
    windowRef.addEventListener('keydown', retryOnGesture, { once: true });
  }

  function dispose() {
    if (!remoteAudioEl) return;
    remoteAudioEl.srcObject = null;
    remoteAudioEl.remove();
    remoteAudioEl = null;
  }

  return {
    ensureElement,
    attachRemoteStream,
    dispose,
    getElement: () => remoteAudioEl
  };
}
