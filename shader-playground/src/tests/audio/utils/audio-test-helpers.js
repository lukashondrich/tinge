import { vi } from 'vitest';

/**
 * Audio Testing Utilities
 * 
 * Collection of helper functions and mocks for testing audio functionality
 */

// Mock AudioContext constructor
export const createMockAudioContext = (options = {}) => {
  const mockBufferSource = {
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

  const mockAudioContext = {
    state: options.initialState || 'suspended',
    sampleRate: options.sampleRate || 44100,
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
      duration: options.bufferDuration || 2.5,
      sampleRate: options.sampleRate || 44100,
      numberOfChannels: 2,
      length: options.bufferLength || 110250,
      getChannelData: vi.fn(() => new Float32Array(options.bufferLength || 110250))
    })),
    createBuffer: vi.fn(() => ({
      duration: options.bufferDuration || 2.5,
      sampleRate: options.sampleRate || 44100,
      numberOfChannels: 2,
      length: options.bufferLength || 110250,
      getChannelData: vi.fn(() => new Float32Array(options.bufferLength || 110250))
    }))
  };

  return { mockAudioContext, mockBufferSource };
};

// Mock Audio constructor
export const createMockAudio = (options = {}) => {
  const mockAudio = {
    play: vi.fn(() => options.playFails ? Promise.reject(new Error('Audio play failed')) : Promise.resolve()),
    pause: vi.fn(),
    load: vi.fn(),
    currentTime: 0,
    duration: options.duration || 2.5,
    volume: 1.0,
    muted: false,
    paused: true,
    ended: false,
    src: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  return mockAudio;
};

// Mock MediaRecorder
export const createMockMediaRecorder = (options = {}) => {
  const mockMediaRecorder = {
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    state: options.initialState || 'inactive',
    mimeType: options.mimeType || 'audio/webm',
    stream: options.stream || null,
    ondataavailable: null,
    onstop: null,
    onerror: null,
    onpause: null,
    onresume: null,
    onstart: null
  };

  return mockMediaRecorder;
};

// Mock getUserMedia
export const createMockGetUserMedia = (options = {}) => {
  const mockStream = {
    getTracks: vi.fn(() => options.tracks || [{
      stop: vi.fn(),
      kind: 'audio',
      enabled: true,
      id: 'mock-audio-track'
    }]),
    getAudioTracks: vi.fn(() => options.audioTracks || [{
      stop: vi.fn(),
      kind: 'audio',
      enabled: true,
      id: 'mock-audio-track'
    }]),
    getVideoTracks: vi.fn(() => []),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    id: 'mock-stream-id'
  };

  const mockGetUserMedia = vi.fn(() => {
    if (options.shouldFail) {
      const error = new Error(options.errorMessage || 'getUserMedia failed');
      error.name = options.errorName || 'NotAllowedError';
      return Promise.reject(error);
    }
    return Promise.resolve(mockStream);
  });

  return { mockGetUserMedia, mockStream };
};

// Mock SpeechSynthesis
export const createMockSpeechSynthesis = (options = {}) => {
  const mockSpeechSynthesis = {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => options.voices || []),
    speaking: false,
    pending: false,
    paused: false
  };

  const mockSpeechSynthesisUtterance = vi.fn(function(text) {
    this.text = text;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    this.voice = null;
    this.lang = 'en-US';
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.onpause = null;
    this.onresume = null;
    this.onmark = null;
    this.onboundary = null;
  });

  return { mockSpeechSynthesis, mockSpeechSynthesisUtterance };
};

