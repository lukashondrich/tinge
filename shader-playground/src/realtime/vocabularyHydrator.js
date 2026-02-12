import { createLogger } from '../utils/logger.js';

const logger = createLogger('vocabulary-hydrator');

export class VocabularyHydrator {
  constructor({
    vocabularyStorage,
    usedWords,
    optimizer,
    mesh,
    labels,
    wordPositions,
    wordIndices,
    gel,
    scale,
    makeColorForSpeaker,
    makeVector3,
    shouldEnableDemoSeed,
    applyDemoSeedVocabulary,
    schedule = setTimeout,
    log = (...args) => logger.log(...args),
    warn = (...args) => logger.warn(...args)
  }) {
    this.vocabularyStorage = vocabularyStorage;
    this.usedWords = usedWords;
    this.optimizer = optimizer;
    this.mesh = mesh;
    this.labels = labels;
    this.wordPositions = wordPositions;
    this.wordIndices = wordIndices;
    this.gel = gel;
    this.scale = scale;
    this.makeColorForSpeaker = makeColorForSpeaker;
    this.makeVector3 = makeVector3;
    this.shouldEnableDemoSeed = shouldEnableDemoSeed;
    this.applyDemoSeedVocabulary = applyDemoSeedVocabulary;
    this.schedule = schedule;
    this.log = log;
    this.warn = warn;

    this.totalVocabularySize = 0;
    this.loadedWordCount = 0;
    this.isLoadingBatch = false;
  }

  async loadExistingVocabulary() {
    this.log('📚 Loading vocabulary with performance optimization...');
    try {
      let fullVocabulary = this.vocabularyStorage.loadVocabulary();
      this.totalVocabularySize = fullVocabulary.length;

      if (this.totalVocabularySize === 0) {
        const demoEnabled = this.shouldEnableDemoSeed();
        if (demoEnabled) {
          const seededCount = this.applyDemoSeedVocabulary();
          this.log(`📚 Added ${seededCount} demo seed words for first-time experience`);
          fullVocabulary = this.vocabularyStorage.loadVocabulary();
          this.totalVocabularySize = fullVocabulary.length;
        } else {
          this.log('📚 No previous vocabulary found - starting fresh');
          return;
        }
      }

      this.log(`📚 Found ${this.totalVocabularySize} words total - using progressive loading`);
      const recentWords = this.vocabularyStorage.loadRecentWords(150);
      if (recentWords.length > 0) {
        this.gel.visible = true;
        await this.loadWordsToScene(recentWords);
        if (this.totalVocabularySize > 150) {
          this.schedule(() => this.loadOlderWordsBatch(), 1000);
        }
      }
    } catch (error) {
      this.warn('📚 Error loading vocabulary:', error);
    }
  }

  async loadWordsToScene(words) {
    for (const item of words) {
      try {
        const key = item.word.trim().toLowerCase();
        if (!this.usedWords.has(key)) {
          this.usedWords.add(key);
          this.optimizer.addPoint(item.position);
          const id = this.optimizer.getPositions().length - 1;
          this.mesh.count = id + 1;
          this.mesh.setColorAt(id, this.makeColorForSpeaker(item.speaker));
          this.labels[id] = item.word;
          const position = this.makeVector3(
            item.position.x * this.scale,
            item.position.y * this.scale,
            item.position.z * this.scale
          );
          this.wordPositions.set(key, position);
          this.wordIndices.set(key, id);
          this.log('📍 Loaded word position:', key, position, 'index:', id);
          this.loadedWordCount += 1;
        }
      } catch (error) {
        this.warn(`📚 Failed to restore word "${item.word}":`, error);
      }
    }

    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  async loadOlderWordsBatch() {
    if (this.isLoadingBatch || this.loadedWordCount >= this.totalVocabularySize) return;

    this.isLoadingBatch = true;
    try {
      const batchSize = 100;
      const remainingWords = this.totalVocabularySize - this.loadedWordCount;
      const wordsToLoad = Math.min(batchSize, remainingWords);
      const offset = Math.max(0, this.totalVocabularySize - 150 - wordsToLoad);
      const batch = this.vocabularyStorage.loadVocabularyBatch(offset, wordsToLoad);

      if (batch.length > 0) {
        await this.loadWordsToScene(batch);
        if (this.loadedWordCount < this.totalVocabularySize) {
          this.schedule(() => this.loadOlderWordsBatch(), 500);
        }
      }
    } catch (error) {
      this.warn('📚 Error loading vocabulary batch:', error);
    } finally {
      this.isLoadingBatch = false;
    }
  }
}
