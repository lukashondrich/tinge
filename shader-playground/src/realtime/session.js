import jsyaml from 'js-yaml';
import { AudioManager } from '../audio/audioManager.js';
import { StorageService } from '../core/storageService.js';
import { handleGetUserProfile, handleUpdateUserProfile } from '../core/userProfile.js';
import { createLogger } from '../utils/logger.js';
import { TokenUsageTracker } from './tokenUsageTracker.js';
import { KnowledgeSearchService } from './knowledgeSearchService.js';
import { FunctionCallService } from './functionCallService.js';
import { PttOrchestrator } from './pttOrchestrator.js';
import { ConnectionBootstrapService } from './connectionBootstrapService.js';
import { WebRtcTransportService } from './webrtcTransportService.js';

const ENABLE_SEMANTIC_VAD = false;
const logger = createLogger('realtime-session');

/**
 * RealtimeSession encapsulates the WebRTC connection and push-to-talk loop.
 * Existing UI hooks (PTT button, transcript panel, etc.) can interact through
 * the methods and callbacks exposed here.
 */
export class RealtimeSession {
  constructor({ apiUrl, mobileDebug, deviceType }) {
    this.apiUrl = apiUrl;
    this.mobileDebug = mobileDebug || (() => {});
    this.deviceType = deviceType;

    this.peerConnection = null;
    this.dataChannel = null;
    this.audioTrack = null;

    this.userAudioMgr = new AudioManager({ speaker: 'user' });
    this.aiAudioMgr = new AudioManager({ speaker: 'ai' });

    this.onRemoteStreamCallback = null;
    this.onEventCallback = null;
    this.tokenUsageCallback = null;
    this.pttButton = null;

    this.isMicActive = false;
    this.isConnected = false;
    this.isConnecting = false;
    this.currentEphemeralKey = null;
    this.pendingUserRecordPromise = null;
    this.pendingUserRecord = null;
    this.aiRecordingStartTime = null;
    this.aiWordOffsets = [];
    this.aiTranscript = '';
    this.aiAudioReady = false;
    this.aiAudioReadyWarningShown = false;
    this.seenRemoteAudioTrackIds = new Set();
    this.tokenUsageTracker = new TokenUsageTracker({
      apiUrl: this.apiUrl,
      getEphemeralKey: () => this.currentEphemeralKey,
      onUsage: (usage) => {
        if (this.tokenUsageCallback) {
          this.tokenUsageCallback(usage);
        }
      },
      warn: (...args) => logger.warn(...args)
    });
    this.knowledgeSearchService = new KnowledgeSearchService({
      apiUrl: this.apiUrl
    });
    this.functionCallService = new FunctionCallService({
      getUserProfile: (args) => handleGetUserProfile(args),
      updateUserProfile: (args) => handleUpdateUserProfile(args),
      searchKnowledge: (args) => this.searchKnowledge(args),
      onEvent: (payload) => {
        if (this.onEventCallback) this.onEventCallback(payload);
      },
      sendJson: (payload) => {
        this.dataChannel.send(JSON.stringify(payload));
      },
      error: (...args) => logger.error(...args)
    });
    this.connectionBootstrapService = new ConnectionBootstrapService({
      apiUrl: this.apiUrl,
      mobileDebug: (...args) => this.mobileDebug(...args),
      deviceType: this.deviceType,
      onTokenUsage: (usage) => {
        if (this.tokenUsageCallback) {
          this.tokenUsageCallback(usage);
        }
      }
    });
    this.webrtcTransportService = new WebRtcTransportService({
      mobileDebug: (...args) => this.mobileDebug(...args),
      onIceDisconnected: () => {},
      onIceFailed: () => {
        logger.error('ICE connection failed - marking disconnected');
        this.isConnected = false;
        this.setPTTStatus('Reconnect', '#888');
      }
    });
    this.pttOrchestrator = new PttOrchestrator({
      getPTTButton: () => this.pttButton,
      getIsMicActive: () => this.isMicActive,
      setIsMicActive: (value) => {
        this.isMicActive = value;
      },
      getIsConnected: () => this.isConnected,
      getIsConnecting: () => this.isConnecting,
      getAudioTrack: () => this.audioTrack,
      getDataChannel: () => this.dataChannel,
      resetPendingRecording: () => this.resetPendingRecording(),
      setPendingUserRecord: (record) => {
        this.pendingUserRecord = record;
      },
      setPendingUserRecordPromise: (promise) => {
        this.pendingUserRecordPromise = promise;
      },
      checkTokenLimit: () => this.checkTokenLimit(),
      connect: () => this.connect(),
      waitForDataChannelOpen: () => this.waitForDataChannelOpen(5000),
      userAudioMgr: this.userAudioMgr,
      onEvent: (event) => {
        if (this.onEventCallback) this.onEventCallback(event);
      },
      error: (...args) => logger.error(...args)
    });
  }

