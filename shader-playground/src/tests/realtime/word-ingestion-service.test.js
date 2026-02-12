import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WordIngestionService } from '../../realtime/wordIngestionService.js';

describe('WordIngestionService', () => {
  let bubbleManager;
  let usedWords;
  let positions;
  let optimizer;
  let mesh;
  let gel;
  let recentlyAdded;
  let labels;
  let wordPositions;
  let wordIndices;
  let vocabularyStorage;
  let service;

  beforeEach(() => {
    bubbleManager = {
      appendWord: vi.fn()
    };
    usedWords = new Set();
    positions = [];
    optimizer = {
      addPoint: vi.fn((point) => {
        positions.push(point);
      }),
      getPositions: vi.fn(() => positions)
    };
    mesh = {
      count: 0,
      setColorAt: vi.fn(),
      instanceColor: {
        needsUpdate: false
      }
    };
    gel = { visible: false };
    recentlyAdded = new Map();
    labels = [];
    wordPositions = new Map();
    wordIndices = new Map();
    vocabularyStorage = {
      saveWord: vi.fn()
    };

    service = new WordIngestionService({
      bubbleManager,
      onWordClick: () => {},
      usedWords,
      optimizer,
      mesh,
      gel,
      recentlyAdded,
      labels,
      wordPositions,
      wordIndices,
      scale: 2,
      vocabularyStorage,
      apiUrl: 'http://api.local'
    });
  });

  it('adds new word to bubble, embedding, scene, and storage', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ x: 1, y: 2, z: 3 })
    }));

    await service.processWord('Hello', 'user', {});

    expect(bubbleManager.appendWord).toHaveBeenCalledTimes(1);
    expect(usedWords.has('hello')).toBe(true);
    expect(optimizer.addPoint).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
    expect(mesh.count).toBe(1);
    expect(gel.visible).toBe(true);
    expect(labels[0]).toBe('Hello');
    expect(wordIndices.get('hello')).toBe(0);
    expect(mesh.instanceColor.needsUpdate).toBe(true);
    expect(recentlyAdded.has(0)).toBe(true);
    expect(vocabularyStorage.saveWord).toHaveBeenCalledWith('Hello', { x: 1, y: 2, z: 3 }, 'user');

    const tracked = wordPositions.get('hello');
    expect(tracked.x).toBe(2);
    expect(tracked.y).toBe(4);
    expect(tracked.z).toBe(6);
  });

  it('respects skipBubble option', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ x: 0.1, y: 0.2, z: 0.3 })
    }));

    await service.processWord('NoBubble', 'ai', { skipBubble: true });
    expect(bubbleManager.appendWord).not.toHaveBeenCalled();
  });

  it('tracks existing duplicate word when index is missing', async () => {
    usedWords.add('repeat');
    labels[3] = 'repeat';
    positions[3] = { x: 4, y: 5, z: 6 };
    globalThis.fetch = vi.fn();

    await service.processWord('repeat', 'ai', { skipBubble: true });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(wordIndices.get('repeat')).toBe(3);
    const tracked = wordPositions.get('repeat');
    expect(tracked.x).toBe(8);
    expect(tracked.y).toBe(10);
    expect(tracked.z).toBe(12);
  });
});
