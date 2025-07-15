import { describe, test, expect, beforeEach, vi, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock DOM environment
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="transcriptContainer"></div>
      <canvas id="threejs-canvas"></canvas>
    </body>
  </html>
`);

globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.navigator = dom.window.navigator;

// Mock Audio constructor - create fresh instance for each test
let mockAudio;

const createMockAudio = () => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  currentTime: 0,
  duration: 2.5,
  volume: 1.0
});

Object.defineProperty(globalThis, 'Audio', {
  value: vi.fn(() => {
    mockAudio = createMockAudio();
    return mockAudio;
  }),
  writable: true
});

// Mock SpeechSynthesis API
const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => [])
};

const mockSpeechSynthesisUtterance = vi.fn(function(text) {
  this.text = text;
  this.rate = 1.0;
  this.pitch = 1.0;
  this.volume = 1.0;
  this.voice = null;
  this.lang = 'en-US';
});

Object.defineProperty(globalThis, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true
});

Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
  value: mockSpeechSynthesisUtterance,
  writable: true
});

// Also set speechSynthesis on window
globalThis.window.speechSynthesis = mockSpeechSynthesis;
globalThis.window.SpeechSynthesisUtterance = mockSpeechSynthesisUtterance;

// Mock console methods
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Audio Playback Functions', () => {
  let wordToUtteranceMap;
  let playAudioFor;
  let playTTSFallback;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh word-to-utterance map
    wordToUtteranceMap = new Map();
    
    // Define the functions from main.js
    playAudioFor = (word) => {
      const utteranceData = wordToUtteranceMap.get(word.toLowerCase());
      
      if (utteranceData && utteranceData.audioURL) {
        // Play the original utterance audio
        const audio = new Audio(utteranceData.audioURL);
        audio.play().catch(err => {
          console.warn('Failed to play utterance audio:', err);
          // Fallback to TTS
          playTTSFallback(word);
        });
      } else {
        // Fallback to Text-to-Speech
        playTTSFallback(word);
      }
    };
    
    playTTSFallback = (word) => {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.rate = 0.8;
        utterance.pitch = 1.0;
        utterance.volume = 0.7;
        speechSynthesis.speak(utterance);
      } else {
        console.warn('Speech synthesis not supported - no audio playback available');
      }
    };
  });

  describe('playAudioFor()', () => {
    test('should play audio from mapped utterance', () => {
      const mockAudioURL = 'blob:mock-utterance-url';
      const utteranceData = {
        audioURL: mockAudioURL,
        utteranceId: 'test-utterance-1',
        speaker: 'user'
      };
      
      wordToUtteranceMap.set('hello', utteranceData);
      
      playAudioFor('hello');
      
      expect(globalThis.Audio).toHaveBeenCalledWith(mockAudioURL);
      expect(mockAudio.play).toHaveBeenCalledTimes(1);
    });

    test('should handle case-insensitive word matching', () => {
      const mockAudioURL = 'blob:mock-utterance-url';
      const utteranceData = {
        audioURL: mockAudioURL,
        utteranceId: 'test-utterance-1',
        speaker: 'user'
      };
      
      wordToUtteranceMap.set('hello', utteranceData);
      
      playAudioFor('HELLO');
      
      expect(globalThis.Audio).toHaveBeenCalledWith(mockAudioURL);
      expect(mockAudio.play).toHaveBeenCalledTimes(1);
    });

    test('should fallback to TTS when no utterance data found', () => {
      playAudioFor('unknown');
      
      expect(globalThis.Audio).not.toHaveBeenCalled();
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('unknown');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    });

    test('should fallback to TTS when utterance data has no audioURL', () => {
      const utteranceData = {
        utteranceId: 'test-utterance-1',
        speaker: 'user'
        // No audioURL
      };
      
      wordToUtteranceMap.set('hello', utteranceData);
      
      playAudioFor('hello');
      
      expect(globalThis.Audio).not.toHaveBeenCalled();
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('hello');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    });

    test('should fallback to TTS when audio play fails', async () => {
      const mockAudioURL = 'blob:mock-utterance-url';
      const utteranceData = {
        audioURL: mockAudioURL,
        utteranceId: 'test-utterance-1',
        speaker: 'user'
      };
      
      wordToUtteranceMap.set('hello', utteranceData);
      
      // Mock audio play failure
      mockAudio.play.mockRejectedValue(new Error('Audio play failed'));
      
      playAudioFor('hello');
      
      expect(globalThis.Audio).toHaveBeenCalledWith(mockAudioURL);
      expect(mockAudio.play).toHaveBeenCalledTimes(1);
      
      // Wait for promise to resolve and catch to be called
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(console.warn).toHaveBeenCalledWith('Failed to play utterance audio:', expect.any(Error));
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('hello');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    });
  });

  describe('playTTSFallback()', () => {
    test('should create and speak SpeechSynthesisUtterance', () => {
      playTTSFallback('test');
      
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('test');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
      
      const utteranceInstance = mockSpeechSynthesisUtterance.mock.instances[0];
      expect(utteranceInstance.text).toBe('test');
      expect(utteranceInstance.rate).toBe(0.8);
      expect(utteranceInstance.pitch).toBe(1.0);
      expect(utteranceInstance.volume).toBe(0.7);
    });

    test('should configure TTS utterance properties', () => {
      playTTSFallback('hello');
      
      const utteranceInstance = mockSpeechSynthesisUtterance.mock.instances[0];
      expect(utteranceInstance.rate).toBe(0.8);
      expect(utteranceInstance.pitch).toBe(1.0);
      expect(utteranceInstance.volume).toBe(0.7);
    });

    test('should handle missing speechSynthesis API', () => {
      // Temporarily remove speechSynthesis
      const originalSpeechSynthesis = globalThis.speechSynthesis;
      delete globalThis.speechSynthesis;
      
      playTTSFallback('test');
      
      expect(console.warn).toHaveBeenCalledWith(
        'Speech synthesis not supported - no audio playback available'
      );
      expect(mockSpeechSynthesisUtterance).not.toHaveBeenCalled();
      
      // Restore speechSynthesis
      globalThis.speechSynthesis = originalSpeechSynthesis;
    });
  });

  describe('Word-to-Utterance Mapping', () => {
    test('should map words from utterance with wordTimings', () => {
      const mockRecord = {
        id: 'test-utterance-1',
        speaker: 'user',
        audioURL: 'blob:mock-url',
        wordTimings: [
          { word: 'Hello', start: 0.0, end: 0.5 },
          { word: 'world!', start: 0.6, end: 1.0 }
        ]
      };
      
      // Simulate the mapping process from main.js
      if (mockRecord.audioURL && mockRecord.wordTimings) {
        mockRecord.wordTimings.forEach(wordTiming => {
          const word = wordTiming.word.toLowerCase().replace(/[^\w]/g, ''); // Clean word
          if (word) {
            wordToUtteranceMap.set(word, {
              audioURL: mockRecord.audioURL,
              wordTiming: wordTiming,
              utteranceId: mockRecord.id,
              speaker: mockRecord.speaker
            });
          }
        });
      }
      
      // Test that words are mapped correctly
      const helloData = wordToUtteranceMap.get('hello');
      expect(helloData).toBeDefined();
      expect(helloData.audioURL).toBe('blob:mock-url');
      expect(helloData.wordTiming.word).toBe('Hello');
      expect(helloData.wordTiming.start).toBe(0.0);
      expect(helloData.wordTiming.end).toBe(0.5);
      
      const worldData = wordToUtteranceMap.get('world');
      expect(worldData).toBeDefined();
      expect(worldData.audioURL).toBe('blob:mock-url');
      expect(worldData.wordTiming.word).toBe('world!');
      expect(worldData.wordTiming.start).toBe(0.6);
      expect(worldData.wordTiming.end).toBe(1.0);
    });

    test('should map words from utterance without wordTimings', () => {
      const mockRecord = {
        id: 'test-utterance-1',
        speaker: 'user',
        audioURL: 'blob:mock-url',
        text: 'Hello world test'
      };
      
      // Simulate the mapping process from main.js
      if (mockRecord.audioURL && mockRecord.text && mockRecord.text !== '...') {
        const words = mockRecord.text.toLowerCase().match(/\b\w+\b/g) || [];
        words.forEach(word => {
          if (!wordToUtteranceMap.has(word)) {
            wordToUtteranceMap.set(word, {
              audioURL: mockRecord.audioURL,
              utteranceId: mockRecord.id,
              speaker: mockRecord.speaker
            });
          }
        });
      }
      
      // Test that words are mapped correctly
      const helloData = wordToUtteranceMap.get('hello');
      expect(helloData).toBeDefined();
      expect(helloData.audioURL).toBe('blob:mock-url');
      expect(helloData.utteranceId).toBe('test-utterance-1');
      
      const worldData = wordToUtteranceMap.get('world');
      expect(worldData).toBeDefined();
      expect(worldData.audioURL).toBe('blob:mock-url');
      
      const testData = wordToUtteranceMap.get('test');
      expect(testData).toBeDefined();
      expect(testData.audioURL).toBe('blob:mock-url');
    });

    test('should not overwrite existing word mappings', () => {
      const firstRecord = {
        id: 'utterance-1',
        speaker: 'user',
        audioURL: 'blob:first-url',
        text: 'Hello world'
      };
      
      const secondRecord = {
        id: 'utterance-2',
        speaker: 'ai',
        audioURL: 'blob:second-url',
        text: 'Hello again'
      };
      
      // Map first record
      const words1 = firstRecord.text.toLowerCase().match(/\b\w+\b/g) || [];
      words1.forEach(word => {
        if (!wordToUtteranceMap.has(word)) {
          wordToUtteranceMap.set(word, {
            audioURL: firstRecord.audioURL,
            utteranceId: firstRecord.id,
            speaker: firstRecord.speaker
          });
        }
      });
      
      // Map second record
      const words2 = secondRecord.text.toLowerCase().match(/\b\w+\b/g) || [];
      words2.forEach(word => {
        if (!wordToUtteranceMap.has(word)) {
          wordToUtteranceMap.set(word, {
            audioURL: secondRecord.audioURL,
            utteranceId: secondRecord.id,
            speaker: secondRecord.speaker
          });
        }
      });
      
      // "Hello" should still point to first record
      const helloData = wordToUtteranceMap.get('hello');
      expect(helloData.audioURL).toBe('blob:first-url');
      expect(helloData.utteranceId).toBe('utterance-1');
      
      // "again" should point to second record
      const againData = wordToUtteranceMap.get('again');
      expect(againData.audioURL).toBe('blob:second-url');
      expect(againData.utteranceId).toBe('utterance-2');
    });

    test('should clean punctuation from words before mapping', () => {
      const mockRecord = {
        id: 'test-utterance-1',
        speaker: 'user',
        audioURL: 'blob:mock-url',
        wordTimings: [
          { word: 'Hello!', start: 0.0, end: 0.5 },
          { word: 'world.', start: 0.6, end: 1.0 }
        ]
      };
      
      // Simulate the mapping process from main.js
      mockRecord.wordTimings.forEach(wordTiming => {
        const word = wordTiming.word.toLowerCase().replace(/[^\w]/g, ''); // Clean word
        if (word) {
          wordToUtteranceMap.set(word, {
            audioURL: mockRecord.audioURL,
            wordTiming: wordTiming,
            utteranceId: mockRecord.id,
            speaker: mockRecord.speaker
          });
        }
      });
      
      // Words should be accessible without punctuation
      expect(wordToUtteranceMap.get('hello')).toBeDefined();
      expect(wordToUtteranceMap.get('world')).toBeDefined();
      
      // But original word timing should be preserved
      const helloData = wordToUtteranceMap.get('hello');
      expect(helloData.wordTiming.word).toBe('Hello!');
    });
  });

  describe('Integration with 3D Word Clicks', () => {
    test('should handle 3D word click audio playback', () => {
      const mockAudioURL = 'blob:mock-utterance-url';
      const utteranceData = {
        audioURL: mockAudioURL,
        utteranceId: 'test-utterance-1',
        speaker: 'user'
      };
      
      wordToUtteranceMap.set('hello', utteranceData);
      
      // Simulate 3D word click (from main.js onclick handler)
      const wordFromScene = 'hello';
      playAudioFor(wordFromScene);
      
      expect(globalThis.Audio).toHaveBeenCalledWith(mockAudioURL);
      expect(mockAudio.play).toHaveBeenCalledTimes(1);
    });

    test('should handle 3D word click without audio data', () => {
      // Simulate 3D word click for word without audio
      const wordFromScene = 'unknown';
      playAudioFor(wordFromScene);
      
      expect(globalThis.Audio).not.toHaveBeenCalled();
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('unknown');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    });
  });
});