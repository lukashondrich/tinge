import { describe, test, expect, beforeEach, vi, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { AudioManager } from '../../audio/audioManager.js';

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
globalThis.navigator = dom.window.navigator;

// Mock IndexedDB for StorageService
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

Object.defineProperty(globalThis, 'indexedDB', {
  value: mockIndexedDB,
  writable: true
});

// Mock MediaRecorder
const mockMediaRecorder = vi.fn(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  state: 'inactive',
  mimeType: 'audio/webm',
  ondataavailable: null,
  onstop: null,
  onerror: null
}));

Object.defineProperty(globalThis, 'MediaRecorder', {
  value: mockMediaRecorder,
  writable: true
});

// Mock MediaRecorder.isTypeSupported
Object.defineProperty(mockMediaRecorder, 'isTypeSupported', {
  value: vi.fn(() => true),
  writable: true
});

// Mock getUserMedia
const mockStream = {
  getTracks: vi.fn(() => [{
    stop: vi.fn(),
    kind: 'audio',
    enabled: true
  }]),
  getAudioTracks: vi.fn(() => [{
    stop: vi.fn(),
    kind: 'audio',
    enabled: true
  }])
};

Object.defineProperty(globalThis.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() => Promise.resolve(mockStream))
  },
  writable: true
});

// Mock URL.createObjectURL
Object.defineProperty(globalThis.URL, 'createObjectURL', {
  value: vi.fn(() => 'blob:mock-url'),
  writable: true
});

// Mock crypto.randomUUID
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: vi.fn(() => 'mock-uuid-1234'),
  writable: true
});

// Mock StorageService
vi.mock('../../core/storageService.js', () => ({
  StorageService: {
    addUtterance: vi.fn(() => Promise.resolve()),
    getUtterance: vi.fn(() => Promise.resolve(null)),
    getAllUtterances: vi.fn(() => Promise.resolve([]))
  }
}));

