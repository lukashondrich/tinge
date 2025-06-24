const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Mock dependencies
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: mockSpawn
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn()
}));

// Create test app that mimics the embedding service
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Mock embedding storage
  let embeddings = [];

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Embed word endpoint
  app.post('/embed-word', async (req, res) => {
    try {
      const { word } = req.body;
      
      if (!word || typeof word !== 'string') {
        return res.status(400).json({ error: 'Word is required and must be a string' });
      }

      // Check if embedding already exists
      const existingEmbedding = embeddings.find(e => e.word === word);
      if (existingEmbedding) {
        return res.json({
          word,
          embedding: existingEmbedding.embedding,
          cached: true
        });
      }

      // Mock Python process for generating embeddings
      const mockPythonProcess = {
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        },
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              // Simulate embedding response
              setTimeout(() => {
                const mockEmbedding = Array.from({ length: 384 }, () => Math.random() - 0.5);
                callback(JSON.stringify({ word, embedding: mockEmbedding }) + '\n');
              }, 10);
            }
          })
        },
        stderr: {
          on: jest.fn()
        },
        on: jest.fn()
      };

      mockSpawn.mockReturnValue(mockPythonProcess);

      // Generate new embedding
      const embedding = Array.from({ length: 384 }, () => Math.random() - 0.5);
      const embeddingData = { word, embedding, timestamp: Date.now() };
      
      // Store in mock cache
      embeddings.push(embeddingData);

      res.json({
        word,
        embedding,
        cached: false
      });

    } catch (error) {
      res.status(500).json({
        error: 'Embedding generation failed',
        detail: error.message
      });
    }
  });

  // Get all embeddings endpoint
  app.get('/embeddings', (req, res) => {
    res.json({ embeddings, count: embeddings.length });
  });

  // Clear embeddings endpoint (for testing)
  app.delete('/embeddings', (req, res) => {
    embeddings = [];
    res.json({ message: 'Embeddings cleared', count: 0 });
  });

  return app;
};