// Mock IndexedDB
export const createMockIndexedDB = (options = {}) => {
  const mockObjectStore = {
    add: vi.fn(() => ({ onsuccess: null, onerror: null })),
    get: vi.fn(() => ({ onsuccess: null, onerror: null, result: null })),
    put: vi.fn(() => ({ onsuccess: null, onerror: null })),
    delete: vi.fn(() => ({ onsuccess: null, onerror: null })),
    getAll: vi.fn(() => ({ onsuccess: null, onerror: null, result: [] })),
    createIndex: vi.fn(),
    count: vi.fn(() => ({ onsuccess: null, onerror: null, result: 0 })),
    clear: vi.fn(() => ({ onsuccess: null, onerror: null }))
  };

  const mockTransaction = {
    objectStore: vi.fn(() => mockObjectStore),
    oncomplete: null,
    onerror: null,
    onabort: null,
    abort: vi.fn()
  };

  const mockDB = {
    transaction: vi.fn(() => mockTransaction),
    createObjectStore: vi.fn(() => mockObjectStore),
    deleteObjectStore: vi.fn(),
    close: vi.fn(),
    version: options.version || 1,
    name: options.name || 'TestDB',
    objectStoreNames: options.objectStoreNames || ['utterances']
  };

  const mockOpenRequest = {
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: mockDB
  };

  const mockIndexedDB = {
    open: vi.fn(() => mockOpenRequest),
    deleteDatabase: vi.fn(() => ({ onsuccess: null, onerror: null })),
    cmp: vi.fn()
  };

  return { mockIndexedDB, mockDB, mockTransaction, mockObjectStore, mockOpenRequest };
};

// Create mock utterance data
export const createMockUtterance = (options = {}) => {
  const mockBlob = new Blob([options.audioData || 'mock audio data'], { 
    type: options.mimeType || 'audio/webm' 
  });

  return {
    id: options.id || 'mock-utterance-id',
    speaker: options.speaker || 'user',
    timestamp: options.timestamp || Date.now(),
    text: options.text || 'Mock utterance text',
    audioBlob: mockBlob,
    audioURL: options.audioURL || 'blob:mock-url',
    wordTimings: options.wordTimings || [
      { word: 'Mock', start: 0.0, end: 0.5 },
      { word: 'utterance', start: 0.6, end: 1.0 },
      { word: 'text', start: 1.2, end: 1.6 }
    ]
  };
};

// Setup DOM environment for testing
export const setupDOMEnvironment = (options = {}) => {
  const domHTML = options.html || `
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
  `;

  return domHTML;
};

// Setup comprehensive audio mocks
export const setupAudioMocks = (globalThis, options = {}) => {
  // Mock AudioContext
  const { mockAudioContext, mockBufferSource } = createMockAudioContext(options.audioContext);
  Object.defineProperty(globalThis, 'AudioContext', {
    value: vi.fn(() => mockAudioContext),
    writable: true
  });
  Object.defineProperty(globalThis, 'webkitAudioContext', {
    value: vi.fn(() => mockAudioContext),
    writable: true
  });

  // Mock Audio
  const mockAudio = createMockAudio(options.audio);
  Object.defineProperty(globalThis, 'Audio', {
    value: vi.fn(() => mockAudio),
    writable: true
  });

  // Mock MediaRecorder
  const mockMediaRecorder = createMockMediaRecorder(options.mediaRecorder);
  Object.defineProperty(globalThis, 'MediaRecorder', {
    value: vi.fn(() => mockMediaRecorder),
    writable: true
  });

  // Mock getUserMedia
  const { mockGetUserMedia, mockStream } = createMockGetUserMedia(options.getUserMedia);
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: mockGetUserMedia
    },
    writable: true
  });

  // Mock SpeechSynthesis
  const { mockSpeechSynthesis, mockSpeechSynthesisUtterance } = createMockSpeechSynthesis(options.speechSynthesis);
  Object.defineProperty(globalThis, 'speechSynthesis', {
    value: mockSpeechSynthesis,
    writable: true
  });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: mockSpeechSynthesisUtterance,
    writable: true
  });

  // Mock IndexedDB
  const { mockIndexedDB } = createMockIndexedDB(options.indexedDB);
  Object.defineProperty(globalThis, 'indexedDB', {
    value: mockIndexedDB,
    writable: true
  });

  // Mock URL methods
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    value: vi.fn(() => options.blobURL || 'blob:mock-url'),
    writable: true
  });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true
  });

  // Mock crypto
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: vi.fn(() => options.uuid || 'mock-uuid-1234'),
    writable: true
  });

  return {
    mockAudioContext,
    mockBufferSource,
    mockAudio,
    mockMediaRecorder,
    mockGetUserMedia,
    mockStream,
    mockSpeechSynthesis,
    mockSpeechSynthesisUtterance,
    mockIndexedDB
  };
};

