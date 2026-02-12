import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeEventCoordinator } from '../../realtime/realtimeEventCoordinator.js';

describe('RealtimeEventCoordinator', () => {
  let bubbleManager;
  let retrievalCoordinator;
  let addWord;
  let warn;
  let usedWords;
  let coordinator;

  beforeEach(() => {
    bubbleManager = {
      beginTurn: vi.fn(),
      appendDelta: vi.fn(() => ['done']),
      appendWord: vi.fn(),
      hasActiveDelta: vi.fn(() => false),
      getActiveBubble: vi.fn(() => ({})),
      scheduleFinalize: vi.fn()
    };
    retrievalCoordinator = {
      appendStreamingDelta: vi.fn(() => 'mapped'),
      handleFinalTranscript: vi.fn(() => 'final'),
      handleToolSearchResult: vi.fn(() => null),
      handleToolSearchStarted: vi.fn()
    };
    addWord = vi.fn();
    warn = vi.fn();
    usedWords = new Set();

    coordinator = new RealtimeEventCoordinator({
      bubbleManager,
      retrievalCoordinator,
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
