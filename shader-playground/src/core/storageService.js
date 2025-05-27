// src/core/storageService.js
import Dexie from 'dexie';

// Initialize IndexedDB via Dexie
const db = new Dexie('LangAppDB');
// Define the schema for utterances
// We store: id (PK), speaker, timestamp, text, and the raw audioBlob
// Dexie will handle Blob serialization automatically
db.version(1).stores({
  utterances: 'id, speaker, timestamp, text'
});

export const StorageService = {
  /**
   * Add or update an utterance record
   * @param {{id: string, speaker: string, timestamp: number, text: string, audioBlob: Blob}} utterance
   */
  async addUtterance(utterance) {
    await db.utterances.put(utterance);
    console.log('🔖 Utterance saved to IndexedDB:', utterance);
  },

  /**
   * Retrieve all utterances, ordered by timestamp asc
   * @returns {Promise<Array<{id: string, speaker: string, timestamp: number, text: string, audioBlob: Blob}>>}
   */
  async getUtterances() {
    const all = await db.utterances.orderBy('timestamp').toArray();
    console.log('📂 Loaded utterances from IndexedDB:', all);
    return all;
  }
};

// Expose for console debugging
if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
}

