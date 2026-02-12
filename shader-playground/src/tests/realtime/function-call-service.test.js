import { describe, it, expect, vi } from 'vitest';
import { FunctionCallService } from '../../realtime/functionCallService.js';

describe('FunctionCallService', () => {
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
});
