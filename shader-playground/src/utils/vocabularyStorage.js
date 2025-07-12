/**
 * Vocabulary Storage System
 * 
 * Manages persistence of spoken words and their positions across sessions
 * so users can continue where they left off with their vocabulary visualization
 */

export class VocabularyStorage {
  constructor() {
    this.storageKey = 'tinge-vocabulary';
    this.maxWords = 500; // Prevent localStorage from growing too large
  }

  /**
   * Load vocabulary from localStorage
   * @returns {Array} Array of {word, position: {x, y, z}, timestamp, speaker} objects
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
   * Save a new word to vocabulary
   * @param {string} word - The spoken word
   * @param {Object} position - {x, y, z} position
   * @param {string} speaker - 'user' or 'ai'
   */
  saveWord(word, position, speaker = 'ai') {
    try {
      const vocabulary = this.loadVocabulary();
      const key = word.trim().toLowerCase();
      
      // Check if word already exists
      const existingIndex = vocabulary.findIndex(item => item.word.toLowerCase() === key);
      
      if (existingIndex >= 0) {
        // Update existing word with new position and timestamp
        vocabulary[existingIndex] = {
          word: word,
          position: position,
          speaker: speaker,
          timestamp: Date.now()
        };
      } else {
        // Add new word
        vocabulary.push({
          word: word,
          position: position,
          speaker: speaker,
          timestamp: Date.now()
        });
        
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
   * Get vocabulary statistics
   * @returns {Object} Statistics about stored vocabulary
   */
  getStats() {
    const vocabulary = this.loadVocabulary();
    const userWords = vocabulary.filter(item => item.speaker === 'user').length;
    const aiWords = vocabulary.filter(item => item.speaker === 'ai').length;
    
    return {
      total: vocabulary.length,
      userWords,
      aiWords,
      maxWords: this.maxWords
    };
  }

  /**
   * Clear all vocabulary (useful for reset)
   */
  clearVocabulary() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('🗑️ Vocabulary storage cleared');
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