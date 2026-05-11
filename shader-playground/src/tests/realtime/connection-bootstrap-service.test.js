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

  it('requests token from GA response shape', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        value: 'ek_ga',
        expires_at: 123
      })
    }));

    const service = new ConnectionBootstrapService({
      apiUrl: 'http://localhost:3000',
      fetchFn,
      createAbortController: () => ({ signal: {}, abort: vi.fn() }),
      schedule: () => 1,
      clearScheduled: () => {}
    });

    const key = await service.requestEphemeralKey();
    expect(key).toBe('ek_ga');
  });

  it('throws when token response is missing ephemeral key', async () => {
    const service = new ConnectionBootstrapService({
      apiUrl: 'http://localhost:3000',
      fetchFn: vi.fn(async () => ({
        ok: true,
        json: async () => ({})
      })),
      createAbortController: () => ({ signal: {}, abort: vi.fn() }),
      schedule: () => 1,
      clearScheduled: () => {}
    });

    await expect(service.requestEphemeralKey()).rejects.toThrow('Token response missing ephemeral key');
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

  it('requests RTC config with ICE servers and transport policy', async () => {
    const iceServers = [
      { urls: ['stun:stun.example.com:19302'] },
      { urls: ['turn:turn.example.com:3478'], username: 'u', credential: 'p' }
    ];
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ iceServers, iceTransportPolicy: 'relay' })
    }));
    const mobileDebug = vi.fn();

    const service = new ConnectionBootstrapService({
      apiUrl: 'http://localhost:3000',
      fetchFn,
      mobileDebug
    });

    await expect(service.requestRtcConfig()).resolves.toEqual({
      iceServers,
      iceTransportPolicy: 'relay'
    });
    expect(mobileDebug).toHaveBeenCalledWith('RTC config loaded with 2 ICE server entries (relay policy)');
  });

  it('keeps backwards-compatible RTC ICE server config helper', async () => {
    const iceServers = [
      { urls: ['stun:stun.example.com:19302'] }
    ];
    const service = new ConnectionBootstrapService({
      apiUrl: 'http://localhost:3000',
      fetchFn: vi.fn(async () => ({
        ok: true,
        json: async () => ({ iceServers })
      })),
      mobileDebug: vi.fn()
    });

    await expect(service.requestRtcIceServers()).resolves.toEqual(iceServers);
    expect(service.fetchFn).toHaveBeenCalledWith(
      'http://localhost:3000/rtc-config',
      expect.objectContaining({
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      })
    );
  });

  it('returns null when RTC ICE config request fails', async () => {
    const service = new ConnectionBootstrapService({
      apiUrl: 'http://localhost:3000',
      fetchFn: vi.fn(async () => ({ ok: false, status: 503 }))
    });

    await expect(service.requestRtcIceServers()).resolves.toBeNull();
  });
});
