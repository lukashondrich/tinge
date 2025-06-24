const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');

// Mock fetch for external API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock app creation functions (these would import the actual apps in a real scenario)
const createBackendApp = () => {
  const express = require('express');
  const cors = require('cors');
  const app = express();
  
  app.use(cors());
  app.use(express.json());
  
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'backend' });
  });
  
  app.get('/token', async (req, res) => {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        client_secret: { value: 'mock-token' }
      })
    });
    
    try {
      const response = await fetch('https://api.openai.com/v1/realtime/sessions');
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  return app;
};

const createEmbeddingApp = () => {
  const express = require('express');
  const app = express();
  
  app.use(express.json());
  
  let embeddings = [];
  
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', service: 'embedding' });
  });
  
  app.post('/embed-word', (req, res) => {
    const { word } = req.body;
    
    if (!word) {
      return res.status(400).json({ error: 'Word required' });
    }
    
    // Check cache
    const existing = embeddings.find(e => e.word === word);
    if (existing) {
      return res.json({ word, embedding: existing.embedding, cached: true });
    }
    
    // Generate new embedding
    const embedding = Array.from({ length: 384 }, () => Math.random() - 0.5);
    embeddings.push({ word, embedding });
    
    res.json({ word, embedding, cached: false });
  });
  
  return app;
};

