import * as THREE from 'three';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('word-ingestion');

function randomPoint() {
  return {
    x: (Math.random() - 0.5) * 2,
    y: (Math.random() - 0.5) * 2,
    z: (Math.random() - 0.5) * 2
  };
}

export class WordIngestionService {
  constructor({
    bubbleManager,
    onWordClick,
    usedWords,
    optimizer,
    mesh,
    gel,
    recentlyAdded,
    labels,
    wordPositions,
    wordIndices,
    scale,
    vocabularyStorage,
    apiUrl,
    fetchImpl = (...args) => globalThis.fetch(...args),
    sleep = (delayMs) => new Promise((resolve) => globalThis.setTimeout(resolve, delayMs)),
    embeddingRetryAttempts = 3,
    embeddingRetryBaseDelayMs = 120,
    embeddingRetryMaxDelayMs = 1200,
    embeddingRequestTimeoutMs = 4000,
    maxWordLength = 128,
    embeddingFailureThreshold = 3,
    embeddingCircuitOpenMs = 5000,
    createAbortController = () => {
      if (typeof globalThis.AbortController !== 'function') {
        return null;
      }
      return new globalThis.AbortController();
    },
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    now = () => Date.now(),
    log = (...args) => logger.log(...args),
    warn = (...args) => logger.warn(...args),
    error = (...args) => logger.error(...args)
  }) {
    this.bubbleManager = bubbleManager;
    this.onWordClick = onWordClick;
    this.usedWords = usedWords;
    this.optimizer = optimizer;
    this.mesh = mesh;
    this.gel = gel;
    this.recentlyAdded = recentlyAdded;
    this.labels = labels;
    this.wordPositions = wordPositions;
    this.wordIndices = wordIndices;
    this.scale = scale;
    this.vocabularyStorage = vocabularyStorage;
    this.apiUrl = apiUrl;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.embeddingRetryAttempts = Math.max(1, Number(embeddingRetryAttempts) || 1);
    this.embeddingRetryBaseDelayMs = Math.max(0, Number(embeddingRetryBaseDelayMs) || 0);
    this.embeddingRetryMaxDelayMs = Math.max(
      this.embeddingRetryBaseDelayMs,
      Number(embeddingRetryMaxDelayMs) || this.embeddingRetryBaseDelayMs
    );
    this.embeddingRequestTimeoutMs = Math.max(0, Number(embeddingRequestTimeoutMs) || 0);
    this.maxWordLength = Math.max(1, Number(maxWordLength) || 1);
    this.embeddingFailureThreshold = Math.max(1, Number(embeddingFailureThreshold) || 1);
    this.embeddingCircuitOpenMs = Math.max(0, Number(embeddingCircuitOpenMs) || 0);
    this.createAbortController = createAbortController;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.now = now;
    this.log = log;
    this.warn = warn;
    this.error = error;

    this.embeddingFailureStreak = 0;
    this.embeddingCircuitOpenUntilMs = 0;
    this.embeddingStats = {
      retries: 0,
      timeouts: 0,
      fallbacks: 0,
      skippedWords: 0,
      oversizedWords: 0,
      circuitOpened: 0,
      circuitShortCircuits: 0,
      nonRetryableFailures: 0,
      malformedPayloads: 0,
      recoveries: 0,
      successes: 0
    };
  }

  async processWord(word, speaker = 'ai', options = {}) {
    try {
      if (typeof word !== 'string') {
        this.embeddingStats.skippedWords += 1;
        this.warn('Skipping non-string word ingestion payload');
        return;
      }

      const normalizedWord = word.trim();
      if (!normalizedWord) {
        this.embeddingStats.skippedWords += 1;
        this.warn('Skipping empty word ingestion payload');
        return;
      }
      if (normalizedWord.length > this.maxWordLength) {
        this.embeddingStats.skippedWords += 1;
        this.embeddingStats.oversizedWords += 1;
        this.warn(
          `Skipping oversized word ingestion payload (${normalizedWord.length} chars > ${this.maxWordLength})`
        );
        return;
      }

      if (!options.skipBubble) {
        this.bubbleManager.appendWord({
          speaker,
          word: normalizedWord,
          onWordClick: this.onWordClick
        });
      }

      const key = normalizedWord.toLowerCase();
      if (!this.usedWords.has(key)) {
        this.usedWords.add(key);
        const newPoint = await this._getPointForWord(normalizedWord);
        this._addWordToScene({ word: normalizedWord, speaker, key, newPoint });
      } else {
        this._ensureExistingWordTracking(key);
      }
    } catch (err) {
      this.error('Critical error in processWord for:', word, 'Error:', err);
      throw err;
    }
  }

