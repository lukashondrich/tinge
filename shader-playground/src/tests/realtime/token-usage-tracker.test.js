import { describe, it, expect, vi } from 'vitest';
import { TokenUsageTracker } from '../../realtime/tokenUsageTracker.js';

describe('TokenUsageTracker', () => {
  it('batches estimate calls and posts combined payload', async () => {
    let scheduled = null;
    let timeoutId = 0;
    const schedule = vi.fn((fn) => {
      scheduled = fn;
      timeoutId += 1;
      return timeoutId;
    });
    const clearScheduled = vi.fn();
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ total: 42 })
    }));
    const onUsage = vi.fn();

    const tracker = new TokenUsageTracker({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => 'ek_test',
      onUsage,
      fetchFn,
      schedule,
      clearScheduled
    });

    tracker.updateEstimate('hola ', 0.5);
    tracker.updateEstimate('mundo', 0.25);
    await scheduled();

    expect(clearScheduled).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe('http://localhost:3000/token-usage/ek_test/estimate');
    expect(JSON.parse(options.body)).toEqual({
      text: 'hola mundo',
      audioDuration: 0.75
    });
    expect(onUsage).toHaveBeenCalledWith({ total: 42 });
  });

  it('skips requests when no ephemeral key is present', async () => {
    const fetchFn = vi.fn();
    const schedule = vi.fn();
    const tracker = new TokenUsageTracker({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => null,
      fetchFn,
      schedule
    });

    tracker.updateEstimate('ignored', 1);
    await tracker.updateActual({ input_tokens: 10 });

    expect(schedule).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('posts actual usage updates and forwards callback', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ remaining: 90 })
    }));
    const onUsage = vi.fn();
    const tracker = new TokenUsageTracker({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => 'ek_live',
      onUsage,
      fetchFn
    });

    const result = await tracker.updateActual({ output_tokens: 12 });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:3000/token-usage/ek_live/actual',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual({ remaining: 90 });
    expect(onUsage).toHaveBeenCalledWith({ remaining: 90 });
  });

  it('clears pending estimate timer and buffered values on reset', () => {
    const clearScheduled = vi.fn();
    let scheduled = null;
    const tracker = new TokenUsageTracker({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => 'ek_reset',
      fetchFn: vi.fn(),
      schedule: (fn) => {
        scheduled = fn;
        return 99;
      },
      clearScheduled
    });

    tracker.updateEstimate('abc', 2);
    expect(scheduled).toBeTypeOf('function');
    tracker.reset();

    expect(clearScheduled).toHaveBeenCalledWith(99);
    expect(tracker.accumulatedText).toBe('');
    expect(tracker.accumulatedAudioDuration).toBe(0);
    expect(tracker.tokenEstimationTimeout).toBeNull();
  });
});
