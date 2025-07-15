const { describe, test, expect, beforeEach, beforeAll, afterAll } = require('@jest/globals');
const { JSDOM } = require('jsdom');

// Mock DOM environment
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="app"></div>
    </body>
  </html>
`);

global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;

// Mock IndexedDB
let mockDB;
let mockTransaction;
let mockObjectStore;

beforeEach(() => {
  // Create fresh mock instances for each test
  mockObjectStore = {
    add: jest.fn(() => ({ onsuccess: null, onerror: null })),
    get: jest.fn(() => ({ onsuccess: null, onerror: null, result: null })),
    put: jest.fn(() => ({ onsuccess: null, onerror: null })),
    delete: jest.fn(() => ({ onsuccess: null, onerror: null })),
    getAll: jest.fn(() => ({ onsuccess: null, onerror: null, result: [] })),
    createIndex: jest.fn(),
    count: jest.fn(() => ({ onsuccess: null, onerror: null, result: 0 }))
  };

  mockTransaction = {
    objectStore: jest.fn(() => mockObjectStore),
    oncomplete: null,
    onerror: null,
    onabort: null
  };

  mockDB = {
    transaction: jest.fn(() => mockTransaction),
    createObjectStore: jest.fn(() => mockObjectStore),
    deleteObjectStore: jest.fn(),
    close: jest.fn(),
    version: 1,
    objectStoreNames: ['utterances']
  };

  const mockOpenRequest = {
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: mockDB
  };

  Object.defineProperty(global, 'indexedDB', {
    value: {
      open: jest.fn(() => mockOpenRequest),
      deleteDatabase: jest.fn()
    },
    writable: true
  });
});

// Mock URL.createObjectURL
Object.defineProperty(global.URL, 'createObjectURL', {
  value: jest.fn(() => 'blob:mock-url'),
  writable: true
});

// Mock crypto.randomUUID
Object.defineProperty(global.crypto, 'randomUUID', {
  value: jest.fn(() => 'mock-uuid-1234'),
  writable: true
});

describe('Utterance Storage Integration Tests', () => {
  beforeAll(() => {
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('StorageService Implementation', () => {
    // Mock implementation of StorageService
    const StorageService = {
      dbName: 'VoicePlaygroundDB',
      version: 1,
      db: null,

      async init() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(this.dbName, this.version);
          
          request.onsuccess = () => {
            this.db = request.result;
            resolve();
          };
          
          request.onerror = () => {
            reject(request.error);
          };
          
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('utterances')) {
              const store = db.createObjectStore('utterances', { keyPath: 'id' });
              store.createIndex('timestamp', 'timestamp');
              store.createIndex('speaker', 'speaker');
            }
          };
        });
      },

      async addUtterance(utterance) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['utterances'], 'readwrite');
          const store = transaction.objectStore('utterances');
          const request = store.add(utterance);
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      },

      async getUtterance(id) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['utterances'], 'readonly');
          const store = transaction.objectStore('utterances');
          const request = store.get(id);
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      },

      async getAllUtterances() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['utterances'], 'readonly');
          const store = transaction.objectStore('utterances');
          const request = store.getAll();
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      },

      async deleteUtterance(id) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['utterances'], 'readwrite');
          const store = transaction.objectStore('utterances');
          const request = store.delete(id);
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      },

      async getUtteranceCount() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['utterances'], 'readonly');
          const store = transaction.objectStore('utterances');
          const request = store.count();
          
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
    };

    test('should initialize database successfully', async () => {
      const initPromise = StorageService.init();
      
      // Simulate successful database opening
      const openRequest = indexedDB.open();
      openRequest.onsuccess();
      
      await initPromise;
      
      expect(indexedDB.open).toHaveBeenCalledWith('VoicePlaygroundDB', 1);
      expect(StorageService.db).toBe(mockDB);
    });

    test('should handle database upgrade', async () => {
      const initPromise = StorageService.init();
      
      // Simulate database upgrade
      const openRequest = indexedDB.open();
      const upgradeEvent = {
        target: { result: mockDB }
      };
      openRequest.onupgradeneeded(upgradeEvent);
      
      expect(mockDB.createObjectStore).toHaveBeenCalledWith('utterances', { keyPath: 'id' });
      expect(mockObjectStore.createIndex).toHaveBeenCalledWith('timestamp', 'timestamp');
      expect(mockObjectStore.createIndex).toHaveBeenCalledWith('speaker', 'speaker');
      
      openRequest.onsuccess();
      await initPromise;
    });

    test('should add utterance successfully', async () => {
      const mockUtterance = {
        id: 'test-utterance-1',
        speaker: 'user',
        timestamp: Date.now(),
        text: 'Hello world',
        audioBlob: new Blob(['mock audio data'], { type: 'audio/webm' })
      };

      // Initialize storage first
      StorageService.db = mockDB;
      
      const addPromise = StorageService.addUtterance(mockUtterance);
      
      // Simulate successful add
      const addRequest = mockObjectStore.add();
      addRequest.onsuccess();
      
      await addPromise;
      
      expect(mockDB.transaction).toHaveBeenCalledWith(['utterances'], 'readwrite');
      expect(mockTransaction.objectStore).toHaveBeenCalledWith('utterances');
      expect(mockObjectStore.add).toHaveBeenCalledWith(mockUtterance);
    });

    test('should retrieve utterance by ID', async () => {
      const testId = 'test-utterance-1';
      const mockUtterance = {
        id: testId,
        speaker: 'user',
        text: 'Hello world'
      };

      StorageService.db = mockDB;
      
      const getPromise = StorageService.getUtterance(testId);
      
      // Simulate successful retrieval
      const getRequest = mockObjectStore.get();
      getRequest.result = mockUtterance;
      getRequest.onsuccess();
      
      const result = await getPromise;
      
      expect(mockDB.transaction).toHaveBeenCalledWith(['utterances'], 'readonly');
      expect(mockObjectStore.get).toHaveBeenCalledWith(testId);
      expect(result).toBe(mockUtterance);
    });

    test('should retrieve all utterances', async () => {
      const mockUtterances = [
        { id: 'utterance-1', speaker: 'user', text: 'Hello' },
        { id: 'utterance-2', speaker: 'ai', text: 'Hi there' }
      ];

      StorageService.db = mockDB;
      
      const getAllPromise = StorageService.getAllUtterances();
      
      // Simulate successful retrieval
      const getAllRequest = mockObjectStore.getAll();
      getAllRequest.result = mockUtterances;
      getAllRequest.onsuccess();
      
      const result = await getAllPromise;
      
      expect(mockObjectStore.getAll).toHaveBeenCalled();
      expect(result).toBe(mockUtterances);
    });

    test('should delete utterance successfully', async () => {
      const testId = 'test-utterance-1';

      StorageService.db = mockDB;
      
      const deletePromise = StorageService.deleteUtterance(testId);
      
      // Simulate successful deletion
      const deleteRequest = mockObjectStore.delete();
      deleteRequest.onsuccess();
      
      await deletePromise;
      
      expect(mockDB.transaction).toHaveBeenCalledWith(['utterances'], 'readwrite');
      expect(mockObjectStore.delete).toHaveBeenCalledWith(testId);
    });

    test('should get utterance count', async () => {
      const expectedCount = 5;

      StorageService.db = mockDB;
      
      const countPromise = StorageService.getUtteranceCount();
      
      // Simulate successful count
      const countRequest = mockObjectStore.count();
      countRequest.result = expectedCount;
      countRequest.onsuccess();
      
      const result = await countPromise;
      
      expect(mockObjectStore.count).toHaveBeenCalled();
      expect(result).toBe(expectedCount);
    });
  });

  describe('Audio Blob Storage', () => {
    test('should store audio blob with utterance', async () => {
      const audioData = new ArrayBuffer(1024);
      const audioBlob = new Blob([audioData], { type: 'audio/webm' });
      
      const utterance = {
        id: 'test-with-audio',
        speaker: 'user',
        timestamp: Date.now(),
        text: 'Test with audio',
        audioBlob: audioBlob
      };

      StorageService.db = mockDB;
      
      const addPromise = StorageService.addUtterance(utterance);
      
      // Simulate successful add
      const addRequest = mockObjectStore.add();
      addRequest.onsuccess();
      
      await addPromise;
      
      expect(mockObjectStore.add).toHaveBeenCalledWith(utterance);
      
      // Verify audio blob is included
      const storedUtterance = mockObjectStore.add.mock.calls[0][0];
      expect(storedUtterance.audioBlob).toBe(audioBlob);
      expect(storedUtterance.audioBlob.type).toBe('audio/webm');
    });

    test('should handle large audio blobs', async () => {
      // Create a large audio blob (1MB)
      const largeAudioData = new ArrayBuffer(1024 * 1024);
      const largeAudioBlob = new Blob([largeAudioData], { type: 'audio/webm' });
      
      const utterance = {
        id: 'test-large-audio',
        speaker: 'user',
        timestamp: Date.now(),
        text: 'Test with large audio',
        audioBlob: largeAudioBlob
      };

      StorageService.db = mockDB;
      
      const addPromise = StorageService.addUtterance(utterance);
      
      // Simulate successful add
      const addRequest = mockObjectStore.add();
      addRequest.onsuccess();
      
      await addPromise;
      
      expect(mockObjectStore.add).toHaveBeenCalledWith(utterance);
      
      // Verify large audio blob is handled
      const storedUtterance = mockObjectStore.add.mock.calls[0][0];
      expect(storedUtterance.audioBlob.size).toBe(1024 * 1024);
    });
  });

  describe('Storage Error Handling', () => {
    test('should handle database initialization failures', async () => {
      const initPromise = StorageService.init();
      
      // Simulate database opening failure
      const openRequest = indexedDB.open();
      openRequest.error = new Error('Database initialization failed');
      openRequest.onerror();
      
      await expect(initPromise).rejects.toThrow('Database initialization failed');
    });

    test('should handle add operation failures', async () => {
      const mockUtterance = {
        id: 'test-utterance-1',
        speaker: 'user',
        text: 'Hello world'
      };

      StorageService.db = mockDB;
      
      const addPromise = StorageService.addUtterance(mockUtterance);
      
      // Simulate add failure
      const addRequest = mockObjectStore.add();
      addRequest.error = new Error('Add operation failed');
      addRequest.onerror();
      
      await expect(addPromise).rejects.toThrow('Add operation failed');
    });

    test('should handle get operation failures', async () => {
      const testId = 'test-utterance-1';

      StorageService.db = mockDB;
      
      const getPromise = StorageService.getUtterance(testId);
      
      // Simulate get failure
      const getRequest = mockObjectStore.get();
      getRequest.error = new Error('Get operation failed');
      getRequest.onerror();
      
      await expect(getPromise).rejects.toThrow('Get operation failed');
    });

    test('should handle missing utterance gracefully', async () => {
      const testId = 'non-existent-utterance';

      StorageService.db = mockDB;
      
      const getPromise = StorageService.getUtterance(testId);
      
      // Simulate successful get with no result
      const getRequest = mockObjectStore.get();
      getRequest.result = undefined;
      getRequest.onsuccess();
      
      const result = await getPromise;
      
      expect(result).toBeUndefined();
    });
  });

  describe('Storage Performance', () => {
    test('should handle concurrent storage operations', async () => {
      const utterances = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-utterance-${i}`,
        speaker: i % 2 === 0 ? 'user' : 'ai',
        timestamp: Date.now() + i,
        text: `Concurrent utterance ${i}`,
        audioBlob: new Blob([`audio data ${i}`], { type: 'audio/webm' })
      }));

      StorageService.db = mockDB;
      
      // Start all operations concurrently
      const addPromises = utterances.map(utterance => {
        const promise = StorageService.addUtterance(utterance);
        
        // Simulate immediate success for each
        const addRequest = mockObjectStore.add();
        setTimeout(() => addRequest.onsuccess(), 0);
        
        return promise;
      });
      
      const results = await Promise.all(addPromises);
      
      expect(results.length).toBe(10);
      expect(mockObjectStore.add).toHaveBeenCalledTimes(10);
    });

    test('should handle storage quota limitations', async () => {
      StorageService.db = mockDB;
      
      const addPromise = StorageService.addUtterance({
        id: 'quota-test',
        speaker: 'user',
        text: 'Test quota',
        audioBlob: new Blob(['audio data'], { type: 'audio/webm' })
      });
      
      // Simulate quota exceeded error
      const addRequest = mockObjectStore.add();
      addRequest.error = new Error('QuotaExceededError');
      addRequest.onerror();
      
      await expect(addPromise).rejects.toThrow('QuotaExceededError');
    });
  });

  describe('Storage Cleanup', () => {
    test('should provide cleanup functionality', async () => {
      StorageService.db = mockDB;
      
      // Mock cleanup function
      const cleanup = async () => {
        const utterances = await StorageService.getAllUtterances();
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        
        const oldUtterances = utterances.filter(u => now - u.timestamp > maxAge);
        
        const deletePromises = oldUtterances.map(u => StorageService.deleteUtterance(u.id));
        await Promise.all(deletePromises);
        
        return oldUtterances.length;
      };
      
      // Mock old utterances
      const oldUtterances = [
        { id: 'old-1', timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 },
        { id: 'old-2', timestamp: Date.now() - 9 * 24 * 60 * 60 * 1000 }
      ];
      
      const getAllPromise = StorageService.getAllUtterances();
      const getAllRequest = mockObjectStore.getAll();
      getAllRequest.result = oldUtterances;
      getAllRequest.onsuccess();
      
      // Simulate successful deletions
      const deletePromise1 = StorageService.deleteUtterance('old-1');
      const deletePromise2 = StorageService.deleteUtterance('old-2');
      
      const deleteRequest1 = mockObjectStore.delete();
      const deleteRequest2 = mockObjectStore.delete();
      
      setTimeout(() => {
        deleteRequest1.onsuccess();
        deleteRequest2.onsuccess();
      }, 0);
      
      const cleanedCount = await cleanup();
      
      expect(cleanedCount).toBe(2);
      expect(mockObjectStore.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('Data Migration', () => {
    test('should handle database version upgrades', async () => {
      // Simulate upgrading from version 1 to version 2
      const upgradedStorageService = {
        ...StorageService,
        version: 2,
        
        async init() {
          return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onupgradeneeded = (event) => {
              const db = event.target.result;
              const transaction = event.target.transaction;
              
              if (event.oldVersion < 2) {
                // Migration logic for version 2
                const utteranceStore = transaction.objectStore('utterances');
                utteranceStore.createIndex('wordCount', 'wordCount');
              }
            };
            
            request.onsuccess = () => {
              this.db = request.result;
              resolve();
            };
            
            request.onerror = () => reject(request.error);
          });
        }
      };
      
      const initPromise = upgradedStorageService.init();
      
      // Simulate upgrade
      const openRequest = indexedDB.open();
      const upgradeEvent = {
        target: { result: mockDB, transaction: mockTransaction },
        oldVersion: 1
      };
      openRequest.onupgradeneeded(upgradeEvent);
      
      expect(mockObjectStore.createIndex).toHaveBeenCalledWith('wordCount', 'wordCount');
      
      openRequest.onsuccess();
      await initPromise;
    });
  });
});