import { describe, it, expect } from 'vitest';
import { buildSessionUpdate } from '../../realtime/sessionConfigurationBuilder.js';

describe('sessionConfigurationBuilder', () => {
  it('builds default session update with VAD disabled', () => {
    const payload = buildSessionUpdate({ instructions: 'Tutor prompt' });

    expect(payload.type).toBe('session.update');
    expect(payload.session.type).toBe('realtime');
    expect(payload.session.instructions).toBe('Tutor prompt');
    expect(payload.session.audio.input.transcription).toEqual({
      model: 'gpt-4o-mini-transcribe'
    });
    expect(payload.session.audio.input.turn_detection).toBeNull();
    expect(Array.isArray(payload.session.tools)).toBe(true);
    expect(payload.session.tools.map((tool) => tool.name)).toEqual([
      'get_user_profile',
      'update_user_profile',
      'search_knowledge',
      'log_correction'
    ]);
  });

  it('omits explicit PCM formats on the webrtc transport', () => {
    const payload = buildSessionUpdate({ transport: 'webrtc' });

    expect(payload.session.audio.input.format).toBeUndefined();
    expect(payload.session.audio.output).toBeUndefined();
  });

  it('pins 24kHz PCM input/output formats on the websocket transport', () => {
    const payload = buildSessionUpdate({ transport: 'websocket' });

    expect(payload.session.audio.input.format).toEqual({ type: 'audio/pcm', rate: 24000 });
    expect(payload.session.audio.output.format).toEqual({ type: 'audio/pcm', rate: 24000 });
    expect(payload.session.audio.input.transcription).toEqual({
      model: 'gpt-4o-mini-transcribe'
    });
  });

  it('includes semantic_vad settings when enabled', () => {
    const payload = buildSessionUpdate({ enableSemanticVad: true });

    expect(payload.session.audio.input.turn_detection).toEqual({
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
    expect(searchTool.parameters.properties.dialogue_context).toBeTruthy();
  });

  it('includes correction logging tool schema with required fields', () => {
    const payload = buildSessionUpdate();
    const correctionTool = payload.session.tools.find((tool) => tool.name === 'log_correction');

    expect(correctionTool).toBeTruthy();
    expect(correctionTool.parameters.required).toEqual(['original', 'corrected', 'correction_type']);
  });
});
