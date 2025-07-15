// src/ui/dialoguePanel.js

// Single AudioContext for playback
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Ensure AudioContext is resumed before playback to comply with
// browser autoplay restrictions. Some browsers start the context
// in a suspended state until a user gesture occurs which would
// prevent word‑level audio snippets from playing when clicked.
async function ensureAudioContext() {
  if (audioCtx.state === 'suspended') {
    try {
      // eslint-disable-next-line no-console
      console.log('🔈 Resuming AudioContext for playback');
      await audioCtx.resume();
      // eslint-disable-next-line no-console
      console.log('✅ AudioContext state:', audioCtx.state);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('AudioContext resume failed:', err);
    }
  }
}
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
      
      // For user speech, always look for the most recent unfinalized bubble to replace
      // This ensures the "Speaking..." placeholder gets replaced with final transcription
      let existing = null;
      if (record.speaker === 'user' && record.text !== '...') {
        const userBubbles = this.container.querySelectorAll(`.bubble.user`);
        for (let i = userBubbles.length - 1; i >= 0; i--) {
          const bubble = userBubbles[i];
          // Look for bubbles without utteranceId (unfinalized) or placeholder bubbles
          const isPlaceholder = bubble.querySelector('.highlighted-text')?.textContent?.includes('Speaking...');
          const isUnfinalized = !bubble.dataset.utteranceId || bubble.dataset.utteranceId === 'undefined';
          
          if (isUnfinalized || isPlaceholder) {
            existing = bubble;
            break;
          }
        }
      } else {
        // For AI speech, use the original detection logic
        existing = this.container.querySelector(`[data-utterance-id="${record.id}"]`);
        
        if (!existing && record.text !== '...') {
          const speakerBubbles = this.container.querySelectorAll(`.bubble.${record.speaker}`);
          for (let i = speakerBubbles.length - 1; i >= 0; i--) {
            const bubble = speakerBubbles[i];
            if (!bubble.dataset.utteranceId || bubble.dataset.utteranceId === 'undefined') {
              existing = bubble;
              break;
            }
          }
        }
      }
      
      if (existing && record.text !== '...') {
        // Set the utteranceId on the existing bubble before enhancing
        existing.dataset.utteranceId = record.id;
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
      let audioBuffer = null;
      
      if (record.audioBlob && record.text !== '...') {
        playBtn = document.createElement('button');
        playBtn.className = 'play-utterance';
        playBtn.textContent = '⏵';
        const handlePlay = async () => {
          // eslint-disable-next-line no-console
          console.log('▶️ Play utterance', record.id);
          await ensureAudioContext();
          new Audio(record.audioURL).play();
        };
        playBtn.addEventListener('click', handlePlay);
        playBtn.addEventListener('pointerdown', handlePlay);
        bubble.appendChild(playBtn);

        // 3) Decode & cache AudioBuffer
        audioBuffer = bufferCache.get(record.id);
        if (!audioBuffer) {
          try {
            const raw = await record.audioBlob.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(raw);
            bufferCache.set(record.id, audioBuffer);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`⚠️ Failed to decode audio for ${record.id}:`, err);
          }
        }
      } else {
        // No audio blob available for this record
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
        if (i % 2 === 1) {
          // odd indexes are words - always create spans for proper styling
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = part;
          
          // Only add click handler if we have audio timing data
          if (record.wordTimings && record.wordTimings[w] && audioBuffer) {
            const { start, end } = record.wordTimings[w];
            const handleWord = async () => {
              // eslint-disable-next-line no-console
              console.log(`🔊 Play word "${part}" from ${start} to ${end}s`);
              await ensureAudioContext();
              const src = audioCtx.createBufferSource();
              src.buffer = audioBuffer;
              src.connect(audioCtx.destination);
              // Add 200ms buffer before and after word timing
              const playbackBuffer = 0.1; // 200ms in seconds
              const bufferedStart = Math.max(0, start - playbackBuffer);
              const bufferedEnd = Math.min(audioBuffer.duration, end + playbackBuffer);
              src.start(0, bufferedStart, bufferedEnd - bufferedStart);
            };
            span.addEventListener('click', handleWord);
            span.addEventListener('pointerdown', handleWord);
          }
          w++; // increment word index regardless
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
        this.container.replaceChild(bubble, existingAfterBuild);
      } else {
        this.container.appendChild(bubble);
      }
      this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Enhance an existing bubble with complete audio data and word timings
     */
    async enhanceExistingBubble(bubble, record) {
      // Remove placeholder class if present
      bubble.classList.remove('placeholder');
      
      // Add play button if we have audio and don't already have one
      if (record.audioBlob && !bubble.querySelector('.play-utterance')) {
        const playBtn = document.createElement('button');
        playBtn.className = 'play-utterance';
        playBtn.textContent = '⏵';
        const handlePlay = async () => {
          // eslint-disable-next-line no-console
          console.log('▶️ Play utterance', record.id);
          await ensureAudioContext();
          new Audio(record.audioURL).play();
        };
        playBtn.addEventListener('click', handlePlay);
        playBtn.addEventListener('pointerdown', handlePlay);
        bubble.insertBefore(playBtn, bubble.firstChild);
        
        // Decode & cache AudioBuffer
        let audioBuffer = bufferCache.get(record.id);
        if (!audioBuffer) {
          try {
            const raw = await record.audioBlob.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(raw);
            bufferCache.set(record.id, audioBuffer);
          } catch (err) {
            // eslint-disable-next-line no-console
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
        if (i % 2 === 1) {
          // odd indexes are words - always create spans for proper styling
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = part;
          
          // Only add click handler if we have audio timing data
          if (record.wordTimings && record.wordTimings[w] && audioBuffer) {
            const { start, end } = record.wordTimings[w];
            const handleWord = async () => {
              // eslint-disable-next-line no-console
              console.log(`🔊 Play word "${part}" from ${start} to ${end}s`);
              await ensureAudioContext();
              const src = audioCtx.createBufferSource();
              src.buffer = audioBuffer;
              src.connect(audioCtx.destination);
              // Add 200ms buffer before and after word timing
              const playbackBuffer = 0.1; // 200ms in seconds
              const bufferedStart = Math.max(0, start - playbackBuffer);
              const bufferedEnd = Math.min(audioBuffer.duration, end + playbackBuffer);
              src.start(0, bufferedStart, bufferedEnd - bufferedStart);
            };
            span.addEventListener('click', handleWord);
            span.addEventListener('pointerdown', handleWord);
          }
          w++; // increment word index regardless
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