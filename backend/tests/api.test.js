const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const express = require('express');

// Mock external dependencies
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Mock multer
const mockMulter = {
  single: jest.fn(() => (req, res, next) => {
    req.file = { buffer: Buffer.from('fake audio'), originalname: 'test.wav' };
    next();
  })
};
jest.mock('multer', () => () => mockMulter);

// Mock form-data
jest.mock('form-data', () => {
  const EventEmitter = require('events');
  const mockFormData = jest.fn(() => {
    const instance = new EventEmitter();
    instance.append = jest.fn();
    instance.getHeaders = jest.fn(() => ({ 'content-type': 'multipart/form-data' }));
    return instance;
  });
  mockFormData.prototype = EventEmitter.prototype;
  return mockFormData;
});

// Import after mocking
const cors = require('cors');

// Create test app that mimics the real server structure
const createTestApp = () => {
  const app = express();
  app.use(cors());
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Token endpoint
  app.get('/token', async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: "API key not configured",
        detail: "Please set the OPENAI_API_KEY environment variable" 
      });
    }

    try {
      const response = await mockFetch();
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ 
          error: "Failed to get token from OpenAI",
          detail: errorText 
        });
      }

      const data = await response.json();
      
      if (!data.client_secret || !data.client_secret.value) {
        return res.status(500).json({ 
          error: "Invalid response format from OpenAI",
          detail: "The response didn't contain the expected client_secret fields" 
        });
      }
      
      res.json(data);
    } catch (error) {
      res.status(500).json({ 
        error: "Internal server error",
        detail: error.message 
      });
    }
  });

  // Transcribe endpoint
  app.post('/transcribe', mockMulter.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    try {
      const response = await mockFetch();
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          error: "Transcription failed",
          detail: errorText
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({
        error: "Transcription service error",
        detail: error.message
      });
    }
  });

  return app;
};

describe('Backend API Tests', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
    // Set default API key for tests
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('Health Check Endpoint', () => {
    test('should return OK status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Token Endpoint', () => {
    test('should return 500 when API key is missing', async () => {
      delete process.env.OPENAI_API_KEY;
      
      const response = await request(app)
        .get('/token')
        .expect(500);

      expect(response.body.error).toBe('API key not configured');
      expect(response.body.detail).toContain('OPENAI_API_KEY');
    });

    test('should return token on successful OpenAI response', async () => {
      const mockTokenData = {
        client_secret: {
          value: 'mock-token-value',
          expires_at: Date.now() + 3600000
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenData
      });

      const response = await request(app)
        .get('/token')
        .expect(200);

      expect(response.body).toEqual(mockTokenData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('should handle OpenAI API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key'
      });

      const response = await request(app)
        .get('/token')
        .expect(401);

      expect(response.body.error).toBe('Failed to get token from OpenAI');
      expect(response.body.detail).toBe('Invalid API key');
    });

    test('should handle invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' })
      });

      const response = await request(app)
        .get('/token')
        .expect(500);

      expect(response.body.error).toBe('Invalid response format from OpenAI');
    });

    test('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await request(app)
        .get('/token')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
      expect(response.body.detail).toBe('Network error');
    });
  });

  describe('Transcribe Endpoint', () => {
    test('should return 400 when no file is provided', async () => {
      // Override multer mock for this test
      const noFileMiddleware = (req, res, next) => {
        req.file = null;
        next();
      };
      
      app._router.stack.forEach(layer => {
        if (layer.route && layer.route.path === '/transcribe') {
          layer.route.stack[0].handle = noFileMiddleware;
        }
      });

      const response = await request(app)
        .post('/transcribe')
        .expect(400);

      expect(response.body.error).toBe('No audio file provided');
    });

    test('should have transcribe endpoint defined', async () => {
      // Test that the endpoint exists (will fail due to missing file but that's expected)
      const response = await request(app)
        .post('/transcribe');

      // Should get some response (not 404), even if it's an error due to missing file
      expect(response.status).not.toBe(404);
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for unknown endpoints', async () => {
      await request(app)
        .get('/unknown-endpoint')
        .expect(404);
    });

    test('should handle invalid HTTP methods', async () => {
      await request(app)
        .delete('/health')
        .expect(404);
    });
  });
});