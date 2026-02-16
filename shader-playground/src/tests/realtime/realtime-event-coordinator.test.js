import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeEventCoordinator } from '../../realtime/realtimeEventCoordinator.js';

describe('RealtimeEventCoordinator', () => {
  let bubbleManager;
  let retrievalCoordinator;
  let panel;
  let addWord;
  let warn;
  let usedWords;
  let coordinator;

  beforeEach(() => {
    bubbleManager = {
      beginTurn: vi.fn(),
      appendDelta: vi.fn(() => ['done']),
      appendWord: vi.fn(),
      setUtteranceId: vi.fn(),
      hasActiveDelta: vi.fn(() => false),
      getActiveBubble: vi.fn(() => ({})),
      scheduleFinalize: vi.fn()
    };
    retrievalCoordinator = {
      appendStreamingDelta: vi.fn(() => 'mapped'),
      handleFinalTranscript: vi.fn(() => 'final'),
      handleToolSearchResult: vi.fn(() => null),
      handleToolSearchStarted: vi.fn(),
      resetStreamingTranscript: vi.fn()
    };
    panel = {
      upsertCorrection: vi.fn(() => true),
      updateCorrectionVerification: vi.fn(() => true)
    };
    addWord = vi.fn();
    warn = vi.fn();
    usedWords = new Set();

    coordinator = new RealtimeEventCoordinator({
      bubbleManager,
      retrievalCoordinator,
      panel,
      addWord,
      playAudioFor: vi.fn(),
      usedWords,
      warn
    });
  });

  it('handles streaming delta and emits completed words', () => {
    coordinator.handleEvent({ type: 'response.audio_transcript.delta', delta: 'hello' });
    expect(retrievalCoordinator.appendStreamingDelta).toHaveBeenCalledWith('hello');
    expect(bubbleManager.appendDelta).toHaveBeenCalledWith('ai', 'hello', { displayText: 'mapped' });
    expect(addWord).toHaveBeenCalledWith('done', 'ai', { skipBubble: true });
  });

  it('starts an AI bubble when output audio begins', () => {
    coordinator.handleEvent({ type: 'output_audio_buffer.started' });
    expect(bubbleManager.beginTurn).toHaveBeenCalledWith('ai');
  });

  it('finalizes active AI bubble when assistant is interrupted by PTT', () => {
    coordinator.handleEvent({ type: 'assistant.interrupted', utteranceId: 'interrupted-abc' });
    expect(retrievalCoordinator.resetStreamingTranscript).toHaveBeenCalledTimes(1);
    expect(bubbleManager.setUtteranceId).toHaveBeenCalledWith('ai', 'interrupted-abc');
    expect(bubbleManager.scheduleFinalize).toHaveBeenCalledWith('ai', 0, expect.any(Function));
  });

  it('handles response.text.delta like transcript delta for progressive AI bubble updates', () => {
    coordinator.handleEvent({ type: 'response.text.delta', delta: 'hola' });
    expect(retrievalCoordinator.appendStreamingDelta).toHaveBeenCalledWith('hola');
    expect(bubbleManager.appendDelta).toHaveBeenCalledWith('ai', 'hola', { displayText: 'mapped' });
  });

  it('suppresses tool-call JSON from response.text.delta', () => {
    coordinator.handleEvent({ type: 'response.text.delta', delta: '{"tool_uses":[' });
    coordinator.handleEvent({ type: 'response.text.delta', delta: '{"recipient_name":"get_user_profile"}]}' });
    expect(retrievalCoordinator.appendStreamingDelta).not.toHaveBeenCalled();
    expect(bubbleManager.appendDelta).not.toHaveBeenCalled();
  });

  it('handles transcript word events for user and ai delta mode', () => {
    coordinator.handleEvent({ type: 'transcript.word', word: 'hola', speaker: 'user' });
    expect(bubbleManager.appendWord).toHaveBeenCalled();
    expect(addWord).toHaveBeenCalledWith('hola', 'user', { skipBubble: true });

    bubbleManager.hasActiveDelta.mockReturnValue(true);
    usedWords.add('repeat');
    coordinator.handleEvent({ type: 'transcript.word', word: 'repeat', speaker: 'ai' });
    expect(addWord).toHaveBeenCalledTimes(1);
  });

  it('routes utterance events to processor and handles missing processor', () => {
    coordinator.handleEvent({ type: 'utterance.added', record: { id: 'x' } });
    expect(warn).toHaveBeenCalled();

    const processor = {
      handleUtteranceAdded: vi.fn(),
      handleOutputAudioStopped: vi.fn()
    };
    coordinator.setUtteranceEventProcessor(processor);
    coordinator.handleEvent({ type: 'utterance.added', record: { id: 'y' }, deviceType: 'mobile' });
    expect(processor.handleUtteranceAdded).toHaveBeenCalledWith({ id: 'y' }, 'mobile');
    coordinator.handleEvent({ type: 'output_audio_buffer.stopped' });
    expect(processor.handleOutputAudioStopped).toHaveBeenCalled();
  });

  it('routes retrieval tool events', () => {
    retrievalCoordinator.handleToolSearchResult.mockReturnValue('mapped-stream');
    coordinator.handleEvent({
      type: 'tool.search_knowledge.result',
      result: { results: [{ citation_index: 1 }] },
      telemetry: { status: 'ok' }
    });
    expect(bubbleManager.appendDelta).toHaveBeenCalledWith('ai', '', { displayText: 'mapped-stream' });
    coordinator.handleEvent({ type: 'tool.search_knowledge.started', args: { query_original: 'q' } });
    expect(retrievalCoordinator.handleToolSearchStarted).toHaveBeenCalledWith({ query_original: 'q' });
  });

  it('routes correction detection and verification lifecycle events to panel', () => {
    coordinator.handleEvent({
      type: 'tool.log_correction.detected',
      correction: {
        id: 'corr-1',
        original: 'a',
        corrected: 'b',
        correction_type: 'grammar',
        status: 'detected'
      }
    });
    expect(panel.upsertCorrection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'corr-1', status: 'detected' })
    );

    coordinator.handleEvent({
      type: 'correction.verification.started',
      correctionId: 'corr-1'
    });
    expect(panel.upsertCorrection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'corr-1', status: 'verifying' })
    );

    coordinator.handleEvent({
      type: 'correction.verification.succeeded',
      correctionId: 'corr-1',
      verification: { rule: 'rule', confidence: 0.9 }
    });
    expect(panel.updateCorrectionVerification).toHaveBeenCalledWith('corr-1', {
      status: 'verified',
      verification: { rule: 'rule', confidence: 0.9 }
    });

    coordinator.handleEvent({
      type: 'correction.verification.failed',
      correctionId: 'corr-1',
      error: 'timeout'
    });
    expect(panel.updateCorrectionVerification).toHaveBeenCalledWith('corr-1', {
      status: 'failed',
      error: 'timeout'
    });
  });

  it('applies final transcript to AI bubble when done event arrives', () => {
    retrievalCoordinator.handleFinalTranscript.mockReturnValue('final-mapped');
    coordinator.handleEvent({ type: 'response.audio_transcript.done', transcript: 'final raw' });
    expect(retrievalCoordinator.handleFinalTranscript).toHaveBeenCalledWith('final raw');
    expect(bubbleManager.appendDelta).toHaveBeenCalledWith('ai', '', { displayText: 'final-mapped' });
    expect(bubbleManager.scheduleFinalize).toHaveBeenCalled();
  });

  it('applies response.text.done to AI bubble when transcript stream is unavailable', () => {
    retrievalCoordinator.handleFinalTranscript.mockReturnValue('text-done-mapped');
    coordinator.handleEvent({ type: 'response.text.done', text: 'text done raw' });
    expect(retrievalCoordinator.handleFinalTranscript).toHaveBeenCalledWith('text done raw');
    expect(bubbleManager.appendDelta).toHaveBeenCalledWith('ai', '', { displayText: 'text-done-mapped' });
  });

  it('suppresses tool-call JSON from response.text.done', () => {
    coordinator.handleEvent({
      type: 'response.text.done',
      text: '{"tool_uses":[{"recipient_name":"get_user_profile","parameters":{"user_id":"student_001"}}]}'
    });
    expect(retrievalCoordinator.handleFinalTranscript).not.toHaveBeenCalled();
    expect(bubbleManager.appendDelta).not.toHaveBeenCalled();
  });
});
