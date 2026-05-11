import { describe, it, expect, vi } from 'vitest';
import { TokenLimitService } from '../../realtime/tokenLimitService.js';

describe('TokenLimitService', () => {
  it('returns no_key when ephemeral key is missing', async () => {
    const fetchFn = vi.fn();
    const service = new TokenLimitService({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => null,
      fetchFn
    });

    const result = await service.checkTokenLimit();

    expect(result).toEqual({ allowed: true, reason: 'no_key' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('blocks when usage reports limit reached', async () => {
    const usage = { isAtLimit: true, used: 100, limit: 100 };
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => usage
    }));
    const service = new TokenLimitService({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => 'ek_limit',
      fetchFn
    });

    const result = await service.checkTokenLimit();

    expect(fetchFn).toHaveBeenCalledWith('http://localhost:3000/token-usage/ek_limit');
    expect(result).toEqual({
      allowed: false,
      reason: 'token_limit_exceeded',
      usage
    });
  });

  it('returns usage when below limit', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ isAtLimit: false, used: 25, limit: 100 })
    }));
    const service = new TokenLimitService({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => 'ek_ok',
      fetchFn
    });

    const result = await service.checkTokenLimit();

    expect(result).toEqual({
      allowed: true,
      usage: { isAtLimit: false, used: 25, limit: 100 }
    });
  });

  it('returns check_failed and logs warning when request throws', async () => {
    const warn = vi.fn();
    const error = new Error('network down');
    const fetchFn = vi.fn(async () => {
      throw error;
    });
    const service = new TokenLimitService({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => 'ek_error',
      fetchFn,
      warn
    });

    const result = await service.checkTokenLimit();

    expect(result).toEqual({ allowed: true, reason: 'check_failed' });
    expect(warn).toHaveBeenCalledWith('Failed to check token limit:', error);
  });

  it('returns unknown when endpoint responds non-ok', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false }));
    const service = new TokenLimitService({
      apiUrl: 'http://localhost:3000',
      getEphemeralKey: () => 'ek_non_ok',
      fetchFn
    });

    const result = await service.checkTokenLimit();

    expect(result).toEqual({ allowed: true, reason: 'unknown' });
  });
});
