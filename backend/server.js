// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors"; // Install with: npm install cors

import multer from 'multer';
import fetch from 'node-fetch';    // or use global fetch in Node 18+
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import FormData from 'form-data';
import tokenCounter from './src/services/tokenCounter.js';

const upload = multer();

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Embedding service setup
const embeddingFile = path.join(__dirname, '../shader-playground/public/embedding.json');
let embeddings = [];
try {
  embeddings = JSON.parse(fs.readFileSync(embeddingFile, 'utf8'));
} catch {
  console.warn('Embedding file not found, starting with empty set');
}

// FastText Python process management
const pythonScript = path.join(__dirname, 'src/services/simple_embedding.py');
let python = null;
let pyBuffer = '';
const pending = [];

function initializePythonProcess() {
  try {
    python = spawn('python', [pythonScript, '--server']);
    
    python.stdout.on('data', data => {
      pyBuffer += data.toString();
      const lines = pyBuffer.split('\n');
      pyBuffer = lines.pop();
      for (const line of lines) {
        const req = pending.shift();
        if (!req) continue;
        try {
          const result = JSON.parse(line);
          req.resolve(result);
        } catch (err) {
          req.reject(err);
        }
      }
    });

    python.stderr.on('data', data => {
      console.error('Embedding process error:', data.toString());
    });

    python.on('exit', (code) => {
      console.warn(`Embedding Python process exited with code ${code}, reinitializing...`);
      python = null;
      setTimeout(initializePythonProcess, 1000);
    });

    python.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      python = null;
    });
  } catch (err) {
    console.error('Error initializing Python process:', err);
    python = null;
  }
}

function embedWord(word) {
  return new Promise((resolve, reject) => {
    if (!python) {
      reject(new Error('Python process not initialized'));
      return;
    }
    pending.push({ resolve, reject });
    python.stdin.write(`EMBED:${word}\n`);
  });
}

function detectLanguage(text) {
  return new Promise((resolve, reject) => {
    if (!python) {
      reject(new Error('Python process not initialized'));
      return;
    }
    pending.push({ resolve, reject });
    python.stdin.write(`LANG:${text}\n`);
  });
}

// Initialize Python process on startup
console.log('🐍 Initializing FastText embedding process...');
initializePythonProcess();

// Configure CORS for production
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:3000',
      process.env.FRONTEND_URL,
      // Railway.app domains
      /\.railway\.app$/,
      /\.up\.railway\.app$/
    ].filter(Boolean);
    
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// FASTTEXT EMBEDDING ENDPOINTS (after CORS)
app.get('/embed-word', (req, res) => {
  const word = req.query.word;
  if (!word) return res.status(400).json({ error: 'Missing word parameter' });

  console.log(`FastText embedding request for: ${word}`);

  // Check cache first
  const match = embeddings.find(e => e.label.toLowerCase() === word.toLowerCase());
  if (match) {
    console.log(`Found cached embedding for: ${word}`);
    return res.json(match);
  }

  if (!python) {
    // Fallback if Python process not available
    console.log(`Using fallback embedding for: ${word}`);
    const fallback = {
      label: word,
      x: Math.round(((Math.random() - 0.5) * 4) * 100) / 100,
      y: Math.round(((Math.random() - 0.5) * 4) * 100) / 100,
      z: Math.round(((Math.random() - 0.5) * 4) * 100) / 100,
      source: 'fallback'
    };
    return res.json(fallback);
  }

  embedWord(word)
    .then(data => {
      if (!data.error) {
        embeddings.push(data);
        try {
          fs.writeFileSync(embeddingFile, JSON.stringify(embeddings, null, 2));
          console.log(`Cached FastText embedding for: ${word}`);
        } catch (writeErr) {
          console.warn('Failed to cache embedding:', writeErr);
        }
      }
      res.json(data);
    })
    .catch(err => {
      console.error('Failed to embed word:', err);
      const fallback = {
        label: word,
        x: Math.round(((Math.random() - 0.5) * 4) * 100) / 100,
        y: Math.round(((Math.random() - 0.5) * 4) * 100) / 100,
        z: Math.round(((Math.random() - 0.5) * 4) * 100) / 100,
        source: 'fallback-error'
      };
      res.json(fallback);
    });
});

