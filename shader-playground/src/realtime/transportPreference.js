export const REALTIME_TRANSPORTS = Object.freeze({
  WEBRTC: 'webrtc',
  WEBSOCKET: 'websocket'
});

const STORAGE_KEY = 'realtimeTransport';

const ALIASES = new Map([
  ['webrtc', REALTIME_TRANSPORTS.WEBRTC],
  ['rtc', REALTIME_TRANSPORTS.WEBRTC],
  ['websocket', REALTIME_TRANSPORTS.WEBSOCKET],
  ['ws', REALTIME_TRANSPORTS.WEBSOCKET]
]);

export function normalizeRealtimeTransport(value) {
  return ALIASES.get(String(value || '').trim().toLowerCase()) || null;
}

/**
 * Resolve which realtime transport to use. WebRTC is the default (lowest
 * latency, built-in echo cancellation); WebSocket is the fallback for
 * networks where WebRTC media cannot connect (see docs/tickets/
 * realtime-websocket-transport.md). Selectable per-visit with
 * `?transport=websocket` or persistently via
 * `localStorage.realtimeTransport = 'websocket'`.
 */
export function resolveRealtimeTransport({
  search = globalThis.location?.search,
  storage = globalThis.localStorage
} = {}) {
  try {
    const fromQuery = normalizeRealtimeTransport(
      new URLSearchParams(search || '').get('transport')
    );
    if (fromQuery) return fromQuery;
  } catch (err) {
    // fall through to storage/default
  }

  try {
    const fromStorage = normalizeRealtimeTransport(storage?.getItem(STORAGE_KEY));
    if (fromStorage) return fromStorage;
  } catch (err) {
    // storage can throw in privacy modes; fall through to default
  }

  return REALTIME_TRANSPORTS.WEBRTC;
}
