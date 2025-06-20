// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors"; // Install with: npm install cors

import multer from 'multer';
import fetch from 'node-fetch';    // or use global fetch in Node 18+

import FormData from 'form-data';
const upload = multer();

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// Enable CORS for all routes
app.use(cors());

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
    
    res.json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ 
      error: "Failed to generate token",
      detail: error.message 
    });
  }
});

// Add a test endpoint to verify server is running
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" });
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
});