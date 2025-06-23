import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Create a minimal test server for health check
const createTestApp = () => {
  const app = express();
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });
  return app;
};

describe('Server Health Check', () => {
  test('should return OK status on health check', async () => {
    const app = createTestApp();
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body.status).toBe('OK');
    expect(response.body.timestamp).toBeDefined();
  });
});

describe('Server API Endpoints', () => {
  test('should handle missing endpoints gracefully', async () => {
    const app = createTestApp();
    await request(app)
      .get('/non-existent-endpoint')
      .expect(404);
  });
});