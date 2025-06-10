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
      const bubble = document.createElement('div');
      bubble.classList.add('bubble', record.speaker === 'ai' ? 'ai' : 'user');
      bubble.dataset.id = record.id;

      await this.#renderContents(bubble, record);

      this.container.appendChild(bubble);
      this.container.scrollTop = this.container.scrollHeight;
    }

    async update(record) {
      const bubble = this.container.querySelector(`.bubble[data-id="${record.id}"]`);
      if (!bubble) {
        console.warn(`DialoguePanel: update missing bubble ${record.id}`);
        return this.add(record);
      }
      bubble.innerHTML = '';
      bubble.classList.remove('ai', 'user');
      bubble.classList.add(record.speaker === 'ai' ? 'ai' : 'user');
      await this.#renderContents(bubble, record);
    }

    async #renderContents(bubble, record) {
      // 1) Utterance-level play button
      const playBtn = document.createElement('button');
      playBtn.className = 'play-utterance';
      playBtn.textContent = '▶️';
      playBtn.addEventListener('click', () => new Audio(record.audioURL).play());
      bubble.appendChild(playBtn);

      // 2) Decode & cache AudioBuffer
      let audioBuffer = bufferCache.get(record.id);
      if (!audioBuffer) {
        const raw = await record.audioBlob.arrayBuffer();
        audioBuffer = await audioCtx.decodeAudioData(raw);
        bufferCache.set(record.id, audioBuffer);
      }

      // 3) Build the transcript <p>
      const p = document.createElement('p');
      p.className = 'transcript';

      const wordRe = /([\w’']+)/g;
      const parts = record.text.split(wordRe);

      let w = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i % 2 === 1 && record.wordTimings && record.wordTimings[w]) {
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
          p.appendChild(document.createTextNode(part));
        }
      }

      bubble.appendChild(p);
    }
  }