import { describe, it, expect, vi } from 'vitest';
import { WebRtcTransportService } from '../../realtime/webrtcTransportService.js';

describe('WebRtcTransportService', () => {
  function createPeerConnectionMock() {
    const dataChannel = {};
    const listeners = new Map();
    const peerConnection = {
      iceConnectionState: 'new',
      iceGatheringState: 'complete',
      addTransceiver: vi.fn(),
      addTrack: vi.fn(),
      createDataChannel: vi.fn(() => dataChannel),
      createOffer: vi.fn(async () => ({ sdp: 'offer-sdp' })),
      setLocalDescription: vi.fn(async function setLocalDescription(desc) {
        peerConnection.localDescription = desc;
      }),
      setRemoteDescription: vi.fn(async () => {}),
      restartIce: vi.fn(),
      addEventListener: vi.fn((type, handler) => {
        listeners.set(type, handler);
      }),
      removeEventListener: vi.fn(),
      oniceconnectionstatechange: null,
      localDescription: { sdp: 'offer-sdp' },
      emitIceGatheringStateChange() {
        listeners.get('icegatheringstatechange')?.();
      }
    };
    return { peerConnection, dataChannel };
  }

  it('establishes peer connection and returns track/channel handles', async () => {
    const { peerConnection, dataChannel } = createPeerConnectionMock();
    const audioTrack = { enabled: true };
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [audioTrack]
    }));
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () => 'answer-sdp'
    }));
    const createPeerConnection = vi.fn(() => peerConnection);

    const service = new WebRtcTransportService({
      fetchFn,
      getUserMedia,
      createPeerConnection,
      getIceServers: async () => [
        { urls: 'stun:stun.example.com:19302' },
        { urls: ['turn:turn.example.com:3478'], username: 'u', credential: 'p' }
      ]
    });

    const result = await service.establishPeerConnection('ek');

    expect(result).toEqual({
      peerConnection,
      dataChannel,
      audioTrack
    });
    expect(peerConnection.addTransceiver).toHaveBeenCalledWith('audio', { direction: 'sendrecv' });
    expect(createPeerConnection).toHaveBeenCalledWith({
      iceServers: [
        { urls: 'stun:stun.example.com:19302' },
        { urls: ['turn:turn.example.com:3478'], username: 'u', credential: 'p' }
      ]
    });
    expect(peerConnection.addTrack).toHaveBeenCalledWith(audioTrack);
    expect(audioTrack.enabled).toBe(false);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/calls',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchFn.mock.calls[0][0]).not.toContain('?model=');
    expect(peerConnection.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp'
    });
  });

  it('falls back to default STUN ICE config when remote config is unavailable', async () => {
    const mobileDebug = vi.fn();
    const service = new WebRtcTransportService({
      getIceServers: vi.fn(async () => null),
      mobileDebug
    });

    const iceServers = await service.resolveIceServers();

    expect(iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    expect(mobileDebug).toHaveBeenCalledWith('Using default STUN-only ICE config');
  });

  it('filters invalid ICE server entries from remote config', async () => {
    const service = new WebRtcTransportService({
      getIceServers: vi.fn(async () => [
        null,
        { urls: '' },
        { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' }
      ])
    });

    await expect(service.resolveIceServers()).resolves.toEqual([
      { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' }
    ]);
  });

  it('throws sdp exchange error for non-ok response', async () => {
    const { peerConnection } = createPeerConnectionMock();
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => 'failure detail'
    }));

    const service = new WebRtcTransportService({
      fetchFn,
      getUserMedia: async () => ({ getTracks: () => [{ enabled: true }] }),
      createPeerConnection: () => peerConnection
    });

    await expect(service.establishPeerConnection('ek')).rejects.toThrow(
      'SDP exchange failed: 500 Server Error'
    );
  });

  it('waits for ICE gathering to complete before SDP exchange', async () => {
    const { peerConnection } = createPeerConnectionMock();
    peerConnection.iceGatheringState = 'gathering';
    const clearScheduled = vi.fn();
    const service = new WebRtcTransportService({
      fetchFn: vi.fn(),
      getUserMedia: vi.fn(),
      createPeerConnection: vi.fn(),
      schedule: vi.fn(() => 3),
      clearScheduled
    });

    const waitPromise = service.waitForIceGatheringComplete(peerConnection);
    expect(peerConnection.addEventListener).toHaveBeenCalledWith(
      'icegatheringstatechange',
      expect.any(Function)
    );

    peerConnection.iceGatheringState = 'complete';
    peerConnection.emitIceGatheringStateChange();
    await waitPromise;

    expect(clearScheduled).toHaveBeenCalledWith(3);
    expect(peerConnection.removeEventListener).toHaveBeenCalledWith(
      'icegatheringstatechange',
      expect.any(Function)
    );
  });

  it('continues when ICE gathering wait times out', async () => {
    const { peerConnection } = createPeerConnectionMock();
    peerConnection.iceGatheringState = 'gathering';
    let timeoutHandler;
    const service = new WebRtcTransportService({
      fetchFn: vi.fn(),
      getUserMedia: vi.fn(),
      createPeerConnection: vi.fn(),
      schedule: vi.fn((handler) => {
        timeoutHandler = handler;
        return 4;
      }),
      clearScheduled: vi.fn()
    });

    const waitPromise = service.waitForIceGatheringComplete(peerConnection);
    timeoutHandler();
    await waitPromise;

    expect(peerConnection.removeEventListener).toHaveBeenCalledWith(
      'icegatheringstatechange',
      expect.any(Function)
    );
  });

  it('debounces transient ICE disconnected before reporting reconnect needed', () => {
    const { peerConnection } = createPeerConnectionMock();
    let disconnectTimeout;
    const onIceDisconnected = vi.fn();
    const clearScheduled = vi.fn();
    const service = new WebRtcTransportService({
      onIceDisconnected,
      schedule: vi.fn((handler) => {
        disconnectTimeout = handler;
        return 8;
      }),
      clearScheduled
    });

    peerConnection.iceConnectionState = 'disconnected';
    service.handleIceConnectionStateChange(peerConnection);

    expect(peerConnection.restartIce).toHaveBeenCalledTimes(1);
    expect(onIceDisconnected).not.toHaveBeenCalled();

    peerConnection.iceConnectionState = 'connected';
    service.handleIceConnectionStateChange(peerConnection);
    disconnectTimeout();

    expect(clearScheduled).toHaveBeenCalledWith(8);
    expect(onIceDisconnected).not.toHaveBeenCalled();
  });

  it('reports ICE disconnected after the grace period if still disconnected', () => {
    const { peerConnection } = createPeerConnectionMock();
    let disconnectTimeout;
    const onIceDisconnected = vi.fn();
    const service = new WebRtcTransportService({
      onIceDisconnected,
      schedule: vi.fn((handler) => {
        disconnectTimeout = handler;
        return 8;
      })
    });

    peerConnection.iceConnectionState = 'disconnected';
    service.handleIceConnectionStateChange(peerConnection);
    disconnectTimeout();

    expect(onIceDisconnected).toHaveBeenCalledTimes(1);
  });

  it('reports ICE failed immediately', () => {
    const { peerConnection } = createPeerConnectionMock();
    const onIceFailed = vi.fn();
    const service = new WebRtcTransportService({
      onIceFailed
    });

    peerConnection.iceConnectionState = 'failed';
    service.handleIceConnectionStateChange(peerConnection);

    expect(onIceFailed).toHaveBeenCalledTimes(1);
  });
});
