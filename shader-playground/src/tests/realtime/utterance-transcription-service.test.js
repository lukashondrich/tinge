import { describe, it, expect, vi } from 'vitest';
import { UtteranceTranscriptionService } from '../../realtime/utteranceTranscriptionService.js';

describe('UtteranceTranscriptionService', () => {
  it('posts audio blob to transcription endpoint and returns timings', async () => {
    const append = vi.fn();
    const formData = { append };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        words: [{ word: 'hello', start: 0, end: 0.5 }],
        fullText: 'hello there'
      })
    }));
    const service = new UtteranceTranscriptionService({
      apiUrl: 'http://localhost:3000',
      fetchFn,
      makeFormData: () => formData
    });
    const blob = { id: 'blob1' };

    const result = await service.fetchWordTimings(blob);

    expect(append).toHaveBeenCalledWith('file', blob, 'utterance.webm');
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:3000/transcribe',
      { method: 'POST', body: formData }
    );
    expect(result).toEqual({
      words: [{ word: 'hello', start: 0, end: 0.5 }],
      fullText: 'hello there'
    });
  });

  it('throws when transcription endpoint responds non-ok', async () => {
    const service = new UtteranceTranscriptionService({
      apiUrl: 'http://localhost:3000',
      fetchFn: vi.fn(async () => ({ ok: false, status: 503 })),
      makeFormData: () => ({ append: vi.fn() })
    });

    await expect(service.fetchWordTimings({})).rejects.toThrow('Transcription API error 503');
  });

  it('returns null when recorder yields no record', async () => {
    const service = new UtteranceTranscriptionService({
      apiUrl: 'http://localhost:3000',
      fetchFn: vi.fn()
    });
    const audioMgr = {
      stopRecording: vi.fn(async () => null)
    };

    const result = await service.stopAndTranscribe(audioMgr, 'ignored');

    expect(result).toBeNull();
  });

  it('enriches recording with word timings and full text', async () => {
    const service = new UtteranceTranscriptionService({
      apiUrl: 'http://localhost:3000',
      fetchFn: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          words: [{ word: 'hola', start: 0, end: 0.4 }],
          fullText: 'hola mundo'
        })
      })),
      makeFormData: () => ({ append: vi.fn() })
    });
    const record = {
      id: 'u1',
      text: 'hola',
      audioBlob: { size: 12 }
    };
    const audioMgr = {
      stopRecording: vi.fn(async () => record)
    };

    const result = await service.stopAndTranscribe(audioMgr, 'hola');

    expect(result.wordTimings).toEqual([{ word: 'hola', start: 0, end: 0.4 }]);
    expect(result.fullText).toBe('hola mundo');
  });

  it('uses transcription full text when original transcript is empty', async () => {
    const service = new UtteranceTranscriptionService({
      apiUrl: 'http://localhost:3000',
      fetchFn: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          words: [{ word: 'bonjour', start: 0, end: 0.5 }],
          fullText: 'bonjour tout le monde'
        })
      })),
      makeFormData: () => ({ append: vi.fn() })
    });
    const record = {
      id: 'u-empty',
      text: '',
      audioBlob: { size: 12 }
    };
    const audioMgr = {
      stopRecording: vi.fn(async () => record)
    };

    const result = await service.stopAndTranscribe(audioMgr, '');

    expect(result.text).toBe('bonjour tout le monde');
    expect(result.fullText).toBe('bonjour tout le monde');
    expect(result.wordTimings).toEqual([{ word: 'bonjour', start: 0, end: 0.5 }]);
  });

  it('falls back to original transcript when timing fetch fails', async () => {
    const error = vi.fn();
    const service = new UtteranceTranscriptionService({
      apiUrl: 'http://localhost:3000',
      fetchFn: vi.fn(async () => {
        throw new Error('unreachable');
      }),
      makeFormData: () => ({ append: vi.fn() }),
      error
    });
    const record = {
      id: 'u2',
      text: 'fallback text',
      audioBlob: { size: 7 }
    };
    const audioMgr = {
      stopRecording: vi.fn(async () => record)
    };

    const result = await service.stopAndTranscribe(audioMgr, 'fallback text');

    expect(result.wordTimings).toEqual([]);
    expect(result.fullText).toBe('fallback text');
    expect(error).toHaveBeenCalledWith('Word timing fetch failed: unreachable');
  });
});
