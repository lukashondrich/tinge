import { describe, it, expect, vi } from 'vitest';
import { UserTranscriptionService } from '../../realtime/userTranscriptionService.js';

describe('UserTranscriptionService', () => {
  function createService(overrides = {}) {
    const state = {
      pendingUserRecord: null,
      pendingUserRecordPromise: null
    };
    const onEvent = vi.fn();
    const addUtterance = vi.fn();
    const updateTokenUsageEstimate = vi.fn();
    const fetchWordTimings = vi.fn(async () => ({
      words: [{ word: 'hola', start: 0, end: 0.1 }],
      fullText: 'hola mundo'
    }));
    const stopAndTranscribe = vi.fn(async () => ({ id: 'fallback-record', audioBlob: { id: 'blob-fallback' } }));
    const error = vi.fn();

    const service = new UserTranscriptionService({
      deviceType: 'desktop',
      userAudioMgr: { id: 'user-audio-mgr' },
      fetchWordTimings,
      stopAndTranscribe,
      updateTokenUsageEstimate,
      onEvent,
      addUtterance,
      getPendingUserRecord: () => state.pendingUserRecord,
      setPendingUserRecord: (record) => {
        state.pendingUserRecord = record;
      },
      getPendingUserRecordPromise: () => state.pendingUserRecordPromise,
      setPendingUserRecordPromise: (promise) => {
        state.pendingUserRecordPromise = promise;
      },
      now: () => 123,
      createObjectURL: () => 'blob:created',
      error,
      ...overrides
    });

    return {
      service,
      state,
      onEvent,
      addUtterance,
      updateTokenUsageEstimate,
      fetchWordTimings,
      stopAndTranscribe,
      error
    };
  }

  it('enhances pending user record and emits transcript + utterance events', async () => {
    const ctx = createService();
    ctx.state.pendingUserRecord = { id: 'pending-1', audioBlob: { id: 'blob-1' } };

    await ctx.service.handleTranscriptionCompleted({ transcript: 'hola mundo' });

    expect(ctx.updateTokenUsageEstimate).toHaveBeenCalledWith('hola mundo');
    expect(ctx.stopAndTranscribe).not.toHaveBeenCalled();
    expect(ctx.fetchWordTimings).toHaveBeenCalledWith({ id: 'blob-1' });
    expect(ctx.addUtterance).toHaveBeenCalledTimes(1);
    expect(ctx.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transcript.word',
        word: 'hola',
        transcriptKey: 'desktop-user-hola mundo-123'
      })
    );
    expect(ctx.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'utterance.added',
        deviceType: 'desktop',
        transcriptKey: 'desktop-user-hola mundo-123'
      })
    );
    expect(ctx.state.pendingUserRecord).toBeNull();
    expect(ctx.state.pendingUserRecordPromise).toBeNull();
  });

  it('falls back to stopAndTranscribe when pending promise resolves null', async () => {
    const ctx = createService();
    ctx.state.pendingUserRecordPromise = Promise.resolve(null);

    await ctx.service.handleTranscriptionCompleted({ transcript: 'fallback path' });

    expect(ctx.error).toHaveBeenCalledWith('pendingUserRecordPromise resolved to null');
    expect(ctx.stopAndTranscribe).toHaveBeenCalledWith(
      { id: 'user-audio-mgr' },
      'fallback path'
    );
    expect(ctx.addUtterance).toHaveBeenCalledTimes(1);
  });
});
