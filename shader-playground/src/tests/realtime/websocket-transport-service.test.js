import { describe, it, expect, vi } from 'vitest';
import { WebSocketTransportService } from '../../realtime/websocketTransportService.js';

function createSocketMock() {
  const socket = {
    readyState: 0,
    sent: [],
    send: vi.fn((payload) => socket.sent.push(payload)),
    close: vi.fn(() => {
      socket.readyState = 3;
    }),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    open() {
      socket.readyState = 1;
      socket.onopen?.();
    },
    receive(event) {
      socket.onmessage?.({ data: JSON.stringify(event) });
    }
  };
  return socket;
}

function createCaptureMock() {
  const capture = {
    streaming: false,
    onAudioChunk: null,
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    setStreaming: vi.fn((value) => {
      capture.streaming = Boolean(value);
    })
  };
  Object.defineProperty(capture, 'isStreaming', {
    get: () => capture.streaming
  });
  return capture;
}

function createPlaybackMock() {
  return {
    onPlaybackStarted: null,
    onPlaybackStopped: null,
    init: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    clear: vi.fn(),
    resume: vi.fn(),
    enqueueBase64: vi.fn(),
    getStream: vi.fn(() => ({ id: 'playback-stream' }))
  };
}

function createService({ getModel = () => null } = {}) {
  const socket = createSocketMock();
  const capture = createCaptureMock();
  const playback = createPlaybackMock();
  const createWebSocket = vi.fn(() => socket);

  const service = new WebSocketTransportService({
    getModel,
    createWebSocket,
    createMicrophoneCapture: vi.fn((options) => {
      capture.onAudioChunk = options.onAudioChunk;
      return capture;
    }),
    createPlaybackQueue: vi.fn((options) => {
      playback.onPlaybackStarted = options.onPlaybackStarted;
      playback.onPlaybackStopped = options.onPlaybackStopped;
      return playback;
    }),
    makeEventId: () => 'evt_test'
  });

  return { service, socket, capture, playback, createWebSocket };
}

