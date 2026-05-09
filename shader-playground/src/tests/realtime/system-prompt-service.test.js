import { describe, it, expect, vi } from 'vitest';
import { SystemPromptService } from '../../realtime/systemPromptService.js';

describe('SystemPromptService', () => {
  it('loads YAML prompt text', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      text: async () => 'prompt: |\n  You are a helpful tutor.'
    }));
    const service = new SystemPromptService({
      fetchFn,
      error: vi.fn()
    });

    const result = await service.loadPromptText();

    expect(result).toBe('You are a helpful tutor.');
    expect(fetchFn).toHaveBeenCalledWith('/prompts/systemPrompt.yaml');
  });

  it('throws and logs error when prompt file fails to load', async () => {
    const error = vi.fn();
    const service = new SystemPromptService({
      fetchFn: vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => ''
      })),
      error
    });

    await expect(service.loadPromptText()).rejects.toThrow('YAML load failed: 404');

    expect(error).toHaveBeenCalledWith('Failed to load system prompt YAML: YAML load failed: 404');
  });

  it('throws when prompt field is missing', async () => {
    const error = vi.fn();
    const service = new SystemPromptService({
      fetchFn: vi.fn(async () => ({
        ok: true,
        text: async () => 'other: value'
      })),
      error
    });

    await expect(service.loadPromptText()).rejects.toThrow('YAML prompt is empty');

    expect(error).toHaveBeenCalledWith(
      'Failed to load system prompt YAML: YAML prompt is empty or missing "prompt" field'
    );
  });
});
