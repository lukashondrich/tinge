import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('ignores empty or whitespace-only words', async () => {
    const fetchImpl = vi.fn();

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
      apiUrl: 'http://api.local',
      fetchImpl
    });

    await service.processWord('   ', 'ai', {});
    await service.processWord('', 'ai', {});

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(bubbleManager.appendWord).not.toHaveBeenCalled();
    expect(optimizer.addPoint).not.toHaveBeenCalled();
    expect(usedWords.size).toBe(0);
    expect(mesh.count).toBe(0);
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      skippedWords: 2
    }));
  });

  it('ignores non-string word payloads', async () => {
    const fetchImpl = vi.fn();

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
      apiUrl: 'http://api.local',
      fetchImpl
    });

    await service.processWord(null, 'ai', {});
    await service.processWord(123, 'ai', {});
    await service.processWord({ token: 'bad' }, 'ai', {});

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(bubbleManager.appendWord).not.toHaveBeenCalled();
    expect(optimizer.addPoint).not.toHaveBeenCalled();
    expect(usedWords.size).toBe(0);
    expect(mesh.count).toBe(0);
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      skippedWords: 3
    }));
  });

  it('ignores oversized word payloads', async () => {
    const fetchImpl = vi.fn();
    const oversizedWord = 'x'.repeat(130);

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
      apiUrl: 'http://api.local',
      fetchImpl,
      maxWordLength: 128
    });

    await service.processWord(oversizedWord, 'ai', {});

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(bubbleManager.appendWord).not.toHaveBeenCalled();
    expect(optimizer.addPoint).not.toHaveBeenCalled();
    expect(usedWords.size).toBe(0);
    expect(mesh.count).toBe(0);
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      skippedWords: 1,
      oversizedWords: 1
    }));
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

  it('retries embedding requests with backoff and eventually succeeds', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ x: 9, y: 8, z: 7 })
      });
    const sleep = vi.fn(async () => {});

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      embeddingRetryAttempts: 3,
      embeddingRetryBaseDelayMs: 10,
      embeddingRetryMaxDelayMs: 25
    });

    await service.processWord('RetryWord', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0][0]).toBe(10);
    expect(sleep.mock.calls[1][0]).toBe(20);
    expect(optimizer.addPoint).toHaveBeenCalledWith({ x: 9, y: 8, z: 7 });
  });

  it('falls back to random point after retries are exhausted', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('service unavailable'))
      .mockResolvedValueOnce({ ok: false, status: 502 });
    const sleep = vi.fn(async () => {});
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.5);

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      embeddingRetryAttempts: 2,
      embeddingRetryBaseDelayMs: 5
    });

    await service.processWord('FallbackWord', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(5);
    expect(positions[0].x).toBeCloseTo(0.2, 8);
    expect(positions[0].y).toBeCloseTo(-0.2, 8);
    expect(positions[0].z).toBeCloseTo(0, 8);
  });

  it('opens circuit after consecutive failures and short-circuits subsequent requests', async () => {
    const nowMs = 100;
    const fetchImpl = vi.fn(async () => {
      throw new Error('outage');
    });
    const sleep = vi.fn(async () => {});

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      now: () => nowMs,
      embeddingRetryAttempts: 1,
      embeddingFailureThreshold: 2,
      embeddingCircuitOpenMs: 1000
    });

    await service.processWord('one', 'ai', { skipBubble: true });
    await service.processWord('two', 'ai', { skipBubble: true });
    await service.processWord('three', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const stats = service.getEmbeddingHealthStats();
    expect(stats.circuitOpened).toBe(1);
    expect(stats.circuitShortCircuits).toBe(1);
    expect(stats.failureStreak).toBe(2);
    expect(stats.circuitOpenUntilMs).toBe(1100);
  });

  it('recovers after circuit cooldown and resets failure state on success', async () => {
    let nowMs = 0;
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ x: 3, y: 2, z: 1 })
      });
    const sleep = vi.fn(async () => {});

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      now: () => nowMs,
      embeddingRetryAttempts: 1,
      embeddingFailureThreshold: 1,
      embeddingCircuitOpenMs: 500
    });

    await service.processWord('fail-open', 'ai', { skipBubble: true });

    nowMs = 100;
    await service.processWord('fail-fast', 'ai', { skipBubble: true });

    nowMs = 700;
    await service.processWord('recover', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(optimizer.addPoint).toHaveBeenLastCalledWith({ x: 3, y: 2, z: 1 });

    const stats = service.getEmbeddingHealthStats();
    expect(stats.circuitOpened).toBe(1);
    expect(stats.circuitShortCircuits).toBe(1);
    expect(stats.recoveries).toBe(1);
    expect(stats.failureStreak).toBe(0);
    expect(stats.circuitOpenUntilMs).toBe(0);
  });

  it('does not retry non-retryable embedding response status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400 }));
    const sleep = vi.fn(async () => {});
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.75)
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0.5);

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      embeddingRetryAttempts: 3,
      embeddingRetryBaseDelayMs: 10
    });

    await service.processWord('BadRequestWord', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(positions[0].x).toBeCloseTo(0.5, 8);
    expect(positions[0].y).toBeCloseTo(-0.5, 8);
    expect(positions[0].z).toBeCloseTo(0, 8);
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      failureStreak: 0,
      circuitOpened: 0,
      circuitShortCircuits: 0,
      nonRetryableFailures: 1
    }));
  });

  it('retries transient 429 responses before succeeding', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ x: 4, y: 5, z: 6 })
      });
    const sleep = vi.fn(async () => {});

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      embeddingRetryAttempts: 3,
      embeddingRetryBaseDelayMs: 15
    });

    await service.processWord('RateLimitedWord', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(15);
    expect(optimizer.addPoint).toHaveBeenCalledWith({ x: 4, y: 5, z: 6 });
  });

  it('retries after embedding request timeout and records timeout stats', async () => {
    let attempt = 0;
    const fetchImpl = vi.fn((_url, options = {}) => {
      attempt += 1;
      if (attempt === 1) {
        return new Promise((resolve, reject) => {
          if (options.signal?.aborted) {
            reject(new Error('aborted'));
            return;
          }
          options.signal?.addEventListener?.('abort', () => reject(new Error('aborted')));
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ x: 2, y: 4, z: 6 })
      });
    });
    const sleep = vi.fn(async () => {});
    const createAbortController = () => {
      let aborted = false;
      const listeners = [];
      return {
        signal: {
          get aborted() {
            return aborted;
          },
          addEventListener: (type, handler) => {
            if (type === 'abort') {
              listeners.push(handler);
            }
          }
        },
        abort: () => {
          aborted = true;
          listeners.forEach((handler) => handler());
        }
      };
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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      embeddingRetryAttempts: 2,
      embeddingRetryBaseDelayMs: 12,
      embeddingRequestTimeoutMs: 1,
      createAbortController,
      schedule: (fn) => {
        fn();
        return 1;
      },
      clearScheduled: () => {}
    });

    await service.processWord('TimeoutWord', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(12);
    expect(optimizer.addPoint).toHaveBeenCalledWith({ x: 2, y: 4, z: 6 });
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      retries: 1,
      timeouts: 1,
      successes: 1,
      fallbacks: 0
    }));
  });

  it('fails fast on malformed embedding payload even with 200 response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ x: 1, y: 'bad', z: 3 })
    }));
    const sleep = vi.fn(async () => {});
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.2);

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      embeddingRetryAttempts: 3,
      embeddingRetryBaseDelayMs: 10
    });

    await service.processWord('MalformedWord', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(positions[0].x).toBeCloseTo(0.4, 8);
    expect(positions[0].y).toBeCloseTo(-0.2, 8);
    expect(positions[0].z).toBeCloseTo(-0.6, 8);
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      failureStreak: 0,
      circuitOpened: 0,
      circuitShortCircuits: 0,
      malformedPayloads: 1
    }));
  });

  it('treats null embedding coordinates as malformed payload', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ x: 1, y: null, z: 3 })
    }));
    const sleep = vi.fn(async () => {});
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.55)
      .mockReturnValueOnce(0.45)
      .mockReturnValueOnce(0.65);

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep
    });

    await service.processWord('NullCoordWord', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      malformedPayloads: 1,
      failureStreak: 0
    }));
  });

  it('treats empty-string embedding coordinates as malformed payload', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ x: '1', y: '', z: '3' })
    }));
    const sleep = vi.fn(async () => {});

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep
    });

    await service.processWord('EmptyStringCoordWord', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      malformedPayloads: 1,
      failureStreak: 0
    }));
  });

  it('accepts numeric string embedding payload values', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ x: '1.5', y: '2', z: '-3.25' })
    }));

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
      apiUrl: 'http://api.local',
      fetchImpl
    });

    await service.processWord('NumericStringWord', 'ai', { skipBubble: true });

    expect(optimizer.addPoint).toHaveBeenCalledWith({ x: 1.5, y: 2, z: -3.25 });
  });

  it('does not open circuit for repeated non-retryable responses', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400 }));
    const sleep = vi.fn(async () => {});

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
      apiUrl: 'http://api.local',
      fetchImpl,
      sleep,
      embeddingRetryAttempts: 2,
      embeddingFailureThreshold: 2,
      embeddingCircuitOpenMs: 1000
    });

    await service.processWord('bad-1', 'ai', { skipBubble: true });
    await service.processWord('bad-2', 'ai', { skipBubble: true });
    await service.processWord('bad-3', 'ai', { skipBubble: true });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).not.toHaveBeenCalled();
    expect(service.getEmbeddingHealthStats()).toEqual(expect.objectContaining({
      failureStreak: 0,
      circuitOpened: 0,
      circuitShortCircuits: 0,
      nonRetryableFailures: 3
    }));
  });
});
