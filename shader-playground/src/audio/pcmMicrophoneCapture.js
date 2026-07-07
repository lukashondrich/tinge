import { floatTo16BitPcm, int16ToBase64, resampleFloat32 } from './pcmAudioCodec.js';

const CAPTURE_WORKLET_NAME = 'pcm-capture-processor';
// The streaming gate lives inside the worklet so the audio thread doesn't
// structured-clone ~375 frames/sec to the main thread while PTT is idle.
const CAPTURE_WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.streaming = false;
    this.port.onmessage = (event) => {
      this.streaming = Boolean(event.data && event.data.streaming);
    };
  }
  process(inputs) {
    if (!this.streaming) return true;
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor('${CAPTURE_WORKLET_NAME}', PcmCaptureProcessor);
`;

function defaultCreateAudioContext(sampleRate) {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API is not available in this browser');
  try {
    return new Ctor({ sampleRate });
  } catch (err) {
    // Some browsers reject custom sample rates; fall back to the default and
    // let the downsampler bridge the gap.
    return new Ctor();
  }
}

/**
 * Captures microphone audio as base64 PCM16 chunks at the Realtime API's
 * 24kHz mono format. Streaming is gated: frames are only emitted while
 * `setStreaming(true)` (push-to-talk pressed), mirroring how the WebRTC path
 * toggles `audioTrack.enabled`.
 */
export class PcmMicrophoneCapture {
  constructor({
    onAudioChunk,
    targetSampleRate = 24000,
    chunkDurationMs = 50,
    getUserMedia = (...args) => globalThis.navigator.mediaDevices.getUserMedia(...args),
    createAudioContext = defaultCreateAudioContext,
    error = () => {}
  } = {}) {
    this.onAudioChunk = onAudioChunk;
    this.targetSampleRate = targetSampleRate;
    this.chunkDurationMs = chunkDurationMs;
    this.getUserMedia = getUserMedia;
    this.createAudioContext = createAudioContext;
    this.error = error;

    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.captureNode = null;
    this.streaming = false;
    this.stopped = false;
    this.pendingSamples = [];
    this.pendingSampleCount = 0;
  }

  get isStreaming() {
    return this.streaming;
  }

  async start() {
    this.mediaStream = await this.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });
    this.audioContext = this.createAudioContext(this.targetSampleRate);
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.captureNode = await this.createCaptureNode();
    this.sourceNode.connect(this.captureNode.node);
  }

  async createCaptureNode() {
    const context = this.audioContext;
    if (context.audioWorklet && typeof globalThis.AudioWorkletNode === 'function') {
      const blob = new globalThis.Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
      const moduleUrl = globalThis.URL.createObjectURL(blob);
      try {
        await context.audioWorklet.addModule(moduleUrl);
      } finally {
        globalThis.URL.revokeObjectURL(moduleUrl);
      }
      const node = new globalThis.AudioWorkletNode(context, CAPTURE_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1
      });
      node.port.onmessage = (event) => this.handleFrame(event.data);
      return {
        node,
        disconnect: () => node.disconnect(),
        setWorkletStreaming: (streaming) => {
          try {
            node.port.postMessage({ streaming });
          } catch (err) {
            // a closing port during teardown is fine to ignore
          }
        }
      };
    }

    // ScriptProcessor fallback for browsers without AudioWorklet.
    const node = context.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (event) => {
      this.handleFrame(event.inputBuffer.getChannelData(0).slice(0));
    };
    // ScriptProcessor only fires when connected to a destination; use a muted
    // gain so the mic isn't audible locally.
    const sink = context.createGain();
    sink.gain.value = 0;
    node.connect(sink);
    sink.connect(context.destination);
    return {
      node,
      disconnect: () => {
        node.disconnect();
        sink.disconnect();
      }
    };
  }

  setStreaming(enabled) {
    this.streaming = Boolean(enabled);
    if (this.streaming) {
      // PTT press is a user gesture — the one chance to revive a context that
      // was created suspended (e.g. during a timer-driven auto-reconnect).
      this.resumeContext();
    }
    this.captureNode?.setWorkletStreaming?.(this.streaming);
    if (!this.streaming) {
      this.flushPending();
    }
  }

  resumeContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  handleFrame(frame) {
    if (!this.streaming || this.stopped || !frame?.length) return;
    this.pendingSamples.push(frame);
    this.pendingSampleCount += frame.length;

    const sourceRate = this.audioContext?.sampleRate || this.targetSampleRate;
    const chunkSamples = Math.ceil((sourceRate * this.chunkDurationMs) / 1000);
    if (this.pendingSampleCount >= chunkSamples) {
      this.flushPending();
    }
  }

  flushPending() {
    if (!this.pendingSampleCount) return;
    const merged = new Float32Array(this.pendingSampleCount);
    let offset = 0;
    for (const frame of this.pendingSamples) {
      merged.set(frame, offset);
      offset += frame.length;
    }
    this.pendingSamples = [];
    this.pendingSampleCount = 0;

    try {
      const sourceRate = this.audioContext?.sampleRate || this.targetSampleRate;
      const resampled = resampleFloat32(merged, sourceRate, this.targetSampleRate);
      if (!resampled.length) return;
      const base64 = int16ToBase64(floatTo16BitPcm(resampled));
      this.onAudioChunk?.(base64);
    } catch (err) {
      this.error(`PCM capture chunk failed: ${err.message}`);
    }
  }

  async stop() {
    this.stopped = true;
    this.streaming = false;
    this.pendingSamples = [];
    this.pendingSampleCount = 0;

    if (this.captureNode) {
      if (this.captureNode.node?.port) {
        this.captureNode.node.port.onmessage = null;
      }
      try {
        this.captureNode.disconnect();
      } catch (err) {
        // ignore disconnect errors during teardown
      }
      this.captureNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (err) {
        // ignore disconnect errors during teardown
      }
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          // ignore track stop errors
        }
      });
      this.mediaStream = null;
    }
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
