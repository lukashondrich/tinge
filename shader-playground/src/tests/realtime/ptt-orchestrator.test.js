import { describe, it, expect, vi } from 'vitest';
import { PttOrchestrator } from '../../realtime/pttOrchestrator.js';

describe('PttOrchestrator', () => {
  function setup(overrides = {}) {
    const state = {
      isMicActive: false,
      isConnected: true,
      isConnecting: false,
      pendingUserRecord: null,
      pendingUserRecordPromise: null
    };
    const pttButton = { innerText: '', style: { backgroundColor: '' } };
    const audioTrack = { enabled: false };
    const dataChannel = { readyState: 'open', send: vi.fn() };
    const userAudioMgr = {
      isRecording: false,
      startRecording: vi.fn(() => {
        userAudioMgr.isRecording = true;
      }),
      stopRecording: vi.fn(async () => ({ id: 'u1', text: '...' }))
    };
    const onEvent = vi.fn();
    const error = vi.fn();
    const interruptAssistantResponse = vi.fn();
    const checkTokenLimit = vi.fn(async () => ({ allowed: true }));
    const connect = vi.fn(async () => {});
    let scheduled = null;

    const orchestrator = new PttOrchestrator({
      getPTTButton: () => pttButton,
      getIsMicActive: () => state.isMicActive,
      setIsMicActive: (v) => {
        state.isMicActive = v;
      },
      getIsConnected: () => state.isConnected,
      getIsConnecting: () => state.isConnecting,
      getAudioTrack: () => audioTrack,
      getDataChannel: () => dataChannel,
      resetPendingRecording: () => {
        state.pendingUserRecord = null;
        state.pendingUserRecordPromise = null;
      },
      setPendingUserRecord: (record) => {
        state.pendingUserRecord = record;
      },
      setPendingUserRecordPromise: (promise) => {
        state.pendingUserRecordPromise = promise;
      },
      checkTokenLimit,
      connect,
      waitForDataChannelOpen: vi.fn(async () => true),
      interruptAssistantResponse,
      userAudioMgr,
      onEvent,
      error,
      makeEventId: () => 'evt-1',
      now: () => 12345,
      schedule: (fn) => {
        scheduled = fn;
        return 1;
      },
      ...overrides
    });

    return {
      orchestrator,
      state,
      pttButton,
      audioTrack,
      dataChannel,
      userAudioMgr,
      onEvent,
      error,
      interruptAssistantResponse,
      checkTokenLimit,
      connect,
      runScheduled: async () => {
        if (scheduled) await scheduled();
      }
    };
  }

  it('starts recording and enables mic on successful press', async () => {
    const ctx = setup();
    const result = await ctx.orchestrator.handlePTTPress();

    expect(result).toEqual({ allowed: true });
    expect(ctx.userAudioMgr.startRecording).toHaveBeenCalledTimes(1);
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'response.cancel', event_id: 'evt-1' })
    );
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input_audio_buffer.clear', event_id: 'evt-1' })
    );
    expect(ctx.interruptAssistantResponse).toHaveBeenCalledWith({
      interruptedUtteranceId: 'interrupted-12345'
    });
    expect(ctx.onEvent).toHaveBeenCalledWith({
      type: 'assistant.interrupted',
      utteranceId: 'interrupted-12345'
    });
    expect(ctx.onEvent).toHaveBeenCalledWith({ type: 'input_audio_buffer.speech_started' });
    expect(ctx.state.isMicActive).toBe(true);
    expect(ctx.audioTrack.enabled).toBe(true);
    expect(ctx.pttButton.innerText).toBe('Talking');
  });

  it('returns blocked state when currently connecting', async () => {
    const ctx = setup({
      getIsConnecting: () => true
    });
    const result = await ctx.orchestrator.handlePTTPress();
    expect(result).toEqual({ allowed: false, reason: 'connecting' });
  });

  it('returns connecting when connect leaves session in-flight', async () => {
    const stateRef = { current: null };
    const ctx = setup({
      getIsConnected: () => stateRef.current.isConnected,
      getIsConnecting: () => stateRef.current.isConnecting,
      connect: vi.fn(async () => {
        stateRef.current.isConnecting = true;
      })
    });
    stateRef.current = ctx.state;
    ctx.state.isConnected = false;
    ctx.state.isConnecting = false;

    const result = await ctx.orchestrator.handlePTTPress();

    expect(result).toEqual({ allowed: false, reason: 'connecting' });
    expect(ctx.userAudioMgr.startRecording).not.toHaveBeenCalled();
  });

  it('blocks start when data channel does not open in time', async () => {
    const ctx = setup({
      waitForDataChannelOpen: vi.fn(async () => false)
    });
    const result = await ctx.orchestrator.handlePTTPress();
    expect(result).toEqual({ allowed: false, reason: 'data_channel_not_open' });
    expect(ctx.userAudioMgr.startRecording).not.toHaveBeenCalled();
  });

  it('stops recording and commits buffer on release', async () => {
    const ctx = setup();
    ctx.userAudioMgr.isRecording = true;
    ctx.state.isMicActive = true;
    ctx.audioTrack.enabled = true;

    ctx.orchestrator.handlePTTRelease({ bufferTime: 0 });
    await ctx.runScheduled();
    await ctx.state.pendingUserRecordPromise;

    expect(ctx.state.pendingUserRecord).toEqual({ id: 'u1', text: '...' });
    expect(ctx.onEvent).toHaveBeenCalledWith({ type: 'input_audio_buffer.speech_stopped' });
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input_audio_buffer.commit', event_id: 'evt-1' })
    );
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'response.create', event_id: 'evt-1' })
    );
    expect(ctx.state.isMicActive).toBe(false);
    expect(ctx.audioTrack.enabled).toBe(false);
  });
});
