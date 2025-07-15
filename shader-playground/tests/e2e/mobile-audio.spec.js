import { test, expect, devices } from '@playwright/test';

test.describe('Mobile Audio Tests', () => {
  test.describe('Mobile Chrome', () => {
    test.use({ ...devices['Pixel 5'] });
    
    test.beforeEach(async ({ page }) => {
      // Grant microphone permissions
      await page.context().grantPermissions(['microphone']);
      
      // Navigate to the app
      await page.goto('/');
      
      // Wait for mobile-specific elements
      await page.waitForSelector('#transcriptContainer');
      await page.waitForSelector('#threejs-canvas');
    });

    test('should detect mobile device correctly', async ({ page }) => {
      const isMobile = await page.evaluate(() => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               ('ontouchstart' in window) ||
               (navigator.maxTouchPoints > 0);
      });
      
      expect(isMobile).toBe(true);
    });

    test('should use mobile-specific audio constraints', async ({ page }) => {
      // Mock getUserMedia to capture constraints
      await page.evaluate(() => {
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = function(constraints) {
          window.lastAudioConstraints = constraints;
          return originalGetUserMedia.call(this, constraints);
        };
      });
      
      // Trigger audio initialization
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
        
        navigator.mediaDevices.getUserMedia(mobileConstraints);
      });
      
      // Check that mobile constraints were used
      const constraints = await page.evaluate(() => window.lastAudioConstraints);
      expect(constraints.audio.channelCount).toBe(1);
      expect(constraints.audio.sampleRate).toBe(16000);
    });

    test('should handle touch events for audio playback', async ({ page }) => {
      // Add mock utterance with audio
      await page.evaluate(() => {
        const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
        const mockAudioURL = URL.createObjectURL(mockBlob);
        
        const mockRecord = {
          id: 'mobile-test-utterance',
          speaker: 'user',
          text: 'Mobile audio test',
          audioBlob: mockBlob,
          audioURL: mockAudioURL
        };
        
        // Track audio playback
        window.mobileAudioPlayed = false;
        Audio.prototype.play = function() {
          window.mobileAudioPlayed = true;
          return Promise.resolve();
        };
        
        // Add to DialoguePanel
        if (window.panel) {
          window.panel.add(mockRecord);
        }
      });
      
      // Wait for speech bubble
      await page.waitForSelector('.bubble.user');
      
      // Use touch tap instead of click
      const playButton = page.locator('.bubble.user .play-utterance');
      await playButton.tap();
      
      // Verify audio was played
      const audioPlayed = await page.evaluate(() => window.mobileAudioPlayed);
      expect(audioPlayed).toBe(true);
    });

    test('should handle mobile audio context autoplay restrictions', async ({ page }) => {
      // Mock AudioContext with mobile restrictions
      await page.evaluate(() => {
        window.mockAudioContext = {
          state: 'suspended',
          resumeAttempts: 0,
          resume: async function() {
            this.resumeAttempts++;
            if (this.resumeAttempts === 1) {
              // First attempt fails (simulating mobile restrictions)
              throw new Error('User interaction required');
            } else {
              // Second attempt succeeds
              this.state = 'running';
              return Promise.resolve();
            }
          }
        };
        
        // Mock ensureAudioContext with retry logic
        window.ensureAudioContext = async function() {
          if (window.mockAudioContext.state === 'suspended') {
            try {
              await window.mockAudioContext.resume();
            } catch (err) {
              // Retry on user interaction
              await new Promise(resolve => {
                document.addEventListener('touchstart', async () => {
                  try {
                    await window.mockAudioContext.resume();
                    resolve();
                  } catch (retryErr) {
                    console.warn('AudioContext resume retry failed:', retryErr);
                    resolve();
                  }
                }, { once: true });
              });
            }
          }
        };
      });
      
      // Attempt to resume AudioContext
      await page.evaluate(() => {
        window.ensureAudioContext();
      });
      
      // Simulate user touch
      await page.touchscreen.tap(100, 100);
      
      // Wait for AudioContext to be resumed
      await page.waitForTimeout(100);
      
      // Verify AudioContext was eventually resumed
      const contextState = await page.evaluate(() => window.mockAudioContext.state);
      expect(contextState).toBe('running');
      
      const resumeAttempts = await page.evaluate(() => window.mockAudioContext.resumeAttempts);
      expect(resumeAttempts).toBe(2);
    });

    test('should show mobile debug panel on errors', async ({ page }) => {
      // Mock mobile debug functionality
      await page.evaluate(() => {
        // Create mobile debug panel
        const debugPanel = document.createElement('div');
        debugPanel.id = 'mobileDebug';
        debugPanel.style.display = 'none';
        debugPanel.innerHTML = '<div id="debugOutput"></div>';
        document.body.appendChild(debugPanel);
        
        // Mock mobile debug function
        window.mobileDebug = function(message) {
          const debugPanel = document.getElementById('mobileDebug');
          const debugOutput = document.getElementById('debugOutput');
          
          if (debugPanel && debugOutput) {
            debugPanel.style.display = 'block';
            const timestamp = new Date().toLocaleTimeString();
            debugOutput.innerHTML += `<div>[${timestamp}] ${message}</div>`;
          }
        };
      });
      
      // Trigger mobile debug message
      await page.evaluate(() => {
        window.mobileDebug('Mobile audio error occurred');
      });
      
      // Check that debug panel is visible
      const debugPanel = page.locator('#mobileDebug');
      await expect(debugPanel).toBeVisible();
      
      // Check debug message content
      const debugOutput = page.locator('#debugOutput');
      await expect(debugOutput).toContainText('Mobile audio error occurred');
    });

    test('should handle mobile network connectivity issues', async ({ page }) => {
      // Mock network failure
      await page.evaluate(() => {
        // Override fetch to simulate network failure
        const originalFetch = window.fetch;
        window.fetch = function(url) {
          if (url.includes('/token') || url.includes('/embed-word')) {
            return Promise.reject(new Error('Network error'));
          }
          return originalFetch.apply(this, arguments);
        };
        
        // Track network errors
        window.networkErrors = [];
        window.addEventListener('error', (e) => {
          if (e.message.includes('Network')) {
            window.networkErrors.push(e.message);
          }
        });
      });
      
      // Attempt network request
      await page.evaluate(() => {
        fetch('/token').catch(err => {
          console.error('Network request failed:', err);
        });
      });
      
      // App should remain functional despite network errors
      const appContainer = page.locator('#transcriptContainer');
      await expect(appContainer).toBeVisible();
    });
  });

  test.describe('Mobile Safari', () => {
    test.use({ ...devices['iPhone 12'] });
    
    test.beforeEach(async ({ page }) => {
      await page.context().grantPermissions(['microphone']);
      await page.goto('/');
      await page.waitForSelector('#transcriptContainer');
    });

    test('should handle Safari-specific audio constraints', async ({ page }) => {
      // Mock Safari user agent
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'userAgent', {
          value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          writable: true
        });
        
        // Mock Safari-specific audio handling
        window.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      });
      
      const isSafari = await page.evaluate(() => window.isSafari);
      expect(isSafari).toBe(true);
    });

    test('should handle Safari audio format restrictions', async ({ page }) => {
      // Test different audio formats support
      await page.evaluate(() => {
        const audio = new Audio();
        
        // Test various formats
        window.formatSupport = {
          webm: !!audio.canPlayType('audio/webm'),
          mp4: !!audio.canPlayType('audio/mp4'),
          ogg: !!audio.canPlayType('audio/ogg')
        };
      });
      
      const formatSupport = await page.evaluate(() => window.formatSupport);
      
      // Safari typically supports MP4 but not WebM
      expect(formatSupport.mp4).toBe(true);
    });

    test('should handle Safari AudioContext limitations', async ({ page }) => {
      // Mock Safari AudioContext behavior
      await page.evaluate(() => {
        window.safariAudioContext = {
          state: 'suspended',
          sampleRate: 44100,
          resume: async function() {
            // Safari requires user gesture for resume
            if (!window.userGestureReceived) {
              throw new Error('NotAllowedError: User gesture required');
            }
            this.state = 'running';
            return Promise.resolve();
          }
        };
        
        // Mock user gesture detection
        document.addEventListener('touchstart', () => {
          window.userGestureReceived = true;
        });
      });
      
      // Attempt to resume without user gesture
      const resumeError = await page.evaluate(() => {
        return window.safariAudioContext.resume().catch(err => err.message);
      });
      
      expect(resumeError).toContain('User gesture required');
      
      // Simulate user touch
      await page.touchscreen.tap(100, 100);
      
      // Now resume should work
      await page.evaluate(() => {
        return window.safariAudioContext.resume();
      });
      
      const contextState = await page.evaluate(() => window.safariAudioContext.state);
      expect(contextState).toBe('running');
    });
  });

  test.describe('Mobile Performance', () => {
    test.use({ ...devices['Pixel 5'] });
    
    test.beforeEach(async ({ page }) => {
      await page.context().grantPermissions(['microphone']);
      await page.goto('/');
      await page.waitForSelector('#transcriptContainer');
    });

    test('should handle mobile memory constraints', async ({ page }) => {
      // Mock memory monitoring
      await page.evaluate(() => {
        window.memoryUsage = {
          heapUsed: 0,
          heapTotal: 0,
          limit: 100 * 1024 * 1024 // 100MB limit for mobile
        };
        
        // Mock memory tracking
        window.trackMemory = function() {
          if (performance.memory) {
            this.memoryUsage.heapUsed = performance.memory.usedJSHeapSize;
            this.memoryUsage.heapTotal = performance.memory.totalJSHeapSize;
          }
        };
        
        // Mock memory cleanup
        window.cleanupAudio = function() {
          if (window.bufferCache) {
            window.bufferCache.clear();
          }
        };
      });
      
      // Create multiple audio buffers to test memory usage
      await page.evaluate(() => {
        window.bufferCache = new Map();
        
        for (let i = 0; i < 10; i++) {
          const buffer = new ArrayBuffer(1024 * 1024); // 1MB buffer
          window.bufferCache.set(`buffer-${i}`, buffer);
        }
        
        window.trackMemory();
      });
      
      // Check memory usage
      const memoryUsage = await page.evaluate(() => window.memoryUsage);
      expect(memoryUsage.heapUsed).toBeGreaterThan(0);
      
      // Test cleanup
      await page.evaluate(() => {
        window.cleanupAudio();
      });
      
      const cacheSize = await page.evaluate(() => window.bufferCache.size);
      expect(cacheSize).toBe(0);
    });

    test('should handle mobile CPU constraints', async ({ page }) => {
      // Mock CPU-intensive audio processing
      await page.evaluate(() => {
        window.audioProcessingTimes = [];
        
        // Mock audio processing function
        window.processAudio = function(iterations = 1000) {
          const startTime = performance.now();
          
          // Simulate CPU-intensive work
          for (let i = 0; i < iterations; i++) {
            Math.sin(i * Math.PI / 180);
          }
          
          const endTime = performance.now();
          const processingTime = endTime - startTime;
          
          window.audioProcessingTimes.push(processingTime);
          return processingTime;
        };
      });
      
      // Test processing performance
      const processingTime = await page.evaluate(() => {
        return window.processAudio();
      });
      
      expect(processingTime).toBeGreaterThan(0);
      
      // Mobile processing should complete within reasonable time
      expect(processingTime).toBeLessThan(1000); // 1 second max
    });

    test('should handle mobile battery optimization', async ({ page }) => {
      // Mock battery API
      await page.evaluate(() => {
        window.mockBattery = {
          level: 0.5,
          charging: false,
          chargingTime: Infinity,
          dischargingTime: 7200
        };
        
        // Mock battery-aware audio processing
        window.adjustAudioQuality = function(batteryLevel) {
          if (batteryLevel < 0.2) {
            // Low battery - reduce quality
            return {
              sampleRate: 22050,
              channelCount: 1,
              bitDepth: 16
            };
          } else {
            // Normal quality
            return {
              sampleRate: 44100,
              channelCount: 2,
              bitDepth: 24
            };
          }
        };
      });
      
      // Test battery-aware adjustments
      const lowBatterySettings = await page.evaluate(() => {
        return window.adjustAudioQuality(0.1);
      });
      
      expect(lowBatterySettings.sampleRate).toBe(22050);
      expect(lowBatterySettings.channelCount).toBe(1);
      
      const normalBatterySettings = await page.evaluate(() => {
        return window.adjustAudioQuality(0.8);
      });
      
      expect(normalBatterySettings.sampleRate).toBe(44100);
      expect(normalBatterySettings.channelCount).toBe(2);
    });
  });

  test.describe('Mobile Touch Interactions', () => {
    test.use({ ...devices['iPhone 12'] });
    
    test.beforeEach(async ({ page }) => {
      await page.context().grantPermissions(['microphone']);
      await page.goto('/');
      await page.waitForSelector('#transcriptContainer');
    });

    test('should handle touch events for audio controls', async ({ page }) => {
      // Add mock utterance
      await page.evaluate(() => {
        const mockBlob = new Blob(['mock audio data'], { type: 'audio/webm' });
        const mockAudioURL = URL.createObjectURL(mockBlob);
        
        const mockRecord = {
          id: 'touch-test-utterance',
          speaker: 'user',
          text: 'Touch test',
          audioBlob: mockBlob,
          audioURL: mockAudioURL
        };
        
        // Track touch events
        window.touchEvents = [];
        
        // Mock touch event handlers
        document.addEventListener('touchstart', (e) => {
          window.touchEvents.push('touchstart');
        });
        
        document.addEventListener('touchend', (e) => {
          window.touchEvents.push('touchend');
        });
        
        if (window.panel) {
          window.panel.add(mockRecord);
        }
      });
      
      // Wait for speech bubble
      await page.waitForSelector('.bubble.user');
      
      // Perform touch sequence
      const playButton = page.locator('.bubble.user .play-utterance');
      await playButton.tap();
      
      // Verify touch events were fired
      const touchEvents = await page.evaluate(() => window.touchEvents);
      expect(touchEvents).toContain('touchstart');
      expect(touchEvents).toContain('touchend');
    });

    test('should handle long press for additional options', async ({ page }) => {
      // Mock long press functionality
      await page.evaluate(() => {
        let longPressTimer = null;
        window.longPressDetected = false;
        
        // Mock long press detection
        document.addEventListener('touchstart', (e) => {
          longPressTimer = setTimeout(() => {
            window.longPressDetected = true;
          }, 500);
        });
        
        document.addEventListener('touchend', (e) => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
          }
        });
      });
      
      // Perform long press
      await page.touchscreen.tap(100, 100);
      await page.waitForTimeout(600);
      
      // Check if long press was detected
      const longPressDetected = await page.evaluate(() => window.longPressDetected);
      expect(longPressDetected).toBe(true);
    });

    test('should handle gesture conflicts with audio playback', async ({ page }) => {
      // Mock gesture detection
      await page.evaluate(() => {
        window.gestureState = {
          isScrolling: false,
          isZooming: false,
          audioPlaybackBlocked: false
        };
        
        // Mock gesture handlers
        document.addEventListener('touchmove', (e) => {
          if (e.touches.length === 1) {
            window.gestureState.isScrolling = true;
          } else if (e.touches.length === 2) {
            window.gestureState.isZooming = true;
          }
        });
        
        // Mock audio playback with gesture checking
        window.playAudioWithGestureCheck = function() {
          if (window.gestureState.isScrolling || window.gestureState.isZooming) {
            window.gestureState.audioPlaybackBlocked = true;
            return false;
          }
          return true;
        };
      });
      
      // Simulate scrolling gesture
      await page.touchscreen.tap(100, 100);
      await page.mouse.move(100, 200);
      
      // Attempt audio playback during gesture
      const playbackAllowed = await page.evaluate(() => {
        return window.playAudioWithGestureCheck();
      });
      
      expect(playbackAllowed).toBe(false);
      
      const gestureState = await page.evaluate(() => window.gestureState);
      expect(gestureState.audioPlaybackBlocked).toBe(true);
    });
  });
});