import { describe, it, expect, vi } from 'vitest';
import { FunctionCallService } from '../../realtime/functionCallService.js';

describe('FunctionCallService', () => {
  async function flushAsyncWork() {
    await Promise.resolve();
    await Promise.resolve();
  }

  function createService(overrides = {}) {
    const onEvent = vi.fn();
    const sendJson = vi.fn();
    const error = vi.fn();
    const service = new FunctionCallService({
      getUserProfile: vi.fn(async (args) => ({ kind: 'profile', args })),
      updateUserProfile: vi.fn(async (args) => ({ kind: 'updated', args })),
      searchKnowledge: vi.fn(async (args) => ({
        data: { results: [{ id: 1 }], argsEcho: args },
        telemetry: { status: 'ok', resultCount: 1 }
      })),
      onEvent,
      sendJson,
      makeEventId: () => 'evt-fixed',
      makeCorrectionId: () => 'corr-fixed',
      nowIso: () => '2026-02-16T12:00:00.000Z',
      error,
      ...overrides
    });

    return { service, onEvent, sendJson, error };
  }

  it('handles get_user_profile and sends function output + response.create', async () => {
    const { service, sendJson } = createService();
    await service.handleFunctionCall({
      name: 'get_user_profile',
      arguments: JSON.stringify({ user_id: 'u1' }),
      call_id: 'call-1'
    });

    expect(sendJson).toHaveBeenCalledTimes(2);
    expect(sendJson.mock.calls[0][0].item.type).toBe('function_call_output');
    expect(sendJson.mock.calls[1][0].type).toBe('response.create');
  });

  it('emits search started/result events for search_knowledge', async () => {
    const { service, onEvent } = createService();
    await service.handleFunctionCall({
      name: 'search_knowledge',
      arguments: JSON.stringify({ query_original: 'hola', query_en: 'hello' }),
      call_id: 'call-2'
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool.search_knowledge.started' })
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool.search_knowledge.result' })
    );
  });

  it('emits search error telemetry when search throws', async () => {
    const { service, onEvent, error } = createService({
      searchKnowledge: vi.fn(async () => {
        throw new Error('search failed');
      })
    });

    await service.handleFunctionCall({
      name: 'search_knowledge',
      arguments: JSON.stringify({ query_original: 'x', query_en: 'x' }),
      call_id: 'call-3'
    });

    expect(error).toHaveBeenCalledWith('Function call error: search failed');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool.search_knowledge.result',
        telemetry: expect.objectContaining({ status: 'error', error: 'search failed' })
      })
    );
  });

  it('returns unknown function error output for unknown names', async () => {
    const { service, sendJson, error } = createService();
    await service.handleFunctionCall({
      name: 'unknown_tool',
      arguments: '{}',
      call_id: 'call-4'
    });

    expect(error).toHaveBeenCalledWith('Unknown function call: unknown_tool');
    const output = JSON.parse(sendJson.mock.calls[0][0].item.output);
    expect(output).toEqual({ error: 'Unknown function: unknown_tool' });
  });

  it('emits correction detected event for log_correction and returns success output', async () => {
    const { service, onEvent, sendJson } = createService();
    await service.handleFunctionCall({
      name: 'log_correction',
      arguments: JSON.stringify({
        original: 'tengo hambre mucho',
        corrected: 'tengo mucha hambre',
        correction_type: 'grammar',
        learner_excerpt: 'yo tengo hambre mucho hoy',
        assistant_excerpt: 'Dirias: tengo mucha hambre.'
      }),
      call_id: 'call-5'
    });

    expect(onEvent).toHaveBeenCalledWith({
      type: 'tool.log_correction.detected',
      correction: {
        id: 'corr-fixed',
        original: 'tengo hambre mucho',
        corrected: 'tengo mucha hambre',
        correction_type: 'grammar',
        learner_excerpt: 'yo tengo hambre mucho hoy',
        assistant_excerpt: 'Dirias: tengo mucha hambre.',
        source: 'tool_call',
        status: 'detected',
        detected_at: '2026-02-16T12:00:00.000Z'
      }
    });

    const output = JSON.parse(sendJson.mock.calls[0][0].item.output);
    expect(output).toEqual({
      success: true,
      correction_id: 'corr-fixed'
    });
  });

  it('returns validation error for invalid log_correction payload', async () => {
    const { service, sendJson, onEvent } = createService();
    await service.handleFunctionCall({
      name: 'log_correction',
      arguments: JSON.stringify({
        original: 'hola',
        corrected: 'hola',
        correction_type: 'style'
      }),
      call_id: 'call-6'
    });

    expect(onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool.log_correction.detected' })
    );
    const output = JSON.parse(sendJson.mock.calls[0][0].item.output);
    expect(output).toEqual({
      error: 'Invalid correction_type: style'
    });
  });

  it('emits verification started/succeeded events for log_correction', async () => {
    const verifyCorrection = vi.fn(async ({ correction_id }) => ({
      data: {
        correction_id,
        rule: 'Agreement rule',
        confidence: 0.9
      }
    }));
    const { service, onEvent } = createService({ verifyCorrection });

    await service.handleFunctionCall({
      name: 'log_correction',
      arguments: JSON.stringify({
        original: 'tengo hambre mucho',
        corrected: 'tengo mucha hambre',
        correction_type: 'grammar'
      }),
      call_id: 'call-7'
    });

    await flushAsyncWork();

    expect(verifyCorrection).toHaveBeenCalledWith({
      correction_id: 'corr-fixed',
      original: 'tengo hambre mucho',
      corrected: 'tengo mucha hambre',
      correction_type: 'grammar'
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'correction.verification.started',
        correctionId: 'corr-fixed'
      })
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'correction.verification.succeeded',
        correctionId: 'corr-fixed',
        verification: expect.objectContaining({
          rule: 'Agreement rule',
          confidence: 0.9
        })
      })
    );
  });

  it('emits verification failed event when verifyCorrection throws', async () => {
    const verifyCorrection = vi.fn(async () => {
      throw new Error('verify failed');
    });
    const { service, onEvent, error } = createService({ verifyCorrection });

    await service.handleFunctionCall({
      name: 'log_correction',
      arguments: JSON.stringify({
        original: 'foo',
        corrected: 'bar',
        correction_type: 'vocabulary'
      }),
      call_id: 'call-8'
    });

    await flushAsyncWork();

    expect(error).toHaveBeenCalledWith('Correction verification error: verify failed');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'correction.verification.failed',
        correctionId: 'corr-fixed',
        error: 'verify failed'
      })
    );
  });
});
