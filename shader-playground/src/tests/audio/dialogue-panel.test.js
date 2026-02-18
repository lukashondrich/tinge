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

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('DialoguePanel Audio Functionality', () => {
  let panel;
  let container;
  let DialoguePanel;
  let CorrectionStore;

  beforeAll(async () => {
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Import DialoguePanel after setting up all mocks
    const module = await import('../../ui/dialoguePanel.js');
    DialoguePanel = module.DialoguePanel;
    const correctionStoreModule = await import('../../core/correctionStore.js');
    CorrectionStore = correctionStoreModule.CorrectionStore;
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockAudioContext.state = 'suspended';
    if (typeof DialoguePanel.resetCache === 'function') {
      DialoguePanel.resetCache();
    }
    
    // Reset DOM
    container = document.getElementById('transcriptContainer');
    container.innerHTML = '';
    try {
      if (globalThis.window?.localStorage) {
        globalThis.window.localStorage.clear();
      }
    } catch {
      // localStorage may be unavailable for opaque-origin JSDOM
    }
    
    // Create fresh DialoguePanel instance
    panel = new DialoguePanel('#transcriptContainer', { debounceMs: 0 });
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
      await playButton.__handlePlay();
      await flushPromises();

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
      await playButton.__handlePlay();
      await flushPromises();

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
      await playButton.__handlePlay();
      await flushPromises();

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
      expect(mockAudioContext.decodeAudioData).toHaveBeenCalled();

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
      await firstWord.__handleWord();
      await flushPromises();

      expect(mockAudioContext.resume).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createBufferSource).toHaveBeenCalledTimes(1);
      
      const bufferSource = mockAudioContext.createBufferSource.mock.results[0].value;
      expect(bufferSource.buffer).toBe(mockBuffer);
      expect(bufferSource.connect).toHaveBeenCalledWith(mockAudioContext.destination);
      expect(bufferSource.start).toHaveBeenCalledWith(0, 0, 0.6); // buffered start/end (clamped to 0)
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
      await flushPromises();
      
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
      await wordSpan.__handleWord();
      await flushPromises();

      const bufferSource = mockAudioContext.createBufferSource.mock.results[0].value;
      
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
      await playButton.__handlePlay();
      await flushPromises();

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
      await flushPromises();
      await panel.add(record);
      await flushPromises();

      const playButtons = container.querySelectorAll('.play-utterance');
      expect(playButtons.length).toBe(1);
    });

    test('prefers exact utterance-id match over older unfinalized user bubble', async () => {
      const oldBubble = document.createElement('div');
      oldBubble.className = 'bubble user';
      oldBubble.innerHTML = '<p><span class="highlighted-text">Speaking...</span></p>';
      container.appendChild(oldBubble);

      const currentBubble = document.createElement('div');
      currentBubble.className = 'bubble user';
      currentBubble.dataset.utteranceId = 'u-new';
      currentBubble.innerHTML = '<p class="transcript"><span class="highlighted-text">temporary</span></p>';
      container.appendChild(currentBubble);

      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      await panel.add({
        id: 'u-new',
        speaker: 'user',
        text: 'Final user utterance',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      });

      expect(currentBubble.textContent).toContain('Final user utterance');
      expect(oldBubble.querySelector('.highlighted-text').textContent).toContain('Speaking...');
    });

    test('reuses synthetic AI bubble for finalized utterance to avoid duplicate AI bubbles', async () => {
      const syntheticBubble = document.createElement('div');
      syntheticBubble.className = 'bubble ai';
      syntheticBubble.dataset.utteranceId = 'synthetic-ai-1';
      syntheticBubble.innerHTML = '<p class="transcript"><span class="highlighted-text">temporary stream text</span></p>';
      container.appendChild(syntheticBubble);

      const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
      await panel.add({
        id: 'ai-real-1',
        speaker: 'ai',
        text: 'Final AI utterance',
        audioBlob: mockBlob,
        audioURL: 'blob:mock-url'
      });

      const aiBubbles = container.querySelectorAll('.bubble.ai');
      expect(aiBubbles.length).toBe(1);
      expect(aiBubbles[0].dataset.utteranceId).toBe('ai-real-1');
      expect(aiBubbles[0].textContent).toContain('Final AI utterance');
    });
  });

  describe('Correction UI', () => {
    test('renders manual correction trigger on user bubbles', async () => {
      await panel.add({
        id: 'user-0',
        speaker: 'user',
        text: 'A mi me gusta canto musica.'
      });
      await panel.add({
        id: 'ai-0',
        speaker: 'ai',
        text: 'Instead of "A mi me gusta canto musica", you should say "A mi me gusta cantar musica".'
      });

      expect(container.querySelector('.bubble.user .manual-correction-trigger')).toBeTruthy();
      expect(container.querySelector('.bubble.ai .manual-correction-trigger')).toBeNull();
    });

    test('attaches correction indicator to latest AI bubble and keeps details collapsed by default', async () => {
      await panel.add({
        id: 'ai-1',
        speaker: 'ai',
        text: 'Tengo hambre mucho.'
      });

      const attached = panel.upsertCorrection({
        id: 'corr-1',
        original: 'tengo hambre mucho',
        corrected: 'tengo mucha hambre',
        correction_type: 'grammar',
        status: 'detected'
      });

      expect(attached).toBe(true);
      const toggle = container.querySelector('.correction-toggle');
      expect(toggle).toBeTruthy();
      expect(toggle.textContent).toContain('Correction');

      const details = container.querySelector('.correction-details');
      expect(details.hidden).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      const bubble = container.querySelector('.bubble.ai');
      expect(bubble.querySelector('.transcript').nextElementSibling.className).toContain('correction-widget');

      toggle.click();
      expect(container.querySelector('.correction-details').hidden).toBe(false);
      expect(container.querySelector('.correction-toggle').textContent).toContain('Hide Correction');
      container.querySelector('.correction-toggle').click();
      expect(container.querySelector('.correction-details').hidden).toBe(true);
      expect(container.textContent).toContain('Your phrase: tengo hambre mucho');
      expect(container.textContent).toContain('Correction: tengo mucha hambre');
    });

    test('updates correction verification state and persists feedback', async () => {
      const storageData = new Map();
      const storage = {
        getItem: (key) => (storageData.has(key) ? storageData.get(key) : null),
        setItem: (key, value) => storageData.set(key, value),
        clear: () => storageData.clear()
      };
      panel = new DialoguePanel('#transcriptContainer', {
        debounceMs: 0,
        correctionStore: new CorrectionStore({ storage })
      });

      await panel.add({
        id: 'ai-2',
        speaker: 'ai',
        text: 'Dirias tengo mucha hambre.'
      });

      panel.upsertCorrection({
        id: 'corr-2',
        original: 'tengo hambre mucho',
        corrected: 'tengo mucha hambre',
        correction_type: 'grammar',
        status: 'detected'
      });
      panel.updateCorrectionVerification('corr-2', {
        status: 'verified',
        verification: {
          rule: 'Adjective agreement and position.',
          confidence: 0.82
        }
      });

      container.querySelector('.correction-toggle').click();
      expect(container.textContent).toContain('Verified');
      expect(container.textContent).toContain('Adjective agreement and position.');
      expect(container.textContent).toContain('confidence 82%');

      const agreeBtn = Array.from(container.querySelectorAll('.correction-feedback-btn'))
        .find((btn) => btn.textContent === 'Agree');
      agreeBtn.click();
      const updatedAgreeBtn = Array.from(container.querySelectorAll('.correction-feedback-btn'))
        .find((btn) => btn.textContent === 'Agree');
      expect(updatedAgreeBtn.classList.contains('is-active')).toBe(true);

      const stored = JSON.parse(storage.getItem('correction_history_student_001'));
      expect(stored.corrections.find((item) => item.id === 'corr-2').user_feedback).toBe('agree');
    });

    test('attaches queued correction when verification arrives before AI bubble render', async () => {
      const queued = panel.upsertCorrection({
        id: 'corr-queued',
        original: 'a mi me gusta canto musica',
        corrected: 'a mi me gusta cantar musica',
        correction_type: 'grammar',
        status: 'detected'
      });
      expect(queued).toBe(true);
      expect(container.querySelector('.correction-toggle')).toBeNull();

      const updated = panel.updateCorrectionVerification('corr-queued', {
        status: 'verified',
        verification: {
          rule: 'After gustar use infinitive.',
          confidence: 0.9
        }
      });
      expect(updated).toBe(true);

      await panel.add({
        id: 'ai-queued',
        speaker: 'ai',
        text: 'Try this correction next.'
      });

      const toggle = container.querySelector('.correction-toggle');
      expect(toggle).toBeTruthy();
      toggle.click();
      expect(container.textContent).toContain('Verified');
      expect(container.textContent).toContain('After gustar use infinitive.');
      expect(container.textContent).toContain('confidence 90%');
      expect(container.textContent).toContain('Your phrase: a mi me gusta canto musica');
      expect(container.textContent).toContain('Correction: a mi me gusta cantar musica');
    });

    test('manual trigger infers correction pair and verifies it', async () => {
      const manualVerify = vi.fn(async (payload) => ({
        data: {
          correction_id: payload.correction_id,
          mistake: payload.original,
          correction: payload.corrected,
          rule: 'Use infinitive after gustar.',
          category: 'grammar',
          confidence: 0.9,
          is_ambiguous: false
        }
      }));
      panel = new DialoguePanel('#transcriptContainer', {
        debounceMs: 0,
        manualCorrectionVerifier: manualVerify,
        makeCorrectionId: () => 'manual-corr-1'
      });

      await panel.add({
        id: 'u-manual',
        speaker: 'user',
        text: 'A mi me gusta canto musica.'
      });
      await panel.add({
        id: 'ai-manual',
        speaker: 'ai',
        text: 'Claro, la forma correcta seria: "A mi me gusta cantar musica."'
      });

      const trigger = container.querySelector('.bubble.user .manual-correction-trigger');
      expect(trigger).toBeTruthy();
      trigger.click();
      await flushPromises();

      expect(manualVerify).toHaveBeenCalledWith(expect.objectContaining({
        correction_id: 'manual-corr-1',
        original: 'A mi me gusta canto musica.',
        corrected: 'A mi me gusta cantar musica.',
        correction_type: 'grammar'
      }));

      const toggle = container.querySelector('.correction-toggle');
      expect(toggle).toBeTruthy();
      expect(container.querySelector('.bubble.user .correction-widget')).toBeNull();
      expect(container.querySelector('.bubble.ai .correction-widget')).toBeTruthy();
      toggle.click();
      await vi.waitFor(() => {
        expect(container.textContent).toContain('Verified');
      });
      expect(container.textContent).toContain('Use infinitive after gustar.');
    });

    test('manual trigger makes one request and then toggles correction panel', async () => {
      const manualVerify = vi.fn(async (payload) => ({
        data: {
          correction_id: payload.correction_id,
          mistake: payload.original,
          correction: payload.corrected,
          rule: 'Use infinitive after gustar.',
          category: 'grammar',
          confidence: 0.9,
          is_ambiguous: false
        }
      }));
      panel = new DialoguePanel('#transcriptContainer', {
        debounceMs: 0,
        manualCorrectionVerifier: manualVerify,
        makeCorrectionId: () => 'manual-corr-toggle'
      });

      await panel.add({
        id: 'u-toggle',
        speaker: 'user',
        text: 'A mi me gusta canto musica.'
      });
      await panel.add({
        id: 'ai-toggle',
        speaker: 'ai',
        text: 'Claro, la forma correcta seria: "A mi me gusta cantar musica."'
      });

      const trigger = container.querySelector('.bubble.user .manual-correction-trigger');
      trigger.click();
      await vi.waitFor(() => {
        expect(manualVerify).toHaveBeenCalledTimes(1);
      });
      await vi.waitFor(() => {
        expect(trigger.disabled).toBe(false);
      });

      const toggle = container.querySelector('.correction-toggle');
      toggle.click();
      expect(container.querySelector('.correction-details').hidden).toBe(false);

      trigger.click();
      expect(manualVerify).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.correction-details').hidden).toBe(true);
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