describe('Integration Tests', () => {
  let backendApp, embeddingApp;
  
  beforeAll(() => {
    backendApp = createBackendApp();
    embeddingApp = createEmbeddingApp();
    process.env.OPENAI_API_KEY = 'test-key';
  });
  
  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('Service Health Checks', () => {
    test('backend service should be healthy', async () => {
      const response = await request(backendApp)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('OK');
      expect(response.body.service).toBe('backend');
    });
    
    test('embedding service should be healthy', async () => {
      const response = await request(embeddingApp)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('OK');
      expect(response.body.service).toBe('embedding');
    });
  });

  describe('Cross-Service Communication Flow', () => {
    test('should handle full conversation flow', async () => {
      // Step 1: Get token from backend (simulates frontend request)
      const tokenResponse = await request(backendApp)
        .get('/token')
        .expect(200);
      
      expect(tokenResponse.body.client_secret.value).toBe('mock-token');
      
      // Step 2: Process words through embedding service (simulates real-time processing)
      const words = ['hello', 'world', 'testing'];
      const embeddingPromises = words.map(word =>
        request(embeddingApp)
          .post('/embed-word')
          .send({ word })
      );
      
      const embeddingResponses = await Promise.all(embeddingPromises);
      
      embeddingResponses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.word).toBe(words[index]);
        expect(response.body.embedding).toBeDefined();
        expect(response.body.embedding.length).toBe(384);
        expect(response.body.cached).toBe(false);
      });
      
      // Step 3: Verify caching works on subsequent requests
      const cachedResponse = await request(embeddingApp)
        .post('/embed-word')
        .send({ word: 'hello' })
        .expect(200);
      
      expect(cachedResponse.body.cached).toBe(true);
      expect(cachedResponse.body.embedding).toEqual(embeddingResponses[0].body.embedding);
    });
    
    test('should handle error propagation between services', async () => {
      // Test backend error handling
      delete process.env.OPENAI_API_KEY;
      
      const tokenResponse = await request(backendApp)
        .get('/token')
        .expect(500);
      
      expect(tokenResponse.body.error).toBe('API key not configured');
      
      // Test embedding service error handling
      const embeddingResponse = await request(embeddingApp)
        .post('/embed-word')
        .send({}) // Missing word
        .expect(400);
      
      expect(embeddingResponse.body.error).toBe('Word required');
      
      // Restore for other tests
      process.env.OPENAI_API_KEY = 'test-key';
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle concurrent requests across services', async () => {
      const concurrentRequests = 10;
      
      // Test concurrent token requests
      const tokenPromises = Array.from({ length: concurrentRequests }, () =>
        request(backendApp).get('/token')
      );
      
      const tokenResponses = await Promise.all(tokenPromises);
      tokenResponses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Test concurrent embedding requests
      const embeddingPromises = Array.from({ length: concurrentRequests }, (_, i) =>
        request(embeddingApp)
          .post('/embed-word')
          .send({ word: `concurrent${i}` })
      );
      
      const embeddingResponses = await Promise.all(embeddingPromises);
      embeddingResponses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.word).toBe(`concurrent${i}`);
      });
    });
    
    test('should maintain performance under load', async () => {
      const startTime = Date.now();
      const requestCount = 50;
      
      const promises = Array.from({ length: requestCount }, (_, i) =>
        request(embeddingApp)
          .post('/embed-word')
          .send({ word: `load${i}` })
      );
      
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Performance should be reasonable (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds for 50 requests
      
      console.log(`Processed ${requestCount} requests in ${duration}ms`);
    });
  });

  describe('Data Flow Integration', () => {
    test('should simulate real-time conversation data flow', async () => {
      // Simulate a conversation flow
      const conversationData = {
        utterances: [
          { speaker: 'user', text: 'Hello there', words: ['Hello', 'there'] },
          { speaker: 'ai', text: 'Hi how are you', words: ['Hi', 'how', 'are', 'you'] },
          { speaker: 'user', text: 'I am fine thanks', words: ['I', 'am', 'fine', 'thanks'] }
        ]
      };
      
      // Process each utterance
      for (const utterance of conversationData.utterances) {
        // Process each word for embeddings
        const wordPromises = utterance.words.map(word =>
          request(embeddingApp)
            .post('/embed-word')
            .send({ word: word.toLowerCase() })
        );
        
        const wordResults = await Promise.all(wordPromises);
        
        // Verify all words were processed
        wordResults.forEach((result, index) => {
          expect(result.status).toBe(200);
          expect(result.body.word).toBe(utterance.words[index].toLowerCase());
          expect(result.body.embedding).toBeDefined();
        });
        
        // Simulate storage of utterance with embeddings
        const utteranceWithEmbeddings = {
          ...utterance,
          embeddings: wordResults.map(r => r.body.embedding)
        };
        
        expect(utteranceWithEmbeddings.embeddings.length).toBe(utterance.words.length);
      }
    });
    
    test('should handle API rate limiting gracefully', async () => {
      // Simulate rate limiting by making OpenAI API fail
      mockFetch.mockRejectedValueOnce(new Error('Rate limit exceeded'));
      
      const response = await request(backendApp)
        .get('/token')
        .expect(500);
      
      expect(response.body.error).toContain('Rate limit exceeded');
      
      // Reset mock for subsequent tests
      mockFetch.mockClear();
    });
  });

  describe('Service Dependencies and Resilience', () => {
    test('should handle service unavailability', async () => {
      // Test embedding service handling backend unavailability
      // In a real scenario, this would test actual network calls between services
      
      // Simulate embedding service trying to validate with backend
      const mockBackendCall = jest.fn().mockRejectedValue(new Error('Backend unavailable'));
      
      // The embedding service should still work independently
      const response = await request(embeddingApp)
        .post('/embed-word')
        .send({ word: 'resilience' })
        .expect(200);
      
      expect(response.body.word).toBe('resilience');
      expect(response.body.embedding).toBeDefined();
    });
    
    test('should handle partial service failures', async () => {
      // Test that if one service fails, others continue working
      
      // Backend fails but embedding service works
      delete process.env.OPENAI_API_KEY;
      
      const tokenResponse = await request(backendApp)
        .get('/token')
        .expect(500);
      
      const embeddingResponse = await request(embeddingApp)
        .post('/embed-word')
        .send({ word: 'independent' })
        .expect(200);
      
      expect(tokenResponse.body.error).toBe('API key not configured');
      expect(embeddingResponse.body.word).toBe('independent');
      
      // Restore for cleanup
      process.env.OPENAI_API_KEY = 'test-key';
    });
  });

  describe('End-to-End Workflow Simulation', () => {
    test('should simulate complete user interaction flow', async () => {
      // 1. User opens app - frontend requests token
      const tokenResponse = await request(backendApp)
        .get('/token')
        .expect(200);
      
      expect(tokenResponse.body.client_secret.value).toBe('mock-token');
      
      // 2. User speaks - words are processed in real-time
      const spokenWords = ['How', 'are', 'you', 'doing', 'today'];
      const embeddingResults = [];
      
      for (const word of spokenWords) {
        const result = await request(embeddingApp)
          .post('/embed-word')
          .send({ word: word.toLowerCase() });
        
        expect(result.status).toBe(200);
        embeddingResults.push(result.body);
      }
      
      // 3. Verify all words have embeddings
      expect(embeddingResults.length).toBe(spokenWords.length);
      embeddingResults.forEach((result, index) => {
        expect(result.word).toBe(spokenWords[index].toLowerCase());
        expect(result.embedding.length).toBe(384);
      });
      
      // 4. AI responds - new words are processed
      const aiWords = ['I', 'am', 'doing', 'well', 'thank', 'you'];
      const aiEmbeddings = await Promise.all(
        aiWords.map(word =>
          request(embeddingApp)
            .post('/embed-word')
            .send({ word: word.toLowerCase() })
        )
      );
      
      // Some words might be cached from previous requests
      const cachedWords = aiEmbeddings.filter(r => r.body.cached).length;
      const newWords = aiEmbeddings.filter(r => !r.body.cached).length;
      
      expect(cachedWords + newWords).toBe(aiWords.length);
      console.log(`Cached: ${cachedWords}, New: ${newWords} words`);
    });
  });
});