  attachPTTButton(button) {
    this.pttButton = button;
  }

  async init({ onRemoteStream, onEvent, onTokenUsage }) {
    this.onRemoteStreamCallback = onRemoteStream;
    this.onEventCallback = onEvent;
    this.tokenUsageCallback = onTokenUsage;

    await this.userAudioMgr.init();
  }

  setCallbacks({ onRemoteStream, onEvent, onTokenUsage }) {
    if (onRemoteStream) this.onRemoteStreamCallback = onRemoteStream;
    if (onEvent) this.onEventCallback = onEvent;
    if (onTokenUsage) this.tokenUsageCallback = onTokenUsage;
  }

  updateTokenUsageEstimate(text, audioDuration) {
    this.tokenUsageTracker.updateEstimate(text, audioDuration);
  }

  async updateTokenUsageActual(usageData) {
    return this.tokenUsageTracker.updateActual(usageData);
  }

  async fetchWordTimings(blob) {
    const fd = new FormData();
    fd.append('file', blob, 'utterance.webm');
    const res = await fetch(`${this.apiUrl}/transcribe`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Transcription API error ${res.status}`);
    const { words, fullText } = await res.json();
    return { words, fullText };
  }

  async searchKnowledge(args) {
    return this.knowledgeSearchService.searchKnowledge(args);
  }

  attachCitationIndexes(results = []) {
    return this.knowledgeSearchService.attachCitationIndexes(results);
  }

  async stopAndTranscribe(audioMgr, transcriptText) {
    return audioMgr.stopRecording(transcriptText)
      .then(async (record) => {
        if (!record) return null;
        try {
          const { words, fullText } = await this.fetchWordTimings(record.audioBlob);
          record.wordTimings = words;
          record.fullText = fullText;
        } catch (err) {
          logger.error(`Word timing fetch failed: ${err.message}`);
          record.wordTimings = [];
          record.fullText = record.text;
        }
        return record;
      });
  }

  async checkTokenLimit() {
    if (!this.currentEphemeralKey) return { allowed: true, reason: 'no_key' };
    try {
      const response = await fetch(`${this.apiUrl}/token-usage/${this.currentEphemeralKey}`);
      if (response.ok) {
        const usage = await response.json();
        if (usage.isAtLimit) {
          return {
            allowed: false,
            reason: 'token_limit_exceeded',
            usage
          };
        }
        return { allowed: true, usage };
      }
    } catch (error) {
      logger.warn('Failed to check token limit:', error);
      return { allowed: true, reason: 'check_failed' };
    }
    return { allowed: true, reason: 'unknown' };
  }

  resetPendingRecording() {
    this.pendingUserRecord = null;
    this.pendingUserRecordPromise = null;
  }

  setPTTStatus(text, color) {
    this.pttOrchestrator.setPTTStatus(text, color);
  }

  setPTTReadyStatus() {
    this.pttOrchestrator.setPTTReadyStatus();
  }

  enableMicrophone() {
    this.pttOrchestrator.enableMicrophone();
  }

  disableMicrophone() {
    this.pttOrchestrator.disableMicrophone();
  }

  async handlePTTPress() {
    return this.pttOrchestrator.handlePTTPress();
  }

  handlePTTRelease({ bufferTime }) {
    this.pttOrchestrator.handlePTTRelease({ bufferTime });
  }

  async connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    try {
      if (this.pttButton) {
        this.setPTTStatus('Connecting...', '#666');
      }

      if (this.deviceType === 'mobile') {
        await this.initializeMobileMicrophone();
        await this.verifyBackendReachable();
      }

      const EPHEMERAL_KEY = await this.requestEphemeralKey();
      this.currentEphemeralKey = EPHEMERAL_KEY;

      await this.establishPeerConnection(EPHEMERAL_KEY);

      logger.log('OpenAI Realtime connection established');
      this.mobileDebug('🎉 OpenAI Realtime connection fully established!');
      this.isConnected = true;
      this.setPTTReadyStatus();
    } catch (error) {
      logger.error(`OpenAI connection error: ${error.message}`);
      logger.error('Error details:', error);
      this.handleConnectError(error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async waitForDataChannelOpen(timeoutMs = 5000) {
    const dataChannel = this.dataChannel;
    if (!dataChannel) return false;
    if (dataChannel.readyState === 'open') return true;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        dataChannel.removeEventListener('open', onOpen);
        dataChannel.removeEventListener('close', onCloseOrError);
        dataChannel.removeEventListener('error', onCloseOrError);
        resolve(value);
      };
      const onOpen = () => finish(true);
      const onCloseOrError = () => finish(false);
      const timer = setTimeout(() => finish(false), timeoutMs);

      dataChannel.addEventListener('open', onOpen, { once: true });
      dataChannel.addEventListener('close', onCloseOrError, { once: true });
      dataChannel.addEventListener('error', onCloseOrError, { once: true });
    });
  }

  async initializeMobileMicrophone() {
    this.audioTrack = await this.connectionBootstrapService.initializeMobileMicrophone();
  }

  async verifyBackendReachable() {
    await this.connectionBootstrapService.verifyBackendReachable();
  }

  async requestEphemeralKey() {
    return this.connectionBootstrapService.requestEphemeralKey();
  }

  async establishPeerConnection(ephemeralKey) {
    const { peerConnection, dataChannel, audioTrack } =
      await this.webrtcTransportService.establishPeerConnection(ephemeralKey);
    this.peerConnection = peerConnection;
    this.dataChannel = dataChannel;
    this.audioTrack = audioTrack;

    this.dataChannel.onclose = () => {
      this.isConnected = false;
      this.setPTTStatus('Reconnect', '#888');
    };

    this.dataChannel.onopen = async () => {
      this.isConnected = true;
      this.setPTTReadyStatus();
      await this.sendSystemPrompt();
      await this.sendSessionConfiguration();
    };

    this.setupPeerTrackHandling();
    await this.tryHydrateExistingRemoteAudioTrack();
    this.setupDataChannelEvents();

  }

  async sendSystemPrompt() {
    try {
      const res = await fetch('/prompts/systemPrompt.yaml');
      if (!res.ok) throw new Error(`YAML load failed: ${res.status}`);
      const yamlText = await res.text();
      const obj = jsyaml.load(yamlText);
      const sysText = obj.prompt;
      const sysEvent = {
        type: 'conversation.item.create',
        event_id: crypto.randomUUID(),
        item: {
          type: 'message',
          role: 'system',
          content: [
            { type: 'input_text', text: sysText }
          ]
        }
      };
      this.dataChannel.send(JSON.stringify(sysEvent));
    } catch (err) {
      logger.error(`Failed to load system prompt YAML: ${err.message}`);
    }
  }

  async sendSessionConfiguration() {
    const sessionUpdate = {
      type: 'session.update',
      session: {
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
        turn_detection: ENABLE_SEMANTIC_VAD ? {
          type: 'semantic_vad',
          eagerness: 'low',
          create_response: true,
          interrupt_response: false
        } : null,
        tools: [
          {
            type: 'function',
            name: 'get_user_profile',
            description: 'Retrieve the user\'s current learning profile to personalize the tutoring session.',
            parameters: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'The user\'s unique identifier'
                }
              },
              required: ['user_id']
            }
          },
          {
            type: 'function',
            name: 'update_user_profile',
            description: 'Update the user\'s learning profile with new session insights.',
            parameters: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'The user\'s unique identifier'
                },
                updates: {
                  type: 'object',
                  properties: {
                    reference_language: {
                      type: 'string',
                      description: 'Learner\'s native or strongest language'
                    },
                    l1: {
                      type: 'object',
                      description: 'Primary target language updates',
                      properties: {
                        language: { type: 'string' },
                        level: {
                          type: 'string',
                          enum: [
                            'beginner',
                            'elementary',
                            'intermediate',
                            'upper-intermediate',
                            'advanced',
                            'proficient'
                          ]
                        },
                        mistake_patterns: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              type: {
                                type: 'string',
                                enum: ['grammar', 'vocabulary', 'pronunciation', 'pragmatics', 'fluency']
                              },
                              specific: { type: 'string' },
                              example: { type: 'string' }
                            }
                          }
                        },
                        mastery_updates: {
                          type: 'object',
                          properties: {
                            learned: { type: 'array', items: { type: 'string' } },
                            struggling: { type: 'array', items: { type: 'string' } },
                            forgotten: { type: 'array', items: { type: 'string' } }
                          }
                        },
                        specific_goals: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    l2: {
                      type: 'object',
                      description: 'Secondary target language updates (optional)'
                    },
                    l3: {
                      type: 'object',
                      description: 'Tertiary target language updates (optional)'
                    },
                    learning_style: {
                      type: 'object',
                      properties: {
                        correction_style: {
                          type: 'string',
                          enum: ['gentle', 'direct', 'delayed', 'implicit', 'explicit']
                        },
                        challenge_level: {
                          type: 'string',
                          enum: ['comfortable', 'moderate', 'challenging']
                        },
                        session_structure: {
                          type: 'string',
                          enum: ['structured', 'flexible', 'conversation-focused', 'task-based']
                        },
                        cultural_learning_interests: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    personal_context: {
                      type: 'object',
                      properties: {
                        goals_and_timeline: {
                          type: 'object',
                          properties: {
                            short_term: { type: 'string' },
                            long_term: { type: 'string' },
                            timeline: { type: 'string' }
                          }
                        },
                        immediate_needs: { type: 'array', items: { type: 'string' } },
                        motivation_sources: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    communication_patterns: {
                      type: 'object',
                      properties: {
                        conversation_starters: { type: 'array', items: { type: 'string' } },
                        humor_style: { type: 'string' },
                        cultural_background: { type: 'string' },
                        professional_context: { type: 'string' }
                      }
                    },
                    practical_usage: {
                      type: 'object',
                      properties: {
                        social_connections: { type: 'array', items: { type: 'string' } },
                        geographic_relevance: { type: 'string' }
                      }
                    },
                    meta_learning: {
                      type: 'object',
                      properties: {
                        strategy_preferences: { type: 'array', items: { type: 'string' } },
                        confidence_building_needs: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    conversation_notes: {
                      type: 'string',
                      description: 'General observations about the session'
                    }
                  },
                  required: ['user_id', 'updates']
                }
              },
              required: ['user_id', 'updates']
            }
          },
          {
            type: 'function',
            name: 'search_knowledge',
            description: 'Search trusted knowledge snippets for factual questions and provide source metadata for citations.',
            parameters: {
              type: 'object',
              properties: {
                query_original: {
                  type: 'string',
                  description: 'Original query in the user\'s language.'
                },
                query_en: {
                  type: 'string',
                  description: 'English translation/paraphrase of query_original for EN-only retrieval.'
                },
                language: {
                  type: 'string',
                  enum: ['en'],
                  description: 'Document language filter. Use "en".'
                },
                top_k: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 10,
                  description: 'Number of top results to return.'
                }
              },
              required: ['query_original', 'query_en']
            }
          }
        ]
      }
    };

    try {
      this.dataChannel.send(JSON.stringify(sessionUpdate));
    } catch (err) {
      logger.error('Failed to send session configuration:', err);
    }
  }

  setupPeerTrackHandling() {
    this.peerConnection.ontrack = async (event) => {
      const remoteStream = event.streams?.[0]
        || (event.track ? new MediaStream([event.track]) : null);
      if (!remoteStream) {
        logger.error('Received track event without a usable remote stream');
        return;
      }
      await this.handleIncomingRemoteStream(remoteStream);
    };
  }

  async tryHydrateExistingRemoteAudioTrack() {
    if (!this.peerConnection || typeof this.peerConnection.getReceivers !== 'function') {
      return;
    }

    const receiver = this.peerConnection
      .getReceivers()
      .find((r) => r?.track && r.track.kind === 'audio' && r.track.readyState === 'live');
    if (!receiver?.track) {
      return;
    }

    const stream = new MediaStream([receiver.track]);
    await this.handleIncomingRemoteStream(stream);
  }

  async handleIncomingRemoteStream(remoteStream) {
    const track = remoteStream.getAudioTracks?.()[0] || null;
    if (track?.id && this.seenRemoteAudioTrackIds.has(track.id)) {
      return;
    }
    if (track?.id) {
      this.seenRemoteAudioTrackIds.add(track.id);
    }

    if (this.onRemoteStreamCallback) {
      this.onRemoteStreamCallback(remoteStream);
    } else {
      const remoteAudio = document.createElement('audio');
      remoteAudio.srcObject = remoteStream;
      remoteAudio.autoplay = true;
      document.body.appendChild(remoteAudio);
    }

    this.aiAudioMgr.stream = remoteStream;
    try {
      await this.aiAudioMgr.init();
      this.aiAudioReady = true;
      this.aiAudioReadyWarningShown = false;
      logger.log('AI audio recorder attached to remote stream');
    } catch (err) {
      this.aiAudioReady = false;
      logger.error(`AI AudioManager init error: ${err}`);
    }
  }

  setupDataChannelEvents() {
    this.dataChannel.addEventListener('message', async (e) => {
      const event = JSON.parse(e.data);
      if (!event.timestamp) event.timestamp = new Date().toLocaleTimeString();
      if (event.type === 'response.audio_transcript.done' && typeof event.transcript === 'string') {
        event.transcript = event.transcript.trim();
        event.speaker = 'ai';
      }
      if (this.onEventCallback) this.onEventCallback(event);

      if (event.type === 'response.audio_transcript.delta' && typeof event.delta === 'string') {
        if (!this.aiAudioMgr.isRecording) {
          if (!this.aiAudioReady) {
            if (!this.aiAudioReadyWarningShown) {
              logger.warn('AI audio recorder not ready when transcript delta arrived; skipping AI clip capture for this turn');
              this.aiAudioReadyWarningShown = true;
            }
          } else {
            this.aiRecordingStartTime = performance.now();
            this.aiWordOffsets = [];
            this.aiAudioMgr.startRecording();
            this.aiTranscript = '';
          }
        }
        if (this.aiRecordingStartTime !== null) {
          const offsetMs = performance.now() - this.aiRecordingStartTime;
          this.aiWordOffsets.push({ word: event.delta, offsetMs });
          this.aiTranscript += event.delta;
        }
        this.updateTokenUsageEstimate(event.delta);
      }

      if (event.type === 'output_audio_buffer.stopped') {
        if (this.aiAudioMgr.isRecording) {
          const transcript = this.aiTranscript.trim();
          this.stopAndTranscribe(this.aiAudioMgr, transcript).then((record) => {
            if (!record) {
              logger.error('AI stopAndTranscribe returned null record');
              return;
            }
            if (this.onEventCallback) {
              this.onEventCallback({ type: 'utterance.added', record });
            }
            this.aiRecordingStartTime = null;
            this.aiWordOffsets = [];
            this.aiTranscript = '';
          }).catch((err) => logger.error(`AI transcription error: ${err}`));
        }
      }

      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        await this.handleUserTranscription(event);
        return;
      }

      if (event.type === 'response.function_call_arguments.done') {
        await this.handleFunctionCall(event);
      }

      if (event.type === 'response.done' && event.response && event.response.usage) {
        this.updateTokenUsageActual(event.response.usage);
      }

      if (event.type === 'session.updated' && event.session && event.session.usage) {
        this.updateTokenUsageActual(event.session.usage);
      }
    });
  }

  async handleUserTranscription(event) {
    const transcript = (event.transcript || '').trim();
    if (!transcript) return;

    const transcriptKey = `${this.deviceType}-user-${transcript.substring(0, 20)}-${Date.now()}`;

    const words = transcript.split(/\s+/);
    for (const w of words) {
      if (this.onEventCallback) {
        this.onEventCallback({
          type: 'transcript.word',
          word: w,
          speaker: 'user',
          deviceType: this.deviceType,
          transcriptKey
        });
      }
    }

    this.updateTokenUsageEstimate(transcript);

    const enhanceRecord = async (record) => {
      record.text = transcript;
      record.deviceType = this.deviceType;
      if (record.audioBlob && !record.audioURL) {
        record.audioURL = URL.createObjectURL(record.audioBlob);
      }
      try {
        const { words: timings, fullText } = await this.fetchWordTimings(record.audioBlob);
        record.wordTimings = timings;
        record.fullText = fullText;
      } catch (err) {
        logger.error(`Word timing fetch failed: ${err.message}`);
        record.wordTimings = [];
        record.fullText = transcript;
      }
      StorageService.addUtterance(record);
      if (this.onEventCallback) {
        this.onEventCallback({ type: 'utterance.added', record, deviceType: this.deviceType, transcriptKey });
      }
      if (this.pendingUserRecord === record) this.pendingUserRecord = null;
      this.pendingUserRecordPromise = null;
    };

    if (this.pendingUserRecord) {
      enhanceRecord(this.pendingUserRecord).catch((err) => logger.error(`User record enhancement error: ${err}`));
    } else if (this.pendingUserRecordPromise) {
      this.pendingUserRecordPromise
        .then((record) => {
          if (record) {
            enhanceRecord(record);
          } else {
            logger.error('pendingUserRecordPromise resolved to null');
          }
        })
        .catch((err) => logger.error(`User transcription promise error: ${err}`));
    } else {
      this.stopAndTranscribe(this.userAudioMgr, transcript)
        .then((record) => {
          if (record) enhanceRecord(record);
        })
        .catch((err) => logger.error(`User transcription fallback error: ${err}`));
    }
  }

  async handleFunctionCall(event) {
    return this.functionCallService.handleFunctionCall(event);
  }

  handleConnectError(error) {
    let errorText = 'Error';
    if (error.message.includes('getUserMedia') || error.message.includes('Permission')) {
      errorText = this.deviceType === 'mobile' ? 'Mic Access' : 'Mic Error';
    } else if (error.message.includes('SDP') || error.message.includes('WebRTC')) {
      errorText = this.deviceType === 'mobile' ? 'Connection' : 'WebRTC Error';
    } else if (error.message.includes('token') || error.message.includes('fetch')) {
      errorText = 'Network';
    }

    this.setPTTStatus(errorText, '#c00');

    setTimeout(() => {
      if (this.deviceType === 'mobile' && errorText === 'Mic Access') {
        this.setPTTStatus('Allow Mic', '#44f');
        const mobileHelp = document.getElementById('mobileHelp');
        if (mobileHelp) {
          mobileHelp.style.display = 'block';
        }
        logger.log('Mobile microphone troubleshooting: Check browser permissions, try refreshing, or use Chrome/Safari');
      } else {
        this.setPTTStatus('Try Again', '#44f');
      }
    }, 3000);
  }

  sendTextMessage(text) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      logger.error('Cannot send message: data channel not open');
      return false;
    }

    const event = {
      type: 'conversation.item.create',
      event_id: crypto.randomUUID(),
      item: {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text }
        ]
      }
    };
    this.dataChannel.send(JSON.stringify(event));

    const responseEvent = {
      type: 'response.create',
      event_id: crypto.randomUUID()
    };
    this.dataChannel.send(JSON.stringify(responseEvent));
    return true;
  }

  isConnectedToOpenAI() {
    return this.isConnected;
  }

  cleanup() {
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (err) {
        logger.warn('Error closing data channel:', err);
      }
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.getSenders().forEach((sender) => {
          if (sender.track) sender.track.stop();
        });
        this.peerConnection.close();
      } catch (err) {
        logger.warn('Error closing peer connection:', err);
      }
      this.peerConnection = null;
    }

    if (this.audioTrack) {
      try {
        this.audioTrack.stop();
      } catch (err) {
        // ignore track stop errors
      }
      this.audioTrack = null;
    }

    this.isConnected = false;
    this.isMicActive = false;
    this.currentEphemeralKey = null;
    this.resetPendingRecording();
    this.aiRecordingStartTime = null;
    this.aiWordOffsets = [];
    this.aiTranscript = '';
    this.aiAudioReady = false;
    this.aiAudioReadyWarningShown = false;
    this.seenRemoteAudioTrackIds.clear();
    this.tokenUsageTracker.reset();
  }
}
