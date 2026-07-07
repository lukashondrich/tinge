import { PcmMicrophoneCapture } from '../audio/pcmMicrophoneCapture.js';
import { PcmPlaybackQueue } from '../audio/pcmPlaybackQueue.js';

const OPENAI_REALTIME_WSS_URL = 'wss://api.openai.com/v1/realtime';
const WS_READY_STATES = ['connecting', 'open', 'closing', 'closed'];

/**
 * Data-channel-shaped wrapper around the realtime WebSocket so the existing
 * lifecycle service, event router, and PTT orchestrator can drive either
 * transport through one interface: send(), readyState, close(), on-props and
 * addEventListener for 'open'/'close'/'error'/'message'.
 */
class RealtimeWebSocketChannel extends EventTarget {
  constructor({ getSocketReadyState, sendRaw, closeSocket }) {
    super();
    this.label = 'oai-events';
    this.getSocketReadyState = getSocketReadyState;
    this.sendRaw = sendRaw;
    this.closeSocket = closeSocket;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
  }

  get readyState() {
    return WS_READY_STATES[this.getSocketReadyState()] || 'closed';
  }

  send(payload) {
    this.sendRaw(payload);
  }

  close() {
    this.closeSocket();
  }

  emit(type, detail = {}) {
    const event = new Event(type);
    Object.assign(event, detail);
    const handler = this[`on${type}`];
    if (typeof handler === 'function') handler(event);
    this.dispatchEvent(event);
  }

  emitMessage(data) {
    const event = new Event('message');
    event.data = data;
    if (typeof this.onmessage === 'function') this.onmessage(event);
    this.dispatchEvent(event);
  }
}

/**
 * WebSocket transport for the OpenAI Realtime session. Fallback for networks
 * where WebRTC media cannot connect (UDP NAT timeouts, blocked TURN relay):
 * rides the same TLS/443 path as ordinary HTTPS, so no ICE/NAT/relay involved.
 *
 * Differences from the WebRTC path, hidden behind the channel interface:
 * - Mic audio is captured manually and streamed as `input_audio_buffer.append`
 *   (gated by a track-shaped object whose `enabled` mirrors PTT state).
 * - Model audio arrives as `response.output_audio.delta` and is played through
 *   a local queue exposed as a MediaStream (see getRemoteStream()).
 * - `output_audio_buffer.started/stopped` are WebRTC-only server events; they
 *   are synthesized here from playback state so the event router is unchanged.
 * - Outbound `output_audio_buffer.clear` (WebRTC-only) is intercepted and
 *   handled by clearing the local playback queue.
 */
export class WebSocketTransportService {
  constructor({
    mobileDebug = () => {},
    realtimeUrl = OPENAI_REALTIME_WSS_URL,
    getModel = () => null,
    createWebSocket = (url, protocols) => new globalThis.WebSocket(url, protocols),
    createMicrophoneCapture = (options) => new PcmMicrophoneCapture(options),
    createPlaybackQueue = (options) => new PcmPlaybackQueue(options),
    makeEventId = () => `evt_${Math.random().toString(36).slice(2)}`,
    // TCP gives no ICE-style liveness signal and a half-open socket can look
    // healthy for minutes; if a requested response produces no server event
    // within this window, the transport declares itself dead so the shared
    // reconnect path can heal it (WebRTC's ICE watchdog equivalent).
    responseStallTimeoutMs = 15000,
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    warn = () => {},
    error = () => {}
  } = {}) {
    this.mobileDebug = mobileDebug;
    this.realtimeUrl = realtimeUrl;
    this.getModel = getModel;
    this.createWebSocket = createWebSocket;
    this.createMicrophoneCapture = createMicrophoneCapture;
    this.createPlaybackQueue = createPlaybackQueue;
    this.makeEventId = makeEventId;
    this.responseStallTimeoutMs = responseStallTimeoutMs;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.warn = warn;
    this.error = error;

    this.socket = null;
    this.channel = null;
    this.capture = null;
    this.playback = null;
    this.currentResponseId = null;
    this.cancelledResponseId = null;
    this.stallTimer = null;
  }

  async establishConnection(ephemeralKey) {
    await this.teardown();
    this.mobileDebug('Creating realtime WebSocket connection...');

    let model = null;
    try {
      model = await this.getModel();
    } catch (err) {
      this.warn(`Realtime model lookup failed; connecting without model param: ${err.message}`);
    }
    const url = model
      ? `${this.realtimeUrl}?model=${encodeURIComponent(model)}`
      : this.realtimeUrl;

    // Audio setup happens BEFORE the socket exists: getUserMedia can block for
    // seconds, and a socket close during that window would fire into a channel
    // nobody listens to yet (the lifecycle only attaches handlers after this
    // method resolves), leaving connect failures to a slow timeout.
    try {
      this.playback = this.createPlaybackQueue({
        onPlaybackStarted: () => this.emitSynthesizedEvent('output_audio_buffer.started'),
        onPlaybackStopped: () => this.emitSynthesizedEvent('output_audio_buffer.stopped'),
        error: (...args) => this.error(...args)
      });
      await this.playback.init();

      this.capture = this.createMicrophoneCapture({
        onAudioChunk: (base64Audio) => this.sendInputAudioChunk(base64Audio),
        error: (...args) => this.error(...args)
      });
      await this.capture.start();
    } catch (err) {
      await this.teardown();
      throw err;
    }

    const socket = this.createWebSocket(url, [
      'realtime',
      `openai-insecure-api-key.${ephemeralKey}`
    ]);
    this.socket = socket;

    const channel = new RealtimeWebSocketChannel({
      getSocketReadyState: () => (this.socket === socket ? socket.readyState : 3),
      sendRaw: (payload) => this.handleOutbound(socket, payload),
      closeSocket: () => {
        try {
          socket.close();
        } catch (err) {
          // ignore close errors on an already-dead socket
        }
      }
    });
    this.channel = channel;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.mobileDebug('Realtime WebSocket open');
      channel.emit('open');
    };
    socket.onclose = (event = {}) => {
      if (this.socket !== socket) return;
      this.mobileDebug(`Realtime WebSocket closed (code=${event.code} clean=${event.wasClean})`);
      channel.emit('close', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
    };
    socket.onerror = (event) => {
      if (this.socket !== socket) return;
      this.mobileDebug('Realtime WebSocket error');
      channel.emit('error', { error: event?.error || event });
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.handleIncoming(event.data);
    };

    this.mobileDebug(`Realtime WebSocket transport ready (model=${model || 'from-session'})`);
    return {
      peerConnection: null,
      dataChannel: channel,
      audioTrack: this.createMicGateTrack(this.capture)
    };
  }

