import { describe, it, expect, vi } from 'vitest';
import { DataChannelEventRouter } from '../../realtime/dataChannelEventRouter.js';

describe('DataChannelEventRouter', () => {
  function createRouter(overrides = {}) {
    const aiAudioMgr = {
      isRecording: false,
      startRecording: vi.fn(() => {
        aiAudioMgr.isRecording = true;
      }),
      stopRecording: vi.fn(async () => {
        aiAudioMgr.isRecording = false;
        return { id: 'stopped' };
      })
    };
    const updateTokenUsageEstimate = vi.fn();
    const updateTokenUsageActual = vi.fn();
    const stopAndTranscribe = vi.fn(async () => ({ id: 'ai-1' }));
    const handleUserTranscription = vi.fn(async () => {});
    const handleFunctionCall = vi.fn(async () => {});
    const onEvent = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();

    const router = new DataChannelEventRouter({
      aiAudioMgr,
      getAiAudioReady: () => true,
      updateTokenUsageEstimate,
      updateTokenUsageActual,
      stopAndTranscribe,
      handleUserTranscription,
      handleFunctionCall,
      onEvent,
      now: vi.fn()
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1025),
      warn,
      error,
      ...overrides
    });

    return {
      router,
      aiAudioMgr,
      updateTokenUsageEstimate,
      updateTokenUsageActual,
      stopAndTranscribe,
      handleUserTranscription,
      handleFunctionCall,
      onEvent,
      warn,
      error
    };
  }

  it('captures AI transcript delta and emits utterance on output buffer stop', async () => {
    const ctx = createRouter();

    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'hello' })
    });
    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'output_audio_buffer.stopped' })
    });

    expect(ctx.aiAudioMgr.startRecording).toHaveBeenCalledTimes(1);
    expect(ctx.updateTokenUsageEstimate).toHaveBeenCalledWith('hello');
    expect(ctx.stopAndTranscribe).toHaveBeenCalledWith(ctx.aiAudioMgr, 'hello');
    expect(ctx.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'utterance.added', record: { id: 'ai-1' } })
    );
  });

  it('starts AI capture on output audio start and finalizes even without transcript deltas', async () => {
    const ctx = createRouter();

    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'output_audio_buffer.started' })
    });
    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'output_audio_buffer.stopped' })
    });

    expect(ctx.aiAudioMgr.startRecording).toHaveBeenCalledTimes(1);
    expect(ctx.stopAndTranscribe).toHaveBeenCalledWith(ctx.aiAudioMgr, '');
    expect(
      ctx.onEvent.mock.calls.some(([payload]) => (
        payload?.type === 'utterance.added'
        && payload?.record?.id === 'ai-1'
      ))
    ).toBe(true);
  });

  it('routes user transcription, function calls, and usage events', async () => {
    const ctx = createRouter();

    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'hola' })
    });
    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.function_call_arguments.done', name: 'search_knowledge' })
    });
    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.done', response: { usage: { total: 10 } } })
    });
    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'session.updated', session: { usage: { total: 11 } } })
    });

    expect(ctx.handleUserTranscription).toHaveBeenCalledTimes(1);
    expect(ctx.handleFunctionCall).toHaveBeenCalledTimes(1);
    expect(ctx.updateTokenUsageActual).toHaveBeenNthCalledWith(1, { total: 10 });
    expect(ctx.updateTokenUsageActual).toHaveBeenNthCalledWith(2, { total: 11 });
  });

  it('aborts active AI capture when interruption occurs', async () => {
    const ctx = createRouter();

    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'partial answer' })
    });
    ctx.router.abortAiTurnCapture({ interruptedUtteranceId: 'interrupted-1' });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ctx.stopAndTranscribe).toHaveBeenCalledWith(ctx.aiAudioMgr, 'partial answer');
    expect(
      ctx.onEvent.mock.calls.some(([payload]) => (
        payload?.type === 'utterance.added'
        && payload?.interrupted === true
        && payload?.record?.id === 'interrupted-1'
      ))
    ).toBe(true);
    expect(ctx.router.aiTranscript).toBe('');
  });

  it('warns once when AI audio recorder is not ready', async () => {
    const ctx = createRouter({
      getAiAudioReady: () => false
    });

    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'one' })
    });
    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'two' })
    });

    expect(ctx.warn).toHaveBeenCalledTimes(1);
    expect(ctx.aiAudioMgr.startRecording).not.toHaveBeenCalled();
  });

  it('suppresses stale assistant transcript events while interrupted until drain signal', async () => {
    const clearScheduled = vi.fn();
    const ctx = createRouter({
      schedule: () => 42,
      clearScheduled,
      now: vi.fn(() => 1000)
    });

    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'old answer ' })
    });
    expect(ctx.updateTokenUsageEstimate).toHaveBeenCalledWith('old answer ');

    ctx.router.abortAiTurnCapture();

    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'stale tail' })
    });
    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.done', transcript: 'stale final' })
    });
    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'output_audio_buffer.stopped' })
    });

    expect(ctx.updateTokenUsageEstimate).toHaveBeenCalledTimes(1);
    expect(
      ctx.onEvent.mock.calls.some(([payload]) => payload?.type === 'response.audio_transcript.done')
    ).toBe(false);
    expect(clearScheduled).toHaveBeenCalledWith(42);

    await ctx.router.handleMessage({
      data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'new answer' })
    });
    expect(ctx.updateTokenUsageEstimate).toHaveBeenCalledWith('new answer');
  });
});
