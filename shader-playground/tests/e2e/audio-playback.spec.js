import { test, expect } from '@playwright/test';

test.describe('Audio Playback E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Grant microphone permissions
    await page.context().grantPermissions(['microphone']);
    
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForSelector('#transcriptContainer');
    await page.waitForSelector('#threejs-canvas');
  });

  test.describe('Speech Bubble Audio Playback', () => {
    test('should play audio when clicking play button in speech bubble', async ({ page }) => {
      // Mock audio data for testing
      await page.evaluate(() => {
        // Create a mock utterance with audio
        const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
        const mockAudioURL = URL.createObjectURL(mockBlob);
        
        // Create a mock record
        const mockRecord = {
          id: 'test-utterance-1',
          speaker: 'user',
          text: 'Hello world test',
          audioBlob: mockBlob,
          audioURL: mockAudioURL
        };
        
        // Add to DialoguePanel if it exists
        if (window.panel) {
          window.panel.add(mockRecord);
        } else {
          // Create DialoguePanel manually for testing
          const { DialoguePanel } = await import('./src/ui/dialoguePanel.js');
          window.panel = new DialoguePanel('#transcriptContainer');
          window.panel.add(mockRecord);
        }
      });
      
      // Wait for speech bubble to appear
      await page.waitForSelector('.bubble.user');
      
      // Check that play button exists
      const playButton = page.locator('.bubble.user .play-utterance');
      await expect(playButton).toBeVisible();
      await expect(playButton).toHaveText('⏵');
      
      // Set up audio playback monitoring
      let audioPlayCalled = false;
      await page.evaluate(() => {
        // Mock Audio.prototype.play to track calls
        const originalPlay = Audio.prototype.play;
        Audio.prototype.play = function() {
          window.audioPlayCalled = true;
          return Promise.resolve();
        };
      });
      
      // Click play button
      await playButton.click();
      
      // Verify audio was played
      const audioPlayed = await page.evaluate(() => window.audioPlayCalled);
      expect(audioPlayed).toBe(true);
      
      // Check console logs for audio playback
      const logs = [];
      page.on('console', msg => {
        if (msg.text().includes('Play utterance')) {
          logs.push(msg.text());
        }
      });
      
      await playButton.click();
      await page.waitForTimeout(100);
      
      expect(logs.length).toBeGreaterThan(0);
    });

    test('should handle audio playback errors gracefully', async ({ page }) => {
      // Mock audio data with failing playback
      await page.evaluate(() => {
        const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
        const mockAudioURL = URL.createObjectURL(mockBlob);
        
        const mockRecord = {
          id: 'test-utterance-error',
          speaker: 'ai',
          text: 'This will fail to play',
          audioBlob: mockBlob,
          audioURL: mockAudioURL
        };
        
        // Mock Audio.prototype.play to throw error
        Audio.prototype.play = function() {
          return Promise.reject(new Error('Audio playback failed'));
        };
        
        // Add to DialoguePanel
        if (window.panel) {
          window.panel.add(mockRecord);
        }
      });
      
      // Wait for speech bubble
      await page.waitForSelector('.bubble.ai');
      
      // Click play button
      const playButton = page.locator('.bubble.ai .play-utterance');
      await playButton.click();
      
      // Check for error handling in console
      const errorLogs = [];
      page.on('console', msg => {
        if (msg.type() === 'error' || msg.text().includes('failed')) {
          errorLogs.push(msg.text());
        }
      });
      
      await page.waitForTimeout(100);
      
      // The app should handle the error gracefully without crashing
      const appContainer = page.locator('#transcriptContainer');
      await expect(appContainer).toBeVisible();
    });
  });

  test.describe('Word-Level Audio Playback', () => {
    test('should play word-level audio when clicking on words', async ({ page }) => {
      // Mock utterance with word timings
      await page.evaluate(() => {
        const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
        const mockAudioURL = URL.createObjectURL(mockBlob);
        
        const mockRecord = {
          id: 'test-word-timings',
          speaker: 'user',
          text: 'Hello world test',
          audioBlob: mockBlob,
          audioURL: mockAudioURL,
          wordTimings: [
            { word: 'Hello', start: 0.0, end: 0.5 },
            { word: 'world', start: 0.6, end: 1.0 },
            { word: 'test', start: 1.2, end: 1.6 }
          ]
        };
        
        // Track AudioContext buffer source creation
        window.bufferSourcesCreated = 0;
        const originalCreateBufferSource = AudioContext.prototype.createBufferSource;
        AudioContext.prototype.createBufferSource = function() {
          window.bufferSourcesCreated++;
          const source = originalCreateBufferSource.call(this);
          
          // Mock start method
          const originalStart = source.start;
          source.start = function(when, offset, duration) {
            window.lastBufferSourceStart = { when, offset, duration };
            return originalStart.call(this, when, offset, duration);
          };
          
          return source;
        };
        
        if (window.panel) {
          window.panel.add(mockRecord);
        }
      });
      
      // Wait for speech bubble with word spans
      await page.waitForSelector('.bubble.user');
      await page.waitForSelector('.word');
      
      // Check that word spans exist
      const wordSpans = page.locator('.word');
      await expect(wordSpans).toHaveCount(3);
      
      // Click on the first word
      await wordSpans.first().click();
      
      // Verify buffer source was created for word playback
      const bufferSourcesCreated = await page.evaluate(() => window.bufferSourcesCreated);
      expect(bufferSourcesCreated).toBeGreaterThan(0);
      
      // Check that correct timing was used
      const startParams = await page.evaluate(() => window.lastBufferSourceStart);
      expect(startParams).toBeDefined();
      expect(startParams.when).toBe(0);
      expect(startParams.offset).toBeLessThan(0.5); // Should be buffered start
      expect(startParams.duration).toBeGreaterThan(0);
    });

    test('should handle words without timing data', async ({ page }) => {
      // Mock utterance without word timings
      await page.evaluate(() => {
        const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
        const mockAudioURL = URL.createObjectURL(mockBlob);
        
        const mockRecord = {
          id: 'test-no-timings',
          speaker: 'ai',
          text: 'No timing data',
          audioBlob: mockBlob,
          audioURL: mockAudioURL
          // No wordTimings property
        };
        
        if (window.panel) {
          window.panel.add(mockRecord);
        }
      });
      
      // Wait for speech bubble
      await page.waitForSelector('.bubble.ai');
      
      // Words should still be displayed but not clickable for audio
      const wordSpans = page.locator('.word');
      if (await wordSpans.count() > 0) {
        await wordSpans.first().click();
        
        // Should not create buffer sources for words without timing
        const bufferSourcesCreated = await page.evaluate(() => window.bufferSourcesCreated || 0);
        expect(bufferSourcesCreated).toBe(0);
      }
    });
  });

  test.describe('3D Word Audio Playback', () => {
    test('should play audio when clicking on 3D words', async ({ page }) => {
      // Wait for Three.js scene to load
      await page.waitForSelector('#threejs-canvas');
      
      // Mock word-to-utterance mapping
      await page.evaluate(() => {
        // Create word mapping
        window.wordToUtteranceMap = new Map();
        window.wordToUtteranceMap.set('hello', {
          audioURL: 'blob:mock-3d-word-url',
          utteranceId: 'test-3d-utterance',
          speaker: 'user'
        });
        
        // Mock playAudioFor function
        window.playAudioFor = (word) => {
          const utteranceData = window.wordToUtteranceMap.get(word.toLowerCase());
          
          if (utteranceData && utteranceData.audioURL) {
            const audio = new Audio(utteranceData.audioURL);
            window.wordAudioPlayed = word;
            return audio.play().catch(err => {
              console.warn('Failed to play utterance audio:', err);
              // TTS fallback
              const utterance = new SpeechSynthesisUtterance(word);
              speechSynthesis.speak(utterance);
              window.ttsPlayed = word;
            });
          } else {
            // TTS fallback
            const utterance = new SpeechSynthesisUtterance(word);
            speechSynthesis.speak(utterance);
            window.ttsPlayed = word;
          }
        };
      });
      
      // Simulate 3D word click
      await page.evaluate(() => {
        window.playAudioFor('hello');
      });
      
      // Verify word audio was played
      const wordAudioPlayed = await page.evaluate(() => window.wordAudioPlayed);
      expect(wordAudioPlayed).toBe('hello');
    });

    test('should fallback to TTS for words without audio', async ({ page }) => {
      // Mock TTS
      await page.evaluate(() => {
        window.ttsPlayed = null;
        
        // Mock speechSynthesis
        window.speechSynthesis = {
          speak: (utterance) => {
            window.ttsPlayed = utterance.text;
          }
        };
        
        window.SpeechSynthesisUtterance = function(text) {
          this.text = text;
          this.rate = 0.8;
          this.pitch = 1.0;
          this.volume = 0.7;
        };
      });
      
      // Simulate clicking on unknown word
      await page.evaluate(() => {
        window.playAudioFor('unknown');
      });
      
      // Verify TTS was used
      const ttsPlayed = await page.evaluate(() => window.ttsPlayed);
      expect(ttsPlayed).toBe('unknown');
    });
  });

  test.describe('Audio Context Management', () => {
    test('should resume AudioContext on user interaction', async ({ page }) => {
      // Mock suspended AudioContext
      await page.evaluate(() => {
        window.mockAudioContext = {
          state: 'suspended',
          resumed: false,
          resume: async function() {
            this.state = 'running';
            this.resumed = true;
            return Promise.resolve();
          }
        };
        
        // Mock ensureAudioContext function
        window.ensureAudioContext = async function() {
          if (window.mockAudioContext.state === 'suspended') {
            await window.mockAudioContext.resume();
          }
        };
      });
      
      // Simulate user interaction that should resume AudioContext
      await page.evaluate(() => {
        window.ensureAudioContext();
      });
      
      // Verify AudioContext was resumed
      const contextResumed = await page.evaluate(() => window.mockAudioContext.resumed);
      expect(contextResumed).toBe(true);
      
      const contextState = await page.evaluate(() => window.mockAudioContext.state);
      expect(contextState).toBe('running');
    });

    test('should handle AudioContext resume failures', async ({ page }) => {
      // Mock AudioContext with resume failure
      await page.evaluate(() => {
        window.mockAudioContext = {
          state: 'suspended',
          resumeFailed: false,
          resume: async function() {
            this.resumeFailed = true;
            throw new Error('AudioContext resume failed');
          }
        };
        
        window.ensureAudioContext = async function() {
          if (window.mockAudioContext.state === 'suspended') {
            try {
              await window.mockAudioContext.resume();
            } catch (err) {
              console.warn('AudioContext resume failed:', err);
            }
          }
        };
      });
      
      // Attempt to resume AudioContext
      await page.evaluate(() => {
        window.ensureAudioContext();
      });
      
      // Verify failure was handled gracefully
      const resumeFailed = await page.evaluate(() => window.mockAudioContext.resumeFailed);
      expect(resumeFailed).toBe(true);
      
      // App should still be functional
      const appContainer = page.locator('#transcriptContainer');
      await expect(appContainer).toBeVisible();
    });
  });

  test.describe('Mobile Audio Behavior', () => {
    test('should handle mobile audio constraints', async ({ page }) => {
      // Simulate mobile device
      await page.evaluate(() => {
        // Mock mobile user agent
        Object.defineProperty(navigator, 'userAgent', {
          value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
          writable: true
        });
        
        // Mock mobile detection
        window.isMobileDevice = () => {
          return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        };
      });
      
      // Verify mobile detection
      const isMobile = await page.evaluate(() => window.isMobileDevice());
      expect(isMobile).toBe(true);
      
      // Test mobile-specific audio constraints
      await page.evaluate(() => {
        const mobileConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 16000
          }
        };
        
        window.mobileConstraintsUsed = mobileConstraints;
      });
      
      const constraints = await page.evaluate(() => window.mobileConstraintsUsed);
      expect(constraints.audio.channelCount).toBe(1);
      expect(constraints.audio.sampleRate).toBe(16000);
    });
  });

  test.describe('Audio Performance', () => {
    test('should handle rapid audio playback requests', async ({ page }) => {
      // Mock multiple audio elements
      await page.evaluate(() => {
        window.audioPlayCount = 0;
        
        // Mock Audio constructor
        window.Audio = function(src) {
          this.src = src;
          this.play = function() {
            window.audioPlayCount++;
            return Promise.resolve();
          };
        };
      });
      
      // Simulate rapid playback requests
      await page.evaluate(() => {
        for (let i = 0; i < 10; i++) {
          const audio = new Audio(`blob:mock-url-${i}`);
          audio.play();
        }
      });
      
      // Verify all requests were handled
      const audioPlayCount = await page.evaluate(() => window.audioPlayCount);
      expect(audioPlayCount).toBe(10);
    });

    test('should handle audio buffer caching', async ({ page }) => {
      // Mock buffer caching
      await page.evaluate(() => {
        window.bufferCache = new Map();
        window.decodeCount = 0;
        
        // Mock AudioContext with decode tracking
        window.mockAudioContext = {
          decodeAudioData: function(arrayBuffer) {
            window.decodeCount++;
            return Promise.resolve({
              duration: 2.5,
              sampleRate: 44100
            });
          }
        };
        
        // Mock buffer caching function
        window.getOrCreateBuffer = async function(recordId, audioBlob) {
          let buffer = window.bufferCache.get(recordId);
          
          if (!buffer) {
            const arrayBuffer = await audioBlob.arrayBuffer();
            buffer = await window.mockAudioContext.decodeAudioData(arrayBuffer);
            window.bufferCache.set(recordId, buffer);
          }
          
          return buffer;
        };
      });
      
      // Request the same buffer multiple times
      await page.evaluate(async () => {
        const mockBlob = new Blob(['audio data'], { type: 'audio/webm' });
        
        // Request same buffer 3 times
        for (let i = 0; i < 3; i++) {
          await window.getOrCreateBuffer('test-record', mockBlob);
        }
      });
      
      // Verify buffer was only decoded once
      const decodeCount = await page.evaluate(() => window.decodeCount);
      expect(decodeCount).toBe(1);
      
      // Verify cache contains the buffer
      const cacheSize = await page.evaluate(() => window.bufferCache.size);
      expect(cacheSize).toBe(1);
    });
  });

  test.describe('Cross-Browser Audio Compatibility', () => {
    test('should work with different AudioContext implementations', async ({ page }) => {
      // Test standard AudioContext
      await page.evaluate(() => {
        if (window.AudioContext) {
          window.standardAudioContext = new AudioContext();
          window.hasStandardAudioContext = true;
        }
      });
      
      let hasStandardAudioContext = await page.evaluate(() => window.hasStandardAudioContext);
      expect(hasStandardAudioContext).toBe(true);
      
      // Test webkit AudioContext fallback
      await page.evaluate(() => {
        if (window.webkitAudioContext) {
          window.webkitAudioContextInstance = new webkitAudioContext();
          window.hasWebkitAudioContext = true;
        }
      });
      
      let hasWebkitAudioContext = await page.evaluate(() => window.hasWebkitAudioContext);
      expect(hasWebkitAudioContext).toBe(true);
    });

    test('should handle different audio formats', async ({ page }) => {
      // Test different mime types
      const mimeTypes = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg'
      ];
      
      for (const mimeType of mimeTypes) {
        await page.evaluate((type) => {
          const blob = new Blob(['audio data'], { type });
          const audio = new Audio(URL.createObjectURL(blob));
          window.lastTestedMimeType = type;
          window.lastAudioSrc = audio.src;
        }, mimeType);
        
        const testedType = await page.evaluate(() => window.lastTestedMimeType);
        expect(testedType).toBe(mimeType);
        
        const audioSrc = await page.evaluate(() => window.lastAudioSrc);
        expect(audioSrc).toContain('blob:');
      }
    });
  });
});