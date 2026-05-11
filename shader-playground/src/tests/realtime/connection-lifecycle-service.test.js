import { describe, it, expect, vi } from 'vitest';
import { ConnectionLifecycleService } from '../../realtime/connectionLifecycleService.js';
import { CONNECTION_STATES } from '../../realtime/sessionConnectionState.js';

describe('ConnectionLifecycleService', () => {
  function createService(overrides = {}) {
    let currentState = CONNECTION_STATES.IDLE;
    const transitionConnectionState = vi.fn((nextState) => {
      currentState = nextState;
    });
    const setPTTStatus = vi.fn();
    const setPTTReadyStatus = vi.fn();
    const initializeMobileMicrophone = vi.fn(async () => {});
    const verifyBackendReachable = vi.fn(async () => {});
    const requestEphemeralKey = vi.fn(async () => 'ek_test');
    const setCurrentEphemeralKey = vi.fn();
    const setTransport = vi.fn();
    const setupPeerTrackHandling = vi.fn();
    const tryHydrateExistingRemoteAudioTrack = vi.fn(async () => {});
    const setupDataChannelEvents = vi.fn();
    const sendSessionConfiguration = vi.fn(async () => {});
    const handleConnectError = vi.fn();
    const log = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const mobileDebug = vi.fn();

    const dataChannel = {
      readyState: 'open',
      onopen: null,
      onclose: null,
      onerror: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const establishTransport = vi.fn(async () => ({
      peerConnection: { id: 'pc1' },
      dataChannel,
      audioTrack: { id: 'track1' }
    }));

    const service = new ConnectionLifecycleService({
      deviceType: 'desktop',
      getIsConnecting: () => currentState === CONNECTION_STATES.CONNECTING,
      getIsConfiguring: () => currentState === CONNECTION_STATES.CONFIGURING,
      getIsConnected: () => currentState === CONNECTION_STATES.CONNECTED,
      getConnectionState: () => currentState,
      getPTTButton: () => ({ id: 'ptt' }),
      setPTTStatus,
      setPTTReadyStatus,
      transitionConnectionState,
      initializeMobileMicrophone,
      verifyBackendReachable,
      requestEphemeralKey,
      setCurrentEphemeralKey,
      establishTransport,
      setTransport,
      setupPeerTrackHandling,
      tryHydrateExistingRemoteAudioTrack,
      setupDataChannelEvents,
      sendSessionConfiguration,
      handleConnectError,
      getDataChannel: () => dataChannel,
      schedule: vi.fn(() => 99),
      clearScheduled: vi.fn(),
      log,
      warn,
      error,
      mobileDebug,
      ...overrides
    });

    return {
      service,
      dataChannel,
      transitionConnectionState,
      setPTTStatus,
      setPTTReadyStatus,
      initializeMobileMicrophone,
      verifyBackendReachable,
      requestEphemeralKey,
      setCurrentEphemeralKey,
      establishTransport,
      setTransport,
      setupPeerTrackHandling,
      tryHydrateExistingRemoteAudioTrack,
      setupDataChannelEvents,
      sendSessionConfiguration,
      handleConnectError,
      log,
      warn,
      error,
      mobileDebug
    };
  }

  async function flushConnectSetup() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('connects after session.updated and delegates peer bootstrap', async () => {
    const ctx = createService();

    const connectPromise = ctx.service.connect();
    await flushConnectSetup();

    expect(ctx.transitionConnectionState).toHaveBeenNthCalledWith(
      1,
      CONNECTION_STATES.CONNECTING,
      'connect_requested'
    );
    expect(ctx.requestEphemeralKey).toHaveBeenCalledTimes(1);
    expect(ctx.setCurrentEphemeralKey).toHaveBeenCalledWith('ek_test');
    expect(ctx.establishTransport).toHaveBeenCalledWith('ek_test');
    expect(ctx.setTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        peerConnection: { id: 'pc1' },
        audioTrack: { id: 'track1' }
      })
    );
    expect(ctx.setupPeerTrackHandling).toHaveBeenCalledTimes(1);
    expect(ctx.tryHydrateExistingRemoteAudioTrack).toHaveBeenCalledTimes(1);
    expect(ctx.setupDataChannelEvents).toHaveBeenCalledTimes(1);
    expect(ctx.sendSessionConfiguration).toHaveBeenCalledTimes(1);
    expect(ctx.transitionConnectionState).toHaveBeenCalledWith(
      CONNECTION_STATES.CONFIGURING,
      'data_channel_open'
    );
    expect(ctx.setPTTReadyStatus).not.toHaveBeenCalled();

    ctx.service.handleSessionConfigured();
    await connectPromise;

    expect(ctx.setPTTReadyStatus).toHaveBeenCalledTimes(1);
    expect(ctx.transitionConnectionState).toHaveBeenLastCalledWith(
      CONNECTION_STATES.CONNECTED,
      'session_updated'
    );
  });

  it('runs mobile bootstrap checks before requesting token', async () => {
    const ctx = createService({
      deviceType: 'mobile'
    });

    const connectPromise = ctx.service.connect();
    await flushConnectSetup();
    ctx.service.handleSessionConfigured();
    await connectPromise;

    expect(ctx.initializeMobileMicrophone).toHaveBeenCalledTimes(1);
    expect(ctx.verifyBackendReachable).toHaveBeenCalledTimes(1);
  });

  it('handles connect errors and transitions failed', async () => {
    const ctx = createService({
      requestEphemeralKey: vi.fn(async () => {
        throw new Error('token fetch failed');
      })
    });

    await expect(ctx.service.connect()).rejects.toThrow('token fetch failed');
    expect(ctx.transitionConnectionState).toHaveBeenCalledWith(
      CONNECTION_STATES.FAILED,
      'connect_error'
    );
    expect(ctx.handleConnectError).toHaveBeenCalledTimes(1);
  });

  it('wires data channel open/close callbacks during peer establish', async () => {
    const ctx = createService();
    await ctx.service.establishPeerConnection('ek_2');

    await ctx.dataChannel.onopen();
    expect(ctx.mobileDebug).toHaveBeenCalledWith('Realtime data channel open');

    ctx.dataChannel.onclose({ code: 1006, reason: 'network', wasClean: false });
    expect(ctx.transitionConnectionState).toHaveBeenCalledWith(
      CONNECTION_STATES.RECONNECTING,
      'data_channel_close'
    );
    expect(ctx.setPTTStatus).toHaveBeenCalledWith('Reconnect', '#888');
    expect(ctx.warn).toHaveBeenCalledWith(
      'Realtime data channel closed; reconnect required',
      expect.objectContaining({
        readyState: 'open',
        code: 1006,
        reason: 'network',
        wasClean: false
      })
    );

    ctx.dataChannel.onerror({ error: new Error('dc error') });
    expect(ctx.warn).toHaveBeenCalledWith(
      'Realtime data channel error',
      expect.any(Error)
    );
  });

  it('fails connect when session.updated does not arrive before timeout', async () => {
    let timeoutHandler;
    const ctx = createService({
      schedule: vi.fn((handler) => {
        timeoutHandler = handler;
        return 7;
      })
    });

    const connectPromise = ctx.service.connect();
    await flushConnectSetup();
    timeoutHandler();

    await expect(connectPromise).rejects.toThrow('Session configuration timed out');
    expect(ctx.transitionConnectionState).toHaveBeenCalledWith(
      CONNECTION_STATES.FAILED,
      'session_config_timeout'
    );
  });

  it('transitions reconnecting when data channel closes during configuration', async () => {
    const ctx = createService();

    const connectPromise = ctx.service.connect();
    await flushConnectSetup();
    ctx.dataChannel.onclose();

    await expect(connectPromise).rejects.toThrow('Data channel closed during session configuration');
    expect(ctx.transitionConnectionState).toHaveBeenCalledWith(
      CONNECTION_STATES.RECONNECTING,
      'data_channel_close'
    );
    expect(ctx.transitionConnectionState).not.toHaveBeenCalledWith(
      CONNECTION_STATES.FAILED,
      'connect_error'
    );
  });

  it('waitForDataChannelOpen resolves true when channel opens before timeout', async () => {
    let onOpen;
    let onClose;
    let onError;
    const ctx = createService({
      schedule: vi.fn(() => 7),
      clearScheduled: vi.fn(),
      getDataChannel: () => ({
        readyState: 'connecting',
        addEventListener: vi.fn((type, handler) => {
          if (type === 'open') onOpen = handler;
          if (type === 'close') onClose = handler;
          if (type === 'error') onError = handler;
        }),
        removeEventListener: vi.fn()
      })
    });

    const openPromise = ctx.service.waitForDataChannelOpen(5000);
    onOpen();
    const result = await openPromise;

    expect(result).toBe(true);
    expect(onClose).toBeTypeOf('function');
    expect(onError).toBeTypeOf('function');
  });
});
