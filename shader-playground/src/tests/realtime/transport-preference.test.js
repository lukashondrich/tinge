import { describe, it, expect } from 'vitest';
import {
  REALTIME_TRANSPORTS,
  normalizeRealtimeTransport,
  resolveRealtimeTransport
} from '../../realtime/transportPreference.js';

function storageWith(value) {
  return { getItem: () => value };
}

describe('transportPreference', () => {
  it('defaults to webrtc', () => {
    expect(resolveRealtimeTransport({ search: '', storage: storageWith(null) }))
      .toBe(REALTIME_TRANSPORTS.WEBRTC);
  });

  it('honors the transport query param', () => {
    expect(resolveRealtimeTransport({ search: '?transport=websocket', storage: storageWith(null) }))
      .toBe(REALTIME_TRANSPORTS.WEBSOCKET);
    expect(resolveRealtimeTransport({ search: '?transport=ws', storage: storageWith(null) }))
      .toBe(REALTIME_TRANSPORTS.WEBSOCKET);
  });

  it('prefers the query param over localStorage', () => {
    expect(resolveRealtimeTransport({
      search: '?transport=webrtc',
      storage: storageWith('websocket')
    })).toBe(REALTIME_TRANSPORTS.WEBRTC);
  });

  it('falls back to localStorage when no query param is present', () => {
    expect(resolveRealtimeTransport({ search: '', storage: storageWith('websocket') }))
      .toBe(REALTIME_TRANSPORTS.WEBSOCKET);
  });

  it('ignores unknown values', () => {
    expect(resolveRealtimeTransport({ search: '?transport=carrier-pigeon', storage: storageWith('bogus') }))
      .toBe(REALTIME_TRANSPORTS.WEBRTC);
  });

  it('survives a throwing storage', () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      }
    };
    expect(resolveRealtimeTransport({ search: '', storage })).toBe(REALTIME_TRANSPORTS.WEBRTC);
  });

  it('normalizes aliases', () => {
    expect(normalizeRealtimeTransport('WS')).toBe(REALTIME_TRANSPORTS.WEBSOCKET);
    expect(normalizeRealtimeTransport('rtc')).toBe(REALTIME_TRANSPORTS.WEBRTC);
    expect(normalizeRealtimeTransport(undefined)).toBeNull();
  });
});
