// src/ui/dialoguePanel.js

// Single AudioContext for playback
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const bufferCache = new Map();

export class DialoguePanel {
    constructor(containerSelector) {
      this.container = document.querySelector(containerSelector);
      if (!this.container) {
        throw new Error(`DialoguePanel: container "${containerSelector}" not found`);
      }
    }
  
    /**
     * Add a new utterance to the panel, rendering per-word playback.
     * record.text         // original punctuated transcript
     * record.wordTimings  // [{word, start, end}, …] from Whisper
     */
    async add(record) {
      // 1) Bubble wrapper
      const bubble = document.createElement('div');
      bubble.classList.add('bubble', record.speaker === 'ai' ? 'ai' : 'user');
  
      // 2) Utterance-level play button
      const playBtn = document.createElement('button');
      playBtn.className = 'play-utterance';
      playBtn.textContent = '▶️';
      playBtn.addEventListener('click', () => new Audio(record.audioURL).play());
      bubble.appendChild(playBtn);
  
      // 3) Decode & cache AudioBuffer
      let audioBuffer = bufferCache.get(record.id);
      if (!audioBuffer) {
        const raw = await record.audioBlob.arrayBuffer();
        audioBuffer = await audioCtx.decodeAudioData(raw);
        bufferCache.set(record.id, audioBuffer);
      }
  
      // 4) Build the transcript <p>
      const p = document.createElement('p');
      p.className = 'transcript';
  
      // Split text into [non-word, word, non-word, word, …]
      const wordRe = /([\w’']+)/g;
      const parts = record.text.split(wordRe);
  
      let w = 0;  // index into record.wordTimings
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i % 2 === 1 && record.wordTimings && record.wordTimings[w]) {
          // odd indexes are words
          const { start, end } = record.wordTimings[w++];
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = part;
          span.addEventListener('click', () => {
            const src = audioCtx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(audioCtx.destination);
            src.start(0, start, end - start);
          });
          p.appendChild(span);
        } else {
          // even indexes are the exact “glue” (spaces, punctuation)—just text
          p.appendChild(document.createTextNode(part));
        }
      }
  
      // 5) Append bubble & auto-scroll
      bubble.appendChild(p);
      this.container.appendChild(bubble);
      this.container.scrollTop = this.container.scrollHeight;
    }
  }