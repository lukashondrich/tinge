/**
 * Vocabulary Storage System
 * 
 * Manages persistence of spoken words, their positions, and language detection data
 * across sessions so users can continue where they left off with their vocabulary visualization
 */

export class VocabularyStorage {
  constructor() {
    this.storageKey = 'tinge-vocabulary';
    this.maxWords = 5000; // Increased limit for larger vocabulary
    this.languageCacheKey = 'tinge-language-cache';
    this.maxCacheSize = 1000; // Cache for language detection results
  }

  /**
   * Load vocabulary from localStorage
   * @returns {Array} Array of {word, position: {x, y, z}, timestamp, speaker, language?} objects
   */
  loadVocabulary() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return [];
      
      const vocabulary = JSON.parse(stored);
      console.log(`📚 Loaded ${vocabulary.length} words from vocabulary storage`);
      return vocabulary;
    } catch (error) {
      console.warn('Failed to load vocabulary from localStorage:', error);
      return [];
    }
  }

  /**
   * Load recent words for fast startup (performance optimization)
   * @param {number} count - Number of recent words to load
   * @returns {Array} Most recent words
   */
  loadRecentWords(count = 100) {
    try {
      const vocabulary = this.loadVocabulary();
      const recent = vocabulary.slice(-count);
      console.log(`📚 Loaded ${recent.length} recent words for fast startup`);
      return recent;
    } catch (error) {
      console.warn('Failed to load recent vocabulary:', error);
      return [];
    }
  }

  /**
   * Load words in batches for progressive loading
   * @param {number} offset - Starting index
   * @param {number} limit - Number of words to load
   * @returns {Array} Batch of words
   */
  loadVocabularyBatch(offset = 0, limit = 100) {
    try {
      const vocabulary = this.loadVocabulary();
      const batch = vocabulary.slice(offset, offset + limit);
      console.log(`📚 Loaded batch: ${batch.length} words (${offset}-${offset + limit})`);
      return batch;
    } catch (error) {
      console.warn('Failed to load vocabulary batch:', error);
      return [];
    }
  }

  /**
   * Save a new word to vocabulary
   * @param {string} word - The spoken word
   * @param {Object} position - {x, y, z} position
   * @param {string} speaker - 'user' or 'ai'
   * @param {Object} language - Optional language detection data {detected, confidence, source}
   */
  saveWord(word, position, speaker = 'ai', language = null) {
    try {
      const vocabulary = this.loadVocabulary();
      const key = word.trim().toLowerCase();
      
      // Check if word already exists
      const existingIndex = vocabulary.findIndex(item => item.word.toLowerCase() === key);
      
      if (existingIndex >= 0) {
        // Update existing word with new position and timestamp
        const updatedWord = {
          word: word,
          position: position,
          speaker: speaker,
          timestamp: Date.now()
        };
        // Add language data if provided
        if (language) {
          updatedWord.language = language;
        }
        vocabulary[existingIndex] = updatedWord;
      } else {
        // Add new word
        const newWord = {
          word: word,
          position: position,
          speaker: speaker,
          timestamp: Date.now()
        };
        // Add language data if provided
        if (language) {
          newWord.language = language;
        }
        vocabulary.push(newWord);
        
        // Limit vocabulary size to prevent localStorage bloat
        if (vocabulary.length > this.maxWords) {
          // Remove oldest words
          vocabulary.sort((a, b) => b.timestamp - a.timestamp);
          vocabulary.splice(this.maxWords);
        }
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(vocabulary));
      console.log(`💾 Saved word "${word}" to vocabulary storage`);
      
    } catch (error) {
      console.warn('Failed to save word to vocabulary storage:', error);
    }
  }

  /**
   * Load language detection cache from localStorage
   * @returns {Object} Cache of word -> language detection results
   */
  loadLanguageCache() {
    try {
      const stored = localStorage.getItem(this.languageCacheKey);
      if (!stored) return {};
      return JSON.parse(stored);
    } catch (error) {
      console.warn('Failed to load language cache:', error);
      return {};
    }
  }

  /**
   * Save language detection result to cache
   * @param {string} word - The word to cache
   * @param {Object} languageData - Language detection result
   */
  cacheLanguageDetection(word, languageData) {
    try {
      const cache = this.loadLanguageCache();
      const key = word.trim().toLowerCase();
      cache[key] = {
        ...languageData,
        cachedAt: Date.now()
      };
      
      // Limit cache size
      const cacheEntries = Object.entries(cache);
      if (cacheEntries.length > this.maxCacheSize) {
        // Remove oldest entries
        const sorted = cacheEntries.sort((a, b) => (b[1].cachedAt || 0) - (a[1].cachedAt || 0));
        const trimmed = Object.fromEntries(sorted.slice(0, this.maxCacheSize));
        localStorage.setItem(this.languageCacheKey, JSON.stringify(trimmed));
      } else {
        localStorage.setItem(this.languageCacheKey, JSON.stringify(cache));
      }
      
      console.log(`🗂️ Cached language detection for: ${word}`);
    } catch (error) {
      console.warn('Failed to cache language detection:', error);
    }
  }

  /**
   * Get cached language detection for a word
   * @param {string} word - The word to look up
   * @returns {Object|null} Cached language data or null
   */
  getCachedLanguageDetection(word) {
    try {
      const cache = this.loadLanguageCache();
      const key = word.trim().toLowerCase();
      return cache[key] || null;
    } catch (error) {
      console.warn('Failed to get cached language detection:', error);
      return null;
    }
  }

  /**
   * Get vocabulary statistics
   * @returns {Object} Statistics about stored vocabulary
   */
  getStats() {
    const vocabulary = this.loadVocabulary();
    const userWords = vocabulary.filter(item => item.speaker === 'user').length;
    const aiWords = vocabulary.filter(item => item.speaker === 'ai').length;
    
    // Language statistics
    const languageStats = {};
    vocabulary.forEach(item => {
      if (item.language && item.language.detected) {
        const lang = item.language.detected;
        languageStats[lang] = (languageStats[lang] || 0) + 1;
      }
    });
    
    return {
      total: vocabulary.length,
      userWords,
      aiWords,
      maxWords: this.maxWords,
      languages: languageStats
    };
  }

  /**
   * Clear all vocabulary (useful for reset)
   */
  clearVocabulary() {
    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem(this.languageCacheKey);
      console.log('🗑️ Vocabulary storage and language cache cleared');
    } catch (error) {
      console.warn('Failed to clear vocabulary storage:', error);
    }
  }

  /**
   * Export vocabulary as JSON string
   * @returns {string} JSON string of vocabulary
   */
  exportVocabulary() {
    const vocabulary = this.loadVocabulary();
    return JSON.stringify(vocabulary, null, 2);
  }

  /**
   * Import vocabulary from JSON string
   * @param {string} jsonString - JSON string of vocabulary data
   */
  importVocabulary(jsonString) {
    try {
      const vocabulary = JSON.parse(jsonString);
      localStorage.setItem(this.storageKey, JSON.stringify(vocabulary));
      console.log(`📥 Imported ${vocabulary.length} words to vocabulary storage`);
    } catch (error) {
      console.warn('Failed to import vocabulary:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const vocabularyStorage = new VocabularyStorage();