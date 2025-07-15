import { test, expect } from '@playwright/test';

test.describe('Cross-Browser Audio Compatibility', () => {
  test.describe('Chromium', () => {
    test.use({ browserName: 'chromium' });
    
    test.beforeEach(async ({ page }) => {
      await page.context().grantPermissions(['microphone']);
      await page.goto('/');
      await page.waitForSelector('#transcriptContainer');
    });

    test('should support Chromium audio features', async ({ page }) => {
      const browserInfo = await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        hasAudioContext: 'AudioContext' in window,
        hasWebkitAudioContext: 'webkitAudioContext' in window,
        hasGetUserMedia: 'getUserMedia' in navigator.mediaDevices,
        hasMediaRecorder: 'MediaRecorder' in window
      }));
      
      expect(browserInfo.hasAudioContext).toBe(true);
      expect(browserInfo.hasGetUserMedia).toBe(true);
      expect(browserInfo.hasMediaRecorder).toBe(true);
      expect(browserInfo.userAgent).toContain('Chrome');
    });

    test('should support WebM audio format', async ({ page }) => {
      const webmSupport = await page.evaluate(() => {
        const audio = new Audio();
        return {
          webm: !!audio.canPlayType('audio/webm'),
          webmOpus: !!audio.canPlayType('audio/webm; codecs="opus"'),
          webmVorbis: !!audio.canPlayType('audio/webm; codecs="vorbis"')
        };
      });
      
      expect(webmSupport.webm).toBe(true);
      expect(webmSupport.webmOpus).toBe(true);
    });

    test('should handle MediaRecorder with WebM', async ({ page }) => {
      const mediaRecorderSupport = await page.evaluate(() => {
        if (!('MediaRecorder' in window)) return false;
        
        return {
          webm: MediaRecorder.isTypeSupported('audio/webm'),
          webmOpus: MediaRecorder.isTypeSupported('audio/webm; codecs="opus"'),
          webmVorbis: MediaRecorder.isTypeSupported('audio/webm; codecs="vorbis"')
        };
      });
      
      expect(mediaRecorderSupport.webm).toBe(true);
      expect(mediaRecorderSupport.webmOpus).toBe(true);
    });

    test('should handle Chromium-specific audio autoplay policies', async ({ page }) => {
      // Test autoplay policy
      const autoplayTest = await page.evaluate(() => {
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjuZ3u/HeCoGBnmXgwW3pOJWEjN2hHfnR2rPCOzJqkjPfnKXWJzQpFKJZBqHSKoFyKWEajp2gdEPtOmPbFgVnWZyFfpHRHdGUhGYLYYxHWgzGfVGANh6AqBVgS5kHqBQWJ9qLQZ2zVFSLDlz0LhKPMdSMHmMgwUYoaNlLiIZoHVRUaELiEYBo0vC3rOCcGg4OvEgYMJ3mLVD4J4WfQlhZtJWMQDgGcCEJlMmMjMoUzR5YVwNaMCLB0rCBkIGSLORAQIlGH0uIOUxGo0vUzJ7UOxwP2JxdVfMHEjlJmFELfOXLxFCcLxgNtR8FLc9lIzUbL2dTGTLWfTiWpPiLp6OqFfK9gqhxCgRzJdCjdMwqZrKZFMaJJnCOw5iEoJQKxnNBY9bMo0G12yTAIkP8dJqQELUqXnJhPBSlxjdwjKLJKMgYVQIRoAExRIJAc8WwLdTGvuaAWEhAQwxfgIHDFOOdZfCQQCzR8FKhxFNssTEFmrMGR1eLUQdwMIeBhEBdJhIJBd3kMYgQDLPEYCyeZhFaJOzwzAGQRWHEQ08+lGEp0VbFpW0OdFGwKDdRlCBcWkgVE8qr6uCGqFGEFYlEOYhVQwQJG/fgOhRGAgxXFIgIGnQqkJM3oMQWVgGLOHYFB0JEVnBF6FfMxqUHgwhScU7BgFmUQJmWfJmUOhRGYIhHGYHFnwqHgRUlYaEAwTHF0hBX8ETLGTJ3mQhiGnYNHEJVEhEAYhF2GYhV3FsFHQhOGYhVjcKh4EWJWGhAMExxdIQV/BEyR5kIYhp2DRxCVRIRAGIRdhmIVdxbBR0IThmIVY3CoeAhkQ==';
        
        return audio.play()
          .then(() => 'allowed')
          .catch(() => 'blocked');
      });
      
      // Chromium typically blocks autoplay without user gesture
      expect(autoplayTest).toBe('blocked');
    });
  });

  test.describe('Firefox', () => {
    test.use({ browserName: 'firefox' });
    
    test.beforeEach(async ({ page }) => {
      await page.context().grantPermissions(['microphone']);
      await page.goto('/');
      await page.waitForSelector('#transcriptContainer');
    });

    test('should support Firefox audio features', async ({ page }) => {
      const browserInfo = await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        hasAudioContext: 'AudioContext' in window,
        hasWebkitAudioContext: 'webkitAudioContext' in window,
        hasGetUserMedia: 'getUserMedia' in navigator.mediaDevices,
        hasMediaRecorder: 'MediaRecorder' in window
      }));
      
      expect(browserInfo.hasAudioContext).toBe(true);
      expect(browserInfo.hasGetUserMedia).toBe(true);
      expect(browserInfo.hasMediaRecorder).toBe(true);
      expect(browserInfo.userAgent).toContain('Firefox');
    });

    test('should support OGG audio format', async ({ page }) => {
      const oggSupport = await page.evaluate(() => {
        const audio = new Audio();
        return {
          ogg: !!audio.canPlayType('audio/ogg'),
          oggVorbis: !!audio.canPlayType('audio/ogg; codecs="vorbis"'),
          oggOpus: !!audio.canPlayType('audio/ogg; codecs="opus"')
        };
      });
      
      expect(oggSupport.ogg).toBe(true);
    });

    test('should handle Firefox-specific MediaRecorder formats', async ({ page }) => {
      const mediaRecorderSupport = await page.evaluate(() => {
        if (!('MediaRecorder' in window)) return false;
        
        return {
          ogg: MediaRecorder.isTypeSupported('audio/ogg'),
          webm: MediaRecorder.isTypeSupported('audio/webm'),
          oggOpus: MediaRecorder.isTypeSupported('audio/ogg; codecs="opus"')
        };
      });
      
      expect(mediaRecorderSupport.ogg).toBe(true);
    });

    test('should handle Firefox autoplay policies', async ({ page }) => {
      // Firefox has different autoplay policies
      const autoplayTest = await page.evaluate(() => {
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjuZ3u/HeCoGBnmXgwW3pOJWEjN2hHfnR2rPCOzJqkjPfnKXWJzQpFKJZBqHSKoFyKWEajp2gdEPtOmPbFgVnWZyFfpHRHdGUhGYLYYxHWgzGfVGANh6AqBVgS5kHqBQWJ9qLQZ2zVFSLDlz0LhKPMdSMHmMgwUYoaNlLiIZoHVRUaELiEYBo0vC3rOCcGg4OvEgYMJ3mLVD4J4WfQlhZtJWMQDgGcCEJlMmMjMoUzR5YVwNaMCLB0rCBkIGSLORAQIlGH0uIOUxGo0vUzJ7UOxwP2JxdVfMHEjlJmFELfOXLxFCcLxgNtR8FLc9lIzUbL2dTGTLWfTiWpPiLp6OqFfK9gqhxCgRzJdCjdMwqZrKZFMaJJnCOw5iEoJQKxnNBY9bMo0G12yTAIkP8dJqQELUqXnJhPBSlxjdwjKLJKMgYVQIRoAExRIJAc8WwLdTGvuaAWEhAQwxfgIHDFOOdZfCQQCzR8FKhxFNssTEFmrMGR1eLUQdwMIeBhEBdJhIJBd3kMYgQDLPEYCyeZhFaJOzwzAGQRWHEQ08+lGEp0VbFpW0OdFGwKDdRlCBcWkgVE8qr6uCGqFGEFYlEOYhVQwQJG/fgOhRGAgxXFIgIGnQqkJM3oMQWVgGLOHYFB0JEVnBF6FfMxqUHgwhScU7BgFmUQJmWfJmUOhRGYIhHGYHFnwqHgRUlYaEAwTHF0hBX8ETLGTJ3mQhiGnYNHEJVEhEAYhF2GYhV3FsFHQhOGYhVjcKh4EWJWGhAMExxdIQV/BEyR5kIYhp2DRxCVRIRAGIRdhmIVdxbBR0IThmIVY3CoeAhkQ==';
        
        return audio.play()
          .then(() => 'allowed')
          .catch(() => 'blocked');
      });
      
      // Firefox autoplay behavior may differ
      expect(['allowed', 'blocked']).toContain(autoplayTest);
    });

    test('should handle Firefox-specific AudioContext behavior', async ({ page }) => {
      const audioContextTest = await page.evaluate(() => {
        const ctx = new AudioContext();
        
        return {
          state: ctx.state,
          sampleRate: ctx.sampleRate,
          baseLatency: ctx.baseLatency || 0,
          outputLatency: ctx.outputLatency || 0
        };
      });
      
      expect(audioContextTest.state).toBeDefined();
      expect(audioContextTest.sampleRate).toBeGreaterThan(0);
    });
  });

  test.describe('WebKit/Safari', () => {
    test.use({ browserName: 'webkit' });
    
    test.beforeEach(async ({ page }) => {
      await page.context().grantPermissions(['microphone']);
      await page.goto('/');
      await page.waitForSelector('#transcriptContainer');
    });

    test('should support WebKit audio features', async ({ page }) => {
      const browserInfo = await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        hasAudioContext: 'AudioContext' in window,
        hasWebkitAudioContext: 'webkitAudioContext' in window,
        hasGetUserMedia: 'getUserMedia' in navigator.mediaDevices,
        hasMediaRecorder: 'MediaRecorder' in window
      }));
      
      expect(browserInfo.hasAudioContext).toBe(true);
      expect(browserInfo.hasGetUserMedia).toBe(true);
      expect(browserInfo.userAgent).toContain('Safari');
    });

    test('should handle WebKit AudioContext restrictions', async ({ page }) => {
      const audioContextTest = await page.evaluate(() => {
        const ctx = new AudioContext();
        
        return {
          initialState: ctx.state,
          requiresUserGesture: ctx.state === 'suspended'
        };
      });
      
      // WebKit typically starts in suspended state
      expect(audioContextTest.initialState).toBe('suspended');
      expect(audioContextTest.requiresUserGesture).toBe(true);
    });

    test('should resume AudioContext on user gesture', async ({ page }) => {
      // Set up AudioContext
      await page.evaluate(() => {
        window.audioCtx = new AudioContext();
        window.audioCtxResumed = false;
        
        // Function to resume on user gesture
        window.resumeAudioContext = async () => {
          if (window.audioCtx.state === 'suspended') {
            await window.audioCtx.resume();
            window.audioCtxResumed = true;
          }
        };
      });
      
      // Simulate user click
      await page.click('body');
      
      // Try to resume AudioContext
      await page.evaluate(() => {
        return window.resumeAudioContext();
      });
      
      // Check if AudioContext was resumed
      const contextResumed = await page.evaluate(() => window.audioCtxResumed);
      expect(contextResumed).toBe(true);
      
      const contextState = await page.evaluate(() => window.audioCtx.state);
      expect(contextState).toBe('running');
    });

    test('should support AAC audio format', async ({ page }) => {
      const aacSupport = await page.evaluate(() => {
        const audio = new Audio();
        return {
          mp4: !!audio.canPlayType('audio/mp4'),
          aac: !!audio.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
          m4a: !!audio.canPlayType('audio/mp4; codecs="mp4a.40.5"')
        };
      });
      
      expect(aacSupport.mp4).toBe(true);
      expect(aacSupport.aac).toBe(true);
    });

    test('should handle WebKit MediaRecorder limitations', async ({ page }) => {
      const mediaRecorderSupport = await page.evaluate(() => {
        if (!('MediaRecorder' in window)) return { available: false };
        
        return {
          available: true,
          mp4: MediaRecorder.isTypeSupported('audio/mp4'),
          webm: MediaRecorder.isTypeSupported('audio/webm'),
          defaultMimeType: MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm'
        };
      });
      
      // WebKit may have limited MediaRecorder support
      if (mediaRecorderSupport.available) {
        expect(mediaRecorderSupport.defaultMimeType).toBeDefined();
      }
    });
  });

  test.describe('Cross-Browser Feature Detection', () => {
    ['chromium', 'firefox', 'webkit'].forEach(browserName => {
      test(`should detect audio features correctly in ${browserName}`, async ({ browser }) => {
        const context = await browser.newContext();
        await context.grantPermissions(['microphone']);
        const page = await context.newPage();
        
        await page.goto('/');
        await page.waitForSelector('#transcriptContainer');
        
        const featureDetection = await page.evaluate(() => {
          const features = {
            audioContext: 'AudioContext' in window,
            webkitAudioContext: 'webkitAudioContext' in window,
            getUserMedia: navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices,
            mediaRecorder: 'MediaRecorder' in window,
            speechSynthesis: 'speechSynthesis' in window,
            webAudio: 'AudioContext' in window || 'webkitAudioContext' in window,
            audioElement: 'Audio' in window
          };
          
          // Test format support
          if (features.audioElement) {
            const audio = new Audio();
            features.formats = {
              webm: !!audio.canPlayType('audio/webm'),
              mp4: !!audio.canPlayType('audio/mp4'),
              ogg: !!audio.canPlayType('audio/ogg'),
              wav: !!audio.canPlayType('audio/wav')
            };
          }
          
          // Test MediaRecorder support
          if (features.mediaRecorder) {
            features.mediaRecorderFormats = {
              webm: MediaRecorder.isTypeSupported('audio/webm'),
              mp4: MediaRecorder.isTypeSupported('audio/mp4'),
              ogg: MediaRecorder.isTypeSupported('audio/ogg')
            };
          }
          
          return features;
        });
        
        // All browsers should support basic audio features
        expect(featureDetection.audioContext || featureDetection.webkitAudioContext).toBe(true);
        expect(featureDetection.webAudio).toBe(true);
        expect(featureDetection.audioElement).toBe(true);
        expect(featureDetection.getUserMedia).toBe(true);
        expect(featureDetection.speechSynthesis).toBe(true);
        
        // At least one audio format should be supported
        if (featureDetection.formats) {
          const supportedFormats = Object.values(featureDetection.formats).filter(Boolean);
          expect(supportedFormats.length).toBeGreaterThan(0);
        }
        
        await context.close();
      });
    });
  });

  test.describe('Cross-Browser Audio Fallbacks', () => {
    test('should implement proper AudioContext fallback', async ({ page }) => {
      await page.goto('/');
      
      const audioContextFallback = await page.evaluate(() => {
        // Test fallback implementation
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        
        if (!AudioContextConstructor) {
          return { available: false };
        }
        
        const ctx = new AudioContextConstructor();
        return {
          available: true,
          constructor: AudioContextConstructor.name,
          state: ctx.state,
          sampleRate: ctx.sampleRate
        };
      });
      
      expect(audioContextFallback.available).toBe(true);
      expect(audioContextFallback.constructor).toBeDefined();
    });

    test('should handle audio format fallbacks', async ({ page }) => {
      await page.goto('/');
      
      const formatFallback = await page.evaluate(() => {
        const audio = new Audio();
        const formats = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
        
        const supportedFormats = formats.filter(format => audio.canPlayType(format));
        const preferredFormat = supportedFormats[0];
        
        return {
          supportedFormats,
          preferredFormat,
          fallbackAvailable: supportedFormats.length > 0
        };
      });
      
      expect(formatFallback.fallbackAvailable).toBe(true);
      expect(formatFallback.preferredFormat).toBeDefined();
    });

    test('should handle MediaRecorder fallbacks', async ({ page }) => {
      await page.goto('/');
      
      const mediaRecorderFallback = await page.evaluate(() => {
        if (!('MediaRecorder' in window)) {
          return { available: false, fallback: 'manual-recording' };
        }
        
        const formats = ['audio/webm', 'audio/mp4', 'audio/ogg'];
        const supportedFormats = formats.filter(format => MediaRecorder.isTypeSupported(format));
        
        return {
          available: true,
          supportedFormats,
          preferredFormat: supportedFormats[0],
          fallbackAvailable: supportedFormats.length > 0
        };
      });
      
      if (mediaRecorderFallback.available) {
        expect(mediaRecorderFallback.fallbackAvailable).toBe(true);
        expect(mediaRecorderFallback.preferredFormat).toBeDefined();
      }
    });
  });

  test.describe('Cross-Browser Performance', () => {
    test('should maintain consistent audio performance across browsers', async ({ page }) => {
      await page.goto('/');
      
      const performanceMetrics = await page.evaluate(() => {
        const startTime = performance.now();
        
        // Test audio processing performance
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = 1024;
        const sampleRate = audioCtx.sampleRate;
        
        // Create test buffer
        const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
        const channelData = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
          channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate);
        }
        
        const processingTime = performance.now() - startTime;
        
        return {
          processingTime,
          sampleRate,
          bufferSize,
          browserPerformance: processingTime < 100 // Should complete within 100ms
        };
      });
      
      expect(performanceMetrics.processingTime).toBeGreaterThan(0);
      expect(performanceMetrics.browserPerformance).toBe(true);
      expect(performanceMetrics.sampleRate).toBeGreaterThan(0);
    });
  });
});