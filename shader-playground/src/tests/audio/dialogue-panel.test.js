import { describe, test, expect, beforeEach, vi, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock DOM environment
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="transcriptContainer"></div>
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

// Set up AudioContext on window before importing DialoguePanel
globalThis.window.AudioContext = vi.fn(() => mockAudioContext);
globalThis.window.webkitAudioContext = vi.fn(() => mockAudioContext);

Object.defineProperty(globalThis, 'AudioContext', {
  value: globalThis.window.AudioContext,
  writable: true
});

Object.defineProperty(globalThis, 'webkitAudioContext', {
  value: globalThis.window.webkitAudioContext,
  writable: true
});

// Mock Audio constructor
const mockAudio = {
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  currentTime: 0,
  duration: 2.5,
  volume: 1.0
};

Object.defineProperty(globalThis, 'Audio', {
  value: vi.fn(() => mockAudio),
  writable: true
});

// Mock URL.createObjectURL
Object.defineProperty(globalThis.URL, 'createObjectURL', {
  value: vi.fn(() => 'blob:mock-url'),
  writable: true
});

describe('DialoguePanel Audio Functionality', () => {
  let panel;
  let container;
  let DialoguePanel;

  beforeAll(async () => {
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Import DialoguePanel after setting up all mocks
    const module = await import('../../ui/dialoguePanel.js');
    DialoguePanel = module.DialoguePanel;
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset DOM
    container = document.getElementById('transcriptContainer');
    container.innerHTML = '';
    
    // Create fresh DialoguePanel instance
    panel = new DialoguePanel('#transcriptContainer');
  });

  describe('Play Button Creation', () => {
    test('should create play button for utterance with audio', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      await panel.add(record);

      const playButton = container.querySelector('.play-utterance');
      expect(playButton).toBeTruthy();
      expect(playButton.textContent).toBe('⏵');
      expect(playButton.className).toBe('play-utterance');
    });

    test('should not create play button for placeholder text', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: '...',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      await panel.add(record);

      const playButton = container.querySelector('.play-utterance');
      expect(playButton).toBeNull();
    });

    test('should not create play button without audio blob', async () => {
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world'
      };

      await panel.add(record);

      const playButton = container.querySelector('.play-utterance');
      expect(playButton).toBeNull();
    });
  });

  describe('Play Button Event Handling', () => {
    test('should handle play button click events', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      await panel.add(record);

      const playButton = container.querySelector('.play-utterance');
      
      // Simulate click
      playButton.click();

      expect(mockAudioContext.resume).toHaveBeenCalledTimes(1);
      expect(globalThis.Audio).toHaveBeenCalledWith('blob:mock-url');
      expect(mockAudio.play).toHaveBeenCalledTimes(1);
    });


    test('should resume AudioContext when suspended', async () => {
      mockAudioContext.state = 'suspended';
      
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      await panel.add(record);

      const playButton = container.querySelector('.play-utterance');
      playButton.click();

      expect(mockAudioContext.resume).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('🔈 Resuming AudioContext for playback');
    });

    test('should not resume AudioContext when already running', async () => {
      mockAudioContext.state = 'running';
      
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      await panel.add(record);

      const playButton = container.querySelector('.play-utterance');
      playButton.click();

      expect(mockAudioContext.resume).not.toHaveBeenCalled();
    });
  });

  describe('Word-Level Audio', () => {
    test('should create clickable word spans with audio timing', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world test',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url',
        wordTimings: [
          { word: 'Hello', start: 0.0, end: 0.5 },
          { word: 'world', start: 0.6, end: 1.0 },
          { word: 'test', start: 1.2, end: 1.6 }
        ]
      };

      await panel.add(record);

      const wordSpans = container.querySelectorAll('.word');
      expect(wordSpans.length).toBe(3);
      
      expect(wordSpans[0].textContent).toBe('Hello');
      expect(wordSpans[1].textContent).toBe('world');
      expect(wordSpans[2].textContent).toBe('test');
    });

    test('should handle word click events for audio playback', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const mockBuffer = {
        duration: 2.5,
        sampleRate: 44100
      };
      
      mockAudioContext.decodeAudioData.mockResolvedValue(mockBuffer);
      
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url',
        wordTimings: [
          { word: 'Hello', start: 0.0, end: 0.5 },
          { word: 'world', start: 0.6, end: 1.0 }
        ]
      };

      await panel.add(record);

      const wordSpans = container.querySelectorAll('.word');
      const firstWord = wordSpans[0];
      
      // Simulate click on first word
      firstWord.click();

      expect(mockAudioContext.resume).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createBufferSource).toHaveBeenCalledTimes(1);
      
      const bufferSource = mockAudioContext.createBufferSource();
      expect(bufferSource.buffer).toBe(mockBuffer);
      expect(bufferSource.connect).toHaveBeenCalledWith(mockAudioContext.destination);
      expect(bufferSource.start).toHaveBeenCalledWith(0, -0.1, 0.6); // buffered start/end
    });


    test('should not add click handlers to words without timing data', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
        // No wordTimings provided
      };

      await panel.add(record);

      const wordSpans = container.querySelectorAll('.word');
      expect(wordSpans.length).toBe(2);
      
      // Click should not trigger audio playback
      wordSpans[0].click();
      
      expect(mockAudioContext.createBufferSource).not.toHaveBeenCalled();
    });

    test('should handle word timing buffer calculations correctly', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const mockBuffer = {
        duration: 2.5,
        sampleRate: 44100
      };
      
      mockAudioContext.decodeAudioData.mockResolvedValue(mockBuffer);
      
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url',
        wordTimings: [
          { word: 'Hello', start: 0.2, end: 0.8 }
        ]
      };

      await panel.add(record);

      const wordSpan = container.querySelector('.word');
      wordSpan.click();

      const bufferSource = mockAudioContext.createBufferSource();
      
      // Should use buffered start/end times
      // bufferedStart = Math.max(0, 0.2 - 0.1) = 0.1
      // bufferedEnd = Math.min(2.5, 0.8 + 0.1) = 0.9
      expect(bufferSource.start).toHaveBeenCalledWith(0, 0.1, 0.8); // duration = 0.9 - 0.1 = 0.8
    });
  });

  describe('Audio Context Error Handling', () => {
    test('should handle AudioContext resume failures', async () => {
      mockAudioContext.resume.mockRejectedValue(new Error('Resume failed'));
      
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      await panel.add(record);

      const playButton = container.querySelector('.play-utterance');
      playButton.click();

      expect(mockAudioContext.resume).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith('AudioContext resume failed:', expect.any(Error));
    });

    test('should handle audio decoding failures', async () => {
      mockAudioContext.decodeAudioData.mockRejectedValue(new Error('Decode failed'));
      
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      await panel.add(record);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to decode audio for test-id'),
        expect.any(Error)
      );
    });
  });

  describe('Bubble Enhancement', () => {
    test('should enhance existing bubble with audio playback', async () => {
      // First add a bubble without audio
      const initialRecord = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world'
      };

      await panel.add(initialRecord);

      // Verify no play button initially
      expect(container.querySelector('.play-utterance')).toBeNull();

      // Now enhance with audio
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const enhancedRecord = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      await panel.add(enhancedRecord);

      // Should now have play button
      const playButton = container.querySelector('.play-utterance');
      expect(playButton).toBeTruthy();
      expect(playButton.textContent).toBe('⏵');
    });

    test('should not duplicate play buttons when enhancing', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      // Add the same record twice
      await panel.add(record);
      await panel.add(record);

      const playButtons = container.querySelectorAll('.play-utterance');
      expect(playButtons.length).toBe(1);
    });
  });

  describe('Audio Buffer Caching', () => {
    test('should cache decoded audio buffers', async () => {
      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      const mockBuffer = {
        duration: 2.5,
        sampleRate: 44100
      };
      
      mockAudioContext.decodeAudioData.mockResolvedValue(mockBuffer);
      
      const record = {
        id: 'test-id',
        speaker: 'user',
        text: 'Hello world',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      };

      // Add the record twice
      await panel.add(record);
      await panel.add(record);

      // Should only decode once due to caching
      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledTimes(1);
    });
  });
});