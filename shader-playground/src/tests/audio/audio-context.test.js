import { describe, test, expect, beforeEach, vi, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock DOM environment
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="app"></div>
    </body>
  </html>
`);

globalThis.document = dom.window.document;
globalThis.window = dom.window;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  writable: true
});

// Mock AudioContext
let mockAudioContext;
let mockBufferSource;

beforeEach(() => {
  // Create fresh mock instances for each test
  mockBufferSource = {
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    buffer: null,
    playbackRate: { value: 1.0 },
    detune: { value: 0 },
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    onended: null
  };

  mockAudioContext = {
    state: 'suspended',
    sampleRate: 44100,
    currentTime: 0,
    destination: { channelCount: 2, channelCountMode: 'explicit' },
    listener: {},
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createBufferSource: vi.fn(() => mockBufferSource),
    createGain: vi.fn(() => ({
      gain: { value: 1.0 },
      connect: vi.fn(),
      disconnect: vi.fn()
    })),
    decodeAudioData: vi.fn(() => Promise.resolve({
      duration: 2.5,
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 110250,
      getChannelData: vi.fn(() => new Float32Array(110250))
    })),
    createBuffer: vi.fn(() => ({
      duration: 2.5,
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 110250,
      getChannelData: vi.fn(() => new Float32Array(110250))
    }))
  };

  // Mock constructors
  Object.defineProperty(globalThis, 'AudioContext', {
    value: vi.fn(() => mockAudioContext),
    writable: true
  });

  Object.defineProperty(globalThis, 'webkitAudioContext', {
    value: vi.fn(() => mockAudioContext),
    writable: true
  });
});

beforeAll(() => {
  // Mock console methods to avoid noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('AudioContext Management', () => {
  describe('AudioContext Creation', () => {
    test('should create AudioContext with standard constructor', () => {
      const audioCtx = new AudioContext();
      
      expect(globalThis.AudioContext).toHaveBeenCalledTimes(1);
      expect(audioCtx.state).toBe('suspended');
      expect(audioCtx.sampleRate).toBe(44100);
      expect(audioCtx.destination).toBeDefined();
    });

    test('should create AudioContext with webkit fallback', () => {
      // Temporarily replace standard AudioContext
      const originalAudioContext = globalThis.AudioContext;
      globalThis.AudioContext = undefined;
      
      const audioCtx = new globalThis.webkitAudioContext();
      
      expect(globalThis.webkitAudioContext).toHaveBeenCalledTimes(1);
      expect(audioCtx.state).toBe('suspended');
      
      // Restore AudioContext
      globalThis.AudioContext = originalAudioContext;
    });

    test('should handle missing AudioContext gracefully', () => {
      // Remove both AudioContext constructors
      const originalAudioContext = globalThis.AudioContext;
      const originalWebkitAudioContext = globalThis.webkitAudioContext;
      globalThis.AudioContext = undefined;
      globalThis.webkitAudioContext = undefined;
      
      expect(() => new (globalThis.AudioContext || globalThis.webkitAudioContext)()).toThrow();
      
      // Restore constructors
      globalThis.AudioContext = originalAudioContext;
      globalThis.webkitAudioContext = originalWebkitAudioContext;
    });
  });

  describe('AudioContext State Management', () => {
    test('should handle suspended state', () => {
      mockAudioContext.state = 'suspended';
      const audioCtx = new AudioContext();
      
      expect(audioCtx.state).toBe('suspended');
    });

    test('should handle running state', () => {
      mockAudioContext.state = 'running';
      const audioCtx = new AudioContext();
      
      expect(audioCtx.state).toBe('running');
    });

    test('should handle closed state', () => {
      mockAudioContext.state = 'closed';
      const audioCtx = new AudioContext();
      
      expect(audioCtx.state).toBe('closed');
    });

    test('should resume suspended AudioContext', async () => {
      mockAudioContext.state = 'suspended';
      const audioCtx = new AudioContext();
      
      await audioCtx.resume();
      
      expect(audioCtx.resume).toHaveBeenCalledTimes(1);
    });

    test('should suspend running AudioContext', async () => {
      mockAudioContext.state = 'running';
      const audioCtx = new AudioContext();
      
      await audioCtx.suspend();
      
      expect(audioCtx.suspend).toHaveBeenCalledTimes(1);
    });

    test('should close AudioContext', async () => {
      const audioCtx = new AudioContext();
      
      await audioCtx.close();
      
      expect(audioCtx.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureAudioContext Function', () => {
    // This is the function from DialoguePanel that ensures AudioContext is resumed
    const ensureAudioContext = async (audioCtx) => {
      if (audioCtx.state === 'suspended') {
        try {
          console.log('🔈 Resuming AudioContext for playback');
          await audioCtx.resume();
          console.log('✅ AudioContext state:', audioCtx.state);
        } catch (err) {
          console.warn('AudioContext resume failed:', err);
        }
      }
    };

    test('should resume suspended AudioContext', async () => {
      mockAudioContext.state = 'suspended';
      const audioCtx = new AudioContext();
      
      await ensureAudioContext(audioCtx);
      
      expect(audioCtx.resume).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('🔈 Resuming AudioContext for playback');
    });

    test('should not resume running AudioContext', async () => {
      mockAudioContext.state = 'running';
      const audioCtx = new AudioContext();
      
      await ensureAudioContext(audioCtx);
      
      expect(audioCtx.resume).not.toHaveBeenCalled();
    });

    test('should handle resume failures gracefully', async () => {
      mockAudioContext.state = 'suspended';
      mockAudioContext.resume.mockRejectedValue(new Error('Resume failed'));
      const audioCtx = new AudioContext();
      
      await ensureAudioContext(audioCtx);
      
      expect(audioCtx.resume).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith('AudioContext resume failed:', expect.any(Error));
    });
  });

  describe('Audio Buffer Operations', () => {
    test('should decode audio data successfully', async () => {
      const audioCtx = new AudioContext();
      const mockArrayBuffer = new ArrayBuffer(1024);
      
      const buffer = await audioCtx.decodeAudioData(mockArrayBuffer);
      
      expect(audioCtx.decodeAudioData).toHaveBeenCalledWith(mockArrayBuffer);
      expect(buffer.duration).toBe(2.5);
      expect(buffer.sampleRate).toBe(44100);
    });

    test('should handle audio decoding failures', async () => {
      const audioCtx = new AudioContext();
      const mockArrayBuffer = new ArrayBuffer(1024);
      
      audioCtx.decodeAudioData.mockRejectedValue(new Error('Invalid audio data'));
      
      await expect(audioCtx.decodeAudioData(mockArrayBuffer)).rejects.toThrow('Invalid audio data');
    });

    test('should create audio buffer manually', () => {
      const audioCtx = new AudioContext();
      
      const buffer = audioCtx.createBuffer(2, 44100, 44100);
      
      expect(audioCtx.createBuffer).toHaveBeenCalledWith(2, 44100, 44100);
      expect(buffer.numberOfChannels).toBe(2);
      expect(buffer.sampleRate).toBe(44100);
    });
  });

  describe('Audio Buffer Source Operations', () => {
    test('should create buffer source', () => {
      const audioCtx = new AudioContext();
      
      const source = audioCtx.createBufferSource();
      
      expect(audioCtx.createBufferSource).toHaveBeenCalledTimes(1);
      expect(source.start).toBeDefined();
      expect(source.stop).toBeDefined();
      expect(source.connect).toBeDefined();
    });

    test('should configure buffer source', () => {
      const audioCtx = new AudioContext();
      const mockBuffer = {
        duration: 2.5,
        sampleRate: 44100
      };
      
      const source = audioCtx.createBufferSource();
      source.buffer = mockBuffer;
      
      expect(source.buffer).toBe(mockBuffer);
    });

    test('should connect buffer source to destination', () => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createBufferSource();
      
      source.connect(audioCtx.destination);
      
      expect(source.connect).toHaveBeenCalledWith(audioCtx.destination);
    });

    test('should start buffer source playback', () => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createBufferSource();
      
      source.start(0, 0.5, 1.0);
      
      expect(source.start).toHaveBeenCalledWith(0, 0.5, 1.0);
    });

    test('should stop buffer source playback', () => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createBufferSource();
      
      source.stop(2.0);
      
      expect(source.stop).toHaveBeenCalledWith(2.0);
    });

    test('should handle buffer source playback with timing', () => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createBufferSource();
      const mockBuffer = {
        duration: 2.5,
        sampleRate: 44100
      };
      
      source.buffer = mockBuffer;
      source.connect(audioCtx.destination);
      
      // Test word timing playback (similar to DialoguePanel)
      const wordStart = 0.2;
      const wordEnd = 0.8;
      const playbackBuffer = 0.1;
      
      const bufferedStart = Math.max(0, wordStart - playbackBuffer);
      const bufferedEnd = Math.min(mockBuffer.duration, wordEnd + playbackBuffer);
      
      source.start(0, bufferedStart, bufferedEnd - bufferedStart);
      
      expect(source.start).toHaveBeenCalledWith(0, 0.1, 0.8);
    });
  });

  describe('Audio Context Error Handling', () => {
    test('should handle AudioContext creation errors', () => {
      globalThis.AudioContext = vi.fn(() => {
        throw new Error('AudioContext creation failed');
      });
      
      expect(() => new AudioContext()).toThrow('AudioContext creation failed');
    });

    test('should handle buffer source creation errors', () => {
      mockAudioContext.createBufferSource.mockImplementation(() => {
        throw new Error('Buffer source creation failed');
      });
      
      const audioCtx = new AudioContext();
      
      expect(() => audioCtx.createBufferSource()).toThrow('Buffer source creation failed');
    });

    test('should handle buffer source start errors', () => {
      mockBufferSource.start.mockImplementation(() => {
        throw new Error('Buffer source start failed');
      });
      
      const audioCtx = new AudioContext();
      const source = audioCtx.createBufferSource();
      
      expect(() => source.start()).toThrow('Buffer source start failed');
    });
  });

  describe('Audio Context Browser Compatibility', () => {
    test('should detect AudioContext support', () => {
      const hasAudioContext = 'AudioContext' in globalThis || 'webkitAudioContext' in globalThis;
      
      expect(hasAudioContext).toBe(true);
    });

    test('should handle browsers without AudioContext', () => {
      // Remove both AudioContext constructors
      const originalAudioContext = globalThis.AudioContext;
      const originalWebkitAudioContext = globalThis.webkitAudioContext;
      globalThis.AudioContext = undefined;
      globalThis.webkitAudioContext = undefined;
      
      const hasAudioContext = globalThis.AudioContext !== undefined || globalThis.webkitAudioContext !== undefined;
      expect(hasAudioContext).toBe(false);
      
      // Restore constructors
      globalThis.AudioContext = originalAudioContext;
      globalThis.webkitAudioContext = originalWebkitAudioContext;
    });
  });

  describe('Buffer Cache Management', () => {
    test('should implement buffer caching', () => {
      const bufferCache = new Map();
      const _audioCtx = new AudioContext();
      
      // Simulate DialoguePanel buffer caching
      const recordId = 'test-record-1';
      const mockBuffer = {
        duration: 2.5,
        sampleRate: 44100
      };
      
      // First access - should decode
      expect(bufferCache.get(recordId)).toBeUndefined();
      bufferCache.set(recordId, mockBuffer);
      
      // Second access - should use cache
      const cachedBuffer = bufferCache.get(recordId);
      expect(cachedBuffer).toBe(mockBuffer);
    });

    test('should handle buffer cache eviction', () => {
      const bufferCache = new Map();
      const maxCacheSize = 10;
      
      // Fill cache beyond capacity
      for (let i = 0; i < maxCacheSize + 5; i++) {
        bufferCache.set(`record-${i}`, { duration: 1.0 });
      }
      
      // Implement LRU eviction if needed
      while (bufferCache.size > maxCacheSize) {
        const oldestKey = bufferCache.keys().next().value;
        bufferCache.delete(oldestKey);
      }
      
      expect(bufferCache.size).toBeLessThanOrEqual(maxCacheSize);
    });
  });
});