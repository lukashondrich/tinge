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
      console.log(`🎯 DialoguePanel.add called for ${record.speaker} with text: "${record.text.substring(0, 50)}..." and ${record.wordTimings ? record.wordTimings.length : 0} word timings`);
      
      // Check for existing bubble first to prevent duplicates
      const existing = this.container.querySelector(`[data-utterance-id="${record.id}"]`);
      if (existing && record.text !== '...') {
        console.log(`🔄 DialoguePanel: Found existing bubble for ${record.speaker} utterance ${record.id}, enhancing instead of duplicating`);
        // If we have an existing bubble and this is a final record (not placeholder), enhance it
        await this.enhanceExistingBubble(existing, record);
        return;
      }
      
      // 1) Bubble wrapper
      const bubble = document.createElement('div');
      bubble.classList.add('bubble', record.speaker === 'ai' ? 'ai' : 'user');
      bubble.dataset.utteranceId = record.id;
      if (record.text === '...') {
        bubble.classList.add('placeholder');
      }
  
      // 2) Utterance-level play button (only if we have audio blob and it's not placeholder)
      let playBtn = null;
      if (record.audioBlob && record.text !== '...') {
        playBtn = document.createElement('button');
        playBtn.className = 'play-utterance';
        playBtn.textContent = '⏵';
        playBtn.addEventListener('click', () => new Audio(record.audioURL).play());
        bubble.appendChild(playBtn);

        // 3) Decode & cache AudioBuffer
        let audioBuffer = bufferCache.get(record.id);
        if (!audioBuffer) {
          try {
            const raw = await record.audioBlob.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(raw);
            bufferCache.set(record.id, audioBuffer);
          } catch (err) {
            console.warn(`⚠️ Failed to decode audio for ${record.id}:`, err);
          }
        }
      } else {
        console.log(`ℹ️ Skipping play button for ${record.speaker} record ${record.id} - ${record.audioBlob ? 'placeholder text' : 'no audio blob'}`);
      }
  
      // 4) Build the transcript with pastel highlighting
      const p = document.createElement('p');
      p.className = 'transcript';

      // Create highlighted container span
      const highlightedSpan = document.createElement('span');
      highlightedSpan.className = 'highlighted-text';

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
            // Add 200ms buffer before and after word timing
            const playbackBuffer = 0.1; // 200ms in seconds
            const bufferedStart = Math.max(0, start - playbackBuffer);
            const bufferedEnd = Math.min(audioBuffer.duration, end + playbackBuffer);
            src.start(0, bufferedStart, bufferedEnd - bufferedStart);
          });
          highlightedSpan.appendChild(span);
        } else {
          // even indexes are the exact "glue" (spaces, punctuation)—just text
          highlightedSpan.appendChild(document.createTextNode(part));
        }
      }

      // Append the highlighted span to the paragraph
      p.appendChild(highlightedSpan);
  
      // 5) Append bubble & auto-scroll, updating if already exists
      bubble.appendChild(p);
      const existingAfterBuild = this.container.querySelector(`[data-utterance-id="${record.id}"]`);
      if (existingAfterBuild) {
        console.log(`🔄 DialoguePanel: Replacing existing bubble for ${record.speaker} utterance ${record.id}`);
        this.container.replaceChild(bubble, existingAfterBuild);
      } else {
        console.log(`➕ DialoguePanel: Adding new bubble for ${record.speaker} utterance ${record.id}`);
        this.container.appendChild(bubble);
      }
      this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Enhance an existing bubble with complete audio data and word timings
     */
    async enhanceExistingBubble(bubble, record) {
      console.log(`🔧 Enhancing bubble ${record.id} with audio and word timings`);
      
      // Remove placeholder class if present
      bubble.classList.remove('placeholder');
      
      // Add play button if we have audio and don't already have one
      if (record.audioBlob && !bubble.querySelector('.play-utterance')) {
        const playBtn = document.createElement('button');
        playBtn.className = 'play-utterance';
        playBtn.textContent = '⏵';
        playBtn.addEventListener('click', () => new Audio(record.audioURL).play());
        bubble.insertBefore(playBtn, bubble.firstChild);
        
        // Decode & cache AudioBuffer
        let audioBuffer = bufferCache.get(record.id);
        if (!audioBuffer) {
          try {
            const raw = await record.audioBlob.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(raw);
            bufferCache.set(record.id, audioBuffer);
          } catch (err) {
            console.warn(`⚠️ Failed to decode audio for ${record.id}:`, err);
          }
        }
        
        // Rebuild transcript content with enhanced features
        this.buildTranscriptContent(bubble, record, audioBuffer);
      } else {
        // Just update the transcript content
        this.buildTranscriptContent(bubble, record, null);
      }
      
      this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Build or rebuild the transcript content within a bubble
     */
    buildTranscriptContent(bubble, record, audioBuffer) {
      // Remove existing transcript if present
      const existingTranscript = bubble.querySelector('.transcript');
      if (existingTranscript) {
        existingTranscript.remove();
      }

      const p = document.createElement('p');
      p.className = 'transcript';

      // Create highlighted container span
      const highlightedSpan = document.createElement('span');
      highlightedSpan.className = 'highlighted-text';

      // Split text into [non-word, word, non-word, word, …]
      const wordRe = /([\w'']+)/g;
      const parts = record.text.split(wordRe);

      let w = 0;  // index into record.wordTimings
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i % 2 === 1 && record.wordTimings && record.wordTimings[w] && audioBuffer) {
          // odd indexes are words - make them clickable if we have audio
          const { start, end } = record.wordTimings[w++];
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = part;
          span.addEventListener('click', () => {
            const src = audioCtx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(audioCtx.destination);
            // Add 200ms buffer before and after word timing
            const playbackBuffer = 0.1; // 200ms in seconds
            const bufferedStart = Math.max(0, start - playbackBuffer);
            const bufferedEnd = Math.min(audioBuffer.duration, end + playbackBuffer);
            src.start(0, bufferedStart, bufferedEnd - bufferedStart);
          });
          highlightedSpan.appendChild(span);
        } else {
          // even indexes are the exact "glue" (spaces, punctuation)—just text
          highlightedSpan.appendChild(document.createTextNode(part));
        }
      }

      // Append the highlighted span to the paragraph
      p.appendChild(highlightedSpan);
      bubble.appendChild(p);
    }
  }