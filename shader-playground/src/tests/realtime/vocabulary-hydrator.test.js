import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VocabularyHydrator } from '../../realtime/vocabularyHydrator.js';

function buildWord(word, speaker = 'ai', position = { x: 0.1, y: 0.2, z: 0.3 }) {
  return { word, speaker, position };
}

describe('VocabularyHydrator', () => {
  let vocabularyStorage;
  let usedWords;
  let positions;
  let optimizer;
  let mesh;
  let labels;
  let wordPositions;
  let wordIndices;
  let gel;
  let scheduled;
  let hydrator;

  beforeEach(() => {
    vocabularyStorage = {
      loadVocabulary: vi.fn(),
      loadRecentWords: vi.fn(),
      loadVocabularyBatch: vi.fn()
    };
    usedWords = new Set();
    positions = [];
    optimizer = {
      addPoint: vi.fn((point) => positions.push(point)),
      getPositions: vi.fn(() => positions)
    };
    mesh = {
      count: 0,
      setColorAt: vi.fn(),
      instanceColor: { needsUpdate: false },
      instanceMatrix: { needsUpdate: false }
    };
    labels = [];
    wordPositions = new Map();
    wordIndices = new Map();
    gel = { visible: false };
    scheduled = [];

    hydrator = new VocabularyHydrator({
      vocabularyStorage,
      usedWords,
      optimizer,
      mesh,
      labels,
      wordPositions,
      wordIndices,
      gel,
      scale: 2,
      makeColorForSpeaker: (speaker) => `color:${speaker}`,
      makeVector3: (x, y, z) => ({ x, y, z }),
      shouldEnableDemoSeed: () => false,
      applyDemoSeedVocabulary: () => 0,
      schedule: (fn, delay) => scheduled.push({ fn, delay }),
      log: () => {},
      warn: () => {}
    });
  });

  it('loads recent words and schedules background batches for large vocabularies', async () => {
    vocabularyStorage.loadVocabulary.mockReturnValue(new Array(200).fill(null));
    vocabularyStorage.loadRecentWords.mockReturnValue([
      buildWord('alpha', 'user', { x: 1, y: 2, z: 3 }),
      buildWord('beta', 'ai', { x: 4, y: 5, z: 6 })
    ]);
    vocabularyStorage.loadVocabularyBatch.mockReturnValue([
      buildWord('gamma', 'ai', { x: 7, y: 8, z: 9 })
    ]);

    await hydrator.loadExistingVocabulary();

    expect(gel.visible).toBe(true);
    expect(mesh.count).toBe(2);
    expect(labels[0]).toBe('alpha');
    expect(labels[1]).toBe('beta');
    expect(usedWords.has('alpha')).toBe(true);
    expect(usedWords.has('beta')).toBe(true);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBe(1000);

    await scheduled[0].fn();
    expect(vocabularyStorage.loadVocabularyBatch).toHaveBeenCalledTimes(1);
    expect(usedWords.has('gamma')).toBe(true);
  });

  it('supports empty vocabulary with demo seed enabled', async () => {
    vocabularyStorage.loadVocabulary
      .mockReturnValueOnce([])
      .mockReturnValueOnce(new Array(2).fill(null));
    vocabularyStorage.loadRecentWords.mockReturnValue([
      buildWord('seed-a', 'user'),
      buildWord('seed-b', 'ai')
    ]);

    const seededHydrator = new VocabularyHydrator({
      vocabularyStorage,
      usedWords,
      optimizer,
      mesh,
      labels,
      wordPositions,
      wordIndices,
      gel,
      scale: 2,
      makeColorForSpeaker: (speaker) => `color:${speaker}`,
      makeVector3: (x, y, z) => ({ x, y, z }),
      shouldEnableDemoSeed: () => true,
      applyDemoSeedVocabulary: () => 2,
      schedule: (fn, delay) => scheduled.push({ fn, delay }),
      log: () => {},
      warn: () => {}
    });

    await seededHydrator.loadExistingVocabulary();
    expect(mesh.count).toBe(2);
    expect(usedWords.has('seed-a')).toBe(true);
  });

  it('does nothing when vocabulary is empty and demo seed is disabled', async () => {
    vocabularyStorage.loadVocabulary.mockReturnValue([]);
    vocabularyStorage.loadRecentWords.mockReturnValue([]);

    await hydrator.loadExistingVocabulary();

    expect(mesh.count).toBe(0);
    expect(scheduled).toHaveLength(0);
    expect(vocabularyStorage.loadRecentWords).not.toHaveBeenCalled();
  });
});
