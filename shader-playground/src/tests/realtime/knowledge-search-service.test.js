import { describe, it, expect, vi } from 'vitest';
import { KnowledgeSearchService } from '../../realtime/knowledgeSearchService.js';

describe('KnowledgeSearchService', () => {
  it('returns indexed results and telemetry on success', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ title: 'A' }, { title: 'B' }]
      })
    }));
    let now = 1000;
    const service = new KnowledgeSearchService({
      apiUrl: 'http://localhost:3000',
      fetchFn,
      nowFn: () => {
        now += 50;
        return now;
      },
      schedule: () => 1,
      clearScheduled: () => {}
    });

    const payload = await service.searchKnowledge({
      query_original: 'hola',
      query_en: 'hello',
      top_k: 2
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:3000/knowledge/search',
      expect.objectContaining({ method: 'POST' })
    );
    expect(payload.data.results.map((r) => r.citation_index)).toEqual([1, 2]);
    expect(payload.telemetry.queryOriginal).toBe('hola');
    expect(payload.telemetry.queryEn).toBe('hello');
    expect(payload.telemetry.resultCount).toBe(2);
    expect(payload.telemetry.status).toBe('ok');
  });

  it('throws with status and detail on non-ok response', async () => {
    const service = new KnowledgeSearchService({
      apiUrl: 'http://localhost:3000',
      fetchFn: async () => ({
        ok: false,
        status: 503,
        text: async () => 'backend unavailable'
      }),
      schedule: () => 1,
      clearScheduled: () => {}
    });

    await expect(service.searchKnowledge({ query_original: 'x' })).rejects.toThrow(
      'Knowledge search failed (503): backend unavailable'
    );
  });

  it('converts AbortError into timeout message', async () => {
    const service = new KnowledgeSearchService({
      apiUrl: 'http://localhost:3000',
      fetchFn: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
      createAbortController: () => ({
        signal: {},
        abort: () => {}
      }),
      schedule: () => 1,
      clearScheduled: () => {}
    });

    await expect(service.searchKnowledge({ query_original: 'x' })).rejects.toThrow(
      'Knowledge search timed out after 8000ms'
    );
  });
});