  // Track-shaped facade so pttOrchestrator's enable/disableMicrophone
  // (`track.enabled = …`) gates PCM streaming without WebRTC.
  createMicGateTrack(capture) {
    const track = {
      kind: 'audio',
      readyState: 'live',
      stop: () => {
        track.readyState = 'ended';
        capture.stop().catch(() => {});
      }
    };
    Object.defineProperty(track, 'enabled', {
      get: () => capture.isStreaming,
      set: (value) => {
        if (value) {
          // Enabling happens on PTT press — a user gesture that can revive
          // audio contexts left suspended by a timer-driven reconnect.
          this.playback?.resume();
        }
        capture.setStreaming(value);
      }
    });
    return track;
  }

  getRemoteStream() {
    return this.playback?.getStream() || null;
  }

  sendInputAudioChunk(base64Audio) {
    if (!this.socket || this.socket.readyState !== 1) return;
    try {
      this.socket.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        event_id: this.makeEventId(),
        audio: base64Audio
      }));
    } catch (err) {
      this.error(`Failed to send input audio chunk: ${err.message}`);
    }
  }

  handleOutbound(socket, payload) {
    let parsed = null;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      // Non-JSON payloads pass through untouched.
    }

    // WebRTC-only event: the "output audio buffer" lives in this client now,
    // so clear it locally instead of asking the server. Deltas of the
    // cancelled response can still be in flight; remember its id so they are
    // dropped instead of audibly resuming the cancelled speech.
    if (parsed?.type === 'output_audio_buffer.clear') {
      this.cancelledResponseId = this.currentResponseId;
      this.playback?.clear();
      return;
    }

    if (parsed?.type === 'response.create') {
      this.armStallWatchdog();
    }

    socket.send(payload);
  }

  armStallWatchdog() {
    this.disarmStallWatchdog();
    this.stallTimer = this.schedule(() => {
      this.stallTimer = null;
      if (!this.socket) return;
      this.warn(`No realtime event within ${this.responseStallTimeoutMs}ms of response.create; assuming dead socket`);
      this.mobileDebug('Realtime WebSocket stalled; forcing close to trigger reconnect');
      try {
        this.socket.close();
      } catch (err) {
        // ignore close errors on a dead socket
      }
    }, this.responseStallTimeoutMs);
  }

  disarmStallWatchdog() {
    if (this.stallTimer) {
      this.clearScheduled(this.stallTimer);
      this.stallTimer = null;
    }
  }

  handleIncoming(rawData) {
    // Any server event proves the socket is alive.
    this.disarmStallWatchdog();

    let event;
    try {
      event = JSON.parse(rawData);
    } catch (err) {
      this.error(`Failed to parse realtime WebSocket payload: ${err}`);
      return;
    }

    if (event.type === 'response.output_audio.delta') {
      if (event.response_id) this.currentResponseId = event.response_id;
      // In-flight deltas of an interrupted response keep arriving for one
      // round-trip after the local buffer clear; don't resurrect its audio.
      if (this.cancelledResponseId
        && (event.response_id || this.cancelledResponseId) === this.cancelledResponseId) {
        return;
      }
      this.playback?.enqueueBase64(event.delta);
      return; // audio deltas are consumed here, not routed as app events
    }
    if (event.type === 'response.output_audio.done') {
      return; // playback drain synthesizes output_audio_buffer.stopped
    }

    this.channel?.emitMessage(rawData);
  }

  emitSynthesizedEvent(type) {
    if (!this.channel) return;
    this.channel.emitMessage(JSON.stringify({
      type,
      event_id: this.makeEventId(),
      ...(this.currentResponseId ? { response_id: this.currentResponseId } : {})
    }));
  }

  async teardown() {
    this.disarmStallWatchdog();
    const { socket, capture, playback } = this;
    this.socket = null;
    this.channel = null;
    this.capture = null;
    this.playback = null;
    this.currentResponseId = null;
    this.cancelledResponseId = null;

    if (socket) {
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      try {
        if (socket.readyState === 0 || socket.readyState === 1) {
          socket.close();
        }
      } catch (err) {
        // ignore close errors during teardown
      }
    }
    if (capture) {
      await capture.stop().catch(() => {});
    }
    if (playback) {
      await playback.close().catch(() => {});
    }
  }
}