describe('WebSocketTransportService', () => {
  it('connects with realtime subprotocols carrying the ephemeral key', async () => {
    const { service, createWebSocket } = createService();

    const result = await service.establishConnection('ek-123');

    expect(createWebSocket).toHaveBeenCalledWith(
      'wss://api.openai.com/v1/realtime',
      ['realtime', 'openai-insecure-api-key.ek-123']
    );
    expect(result.peerConnection).toBeNull();
    expect(result.dataChannel).toBeTruthy();
    expect(result.audioTrack).toBeTruthy();
  });

  it('appends the session model as a query param when known', async () => {
    const { service, createWebSocket } = createService({
      getModel: () => 'gpt-realtime-1.5'
    });

    await service.establishConnection('ek');

    expect(createWebSocket).toHaveBeenCalledWith(
      'wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5',
      expect.any(Array)
    );
  });

  it('exposes a data-channel-shaped wrapper with open/close lifecycle', async () => {
    const { service, socket } = createService();
    const { dataChannel } = await service.establishConnection('ek');

    expect(dataChannel.readyState).toBe('connecting');

    const onOpen = vi.fn();
    const onCloseProp = vi.fn();
    dataChannel.addEventListener('open', onOpen);
    dataChannel.onclose = onCloseProp;

    socket.open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(dataChannel.readyState).toBe('open');

    socket.readyState = 3; // a real socket is CLOSED by the time onclose fires
    socket.onclose({ code: 1006, reason: 'network', wasClean: false });
    expect(onCloseProp).toHaveBeenCalledTimes(1);
    expect(onCloseProp.mock.calls[0][0].code).toBe(1006);
    expect(dataChannel.readyState).toBe('closed');
  });

  it('sends channel payloads over the socket', async () => {
    const { service, socket } = createService();
    const { dataChannel } = await service.establishConnection('ek');
    socket.open();

    dataChannel.send(JSON.stringify({ type: 'session.update' }));

    expect(socket.sent).toContain(JSON.stringify({ type: 'session.update' }));
  });

  it('forwards realtime events to message listeners', async () => {
    const { service, socket } = createService();
    const { dataChannel } = await service.establishConnection('ek');
    const onMessage = vi.fn();
    dataChannel.addEventListener('message', onMessage);
    socket.open();

    socket.receive({ type: 'session.updated', session: {} });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(onMessage.mock.calls[0][0].data).type).toBe('session.updated');
  });

  it('consumes output audio deltas into the playback queue instead of routing them', async () => {
    const { service, socket, playback } = createService();
    const { dataChannel } = await service.establishConnection('ek');
    const onMessage = vi.fn();
    dataChannel.addEventListener('message', onMessage);
    socket.open();

    socket.receive({ type: 'response.output_audio.delta', response_id: 'resp_1', delta: 'BASE64' });
    socket.receive({ type: 'response.output_audio.done', response_id: 'resp_1' });

    expect(playback.enqueueBase64).toHaveBeenCalledWith('BASE64');
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('synthesizes output_audio_buffer started/stopped from playback state', async () => {
    const { service, socket, playback } = createService();
    const { dataChannel } = await service.establishConnection('ek');
    const messages = [];
    dataChannel.addEventListener('message', (event) => messages.push(JSON.parse(event.data)));
    socket.open();

    socket.receive({ type: 'response.output_audio.delta', response_id: 'resp_1', delta: 'BASE64' });
    playback.onPlaybackStarted();
    playback.onPlaybackStopped();

    expect(messages).toEqual([
      { type: 'output_audio_buffer.started', event_id: 'evt_test', response_id: 'resp_1' },
      { type: 'output_audio_buffer.stopped', event_id: 'evt_test', response_id: 'resp_1' }
    ]);
  });

  it('intercepts output_audio_buffer.clear and clears local playback', async () => {
    const { service, socket, playback } = createService();
    const { dataChannel } = await service.establishConnection('ek');
    socket.open();

    dataChannel.send(JSON.stringify({ type: 'output_audio_buffer.clear', event_id: 'e1' }));

    expect(playback.clear).toHaveBeenCalledTimes(1);
    expect(socket.sent).toHaveLength(0);
  });

  it('streams mic chunks as input_audio_buffer.append while the socket is open', async () => {
    const { service, socket, capture } = createService();
    await service.establishConnection('ek');

    capture.onAudioChunk('CHUNK1'); // socket not open yet: dropped
    socket.open();
    capture.onAudioChunk('CHUNK2');

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'input_audio_buffer.append',
      event_id: 'evt_test',
      audio: 'CHUNK2'
    });
  });

  it('gates mic streaming through the track-shaped facade', async () => {
    const { service, capture } = createService();
    const { audioTrack } = await service.establishConnection('ek');

    expect(audioTrack.enabled).toBe(false);
    audioTrack.enabled = true;
    expect(capture.setStreaming).toHaveBeenCalledWith(true);
    expect(audioTrack.enabled).toBe(true);

    audioTrack.stop();
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(audioTrack.readyState).toBe('ended');
  });

  it('exposes the playback stream as the remote stream', async () => {
    const { service } = createService();
    await service.establishConnection('ek');

    expect(service.getRemoteStream()).toEqual({ id: 'playback-stream' });
  });

  it('never opens a socket when audio setup fails', async () => {
    const createWebSocket = vi.fn(() => createSocketMock());
    const service = new WebSocketTransportService({
      createWebSocket,
      createMicrophoneCapture: () => ({
        start: vi.fn(async () => {
          throw new Error('mic denied');
        }),
        stop: vi.fn(async () => {})
      }),
      createPlaybackQueue: () => createPlaybackMock()
    });

    await expect(service.establishConnection('ek')).rejects.toThrow('mic denied');
    expect(createWebSocket).not.toHaveBeenCalled();
    expect(service.socket).toBeNull();
  });

  it('drops in-flight deltas of an interrupted response but plays the next response', async () => {
    const { service, socket, playback } = createService();
    const { dataChannel } = await service.establishConnection('ek');
    socket.open();

    socket.receive({ type: 'response.output_audio.delta', response_id: 'resp_1', delta: 'A' });
    dataChannel.send(JSON.stringify({ type: 'output_audio_buffer.clear', event_id: 'e1' }));
    socket.receive({ type: 'response.output_audio.delta', response_id: 'resp_1', delta: 'B' });
    socket.receive({ type: 'response.output_audio.delta', response_id: 'resp_2', delta: 'C' });

    expect(playback.clear).toHaveBeenCalledTimes(1);
    expect(playback.enqueueBase64.mock.calls.map((c) => c[0])).toEqual(['A', 'C']);
  });

  it('force-closes a socket that goes silent after response.create', async () => {
    let stallHandler = null;
    const { service, socket } = createService();
    service.schedule = vi.fn((handler) => {
      stallHandler = handler;
      return 11;
    });
    service.clearScheduled = vi.fn();
    const { dataChannel } = await service.establishConnection('ek');
    socket.open();

    dataChannel.send(JSON.stringify({ type: 'response.create', event_id: 'e1' }));
    expect(stallHandler).toBeTypeOf('function');
    stallHandler();

    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('disarms the stall watchdog when any server event arrives', async () => {
    const { service, socket } = createService();
    service.schedule = vi.fn(() => 11);
    const clearScheduled = vi.fn();
    service.clearScheduled = clearScheduled;
    const { dataChannel } = await service.establishConnection('ek');
    socket.open();

    dataChannel.send(JSON.stringify({ type: 'response.create', event_id: 'e1' }));
    socket.receive({ type: 'response.created', response: { id: 'resp_1' } });

    expect(clearScheduled).toHaveBeenCalledWith(11);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('resumes playback from the PTT gesture that enables the mic', async () => {
    const { service, playback } = createService();
    playback.resume = vi.fn();
    const { audioTrack } = await service.establishConnection('ek');

    audioTrack.enabled = true;

    expect(playback.resume).toHaveBeenCalledTimes(1);
  });

  it('tears down socket, capture, and playback', async () => {
    const { service, socket, capture, playback } = createService();
    await service.establishConnection('ek');
    socket.open();

    await service.teardown();

    expect(socket.close).toHaveBeenCalled();
    expect(capture.stop).toHaveBeenCalled();
    expect(playback.close).toHaveBeenCalled();
    expect(service.getRemoteStream()).toBeNull();
  });

  it('ignores events from a replaced socket', async () => {
    const { service, socket } = createService();
    const { dataChannel } = await service.establishConnection('ek');
    const onClose = vi.fn();
    dataChannel.onclose = onClose;

    await service.teardown();
    socket.onclose?.({ code: 1000 });

    expect(onClose).not.toHaveBeenCalled();
  });
});
