import { describe, it, expect, vi } from 'vitest';
import { WebRtcTransportService } from '../../realtime/webrtcTransportService.js';

describe('WebRtcTransportService', () => {
  function createPeerConnectionMock() {
    const dataChannel = {};
    const peerConnection = {
      iceConnectionState: 'new',
      addTransceiver: vi.fn(),
      addTrack: vi.fn(),
      createDataChannel: vi.fn(() => dataChannel),
      createOffer: vi.fn(async () => ({ sdp: 'offer-sdp' })),
      setLocalDescription: vi.fn(async function setLocalDescription(desc) {
        peerConnection.localDescription = desc;
      }),
      setRemoteDescription: vi.fn(async () => {}),
      restartIce: vi.fn(),
      oniceconnectionstatechange: null,
      localDescription: { sdp: 'offer-sdp' }
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
      createPeerConnection
    });

    const result = await service.establishPeerConnection('ek');

    expect(result).toEqual({
      peerConnection,
      dataChannel,
      audioTrack
    });
    expect(peerConnection.addTransceiver).toHaveBeenCalledWith('audio', { direction: 'sendrecv' });
    expect(peerConnection.addTrack).toHaveBeenCalledWith(audioTrack);
    expect(audioTrack.enabled).toBe(false);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('https://api.openai.com/v1/realtime'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(peerConnection.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp'
    });
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
});
