const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const embeddingFile = path.join(__dirname, '../shader-playground/public/embedding.json');
let embeddings = [];
try {
  embeddings = JSON.parse(fs.readFileSync(embeddingFile, 'utf8'));
} catch {
  console.warn('Embedding file not found, starting with empty set');
}

app.get('/embed-word', (req, res) => {
  const word = req.query.word;
  if (!word) return res.status(400).json({ error: 'Missing word parameter' });

  const match = embeddings.find(e => e.label.toLowerCase() === word.toLowerCase());
  if (match) return res.json(match);

  const script = path.join(__dirname, 'compute_embedding.py');
  const child = spawn('python3', [script, word]);
  let out = '';
  child.stdout.on('data', d => out += d);
  let err = '';
  child.stderr.on('data', d => err += d);
  child.on('close', code => {
    if (code !== 0) {
      console.error('Embedding script error:', err);
      return res.status(500).json({ error: 'Embedding failed' });
    }
    try {
      const data = JSON.parse(out);
      embeddings.push(data);
      fs.writeFileSync(embeddingFile, JSON.stringify(embeddings, null, 2));
      res.json(data);
    } catch (e) {
      console.error('Failed to parse embedding output:', e);
      res.status(500).json({ error: 'Invalid embedding data' });
    }
  });
});

app.listen(3000, () => {
  console.log('Embedding service listening on port 3000');
});