  async _getPointForWord(word) {
    let newPoint = randomPoint();
    const embeddingPoint = await this._fetchEmbeddingPointWithRetry(word);

    if (embeddingPoint) {
      newPoint = embeddingPoint;
      this.log('Got embedding for word:', word, newPoint);
    } else {
      this.embeddingStats.fallbacks += 1;
      this.warn('Embedding service unavailable, using random fallback position for word:', word);
    }

    return newPoint;
  }

  async _fetchEmbeddingPointWithRetry(word) {
    if (this._isEmbeddingCircuitOpen()) {
      this.embeddingStats.circuitShortCircuits += 1;
      const remainingMs = Math.max(0, this.embeddingCircuitOpenUntilMs - this.now());
      this.warn(
        `Embedding circuit open; skipping request for "${word}" for ${remainingMs}ms`
      );
      return null;
    }

    const url = `${this.apiUrl}/embed-word?word=${encodeURIComponent(word)}`;
    let lastError = null;
    let attemptsMade = 0;
    let failureCountsTowardCircuit = true;

    for (let attempt = 1; attempt <= this.embeddingRetryAttempts; attempt += 1) {
      attemptsMade = attempt;
      let retryableFailure = true;
      try {
        const response = await this._fetchEmbeddingResponse(url);
        if (response.ok) {
          const data = await response.json();
          const embeddingPoint = this._parseEmbeddingPoint(data);
          if (embeddingPoint) {
            this.embeddingStats.successes += 1;
            this._markEmbeddingSuccess();
            return embeddingPoint;
          }

          lastError = new Error('Embedding response missing numeric coordinates');
          retryableFailure = false;
          failureCountsTowardCircuit = false;
          this.embeddingStats.malformedPayloads += 1;
          this.warn(
            `Embedding request for "${word}" returned malformed coordinates payload`
          );
        } else {
          lastError = new Error(`Embedding service responded with status ${response.status}`);
          retryableFailure = this._isRetryableResponseStatus(response.status);
          if (!retryableFailure) {
            failureCountsTowardCircuit = false;
            this.embeddingStats.nonRetryableFailures += 1;
            this.warn(
              `Embedding request for "${word}" failed with non-retryable status ${response.status}`
            );
          }
        }
      } catch (error) {
        lastError = error;
        if (error?.code === 'EMBED_TIMEOUT') {
          this.embeddingStats.timeouts += 1;
        }
      }

      if (!retryableFailure) {
        break;
      }

      if (attempt < this.embeddingRetryAttempts) {
        const delayMs = this._getRetryDelayMs(attempt);
        this.embeddingStats.retries += 1;
        this.warn(
          `Embedding request failed for "${word}" (attempt ${attempt}/${this.embeddingRetryAttempts}), retrying in ${delayMs}ms`
        );
        await this.sleep(delayMs);
      }
    }

    if (lastError) {
      this.warn(
        `Embedding unavailable after ${attemptsMade} attempts for "${word}"`,
        lastError?.message || lastError
      );
    }
    this._recordEmbeddingFailure({
      countsTowardCircuit: failureCountsTowardCircuit
    });
    return null;
  }

  _isRetryableResponseStatus(status) {
    return status === 408 || status === 429 || status >= 500;
  }

