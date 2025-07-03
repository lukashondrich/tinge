// src/audio/audioManager.js
import { StorageService } from '../core/storageService';

/**
 * AudioManager wraps MediaRecorder for capturing utterances
 * and storing them via StorageService once a record stops.
 */
export class AudioManager {
  constructor({ speaker = 'user', stream = null } = {}) {
    this.chunks = [];
    this.speaker = speaker;
    this.isRecording = false;
    this.recorder = null;
    this.stream = stream;
  }

  /**
   * Request microphone access and prepare the recorder
   */
  async init() {
    if (!this.stream) {
      try {
        // Mobile-specific audio constraints for better compatibility
        const constraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            // Add mobile-specific settings
            channelCount: 1,
            sampleRate: 16000
          }
        };
        
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        // eslint-disable-next-line no-console
        console.log('Microphone access granted:', this.stream.getAudioTracks());
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Microphone access failed:', err);
        // Provide helpful error messages for different scenarios
        if (err.name === 'NotAllowedError') {
          throw new Error('Microphone permission denied. Please allow microphone access and try again.');
        } else if (err.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        } else if (err.name === 'NotSupportedError') {
          throw new Error('Microphone not supported by this browser. Try Chrome or Safari.');
        } else {
          throw new Error(`Microphone error: ${err.message}`);
        }
      }
    }
    
    try {
      this.recorder = new MediaRecorder(this.stream);
      this.recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          this.chunks.push(ev.data);
        }
      };

      // reset state when stopped
      this.recorder.onstop = () => {
        this.isRecording = false;
      };
      
      // eslint-disable-next-line no-console
      console.log('MediaRecorder initialized successfully');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('MediaRecorder initialization failed:', err);
      throw new Error(`Recording setup failed: ${err.message}`);
    }
  }

  /**
   * Start capturing audio
   */
  startRecording() {
    if (!this.recorder) throw new Error('AudioManager not initialized');
    if (this.isRecording) {
      // eslint-disable-next-line no-console
      console.warn('AudioManager: already recording, ignoring start call');
      return;
    }
    this.chunks = [];
    this.recorder.start();
    this.isRecording = true;
  }

  /**
   * Stop capturing and persist the utterance to IndexedDB
   * @param {string} transcriptText - the text to associate
   */
  async stopRecording(transcriptText) {
    if (!this.recorder) throw new Error('AudioManager not initialized');
    if (!this.isRecording) {
      // eslint-disable-next-line no-console
      console.warn('AudioManager: not recording, ignoring stop call');
      // Still resolve to avoid hanging promises
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      this.recorder.onstop = async () => {
        this.isRecording = false;
        // fallback to webm if mimeType is missing
        const mime = this.recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        // eslint-disable-next-line no-console
        console.log('🔉 AudioManager: blob type=', blob.type, 'size=', blob.size);
        const id = crypto.randomUUID();
        const timestamp = Date.now();
        const audioURL = URL.createObjectURL(blob);
        const utterance = { id, speaker: this.speaker, timestamp, text: transcriptText, audioBlob: blob };
      
        await StorageService.addUtterance(utterance);
        resolve({ ...utterance, audioURL });
      };
      this.recorder.stop();
    });
  }

  /**
   * Play back a given Blob URL
   * @param {string} audioURL
   */
  playAudio(audioURL) {
    const audio = new Audio(audioURL);
    audio.play();
  }
}