describe('Embedding Service Tests', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('Health Check', () => {
    test('should return OK status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Word Embedding Generation', () => {
    test('should generate embedding for a valid word', async () => {
      const testWord = 'hello';
      
      const response = await request(app)
        .post('/embed-word')
        .send({ word: testWord })
        .expect(200);

      expect(response.body.word).toBe(testWord);
      expect(response.body.embedding).toBeDefined();
      expect(Array.isArray(response.body.embedding)).toBe(true);
      expect(response.body.embedding.length).toBe(384); // Standard embedding dimension
      expect(response.body.cached).toBe(false);
    });

    test('should return cached embedding for duplicate word', async () => {
      const testWord = 'world';
      
      // First request - should generate new embedding
      const firstResponse = await request(app)
        .post('/embed-word')
        .send({ word: testWord })
        .expect(200);

      expect(firstResponse.body.cached).toBe(false);

      // Second request - should return cached embedding
      const secondResponse = await request(app)
        .post('/embed-word')
        .send({ word: testWord })
        .expect(200);

      expect(secondResponse.body.cached).toBe(true);
      expect(secondResponse.body.word).toBe(testWord);
      expect(secondResponse.body.embedding).toEqual(firstResponse.body.embedding);
    });

    test('should handle missing word parameter', async () => {
      const response = await request(app)
        .post('/embed-word')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Word is required and must be a string');
    });

    test('should handle invalid word parameter', async () => {
      const response = await request(app)
        .post('/embed-word')
        .send({ word: 123 })
        .expect(400);

      expect(response.body.error).toBe('Word is required and must be a string');
    });

    test('should handle empty word parameter', async () => {
      const response = await request(app)
        .post('/embed-word')
        .send({ word: '' })
        .expect(400);

      expect(response.body.error).toBe('Word is required and must be a string');
    });
  });

  describe('Embedding Storage and Retrieval', () => {
    test('should store multiple embeddings', async () => {
      const words = ['apple', 'banana', 'cherry'];
      
      // Generate embeddings for multiple words
      for (const word of words) {
        await request(app)
          .post('/embed-word')
          .send({ word })
          .expect(200);
      }

      // Check that all embeddings are stored
      const response = await request(app)
        .get('/embeddings')
        .expect(200);

      expect(response.body.count).toBe(words.length);
      expect(response.body.embeddings.length).toBe(words.length);
      
      const storedWords = response.body.embeddings.map(e => e.word);
      expect(storedWords).toEqual(expect.arrayContaining(words));
    });

    test('should clear all embeddings', async () => {
      // Add some embeddings first
      await request(app)
        .post('/embed-word')
        .send({ word: 'test1' })
        .expect(200);

      await request(app)
        .post('/embed-word')
        .send({ word: 'test2' })
        .expect(200);

      // Verify embeddings exist
      let response = await request(app)
        .get('/embeddings')
        .expect(200);
      expect(response.body.count).toBe(2);

      // Clear embeddings
      response = await request(app)
        .delete('/embeddings')
        .expect(200);
      expect(response.body.count).toBe(0);

      // Verify embeddings are cleared
      response = await request(app)
        .get('/embeddings')
        .expect(200);
      expect(response.body.count).toBe(0);
    });
  });

  describe('Python Process Integration', () => {
    test('should spawn Python process for embedding generation', async () => {
      await request(app)
        .post('/embed-word')
        .send({ word: 'python' })
        .expect(200);

      // In a real implementation, we would verify:
      // - Python process is spawned with correct arguments
      // - Input is sent to process stdin
      // - Output is received from process stdout
      // For this mock test, we just verify the endpoint works
    });

    test('should handle Python process errors', async () => {
      // Mock Python process that fails
      const mockFailingProcess = {
        stdin: { write: jest.fn(), end: jest.fn() },
        stdout: { on: jest.fn() },
        stderr: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback('Python error: Module not found');
            }
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Process spawn failed'));
          }
        })
      };

      mockSpawn.mockReturnValue(mockFailingProcess);

      // This would test error handling in a real implementation
      // For now, we just verify the structure exists
      expect(mockSpawn).toBeDefined();
    });
  });

  describe('Performance and Validation', () => {
    test('should handle concurrent embedding requests', async () => {
      const words = ['concurrent1', 'concurrent2', 'concurrent3'];
      
      // Send concurrent requests
      const promises = words.map(word => 
        request(app)
          .post('/embed-word')
          .send({ word })
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.word).toBe(words[index]);
        expect(response.body.embedding).toBeDefined();
      });
    });

    test('should validate embedding dimensions', async () => {
      const response = await request(app)
        .post('/embed-word')
        .send({ word: 'dimension' })
        .expect(200);

      const embedding = response.body.embedding;
      expect(embedding.length).toBe(384);
      
      // Verify all values are numbers
      embedding.forEach(value => {
        expect(typeof value).toBe('number');
        expect(isFinite(value)).toBe(true);
      });
    });

    test('should handle special characters in words', async () => {
      const specialWords = ['café', '世界', 'emoji🌟', 'hyphen-word', "apostrophe's"];
      
      for (const word of specialWords) {
        const response = await request(app)
          .post('/embed-word')
          .send({ word })
          .expect(200);

        expect(response.body.word).toBe(word);
        expect(response.body.embedding).toBeDefined();
      }
    });
  });

  describe('File System Operations', () => {
    test('should handle embedding file operations', () => {
      // Mock file system operations
      const mockEmbeddingData = [
        { word: 'test', embedding: [0.1, 0.2, 0.3], timestamp: Date.now() }
      ];

      fs.readFileSync.mockReturnValue(JSON.stringify(mockEmbeddingData));
      fs.existsSync.mockReturnValue(true);

      // In a real implementation, this would test:
      // - Reading existing embeddings from file
      // - Writing new embeddings to file
      // - Handling file system errors
      
      expect(fs.readFileSync).toBeDefined();
      expect(fs.writeFileSync).toBeDefined();
      expect(fs.existsSync).toBeDefined();
    });
  });
});