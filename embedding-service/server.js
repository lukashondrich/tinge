const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});
const embeddingFile = path.join(__dirname, '../shader-playground/public/embedding.json');
let embeddings = [];
try {
  embeddings = JSON.parse(fs.readFileSync(embeddingFile, 'utf8'));
} catch {
  console.warn('Embedding file not found, starting with empty set');
}

// Start a persistent Python process that keeps the model in memory
const pythonScript = path.join(__dirname, 'compute_embedding.py');
const python = spawn('python3', [pythonScript, '--server']);
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
  console.error('Embedding process error:', data.toString());
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
      console.error('Failed to embed word:', err);
      res.status(500).json({ error: 'Embedding failed' });
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Embedding service listening on port ${PORT}`);
});
