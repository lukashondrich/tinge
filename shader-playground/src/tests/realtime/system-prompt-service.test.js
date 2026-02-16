import { describe, it, expect, vi } from 'vitest';
import { SystemPromptService } from '../../realtime/systemPromptService.js';

describe('SystemPromptService', () => {
  it('loads YAML prompt and sends system message event', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () => 'prompt: |\n  You are a helpful tutor.'
    }));
    const dataChannel = {
      send: vi.fn()
    };
    const service = new SystemPromptService({
      fetchFn,
      makeEventId: () => 'evt-system-1',
      error: vi.fn()
    });

    const result = await service.sendSystemPrompt({ dataChannel });

    expect(result).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('/prompts/systemPrompt.yaml');
    expect(dataChannel.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(dataChannel.send.mock.calls[0][0]);
    expect(payload).toEqual({
      type: 'conversation.item.create',
      event_id: 'evt-system-1',
      item: {
        type: 'message',
        role: 'system',
        content: [
          { type: 'input_text', text: 'You are a helpful tutor.' }
        ]
      }
    });
  });

  it('returns false and logs error when prompt file fails to load', async () => {
    const error = vi.fn();
    const service = new SystemPromptService({
      fetchFn: vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => ''
      })),
      error
    });

    const result = await service.sendSystemPrompt({
      dataChannel: { send: vi.fn() }
    });

    expect(result).toBe(false);
    expect(error).toHaveBeenCalledWith('Failed to load system prompt YAML: YAML load failed: 404');
  });

  it('returns false when data channel is unavailable', async () => {
    const error = vi.fn();
    const service = new SystemPromptService({ error });

    const result = await service.sendSystemPrompt({ dataChannel: null });

    expect(result).toBe(false);
    expect(error).toHaveBeenCalledWith('Failed to load system prompt YAML: data channel is unavailable');
  });
});
