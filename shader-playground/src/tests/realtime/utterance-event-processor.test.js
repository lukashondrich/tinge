import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UtteranceEventProcessor } from '../../realtime/utteranceEventProcessor.js';

describe('UtteranceEventProcessor', () => {
  let bubbleManager;
  let retrievalCoordinator;
  let panel;
  let addWordCalls;
  let textManager;
  let wordIndices;
  let optimizer;
  let processor;

  beforeEach(() => {
    addWordCalls = [];
    bubbleManager = {
      shouldProcessUtterance: vi.fn(() => true),
      setUtteranceId: vi.fn(),
      scheduleFinalize: vi.fn((speaker, delay, cb) => {
        if (typeof cb === 'function') cb(['alpha']);
      }),
      clearFinalizeTimer: vi.fn()
    };
    retrievalCoordinator = {
      remapAssistantTextWithPendingCitations: vi.fn((text) => `${text} [1]`),
      clearPendingAssistantCitationRemap: vi.fn()
    };
    panel = { add: vi.fn() };
    textManager = {
      showLabelsForUtterance: vi.fn(),
      activeLabels: new Map(),
      updatePositions: vi.fn(),
      updateLabels: vi.fn()
    };
    wordIndices = new Map([['hello', 0]]);
    optimizer = {
      getPositions: vi.fn(() => [{ clone: () => ({ multiplyScalar: () => ({ x: 1, y: 2, z: 3 }) }) }])
    };

    processor = new UtteranceEventProcessor({
      bubbleManager,
      retrievalCoordinator,
      panel,
      scrollToBottom: vi.fn(),
      addWord: (...args) => addWordCalls.push(args),
      textManager,
      wordIndices,
      optimizer,
      scale: 1,
      log: () => {},
      error: () => {}
    });
  });

  it('handles placeholder utterances with finalize scheduling', () => {
    const record = { id: 'u1', speaker: 'user', text: '...', wordTimings: [] };
    const handled = processor.handleUtteranceAdded(record, 'desktop');
    expect(handled).toBe(true);
    expect(bubbleManager.setUtteranceId).toHaveBeenCalledWith('user', 'u1');
    expect(bubbleManager.scheduleFinalize).toHaveBeenCalled();
    expect(addWordCalls.length).toBeGreaterThan(0);
    expect(panel.add).not.toHaveBeenCalled();
  });

  it('remaps AI utterance text and adds to panel', () => {
    const record = {
      id: 'a1',
      speaker: 'ai',
      text: 'Hello',
      fullText: 'Hello full',
      audioURL: 'blob:test',
      wordTimings: [{ word: 'Hello', start: 0, end: 1 }]
    };

    const handled = processor.handleUtteranceAdded(record, 'desktop');
    expect(handled).toBe(true);
    expect(retrievalCoordinator.remapAssistantTextWithPendingCitations).toHaveBeenCalled();
    expect(retrievalCoordinator.clearPendingAssistantCitationRemap).toHaveBeenCalled();
    expect(panel.add).toHaveBeenCalledWith(record);
    expect(textManager.showLabelsForUtterance).toHaveBeenCalled();
  });

  it('schedules AI finalize when output audio stops', () => {
    processor.handleOutputAudioStopped();
    expect(bubbleManager.scheduleFinalize).toHaveBeenCalledWith(
      'ai',
      1000,
      expect.any(Function)
    );
  });
});