  async _fetchEmbeddingResponse(url) {
    if (this.embeddingRequestTimeoutMs <= 0) {
      return this.fetchImpl(url);
    }

    const abortController = this.createAbortController?.();
    if (!abortController?.signal || typeof abortController.abort !== 'function') {
      return this.fetchImpl(url);
    }

    let timedOut = false;
    const timer = this.schedule(() => {
      timedOut = true;
      abortController.abort();
    }, this.embeddingRequestTimeoutMs);

    try {
      return await this.fetchImpl(url, { signal: abortController.signal });
    } catch (error) {
      if (timedOut) {
        const timeoutError = new Error(
          `Embedding request timed out after ${this.embeddingRequestTimeoutMs}ms`
        );
        timeoutError.code = 'EMBED_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      this.clearScheduled(timer);
    }
  }

  _parseEmbeddingPoint(data) {
    const x = this._parseCoordinateValue(data?.x);
    const y = this._parseCoordinateValue(data?.y);
    const z = this._parseCoordinateValue(data?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    return { x, y, z };
  }

  _parseCoordinateValue(value) {
    if (value === null || value === undefined) {
      return Number.NaN;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (!trimmedValue) {
        return Number.NaN;
      }
      return Number(trimmedValue);
    }

    return Number.NaN;
  }

  _getRetryDelayMs(attempt) {
    const backoffDelayMs = this.embeddingRetryBaseDelayMs * (2 ** (attempt - 1));
    return Math.min(backoffDelayMs, this.embeddingRetryMaxDelayMs);
  }

  _isEmbeddingCircuitOpen() {
    if (this.embeddingCircuitOpenUntilMs <= 0) return false;

    if (this.now() >= this.embeddingCircuitOpenUntilMs) {
      this.embeddingCircuitOpenUntilMs = 0;
      return false;
    }

    return true;
  }

  _recordEmbeddingFailure({ countsTowardCircuit = true } = {}) {
    if (!countsTowardCircuit) {
      this.embeddingFailureStreak = 0;
      return;
    }

    this.embeddingFailureStreak += 1;
    if (this.embeddingFailureStreak < this.embeddingFailureThreshold) {
      return;
    }

    this.embeddingCircuitOpenUntilMs = this.now() + this.embeddingCircuitOpenMs;
    this.embeddingStats.circuitOpened += 1;
    this.warn(
      `Embedding circuit opened for ${this.embeddingCircuitOpenMs}ms after ${this.embeddingFailureStreak} consecutive failures`
    );
  }

  _markEmbeddingSuccess() {
    if (this.embeddingFailureStreak >= this.embeddingFailureThreshold || this.embeddingCircuitOpenUntilMs > 0) {
      this.embeddingStats.recoveries += 1;
    }
    this.embeddingFailureStreak = 0;
    this.embeddingCircuitOpenUntilMs = 0;
  }

  getEmbeddingHealthStats() {
    return {
      ...this.embeddingStats,
      failureStreak: this.embeddingFailureStreak,
      circuitOpenUntilMs: this.embeddingCircuitOpenUntilMs
    };
  }

  _addWordToScene({ word, speaker, key, newPoint }) {
    try {
      this.optimizer.addPoint(newPoint);
      const id = this.optimizer.getPositions().length - 1;
      this.mesh.count = id + 1;

      if (this.mesh.count === 1) {
        this.gel.visible = true;
      }

      const colour = speaker === 'user'
        ? new THREE.Color('#69ea4f')
        : new THREE.Color(0x5a005a);

      this.mesh.setColorAt(id, colour);
      this.mesh.instanceColor.needsUpdate = true;
      this.recentlyAdded.set(id, performance.now());
      this.labels[id] = word;

      const position = new THREE.Vector3(
        newPoint.x * this.scale,
        newPoint.y * this.scale,
        newPoint.z * this.scale
      );
      this.wordPositions.set(key, position);
      this.wordIndices.set(key, id);
      this.log('📍 Tracked word position:', key, position, 'index:', id);

      this.vocabularyStorage.saveWord(word, newPoint, speaker);
    } catch (err) {
      this.error('Error adding point to 3D scene for word:', word, 'Error:', err);
    }
  }

  _ensureExistingWordTracking(key) {
    if (this.wordIndices.has(key)) return;

    for (let i = 0; i < this.labels.length; i++) {
      if (this.labels[i] && this.labels[i].toLowerCase() === key) {
        this.wordIndices.set(key, i);
        const optimizedPositions = this.optimizer.getPositions();
        if (optimizedPositions[i]) {
          const position = new THREE.Vector3(
            optimizedPositions[i].x * this.scale,
            optimizedPositions[i].y * this.scale,
            optimizedPositions[i].z * this.scale
          );
          this.wordPositions.set(key, position);
        }
        this.log('📍 Found existing word index:', key, 'index:', i);
        break;
      }
    }
  }
}
