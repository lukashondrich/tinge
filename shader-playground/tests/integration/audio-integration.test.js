import { describe, test, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock DOM environment
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="transcriptContainer"></div>
      <canvas id="threejs-canvas"></canvas>
      <div id="mobileDebug" style="display: none;">
        <div id="debugOutput"></div>
      </div>
    </body>
  </html>
`);

global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;

// Mock AudioContext
const mockAudioContext = {
  state: 'suspended',
  resume: vi.fn(() => Promise.resolve()),
  createBufferSource: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    buffer: null
  })),
  decodeAudioData: vi.fn(() => Promise.resolve({
    duration: 2.5,
    sampleRate: 44100
  })),
  destination: {}
};

Object.defineProperty(global, 'AudioContext', {
  value: vi.fn(() => mockAudioContext),
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'webkitAudioContext', {
  value: vi.fn(() => mockAudioContext),
  writable: true,
  configurable: true
});

// Mock MediaRecorder
const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  addEventListener: vi.fn(),
  state: 'inactive',
  mimeType: 'audio/webm',
  ondataavailable: null,
  onstop: null
};

Object.defineProperty(global, 'MediaRecorder', {
  value: vi.fn(() => mockMediaRecorder),
  writable: true,
  configurable: true
});

// Mock getUserMedia
const mockStream = {
  getTracks: vi.fn(() => [{ stop: vi.fn() }]),
  getAudioTracks: vi.fn(() => [{ stop: vi.fn() }])
};

Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() => Promise.resolve(mockStream))
  },
  writable: true,
  configurable: true
});

// Mock URL.createObjectURL
Object.defineProperty(global.URL, 'createObjectURL', {
  value: vi.fn(() => 'blob:mock-url'),
  writable: true,
  configurable: true
});

// Mock crypto.randomUUID
Object.defineProperty(global.crypto, 'randomUUID', {
  value: vi.fn(() => 'mock-uuid-1234'),
  writable: true,
  configurable: true
});

// Mock Audio constructor
const mockAudio = {
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  currentTime: 0,
  duration: 2.5
};

Object.defineProperty(global, 'Audio', {
  value: vi.fn(() => mockAudio),
  writable: true,
  configurable: true
});

// Mock SpeechSynthesis
const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn()
};

const mockSpeechSynthesisUtterance = vi.fn(function(text) {
  this.text = text;
  this.rate = 1.0;
  this.pitch = 1.0;
  this.volume = 1.0;
});

Object.defineProperty(global, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'SpeechSynthesisUtterance', {
  value: mockSpeechSynthesisUtterance,
  writable: true,
  configurable: true
});

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          add: vi.fn(),
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn()
        }))
      }))
    }
  }))
};

Object.defineProperty(global, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
  configurable: true
});

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('Audio Integration Tests', () => {
  beforeAll(() => {
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);
    mockAudio.play.mockImplementation(() => Promise.resolve());
    mockAudioContext.resume.mockResolvedValue();
    mockAudioContext.decodeAudioData.mockReset().mockImplementation(() => Promise.resolve({ duration: 2.5, sampleRate: 44100 }));
    mockAudioContext.createBufferSource.mockReset().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn(),
      buffer: null
    }));
    
    // Reset DOM state
    document.getElementById('transcriptContainer').innerHTML = '';
    
    // Reset AudioContext state
    mockAudioContext.state = 'suspended';
  });

  describe('Full Audio Recording and Playback Workflow', () => {
    test('should complete full audio workflow from recording to playback', async () => {
      // Simulate AudioManager usage
      const audioManager = {
        chunks: [],
        isRecording: false,
        recorder: mockMediaRecorder,
        speaker: 'user',
        
        async init() {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.recorder = new MediaRecorder(stream);
          return this;
        },
        
        startRecording() {
          this.chunks = [];
          this.recorder.start();
          this.isRecording = true;
        },
        
        async stopRecording(transcriptText) {
          return new Promise((resolve) => {
            this.recorder.onstop = () => {
              const blob = new Blob(this.chunks, { type: 'audio/webm' });
              const audioURL = URL.createObjectURL(blob);
              const utterance = {
                id: crypto.randomUUID(),
                speaker: this.speaker,
                timestamp: Date.now(),
                text: transcriptText,
                audioBlob: blob,
                audioURL: audioURL
              };
              resolve(utterance);
            };
            this.recorder.stop();
            this.isRecording = false;
          });
        }
      };

      // 1. Initialize AudioManager
      await audioManager.init();
      
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(global.MediaRecorder).toHaveBeenCalledWith(mockStream);

      // 2. Start recording
      audioManager.startRecording();
      
      expect(mockMediaRecorder.start).toHaveBeenCalled();
      expect(audioManager.isRecording).toBe(true);

      // 3. Simulate audio data
      const mockAudioData = new Blob(['mock audio data'], { type: 'audio/webm' });
      audioManager.chunks.push(mockAudioData);

      // 4. Stop recording and create utterance
      const transcriptText = 'Hello world test';
      const utterancePromise = audioManager.stopRecording(transcriptText);
      
      // Trigger the stop event
      mockMediaRecorder.onstop();
      
      const utterance = await utterancePromise;

      expect(utterance.text).toBe(transcriptText);
      expect(utterance.speaker).toBe('user');
      expect(utterance.audioBlob).toBeDefined();
      expect(utterance.audioURL).toBe('blob:mock-url');
      expect(utterance.id).toBe('mock-uuid-1234');

      // 5. Add utterance to DialoguePanel
      const dialoguePanel = {
        container: document.getElementById('transcriptContainer'),
        bufferCache: new Map(),
        
        async add(record) {
          const bubble = document.createElement('div');
          bubble.classList.add('bubble', record.speaker);
          bubble.dataset.utteranceId = record.id;

          if (record.audioBlob && record.text !== '...') {
            const playBtn = document.createElement('button');
            playBtn.className = 'play-utterance';
            playBtn.textContent = '⏵';
            
            playBtn.addEventListener('click', async () => {
              if (mockAudioContext.state === 'suspended') {
                await mockAudioContext.resume();
              }
              new Audio(record.audioURL).play();
            });
            
            bubble.appendChild(playBtn);
          }

          const transcript = document.createElement('p');
          transcript.className = 'transcript';
          transcript.textContent = record.text;
          bubble.appendChild(transcript);

          this.container.appendChild(bubble);
        }
      };

      await dialoguePanel.add(utterance);

      // 6. Verify UI elements are created
      const bubble = document.querySelector('.bubble.user');
      expect(bubble).toBeTruthy();
      expect(bubble.dataset.utteranceId).toBe('mock-uuid-1234');

      const playButton = bubble.querySelector('.play-utterance');
      expect(playButton).toBeTruthy();
      expect(playButton.textContent).toBe('⏵');

      const transcript = bubble.querySelector('.transcript');
      expect(transcript).toBeTruthy();
      expect(transcript.textContent).toBe('Hello world test');

      // 7. Test playback
      playButton.click();
      await flushPromises();

      expect(mockAudioContext.resume).toHaveBeenCalled();
      expect(global.Audio).toHaveBeenCalledWith('blob:mock-url');
      expect(mockAudio.play).toHaveBeenCalled();
    });

    test('should handle audio workflow with word-level timing', async () => {
      // Create utterance with word timing data
      const utteranceWithTiming = {
        id: 'test-utterance-with-timing',
        speaker: 'ai',
        text: 'Hello world test',
        audioBlob: {
          type: 'audio/webm',
          arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(1024)))
        },
        audioURL: 'blob:mock-url-with-timing',
        wordTimings: [
          { word: 'Hello', start: 0.0, end: 0.5 },
          { word: 'world', start: 0.6, end: 1.0 },
          { word: 'test', start: 1.2, end: 1.6 }
        ]
      };

      // Mock audio buffer
      const mockAudioBuffer = {
        duration: 2.5,
        sampleRate: 44100
      };
      
      mockAudioContext.decodeAudioData.mockResolvedValue(mockAudioBuffer);

      // Simulate DialoguePanel with word-level playback
      const dialoguePanel = {
        container: document.getElementById('transcriptContainer'),
        bufferCache: new Map(),
        
        async add(record) {
          const bubble = document.createElement('div');
          bubble.classList.add('bubble', record.speaker);
          bubble.dataset.utteranceId = record.id;

          // Create transcript with word-level spans
          const transcript = document.createElement('p');
          transcript.className = 'transcript';
          
          if (record.wordTimings && record.audioBlob) {
            // Decode audio for word-level playback
            const raw = await record.audioBlob.arrayBuffer();
            const audioBuffer = await mockAudioContext.decodeAudioData(raw);
            this.bufferCache.set(record.id, audioBuffer);
            
            // Create word spans with click handlers
            record.wordTimings.forEach((timing, index) => {
              const wordSpan = document.createElement('span');
              wordSpan.className = 'word';
              wordSpan.textContent = timing.word;
              
              wordSpan.addEventListener('click', async () => {
                if (mockAudioContext.state === 'suspended') {
                  await mockAudioContext.resume();
                }
                
                const src = mockAudioContext.createBufferSource();
                src.buffer = audioBuffer;
                src.connect(mockAudioContext.destination);
                
                const playbackBuffer = 0.1;
                const bufferedStart = Math.max(0, timing.start - playbackBuffer);
                const bufferedEnd = Math.min(audioBuffer.duration, timing.end + playbackBuffer);
                
                src.start(0, bufferedStart, bufferedEnd - bufferedStart);
              });
              
              transcript.appendChild(wordSpan);
              
              if (index < record.wordTimings.length - 1) {
                transcript.appendChild(document.createTextNode(' '));
              }
            });
          } else {
            transcript.textContent = record.text;
          }
          
          bubble.appendChild(transcript);
          this.container.appendChild(bubble);
        }
      };

      await dialoguePanel.add(utteranceWithTiming);

      // Verify word spans are created
      const wordSpans = document.querySelectorAll('.word');
      expect(wordSpans.length).toBe(3);
      expect(wordSpans[0].textContent).toBe('Hello');
      expect(wordSpans[1].textContent).toBe('world');
      expect(wordSpans[2].textContent).toBe('test');

      // Test word-level playback
      wordSpans[0].click();
      await flushPromises();

      expect(mockAudioContext.resume).toHaveBeenCalled();
      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
      
      const bufferSource = mockAudioContext.createBufferSource.mock.results[0].value;
      expect(bufferSource.buffer).toBe(mockAudioBuffer);
      expect(bufferSource.connect).toHaveBeenCalledWith(mockAudioContext.destination);
      expect(bufferSource.start).toHaveBeenCalledWith(0, 0, 0.6);
    });
  });

  describe('Audio Error Handling Integration', () => {
    test('should handle getUserMedia failures gracefully', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(permissionError);

      const audioManager = {
        async init() {
          try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (err) {
            if (err.name === 'NotAllowedError') {
              throw new Error('Microphone permission denied. Please allow microphone access and try again.');
            }
            throw err;
          }
        }
      };

      await expect(audioManager.init()).rejects.toThrow(
        'Microphone permission denied. Please allow microphone access and try again.'
      );
    });

    test('should handle audio playback failures with TTS fallback', async () => {
      // Mock audio play failure
      mockAudio.play.mockRejectedValue(new Error('Audio play failed'));

      const playAudioFor = (word) => {
        const utteranceData = { audioURL: 'blob:mock-url' };
        const audio = new Audio(utteranceData.audioURL);
        return audio.play().catch(err => {
          console.warn('Failed to play utterance audio:', err);
          // Fallback to TTS
          const utterance = new SpeechSynthesisUtterance(word);
          utterance.rate = 0.8;
          utterance.pitch = 1.0;
          utterance.volume = 0.7;
          speechSynthesis.speak(utterance);
        });
      };

      await playAudioFor('test');

      expect(mockAudio.play).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('Failed to play utterance audio:', expect.any(Error));
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('test');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
    });

    test('should handle AudioContext creation failures', () => {
      const originalAudioContext = global.AudioContext;
      global.AudioContext = vi.fn(() => {
        throw new Error('AudioContext creation failed');
      });

      expect(() => new AudioContext()).toThrow('AudioContext creation failed');
      global.AudioContext = originalAudioContext;
    });

    test('should handle audio decoding failures', async () => {
      mockAudioContext.decodeAudioData.mockRejectedValue(new Error('Invalid audio data'));

      const audioCtx = new AudioContext();
      const mockArrayBuffer = new ArrayBuffer(1024);

      await expect(audioCtx.decodeAudioData(mockArrayBuffer)).rejects.toThrow('Invalid audio data');
    });
  });

  describe('Mobile Audio Integration', () => {
    test('should handle mobile-specific audio constraints', async () => {
      // Mock mobile user agent
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        writable: true
      });

      const isMobileDevice = () => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      };

      expect(isMobileDevice()).toBe(true);

      // Test mobile-specific audio constraints
      const mobileAudioConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      };

      const audioManager = {
        async init() {
          const stream = await navigator.mediaDevices.getUserMedia(mobileAudioConstraints);
          return stream;
        }
      };

      await audioManager.init();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(mobileAudioConstraints);
    });

    test('should handle mobile debug panel updates', () => {
      const mobileDebug = (message) => {
        const debugPanel = document.getElementById('mobileDebug');
        const debugOutput = document.getElementById('debugOutput');
        
        if (debugPanel && debugOutput) {
          debugPanel.style.display = 'block';
          const timestamp = new Date().toLocaleTimeString();
          debugOutput.innerHTML += `<div>[${timestamp}] ${message}</div>`;
        }
      };

      mobileDebug('Test mobile debug message');

      const debugPanel = document.getElementById('mobileDebug');
      const debugOutput = document.getElementById('debugOutput');
      
      expect(debugPanel.style.display).toBe('block');
      expect(debugOutput.innerHTML).toContain('Test mobile debug message');
    });
  });

  describe('Audio Performance Integration', () => {
    test('should handle multiple concurrent audio operations', async () => {
      const audioOps = [];
      
      // Simulate multiple concurrent audio operations
      for (let i = 0; i < 5; i++) {
        audioOps.push(new Promise(resolve => {
          const audio = new Audio(`blob:mock-url-${i}`);
          audio.play().then(() => resolve(`audio-${i}`));
        }));
      }

      const results = await Promise.all(audioOps);
      
      expect(results.length).toBe(5);
      expect(mockAudio.play).toHaveBeenCalledTimes(5);
    });

    test('should handle audio buffer caching efficiently', async () => {
      const bufferCache = new Map();
      const audioCtx = new AudioContext();
      
      // Simulate multiple requests for the same audio buffer
      const recordId = 'test-record';
      
      for (let i = 0; i < 3; i++) {
        let buffer = bufferCache.get(recordId);
        
        if (!buffer) {
          const mockArrayBuffer = new ArrayBuffer(1024);
          buffer = await audioCtx.decodeAudioData(mockArrayBuffer);
          bufferCache.set(recordId, buffer);
        }
        
        expect(buffer).toBeDefined();
      }
      
      // Should only decode once due to caching
      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledTimes(1);
      expect(bufferCache.size).toBe(1);
    });
  });

  describe('Cross-Browser Audio Compatibility', () => {
    test('should handle webkit AudioContext fallback', () => {
      const originalAudioContext = global.AudioContext;
      delete global.AudioContext;
      
      const audioCtx = new webkitAudioContext();
      
      expect(global.webkitAudioContext).toHaveBeenCalled();
      expect(audioCtx.state).toBe('suspended');
      global.AudioContext = originalAudioContext;
    });

    test('should handle MediaRecorder mime type variations', () => {
      const testMimeTypes = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg'
      ];

      testMimeTypes.forEach(mimeType => {
        mockMediaRecorder.mimeType = mimeType;
        const recorder = new MediaRecorder(mockStream);
        
        expect(recorder.mimeType).toBe(mimeType);
      });
    });
  });
});
