import { beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { setupAudioMocks, setupDOMEnvironment } from './utils/audio-test-helpers.js';

// Setup DOM environment
const dom = new JSDOM(setupDOMEnvironment());
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;

// Mock console methods to avoid noise in tests
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

// Setup audio mocks for each test
beforeEach(() => {
  // Reset DOM state
  document.body.innerHTML = setupDOMEnvironment();
  
  // Clear all existing mocks
  vi.clearAllMocks();
  
  // Setup comprehensive audio mocks
  setupAudioMocks(global, {
    audioContext: {
      initialState: 'suspended',
      sampleRate: 44100,
      bufferDuration: 2.5,
      bufferLength: 110250
    },
    audio: {
      duration: 2.5,
      playFails: false
    },
    mediaRecorder: {
      initialState: 'inactive',
      mimeType: 'audio/webm'
    },
    getUserMedia: {
      shouldFail: false,
      tracks: [{
        stop: vi.fn(),
        kind: 'audio',
        enabled: true,
        id: 'mock-audio-track'
      }]
    },
    speechSynthesis: {
      voices: []
    },
    indexedDB: {
      version: 1,
      name: 'VoicePlaygroundDB',
      objectStoreNames: ['utterances']
    },
    blobURL: 'blob:mock-url',
    uuid: 'mock-uuid-1234'
  });
  
  // Mock performance.now for consistent timing
  global.performance = {
    now: vi.fn(() => Date.now()),
    timing: {},
    navigation: {},
    memory: {
      usedJSHeapSize: 1024 * 1024,
      totalJSHeapSize: 2048 * 1024,
      jsHeapSizeLimit: 4096 * 1024
    }
  };
  
  // Mock requestAnimationFrame
  global.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 16));
  global.cancelAnimationFrame = vi.fn();
  
  // Mock setTimeout/setInterval for consistent timing
  vi.useFakeTimers();
});

// Cleanup after each test
afterEach(() => {
  // Restore timers
  vi.useRealTimers();
  
  // Clear all mocks
  vi.clearAllMocks();
  
  // Reset DOM
  document.body.innerHTML = '';
  
  // Clear any global state
  if (global.window) {
    delete global.window.panel;
    delete global.window.audioCtx;
    delete global.window.wordToUtteranceMap;
    delete global.window.playAudioFor;
    delete global.window.mobileDebug;
  }
});

// Setup test environment variables
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

// Global test utilities
global.flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));
global.waitFor = (condition, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
};

// Custom matchers for audio testing
expect.extend({
  toHaveBeenCalledWithAudio(received, expectedAudioURL) {
    const pass = received.mock.calls.some(call => 
      call[0] === expectedAudioURL || 
      (call[0] && call[0].includes && call[0].includes('blob:'))
    );
    
    if (pass) {
      return {
        message: () => `Expected function not to have been called with audio URL ${expectedAudioURL}`,
        pass: true
      };
    } else {
      return {
        message: () => `Expected function to have been called with audio URL ${expectedAudioURL}`,
        pass: false
      };
    }
  },
  
  toHaveAudioPlaybackCapabilities(received) {
    const hasPlay = received.play && typeof received.play === 'function';
    const hasPause = received.pause && typeof received.pause === 'function';
    const hasCurrentTime = typeof received.currentTime === 'number';
    const hasDuration = typeof received.duration === 'number';
    
    const pass = hasPlay && hasPause && hasCurrentTime && hasDuration;
    
    if (pass) {
      return {
        message: () => `Expected object not to have audio playback capabilities`,
        pass: true
      };
    } else {
      return {
        message: () => `Expected object to have audio playback capabilities (play, pause, currentTime, duration)`,
        pass: false
      };
    }
  },
  
  toHaveValidAudioContext(received) {
    const hasCreateBufferSource = received.createBufferSource && typeof received.createBufferSource === 'function';
    const hasDecodeAudioData = received.decodeAudioData && typeof received.decodeAudioData === 'function';
    const hasResume = received.resume && typeof received.resume === 'function';
    const hasDestination = received.destination && typeof received.destination === 'object';
    const hasState = typeof received.state === 'string';
    
    const pass = hasCreateBufferSource && hasDecodeAudioData && hasResume && hasDestination && hasState;
    
    if (pass) {
      return {
        message: () => `Expected object not to have valid AudioContext interface`,
        pass: true
      };
    } else {
      return {
        message: () => `Expected object to have valid AudioContext interface`,
        pass: false
      };
    }
  }
});