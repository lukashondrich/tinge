import { describe, it, expect, vi } from 'vitest';
import { PttOrchestrator } from '../../realtime/pttOrchestrator.js';

describe('PttOrchestrator', () => {
  function setup(overrides = {}) {
    const state = {
      isMicActive: false,
      isConnected: true,
      isConnecting: false,
      isConfiguring: false,
      isAssistantResponseActive: false,
      shouldCancelAssistantResponse: false,
      assistantResponseId: null,
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
      getIsConfiguring: () => state.isConfiguring,
      getIsAssistantResponseActive: () => state.isAssistantResponseActive,
      getShouldCancelAssistantResponse: () => state.shouldCancelAssistantResponse,
      getAssistantResponseId: () => state.assistantResponseId,
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
      JSON.stringify({ type: 'input_audio_buffer.clear', event_id: 'evt-1' })
    );
    expect(ctx.dataChannel.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: 'response.cancel', event_id: 'evt-1' })
    );
    expect(ctx.dataChannel.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: 'output_audio_buffer.clear', event_id: 'evt-1' })
    );
    expect(ctx.interruptAssistantResponse).not.toHaveBeenCalled();
    expect(ctx.onEvent).not.toHaveBeenCalledWith({
      type: 'assistant.interrupted',
      utteranceId: expect.any(String)
    });
    expect(ctx.onEvent).toHaveBeenCalledWith({ type: 'input_audio_buffer.speech_started' });
    expect(ctx.state.isMicActive).toBe(true);
    expect(ctx.audioTrack.enabled).toBe(true);
    expect(ctx.pttButton.innerText).toBe('Talking');
  });

  it('cancels and clears assistant output only when an assistant response is active', async () => {
    const ctx = setup();
    ctx.state.isAssistantResponseActive = true;
    ctx.state.shouldCancelAssistantResponse = true;
    ctx.state.assistantResponseId = 'resp-active';

    const result = await ctx.orchestrator.handlePTTPress();

    expect(result).toEqual({ allowed: true });
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'response.cancel', event_id: 'evt-1', response_id: 'resp-active' })
    );
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output_audio_buffer.clear', event_id: 'evt-1' })
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
  });

  it('does not send response.cancel without a known active response id', async () => {
    const ctx = setup();
    ctx.state.isAssistantResponseActive = true;
    ctx.state.shouldCancelAssistantResponse = true;

    const result = await ctx.orchestrator.handlePTTPress();

    expect(result).toEqual({ allowed: true });
    expect(ctx.dataChannel.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: 'response.cancel', event_id: 'evt-1' })
    );
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output_audio_buffer.clear', event_id: 'evt-1' })
    );
    expect(ctx.interruptAssistantResponse).toHaveBeenCalledWith({
      interruptedUtteranceId: 'interrupted-12345'
    });
  });

  it('cancels an open assistant response without local interruption when output is inactive', async () => {
    const ctx = setup();
    ctx.state.shouldCancelAssistantResponse = true;
    ctx.state.assistantResponseId = 'resp-old';

    const result = await ctx.orchestrator.handlePTTPress();

    expect(result).toEqual({ allowed: true });
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'response.cancel', event_id: 'evt-1', response_id: 'resp-old' })
    );
    expect(ctx.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input_audio_buffer.clear', event_id: 'evt-1' })
    );
    expect(ctx.dataChannel.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: 'output_audio_buffer.clear', event_id: 'evt-1' })
    );
    expect(ctx.interruptAssistantResponse).not.toHaveBeenCalled();
    expect(ctx.onEvent).not.toHaveBeenCalledWith({
      type: 'assistant.interrupted',
      utteranceId: expect.any(String)
    });
  });

  it('returns blocked state when currently connecting', async () => {
    const ctx = setup({
      getIsConnecting: () => true
    });
    const result = await ctx.orchestrator.handlePTTPress();
    expect(result).toEqual({ allowed: false, reason: 'connecting' });
  });

  it('returns blocked state when session is configuring', async () => {
    const ctx = setup({
      getIsConfiguring: () => true
    });
    const result = await ctx.orchestrator.handlePTTPress();
    expect(result).toEqual({ allowed: false, reason: 'configuring' });
    expect(ctx.connect).not.toHaveBeenCalled();
  });

  it('returns connecting when connect leaves session in-flight', async () => {
    const stateRef = { current: null };
    const ctx = setup({
      getIsConnected: () => stateRef.current.isConnected,
      getIsConnecting: () => stateRef.current.isConnecting,
      getIsConfiguring: () => stateRef.current.isConfiguring,
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

  it('returns configuring when connect leaves session configuring', async () => {
    const stateRef = { current: null };
    const ctx = setup({
      getIsConnected: () => stateRef.current.isConnected,
      getIsConnecting: () => stateRef.current.isConnecting,
      getIsConfiguring: () => stateRef.current.isConfiguring,
      connect: vi.fn(async () => {
        stateRef.current.isConfiguring = true;
      })
    });
    stateRef.current = ctx.state;
    ctx.state.isConnected = false;
    ctx.state.isConfiguring = false;

    const result = await ctx.orchestrator.handlePTTPress();

    expect(result).toEqual({ allowed: false, reason: 'configuring' });
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
