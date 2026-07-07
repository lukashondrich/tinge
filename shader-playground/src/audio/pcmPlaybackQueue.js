import { base64ToInt16, int16ToFloat32 } from './pcmAudioCodec.js';

function defaultCreateAudioContext() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API is not available in this browser');
  return new Ctor();
}

/**
 * Sequentially schedules base64 PCM16 chunks from the Realtime API into a
 * MediaStreamAudioDestinationNode. Exposing playback as a MediaStream lets the
 * existing remote-audio plumbing (audio element + AI clip recorder) treat the
 * WebSocket transport exactly like a WebRTC remote track.
 *
 * onPlaybackStarted/onPlaybackStopped fire when audible output begins and when
 * the queue drains — the WebSocket transport uses them to synthesize the
 * `output_audio_buffer.started/stopped` events that only WebRTC emits natively.
 */
export class PcmPlaybackQueue {
  constructor({
    sampleRate = 24000,
    // Brief network stalls empty the buffer mid-response; wait this long
    // before declaring playback stopped so one response stays one AI clip.
    drainGraceMs = 300,
    onPlaybackStarted = () => {},
    onPlaybackStopped = () => {},
    createAudioContext = defaultCreateAudioContext,
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    error = () => {}
  } = {}) {
    this.sampleRate = sampleRate;
    this.drainGraceMs = drainGraceMs;
    this.onPlaybackStarted = onPlaybackStarted;
    this.onPlaybackStopped = onPlaybackStopped;
    this.createAudioContext = createAudioContext;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.error = error;

    this.audioContext = null;
    this.destinationNode = null;
    this.activeSources = new Set();
    this.nextStartTime = 0;
    this.playing = false;
    this.drainTimer = null;
    this.closed = false;
  }

  async init() {
    this.audioContext = this.createAudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }
    this.destinationNode = this.audioContext.createMediaStreamDestination();
  }

  getStream() {
    return this.destinationNode?.stream || null;
  }

  // Call from a user gesture: contexts created during a timer-driven
  // auto-reconnect can start suspended and only a gesture can revive them.
  resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  enqueueBase64(base64Audio) {
    if (this.closed || !this.audioContext || !base64Audio) return;

    let float32;
    try {
      float32 = int16ToFloat32(base64ToInt16(base64Audio));
    } catch (err) {
      this.error(`Failed to decode PCM playback chunk: ${err.message}`);
      return;
    }
    if (!float32.length) return;

    const buffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destinationNode);

    const now = this.audioContext.currentTime;
    const startAt = Math.max(this.nextStartTime, now + 0.02);
    this.nextStartTime = startAt + buffer.duration;
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };
    source.start(startAt);

    if (!this.playing) {
      this.playing = true;
      this.onPlaybackStarted();
    }
    this.scheduleDrainCheck();
  }

  scheduleDrainCheck() {
    if (this.drainTimer) {
      this.clearScheduled(this.drainTimer);
      this.drainTimer = null;
    }
    if (!this.audioContext || this.closed) return;

    const remainingMs = Math.max(0, (this.nextStartTime - this.audioContext.currentTime) * 1000);
    this.drainTimer = this.schedule(() => {
      this.drainTimer = null;
      this.checkDrained();
    }, remainingMs + this.drainGraceMs);
  }

  checkDrained() {
    if (!this.playing || this.closed || !this.audioContext) return;
    if (this.audioContext.currentTime < this.nextStartTime) {
      // More audio was scheduled while the timer was pending; re-arm.
      this.scheduleDrainCheck();
      return;
    }
    this.playing = false;
    this.onPlaybackStopped();
  }

  // Immediately discard queued audio (user interrupt). Intentionally does not
  // fire onPlaybackStopped: the interrupt path finalizes the AI turn itself.
  clear() {
    if (this.drainTimer) {
      this.clearScheduled(this.drainTimer);
      this.drainTimer = null;
    }
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
      } catch (err) {
        // sources that already ended throw; ignore
      }
    }
    this.activeSources.clear();
    this.playing = false;
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  async close() {
    this.closed = true;
    this.clear();
    this.destinationNode = null;
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (err) {
        // ignore close errors during teardown
      }
      this.audioContext = null;
    }
  }
}
