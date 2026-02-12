import { describe, it, expect, vi } from 'vitest';
import { ConnectionBootstrapService } from '../../realtime/connectionBootstrapService.js';

describe('ConnectionBootstrapService', () => {
  it('initializes mobile microphone and stops probe stream tracks', async () => {
    const stopTrack = vi.fn();
    const audioTrack = { kind: 'audio' };
    const getUserMedia = vi.fn(async () => ({
      getAudioTracks: () => [audioTrack],
      getTracks: () => [{ stop: stopTrack }]
    }));
    const mobileDebug = vi.fn();

    const service = new ConnectionBootstrapService({
      apiUrl: 'http://localhost:3000',
      mobileDebug,
      getUserMedia,
      fetchFn: vi.fn()
    });

    const result = await service.initializeMobileMicrophone();
    expect(result).toBe(audioTrack);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it('requests token and forwards token usage', async () => {
    const onTokenUsage = vi.fn();
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        client_secret: { value: 'ek_test' },
        tokenUsage: { remaining: 99 }
      })
    }));

    const service = new ConnectionBootstrapService({
      apiUrl: 'http://localhost:3000',
      onTokenUsage,
      fetchFn,
      createAbortController: () => ({ signal: {}, abort: vi.fn() }),
      schedule: () => 1,
      clearScheduled: () => {}
    });

    const key = await service.requestEphemeralKey();
    expect(key).toBe('ek_test');
    expect(onTokenUsage).toHaveBeenCalledWith({ remaining: 99 });
  });

  it('falls back to cors-explicit token request after minimal fetch failure', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ client_secret: { value: 'ek_fallback' } })
      });

    const service = new ConnectionBootstrapService({
      apiUrl: 'http://localhost:3000',
      deviceType: 'mobile',
      fetchFn,
      createAbortController: () => ({ signal: {}, abort: vi.fn() }),
      schedule: () => 1,
      clearScheduled: () => {}
    });

    const key = await service.requestEphemeralKey();
    expect(key).toBe('ek_fallback');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      })
    );
  });
});