// Audio testing assertions
export const audioTestAssertions = {
  expectAudioPlayback: (mockAudio, shouldHaveBeenCalled = true) => {
    if (shouldHaveBeenCalled) {
      expect(mockAudio.play).toHaveBeenCalled();
    } else {
      expect(mockAudio.play).not.toHaveBeenCalled();
    }
  },

  expectAudioContextResume: (mockAudioContext, shouldHaveBeenCalled = true) => {
    if (shouldHaveBeenCalled) {
      expect(mockAudioContext.resume).toHaveBeenCalled();
    } else {
      expect(mockAudioContext.resume).not.toHaveBeenCalled();
    }
  },

  expectBufferSourcePlayback: (mockBufferSource, expectedParams = {}) => {
    expect(mockBufferSource.start).toHaveBeenCalled();
    expect(mockBufferSource.connect).toHaveBeenCalled();
    
    if (expectedParams.when !== undefined) {
      expect(mockBufferSource.start).toHaveBeenCalledWith(
        expectedParams.when,
        expectedParams.offset,
        expectedParams.duration
      );
    }
  },

  expectRecording: (mockMediaRecorder, action = 'start') => {
    if (action === 'start') {
      expect(mockMediaRecorder.start).toHaveBeenCalled();
    } else if (action === 'stop') {
      expect(mockMediaRecorder.stop).toHaveBeenCalled();
    }
  },

  expectSpeechSynthesis: (mockSpeechSynthesis, expectedText = null) => {
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
    
    if (expectedText) {
      const utteranceCall = mockSpeechSynthesis.speak.mock.calls[0][0];
      expect(utteranceCall.text).toBe(expectedText);
    }
  },

  expectStorageOperation: (mockObjectStore, operation = 'add', expectedData = null) => {
    expect(mockObjectStore[operation]).toHaveBeenCalled();
    
    if (expectedData && operation === 'add') {
      expect(mockObjectStore.add).toHaveBeenCalledWith(expectedData);
    }
  }
};

// Performance testing utilities
export const performanceTestUtils = {
  measureAudioProcessingTime: async (asyncFunction) => {
    const startTime = performance.now();
    await asyncFunction();
    const endTime = performance.now();
    return endTime - startTime;
  },

  createLargeAudioBuffer: (sizeInMB = 1) => {
    const sizeInBytes = sizeInMB * 1024 * 1024;
    return new ArrayBuffer(sizeInBytes);
  },

  simulateMemoryPressure: (iterations = 1000) => {
    const memoryHogs = [];
    for (let i = 0; i < iterations; i++) {
      memoryHogs.push(new Array(1000).fill(Math.random()));
    }
    return memoryHogs;
  }
};

// Mobile testing utilities
export const mobileTestUtils = {
  mockMobileUserAgent: (globalThis, device = 'iPhone') => {
    const userAgents = {
      iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
      Android: 'Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
      iPad: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
    };

    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: userAgents[device] || userAgents.iPhone,
      writable: true
    });

    // Mock touch support
    Object.defineProperty(globalThis, 'ontouchstart', {
      value: true,
      writable: true
    });

    Object.defineProperty(globalThis.navigator, 'maxTouchPoints', {
      value: 5,
      writable: true
    });
  },

  mockMobileConstraints: () => ({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 16000
    }
  }),

  mockMobileDebugPanel: (document) => {
    const debugPanel = document.createElement('div');
    debugPanel.id = 'mobileDebug';
    debugPanel.style.display = 'none';
    
    const debugOutput = document.createElement('div');
    debugOutput.id = 'debugOutput';
    debugPanel.appendChild(debugOutput);
    
    document.body.appendChild(debugPanel);
    return { debugPanel, debugOutput };
  }
};

// Error testing utilities
export const errorTestUtils = {
  createAudioError: (type = 'NotAllowedError', message = 'Audio error') => {
    const error = new Error(message);
    error.name = type;
    return error;
  },

  createNetworkError: (message = 'Network error') => {
    const error = new Error(message);
    error.name = 'NetworkError';
    return error;
  },

  createQuotaError: (message = 'Quota exceeded') => {
    const error = new Error(message);
    error.name = 'QuotaExceededError';
    return error;
  }
};

export default {
  createMockAudioContext,
  createMockAudio,
  createMockMediaRecorder,
  createMockGetUserMedia,
  createMockSpeechSynthesis,
  createMockIndexedDB,
  createMockUtterance,
  setupDOMEnvironment,
  setupAudioMocks,
  audioTestAssertions,
  performanceTestUtils,
  mobileTestUtils,
  errorTestUtils
};