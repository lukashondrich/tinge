import { describe, it, expect, vi } from 'vitest';
import { CorrectionVerificationService } from '../../realtime/correctionVerificationService.js';

describe('CorrectionVerificationService', () => {
  it('posts verification request and returns response data', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        correction_id: 'corr-1',
        rule: 'Agreement',
        confidence: 0.9
      })
    }));
    const service = new CorrectionVerificationService({
      apiUrl: 'http://localhost:3000',
      fetchFn,
      schedule: () => 1,
      clearScheduled: () => {}
    });

    const result = await service.verifyCorrection({
      correction_id: 'corr-1',
      original: 'tengo hambre mucho',
      corrected: 'tengo mucha hambre',
      correction_type: 'grammar'
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:3000/corrections/verify',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.cached).toBe(false);
    expect(result.data.confidence).toBe(0.9);
  });

  it('returns cached response for repeated request within ttl', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ correction_id: 'corr-2', rule: 'Rule', confidence: 0.8 })
    }));
    const service = new CorrectionVerificationService({
      apiUrl: 'http://localhost:3000',
      fetchFn,
      nowMs: () => 1000,
      schedule: () => 1,
      clearScheduled: () => {}
    });

    const payload = {
      correction_id: 'corr-2',
      original: 'a',
      corrected: 'b',
      correction_type: 'vocabulary'
    };
    const first = await service.verifyCorrection(payload);
    const second = await service.verifyCorrection(payload);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('throws timeout error when request is aborted', async () => {
    const service = new CorrectionVerificationService({
      apiUrl: 'http://localhost:3000',
      fetchFn: async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
      verifyTimeoutMs: 4321,
      createAbortController: () => ({
        signal: {},
        abort: () => {}
      }),
      schedule: () => 1,
      clearScheduled: () => {}
    });

    await expect(service.verifyCorrection({
      original: 'x',
      corrected: 'y',
      correction_type: 'grammar'
    })).rejects.toThrow('Correction verification timed out after 4321ms');
  });

  it('throws status-rich error for non-ok responses', async () => {
    const service = new CorrectionVerificationService({
      apiUrl: 'http://localhost:3000',
      fetchFn: async () => ({
        ok: false,
        status: 429,
        json: async () => ({ detail: 'rate limited' })
      }),
      schedule: () => 1,
      clearScheduled: () => {}
    });

    await expect(service.verifyCorrection({
      original: 'x',
      corrected: 'y',
      correction_type: 'grammar'
    })).rejects.toThrow('Correction verification failed (429): rate limited');
  });

  it('validates correction type before request', async () => {
    const fetchFn = vi.fn();
    const service = new CorrectionVerificationService({
      apiUrl: 'http://localhost:3000',
      fetchFn
    });

    await expect(service.verifyCorrection({
      original: 'x',
      corrected: 'y',
      correction_type: 'style'
    })).rejects.toThrow('Invalid correction_type: style');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
