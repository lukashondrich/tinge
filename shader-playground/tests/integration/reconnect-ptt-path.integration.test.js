import { describe, it, expect, vi } from 'vitest';
import { ConnectionLifecycleService } from '../../src/realtime/connectionLifecycleService.js';
import { PttOrchestrator } from '../../src/realtime/pttOrchestrator.js';
import { SessionConnectionState, CONNECTION_STATES } from '../../src/realtime/sessionConnectionState.js';

describe('Reconnect + PTT path (integration)', () => {
  function createContext({
    dataChannelStates = ['open'],
    requestEphemeralKeyImpl = async () => 'ek_test'
  } = {}) {
    const connectionStateMachine = new SessionConnectionState();
    let connectionSnapshot = connectionStateMachine.getSnapshot();
    const transitionConnectionState = (nextState, reason) => {
      connectionSnapshot = connectionStateMachine.transition(nextState, { reason });
      return connectionSnapshot;
    };

    const pttButton = {
      innerText: '',
      style: { backgroundColor: '' }
    };
    const statusHistory = [];
    const setPTTStatus = (text, color) => {
      pttButton.innerText = text;
      pttButton.style.backgroundColor = color;
      statusHistory.push({ text, color });
    };
    const setPTTReadyStatus = vi.fn(() => setPTTStatus('Push to Talk', '#44f'));

    const dataChannels = [];
    let currentDataChannel = null;
    let currentPeerConnection = null;
    let currentAudioTrack = null;

    const makeDataChannel = (id, readyState = 'open') => ({
      id,
      readyState,
      send: vi.fn(),
      onopen: null,
      onclose: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    const establishTransport = vi.fn(async () => {
      const nextIndex = dataChannels.length;
      const readyState = dataChannelStates[nextIndex] || 'open';
      const channel = makeDataChannel(`dc-${nextIndex + 1}`, readyState);
      dataChannels.push(channel);
      return {
        peerConnection: { id: `pc-${dataChannels.length}` },
        dataChannel: channel,
        audioTrack: { id: `track-${dataChannels.length}`, enabled: false }
      };
    });

    const requestEphemeralKey = vi.fn(requestEphemeralKeyImpl);
    const lifecycleService = new ConnectionLifecycleService({
      deviceType: 'desktop',
      getIsConnecting: () => connectionSnapshot.isConnecting,
      getPTTButton: () => pttButton,
      setPTTStatus,
      setPTTReadyStatus,
      transitionConnectionState,
      initializeMobileMicrophone: vi.fn(async () => {}),
      verifyBackendReachable: vi.fn(async () => {}),
      requestEphemeralKey,
      setCurrentEphemeralKey: vi.fn(),
      establishTransport,
      setTransport: ({ peerConnection, dataChannel, audioTrack }) => {
        currentPeerConnection = peerConnection;
        currentDataChannel = dataChannel;
        currentAudioTrack = audioTrack;
      },
      setupPeerTrackHandling: vi.fn(),
      tryHydrateExistingRemoteAudioTrack: vi.fn(async () => {}),
      setupDataChannelEvents: vi.fn(),
      sendSystemPrompt: vi.fn(async () => {}),
      sendSessionConfiguration: vi.fn(async () => {}),
      handleConnectError: vi.fn(),
      getDataChannel: () => currentDataChannel,
      log: vi.fn(),
      error: vi.fn(),
      mobileDebug: vi.fn()
    });

    const userAudioMgr = {
      isRecording: false,
      startRecording: vi.fn(() => {
        userAudioMgr.isRecording = true;
      }),
      stopRecording: vi.fn(async () => {
        userAudioMgr.isRecording = false;
        return { id: 'user-1', text: '...' };
      })
    };

    let isMicActive = false;
    const onEvent = vi.fn();
    const interruptAssistantResponse = vi.fn();
    let pendingUserRecord = null;
    let pendingUserRecordPromise = null;

    const pttOrchestrator = new PttOrchestrator({
      getPTTButton: () => pttButton,
      getIsMicActive: () => isMicActive,
      setIsMicActive: (value) => {
        isMicActive = value;
      },
      getIsConnected: () => connectionSnapshot.isConnected,
      getIsConnecting: () => connectionSnapshot.isConnecting,
      getAudioTrack: () => currentAudioTrack,
      getDataChannel: () => currentDataChannel,
      resetPendingRecording: () => {
        pendingUserRecord = null;
        pendingUserRecordPromise = null;
      },
      setPendingUserRecord: (value) => {
        pendingUserRecord = value;
      },
      setPendingUserRecordPromise: (value) => {
        pendingUserRecordPromise = value;
      },
      checkTokenLimit: vi.fn(async () => ({ allowed: true })),
      connect: () => lifecycleService.connect(),
      waitForDataChannelOpen: () => lifecycleService.waitForDataChannelOpen(5000),
      interruptAssistantResponse,
      userAudioMgr,
      onEvent,
      error: vi.fn(),
      makeEventId: () => 'evt-1',
      now: () => 1700000000000,
      schedule: vi.fn((fn) => {
        fn();
        return 1;
      })
    });

    return {
      lifecycleService,
      pttOrchestrator,
      getConnectionSnapshot: () => connectionSnapshot,
      dataChannels,
      getCurrentDataChannel: () => currentDataChannel,
      getCurrentPeerConnection: () => currentPeerConnection,
      getCurrentAudioTrack: () => currentAudioTrack,
      statusHistory,
      onEvent,
      interruptAssistantResponse,
      userAudioMgr,
      requestEphemeralKey,
      getPendingUserRecord: () => pendingUserRecord,
      getPendingUserRecordPromise: () => pendingUserRecordPromise,
      establishTransport
    };
  }

  it('recovers from data channel close and resumes PTT turn flow on reconnect', async () => {
    const ctx = createContext();

    await ctx.lifecycleService.connect();
    expect(ctx.getConnectionSnapshot().state).toBe(CONNECTION_STATES.CONNECTED);
    expect(ctx.dataChannels).toHaveLength(1);

    const firstChannel = ctx.getCurrentDataChannel();
    firstChannel.onclose();
    expect(ctx.getConnectionSnapshot().state).toBe(CONNECTION_STATES.RECONNECTING);
    expect(ctx.statusHistory.at(-1)).toEqual({ text: 'Reconnect', color: '#888' });

    const pressResult = await ctx.pttOrchestrator.handlePTTPress();
    expect(pressResult).toEqual({ allowed: true });

    expect(ctx.getConnectionSnapshot().state).toBe(CONNECTION_STATES.CONNECTED);
    expect(ctx.establishTransport).toHaveBeenCalledTimes(2);
    expect(ctx.dataChannels).toHaveLength(2);
    expect(ctx.getCurrentDataChannel()).not.toBe(firstChannel);
    expect(ctx.getCurrentPeerConnection()).toEqual({ id: 'pc-2' });

    expect(ctx.getCurrentDataChannel().send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'response.cancel', event_id: 'evt-1' })
    );
    expect(ctx.getCurrentDataChannel().send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input_audio_buffer.clear', event_id: 'evt-1' })
    );
    expect(ctx.interruptAssistantResponse).toHaveBeenCalledWith({
      interruptedUtteranceId: 'interrupted-1700000000000'
    });
    expect(ctx.userAudioMgr.startRecording).toHaveBeenCalledTimes(1);
    expect(ctx.getCurrentAudioTrack().enabled).toBe(true);

    expect(ctx.onEvent).toHaveBeenCalledWith({
      type: 'assistant.interrupted',
      utteranceId: 'interrupted-1700000000000'
    });
    expect(ctx.onEvent).toHaveBeenCalledWith({ type: 'input_audio_buffer.speech_started' });
    expect(ctx.getPendingUserRecord()).toBeNull();
    expect(ctx.getPendingUserRecordPromise()).toBeNull();
  });

  it('fails safely when reconnect channel never opens before timeout', async () => {
    vi.useFakeTimers();
    try {
      const ctx = createContext({
        dataChannelStates: ['open', 'connecting']
      });

      await ctx.lifecycleService.connect();
      const firstChannel = ctx.getCurrentDataChannel();
      firstChannel.onclose();
      expect(ctx.getConnectionSnapshot().state).toBe(CONNECTION_STATES.RECONNECTING);

      const pressPromise = ctx.pttOrchestrator.handlePTTPress();
      await vi.advanceTimersByTimeAsync(5000);
      const pressResult = await pressPromise;

      expect(pressResult).toEqual({ allowed: false, reason: 'data_channel_not_open' });
      expect(ctx.establishTransport).toHaveBeenCalledTimes(2);
      expect(ctx.dataChannels).toHaveLength(2);
      expect(ctx.getCurrentDataChannel().readyState).toBe('connecting');
      expect(ctx.getCurrentDataChannel().send).not.toHaveBeenCalled();
      expect(ctx.interruptAssistantResponse).not.toHaveBeenCalled();
      expect(ctx.userAudioMgr.startRecording).not.toHaveBeenCalled();
      expect(ctx.getCurrentAudioTrack().enabled).toBe(false);
      expect(ctx.onEvent).not.toHaveBeenCalledWith({ type: 'input_audio_buffer.speech_started' });
      expect(ctx.onEvent).not.toHaveBeenCalledWith({
        type: 'assistant.interrupted',
        utteranceId: expect.any(String)
      });
      expect(ctx.getPendingUserRecord()).toBeNull();
      expect(ctx.getPendingUserRecordPromise()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces rapid reconnect presses while reconnect is in progress', async () => {
    let resolveReconnectKey;
    const reconnectKeyPromise = new Promise((resolve) => {
      resolveReconnectKey = resolve;
    });
    let tokenRequestCount = 0;
    const ctx = createContext({
      requestEphemeralKeyImpl: async () => {
        tokenRequestCount += 1;
        if (tokenRequestCount === 1) {
          return 'ek_initial';
        }
        return reconnectKeyPromise;
      }
    });

    await ctx.lifecycleService.connect();
    expect(ctx.getConnectionSnapshot().state).toBe(CONNECTION_STATES.CONNECTED);

    const firstChannel = ctx.getCurrentDataChannel();
    firstChannel.onclose();
    expect(ctx.getConnectionSnapshot().state).toBe(CONNECTION_STATES.RECONNECTING);

    const firstPressPromise = ctx.pttOrchestrator.handlePTTPress();
    const secondPressResult = await ctx.pttOrchestrator.handlePTTPress();
    expect(secondPressResult).toEqual({ allowed: false, reason: 'connecting' });

    // Still waiting on reconnect token: no second transport establish yet.
    expect(ctx.establishTransport).toHaveBeenCalledTimes(1);
    expect(ctx.requestEphemeralKey).toHaveBeenCalledTimes(2);

    resolveReconnectKey('ek_reconnect');
    const firstPressResult = await firstPressPromise;
    expect(firstPressResult).toEqual({ allowed: true });
    expect(ctx.establishTransport).toHaveBeenCalledTimes(2);
    expect(ctx.userAudioMgr.startRecording).toHaveBeenCalledTimes(1);
  });
});
