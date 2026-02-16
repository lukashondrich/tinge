import { describe, it, expect } from 'vitest';
import { buildSessionUpdate } from '../../realtime/sessionConfigurationBuilder.js';

describe('sessionConfigurationBuilder', () => {
  it('builds default session update with VAD disabled', () => {
    const payload = buildSessionUpdate();

    expect(payload.type).toBe('session.update');
    expect(payload.session.input_audio_transcription).toEqual({
      model: 'gpt-4o-mini-transcribe'
    });
    expect(payload.session.turn_detection).toBeNull();
    expect(Array.isArray(payload.session.tools)).toBe(true);
    expect(payload.session.tools.map((tool) => tool.name)).toEqual([
      'get_user_profile',
      'update_user_profile',
      'search_knowledge',
      'log_correction'
    ]);
  });

  it('includes semantic_vad settings when enabled', () => {
    const payload = buildSessionUpdate({ enableSemanticVad: true });

    expect(payload.session.turn_detection).toEqual({
      type: 'semantic_vad',
      eagerness: 'low',
      create_response: true,
      interrupt_response: false
    });
  });

  it('keeps retrieval tool schema requiring query_original and query_en', () => {
    const payload = buildSessionUpdate();
    const searchTool = payload.session.tools.find((tool) => tool.name === 'search_knowledge');

    expect(searchTool).toBeTruthy();
    expect(searchTool.parameters.required).toEqual(['query_original', 'query_en']);
  });

  it('includes correction logging tool schema with required fields', () => {
    const payload = buildSessionUpdate();
    const correctionTool = payload.session.tools.find((tool) => tool.name === 'log_correction');

    expect(correctionTool).toBeTruthy();
    expect(correctionTool.parameters.required).toEqual(['original', 'corrected', 'correction_type']);
  });
});
