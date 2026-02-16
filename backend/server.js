// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import multer from 'multer';
import fetch from 'node-fetch';    // or use global fetch in Node 18+

import FormData from 'form-data';
import { createCorsOptions } from './src/config/corsOptions.js';
import { logServerStartup } from './src/logging/startupBanner.js';
import { createRequestLogger } from './src/middleware/requestLogger.js';
import tokenCounter from './src/services/tokenCounter.js';
import { createKnowledgeSearchHandler } from './src/routes/knowledgeSearchRoute.js';
import { createTokenHandler } from './src/routes/tokenRoute.js';
import { createTranscribeHandler } from './src/routes/transcribeRoute.js';
import { createTokenUsageRouter } from './src/routes/tokenUsageRoutes.js';
import { createLogger } from './src/utils/logger.js';

const upload = multer();

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;
const retrievalServiceUrl = process.env.RETRIEVAL_SERVICE_URL || 'http://localhost:3004';
const retrievalTimeoutMs = Number(process.env.RETRIEVAL_TIMEOUT_MS || 8000);
const retrievalForceEn = !['0', 'false', 'no'].includes(
  String(process.env.RETRIEVAL_FORCE_EN || 'true').trim().toLowerCase()
);
const logger = createLogger('backend-server');

const corsOptions = createCorsOptions({
  frontendUrl: process.env.FRONTEND_URL,
  logger
});

app.use(cors(corsOptions));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'backend',
    env: process.env.NODE_ENV || 'development'
  });
});

// Serve static files from public directory (if needed)
app.use(express.static('public'));

// Log all requests for debugging
app.use(createRequestLogger({ logger }));

// API route for token generation
app.get("/token", createTokenHandler({
  fetchImpl: fetch,
  apiKey,
  tokenCounter,
  logger
}));

app.use(createTokenUsageRouter({
  tokenCounter,
  jsonParser: express.json()
}));


// Transcribe endpoint: accepts a recorded blob and returns Whisper word timestamps
app.post('/transcribe', upload.single('file'), createTranscribeHandler({
  fetchImpl: fetch,
  FormDataCtor: FormData,
  apiKeyProvider: () => process.env.OPENAI_API_KEY,
  logger
}));

// Knowledge search proxy endpoint for retrieval-service
app.post('/knowledge/search', express.json(), createKnowledgeSearchHandler({
  fetchImpl: fetch,
  retrievalServiceUrl,
  retrievalTimeoutMs,
  retrievalForceEn,
  logger
}));




// Note: Profile management removed - now using client-side localStorage

app.listen(port, () => {
  logServerStartup({
    logger,
    port,
    hasApiKey: Boolean(apiKey)
  });
});
