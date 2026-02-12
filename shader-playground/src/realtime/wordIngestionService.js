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
    this.log = log;
    this.warn = warn;
    this.error = error;
  }

  async processWord(word, speaker = 'ai', options = {}) {
    try {
      if (!options.skipBubble) {
        this.bubbleManager.appendWord({ speaker, word, onWordClick: this.onWordClick });
      }

      const key = word.trim().toLowerCase();
      if (!this.usedWords.has(key)) {
        this.usedWords.add(key);
        const newPoint = await this._getPointForWord(word);
        this._addWordToScene({ word, speaker, key, newPoint });
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
    try {
      const res = await fetch(`${this.apiUrl}/embed-word?word=${encodeURIComponent(word)}`);
      if (res.ok) {
        const data = await res.json();
        newPoint = { x: data.x, y: data.y, z: data.z };
        this.log('Got embedding for word:', word, newPoint);
      } else {
        this.warn('Embedding service unavailable, using random position for word:', word);
      }
    } catch (err) {
      this.warn('Embedding service unavailable, using random fallback position for word:', word, err.message);
    }
    return newPoint;
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