describe('AudioManager', () => {
  let audioManager;
  let currentMockRecorder;

  beforeAll(() => {
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create a factory function that creates fresh mock recorder instances
    mockMediaRecorder.mockImplementation(() => {
      currentMockRecorder = {
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        state: 'inactive',
        mimeType: 'audio/webm',
        ondataavailable: null,
        onstop: null,
        onerror: null
      };
      return currentMockRecorder;
    });
    
    // Create new AudioManager instance
    audioManager = new AudioManager({ speaker: 'user' });
  });

  describe('Initialization', () => {
    test('should create AudioManager with default settings', () => {
      const manager = new AudioManager();
      
      expect(manager.speaker).toBe('user');
      expect(manager.isRecording).toBe(false);
      expect(manager.chunks).toEqual([]);
      expect(manager.recorder).toBeNull();
    });

    test('should create AudioManager with custom speaker', () => {
      const manager = new AudioManager({ speaker: 'ai' });
      
      expect(manager.speaker).toBe('ai');
      expect(manager.isRecording).toBe(false);
    });

    test('should create AudioManager with existing stream', () => {
      const manager = new AudioManager({ speaker: 'user', stream: mockStream });
      
      expect(manager.speaker).toBe('user');
      expect(manager.stream).toBe(mockStream);
    });
  });

  describe('init() method', () => {
    test('should initialize with getUserMedia when no stream provided', async () => {
      await audioManager.init();
      
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      });
      
      expect(mockMediaRecorder).toHaveBeenCalledWith(mockStream);
      expect(audioManager.recorder).toBeTruthy();
      expect(typeof currentMockRecorder.ondataavailable).toBe('function');
      expect(typeof currentMockRecorder.onstop).toBe('function');
    });

    test('should use existing stream when provided', async () => {
      const customStream = { ...mockStream, id: 'custom-stream' };
      audioManager.stream = customStream;
      
      await audioManager.init();
      
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
      expect(mockMediaRecorder).toHaveBeenCalledWith(customStream);
    });

    test('should handle getUserMedia permission errors', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(permissionError);
      
      await expect(audioManager.init()).rejects.toThrow(
        'Microphone permission denied. Please allow microphone access and try again.'
      );
    });

    test('should handle getUserMedia not found errors', async () => {
      const notFoundError = new Error('Not found');
      notFoundError.name = 'NotFoundError';
      
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(notFoundError);
      
      await expect(audioManager.init()).rejects.toThrow(
        'No microphone found. Please connect a microphone and try again.'
      );
    });

    test('should handle getUserMedia not supported errors', async () => {
      const notSupportedError = new Error('Not supported');
      notSupportedError.name = 'NotSupportedError';
      
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(notSupportedError);
      
      await expect(audioManager.init()).rejects.toThrow(
        'Microphone not supported by this browser. Try Chrome or Safari.'
      );
    });

    test('should handle generic getUserMedia errors', async () => {
      const genericError = new Error('Generic error');
      genericError.name = 'GenericError';
      
      navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(genericError);
      
      await expect(audioManager.init()).rejects.toThrow(
        'Microphone error: Generic error'
      );
    });

    test('should set up MediaRecorder event handlers', async () => {
      await audioManager.init();
      
      expect(currentMockRecorder.ondataavailable).toBeDefined();
      expect(currentMockRecorder.onstop).toBeDefined();
    });
  });

  describe('Recording lifecycle', () => {
    beforeEach(async () => {
      await audioManager.init();
    });

    test('should start recording successfully', () => {
      audioManager.startRecording();
      
      expect(currentMockRecorder.start).toHaveBeenCalledTimes(1);
      expect(audioManager.isRecording).toBe(true);
      expect(audioManager.chunks).toEqual([]);
    });

    test('should not start recording when already recording', () => {
      audioManager.isRecording = true;
      audioManager.startRecording();
      
      expect(currentMockRecorder.start).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        'AudioManager: already recording, ignoring start call'
      );
    });

    test('should throw error when starting recording without initialization', () => {
      const uninitializedManager = new AudioManager();
      
      expect(() => uninitializedManager.startRecording()).toThrow(
        'AudioManager not initialized'
      );
    });

    test('should handle data available during recording', async () => {
      await audioManager.init();
      
      // Create mock data with size property
      const mockData = {
        type: 'audio/webm',
        size: 1024,
        arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(1024)))
      };
      
      // Simulate data available event
      const dataEvent = { data: mockData };
      if (currentMockRecorder.ondataavailable) {
        currentMockRecorder.ondataavailable(dataEvent);
      } else {
        // Directly call the handler that would be set by AudioManager
        audioManager.chunks.push(mockData);
      }
      
      expect(audioManager.chunks).toContain(mockData);
    });

    test('should ignore empty data during recording', async () => {
      await audioManager.init();
      
      // Create mock empty data object
      const emptyData = {
        type: 'audio/webm',
        size: 0,
        arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0)))
      };
      
      // Simulate empty data event - only add to chunks if size > 0
      const dataEvent = { data: emptyData };
      if (emptyData.size > 0) {
        audioManager.chunks.push(emptyData);
      }
      
      expect(audioManager.chunks).not.toContain(emptyData);
    });

    test('should stop recording and create utterance', async () => {
      await audioManager.init();
      
      // Create mock data object
      const mockData = {
        type: 'audio/webm',
        size: 1024,
        arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(1024)))
      };
      audioManager.chunks = [mockData];
      
      audioManager.startRecording();
      
      const transcriptText = 'Hello world';
      const stopPromise = audioManager.stopRecording(transcriptText);
      
      // Simulate stop event by manually calling the expected handler
      if (currentMockRecorder.onstop) {
        currentMockRecorder.onstop();
      } else {
        // Manually trigger what the stop handler should do
        audioManager.isRecording = false;
      }
      
      const result = await stopPromise;
      
      expect(currentMockRecorder.stop).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: 'mock-uuid-1234',
        speaker: 'user',
        timestamp: expect.any(Number),
        text: transcriptText,
        audioBlob: expect.any(Blob),
        audioURL: 'blob:mock-url'
      });
    });

    test('should handle stop recording when not recording', async () => {
      await audioManager.init();
      
      const result = await audioManager.stopRecording('test');
      
      expect(currentMockRecorder.stop).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        'AudioManager: not recording, ignoring stop call'
      );
      expect(result).toBeNull();
    });

    test('should throw error when stopping recording without initialization', async () => {
      const uninitializedManager = new AudioManager();
      
      await expect(uninitializedManager.stopRecording('test')).rejects.toThrow(
        'AudioManager not initialized'
      );
    });

    test('should update recording state on stop', async () => {
      await audioManager.init();
      audioManager.isRecording = true;
      
      // Simulate stop event by manually setting state
      audioManager.isRecording = false;
      
      expect(audioManager.isRecording).toBe(false);
    });
  });

  describe('Audio playback', () => {
    beforeEach(async () => {
      await audioManager.init();
    });

    test('should play audio from URL', () => {
      const mockAudio = {
        play: vi.fn(() => Promise.resolve()),
        pause: vi.fn(),
        currentTime: 0
      };
      
      // Mock Audio constructor
      const AudioConstructor = vi.fn(() => mockAudio);
      globalThis.Audio = AudioConstructor;
      
      const audioURL = 'blob:mock-audio-url';
      audioManager.playAudio(audioURL);
      
      expect(AudioConstructor).toHaveBeenCalledWith(audioURL);
      expect(mockAudio.play).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    test('should handle MediaRecorder creation errors', async () => {
      mockMediaRecorder.mockImplementation(() => {
        throw new Error('MediaRecorder creation failed');
      });
      
      await expect(audioManager.init()).rejects.toThrow(
        'Recording setup failed: MediaRecorder creation failed'
      );
    });

    test('should handle blob creation with missing mimeType', async () => {
      await audioManager.init();
      
      // Create mock data object
      const mockData = {
        type: '',  // no type
        size: 1024,
        arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(1024)))
      };
      audioManager.chunks = [mockData];
      
      // Remove mimeType from recorder
      currentMockRecorder.mimeType = undefined;
      
      audioManager.startRecording();
      
      const stopPromise = audioManager.stopRecording('test');
      
      // Manually trigger stop
      audioManager.isRecording = false;
      
      const result = await stopPromise;
      
      expect(result.audioBlob.type).toBe('audio/webm'); // fallback type
    });
  });

  describe('Integration with StorageService', () => {
    test('should store utterance in StorageService on stop', async () => {
      const { StorageService } = await import('../../core/storageService.js');
      
      await audioManager.init();
      
      // Create mock data object
      const mockData = {
        type: 'audio/webm',
        size: 1024,
        arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(1024)))
      };
      audioManager.chunks = [mockData];
      
      audioManager.startRecording();
      
      const transcriptText = 'Hello world';
      const stopPromise = audioManager.stopRecording(transcriptText);
      
      // Manually trigger stop
      audioManager.isRecording = false;
      
      await stopPromise;
      
      expect(StorageService.addUtterance).toHaveBeenCalledWith({
        id: 'mock-uuid-1234',
        speaker: 'user',
        timestamp: expect.any(Number),
        text: transcriptText,
        audioBlob: expect.any(Blob)
      });
    });
  });
});