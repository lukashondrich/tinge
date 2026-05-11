const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const app = express();
const logger = createLogger('embedding-service');

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});
const embeddingFile = path.join(__dirname, '../shader-playground/public/embedding.json');
let embeddings = [];
try {
  embeddings = JSON.parse(fs.readFileSync(embeddingFile, 'utf8'));
} catch {
  logger.warn('Embedding file not found, starting with empty set');
}

// Start a persistent Python process that keeps the model in memory
const pythonScript = path.join(__dirname, 'compute_embedding.py');
const venvPython = path.join(__dirname, '.venv', 'bin', 'python3');
const legacyVenvPython = path.join(__dirname, 'venv', 'bin', 'python3');
const pythonExecutable = fs.existsSync(venvPython)
  ? venvPython
  : (fs.existsSync(legacyVenvPython) ? legacyVenvPython : 'python3');

logger.log(`Using Python executable: ${pythonExecutable}`);
const python = spawn(pythonExecutable, [pythonScript, '--server']);
let pyBuffer = '';
const pending = [];

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
  logger.error('Embedding process error:', data.toString());
});

python.on('exit', (code, signal) => {
  const reason = signal ? `signal ${signal}` : `code ${code}`;
  logger.error(`Python process exited (${reason})`);
  while (pending.length > 0) {
    const req = pending.shift();
    if (req) req.reject(new Error(`Embedding backend unavailable (${reason})`));
  }
});

function embedWord(word) {
  return new Promise((resolve, reject) => {
    pending.push({ resolve, reject });
    python.stdin.write(word + '\n');
  });
}

app.get('/embed-word', (req, res) => {
  const word = req.query.word;
  if (!word) return res.status(400).json({ error: 'Missing word parameter' });

  const match = embeddings.find(e => e.label.toLowerCase() === word.toLowerCase());
  if (match) return res.json(match);

  embedWord(word)
    .then(data => {
      embeddings.push(data);
      fs.writeFileSync(embeddingFile, JSON.stringify(embeddings, null, 2));
      res.json(data);
    })
    .catch(err => {
      logger.error('Failed to embed word:', err);
      res.status(500).json({ error: 'Embedding failed' });
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.log(`Embedding service listening on port ${PORT}`);
});