app.get('/detect-language', (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).json({ error: 'Missing text parameter' });

  console.log(`FastText language detection for: ${text.substring(0, 50)}...`);

  if (!python) {
    // Fallback if Python process not available
    console.warn('Language detection fallback: Python process not available');
    return res.json({ 
      language: 'en', 
      confidence: 0.5,
      source: 'fallback'
    });
  }

  detectLanguage(text)
    .then(data => {
      res.json(data);
    })
    .catch(err => {
      console.error('Failed to detect language:', err);
      res.json({ 
        language: 'en', 
        confidence: 0.5,
        source: 'fallback-error'
      });
    });
});

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
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API route for token generation
app.get("/token", async (req, res) => {
  try {
    // Check if API key is available
    if (!apiKey) {
      console.error("Error: OPENAI_API_KEY not found in environment variables");
      return res.status(500).json({ 
        error: "API key not configured",
        detail: "Please set the OPENAI_API_KEY environment variable" 
      });
    }

    console.log("Requesting token from OpenAI...");
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API error (${response.status} ${response.statusText}): ${errorText}`);
      
      let userMessage = "Failed to get token from OpenAI";
      
      // Generate more helpful error messages based on status code
      if (response.status === 401) {
        userMessage = "Invalid API key. Please check your OpenAI API key.";
      } else if (response.status === 403) {
        userMessage = "API key doesn't have access to the OpenAI Realtime API. Please check your OpenAI account permissions.";
      } else if (response.status === 404) {
        userMessage = "API endpoint not found. The Realtime API path may have changed.";
      } else if (response.status === 429) {
        userMessage = "Rate limit exceeded. Please try again later.";
      }
      
      return res.status(response.status).json({ 
        error: userMessage,
        detail: errorText 
      });
    }

    const data = await response.json();
    console.log("Token received successfully");
    
    // Verify the required fields are present
    if (!data.client_secret || !data.client_secret.value) {
      console.error("Invalid response format from OpenAI:", data);
      return res.status(500).json({ 
        error: "Invalid response format from OpenAI",
        detail: "The response didn't contain the expected client_secret fields" 
      });
    }
    
    // Initialize token counter for this ephemeral key
    const ephemeralKey = data.client_secret.value;
    const usage = tokenCounter.initializeKey(ephemeralKey);
    
    // Add usage info to response
    const responseData = {
      ...data,
      tokenUsage: usage
    };
    
    res.json(responseData);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ 
      error: "Failed to generate token",
      detail: error.message 
    });
  }
});

// Token usage endpoints
app.get("/token-usage/:ephemeralKey", (req, res) => {
  const { ephemeralKey } = req.params;
  const usage = tokenCounter.getUsage(ephemeralKey);
  
  if (!usage) {
    return res.status(404).json({ error: "Token not found" });
  }
  
  res.json(usage);
});

app.post("/token-usage/:ephemeralKey/estimate", express.json(), (req, res) => {
  const { ephemeralKey } = req.params;
  const { text, audioDuration } = req.body;
  
  let estimatedTokens = 0;
  
  if (text) {
    estimatedTokens += tokenCounter.estimateTokensFromText(text);
  }
  
  if (audioDuration) {
    estimatedTokens += tokenCounter.estimateTokensFromAudio(audioDuration);
  }
  
  const usage = tokenCounter.updateEstimatedTokens(ephemeralKey, estimatedTokens);
  
  if (!usage) {
    return res.status(404).json({ error: "Token not found" });
  }
  
  res.json(usage);
});

app.post("/token-usage/:ephemeralKey/actual", express.json(), (req, res) => {
  const { ephemeralKey } = req.params;
  const { usageData } = req.body;
  
  const usage = tokenCounter.updateActualUsage(ephemeralKey, usageData);
  
  if (!usage) {
    return res.status(404).json({ error: "Token not found" });
  }
  
  res.json(usage);
});

app.get("/token-stats", (req, res) => {
  const stats = tokenCounter.getAllUsageStats();
  res.json(stats);
});


// Transcribe endpoint: accepts a recorded blob and returns Whisper word timestamps
app.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    // Build multipart form for OpenAI
    const form = new FormData();
    form.append('file', req.file.buffer, 'utterance.webm');
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const aiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    if (!aiRes.ok) {
      const err = await aiRes.text();
      throw new Error(err);
    }
    const json = await aiRes.json();
    res.json({
      words: json.words,   // timing array
      fullText: json.text  // the punctuated string
    });
  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({ error: err.message });
  }
});




// Note: Profile management removed - now using client-side localStorage

app.listen(port, () => {
  console.log(`┌────────────────────────────────────┐`);
  console.log(`│    Express server running on ${port}    │`);
  console.log(`└────────────────────────────────────┘`);
  console.log(`API Key: ${apiKey ? "✓ Found" : "✗ Missing"}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Token endpoint: http://localhost:${port}/token`);
  console.log(`Transcribe endpoint: http://localhost:${port}/transcribe`);
  console.log(`Embedding endpoint: http://localhost:${port}/embed-word`);
  console.log(`Language detection: http://localhost:${port}/detect-language`);
});