import jsyaml from 'js-yaml';
import { AudioManager } from '../audio/audioManager.js';
import { StorageService } from '../core/storageService.js';
import { handleGetUserProfile, handleUpdateUserProfile } from '../core/userProfile.js';

const ENABLE_SEMANTIC_VAD = false;

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

    // Token estimation batching
    this.tokenEstimationTimeout = null;
    this.accumulatedText = '';
    this.accumulatedAudioDuration = 0;
  }

  attachPTTButton(button) {
    this.pttButton = button;
  }

  async init({ onRemoteStream, onEvent, onTokenUsage }) {
    this.onRemoteStreamCallback = onRemoteStream;
    this.onEventCallback = onEvent;
    this.tokenUsageCallback = onTokenUsage;

    await this.userAudioMgr.init();
    await this.aiAudioMgr.init();
  }

  setCallbacks({ onRemoteStream, onEvent, onTokenUsage }) {
    if (onRemoteStream) this.onRemoteStreamCallback = onRemoteStream;
    if (onEvent) this.onEventCallback = onEvent;
    if (onTokenUsage) this.tokenUsageCallback = onTokenUsage;
  }

  updateTokenUsageEstimate(text, audioDuration) {
    if (!this.currentEphemeralKey) return;

    if (text) this.accumulatedText += text;
    if (audioDuration) this.accumulatedAudioDuration += audioDuration;

    if (this.tokenEstimationTimeout) {
      clearTimeout(this.tokenEstimationTimeout);
    }

    this.tokenEstimationTimeout = setTimeout(async () => {
      try {
        const response = await fetch(`${this.apiUrl}/token-usage/${this.currentEphemeralKey}/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: this.accumulatedText,
            audioDuration: this.accumulatedAudioDuration
          })
        });

        if (response.ok) {
          const usage = await response.json();
          if (this.tokenUsageCallback) {
            this.tokenUsageCallback(usage);
          }
          this.accumulatedText = '';
          this.accumulatedAudioDuration = 0;
          return usage;
        }
      } catch (error) {
        console.warn('Failed to update estimated token usage:', error); // eslint-disable-line no-console
      }
    }, 200);
  }

  async updateTokenUsageActual(usageData) {
    if (!this.currentEphemeralKey) return;

    try {
      const response = await fetch(`${this.apiUrl}/token-usage/${this.currentEphemeralKey}/actual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usageData })
      });

      if (response.ok) {
        const usage = await response.json();
        if (this.tokenUsageCallback) {
          this.tokenUsageCallback(usage);
        }
        return usage;
      }
    } catch (error) {
      console.warn('Failed to update actual token usage:', error); // eslint-disable-line no-console
    }
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
    const queryOriginal = String(args?.query_original || '').trim();
    const queryEn = String(args?.query_en || queryOriginal).trim();
    const payload = {
      query_original: queryOriginal,
      query_en: queryEn,
      // EN-only retrieval corpus: always filter to English documents.
      language: 'en',
      ...(args?.top_k ? { top_k: args.top_k } : {})
    };

    const controller = new AbortController();
    const timeoutMs = 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const startedAt = performance.now();
    let response;
    try {
      response = await fetch(`${this.apiUrl}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error(`Knowledge search timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch (err) {
        detail = 'No error detail available';
      }
      throw new Error(`Knowledge search failed (${response.status}): ${detail}`);
    }

    const data = await response.json();
    if (Array.isArray(data.results)) {
      data.results = this.attachCitationIndexes(data.results);
    }
    const durationMs = Math.round(performance.now() - startedAt);
    return {
      data,
      telemetry: {
        queryOriginal: payload.query_original || '',
        queryEn: payload.query_en || '',
        language: payload.language || '',
        topK: payload.top_k || '',
        durationMs,
        resultCount: Array.isArray(data.results) ? data.results.length : 0,
        status: 'ok'
      }
    };
  }

  attachCitationIndexes(results = []) {
    return results.map((item, idx) => ({
      ...item,
      citation_index: idx + 1
    }));
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
          console.error(`Word timing fetch failed: ${err.message}`); // eslint-disable-line no-console
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
      console.warn('Failed to check token limit:', error); // eslint-disable-line no-console
      return { allowed: true, reason: 'check_failed' };
    }
    return { allowed: true, reason: 'unknown' };
  }

  resetPendingRecording() {
    this.pendingUserRecord = null;
    this.pendingUserRecordPromise = null;
  }

  setPTTStatus(text, color) {
    if (!this.pttButton) return;
    this.pttButton.innerText = text;
    this.pttButton.style.backgroundColor = color;
  }

  setPTTReadyStatus() {
    // Guard against async connect callbacks overriding active recording state.
    if (this.isMicActive) return;
    this.setPTTStatus('Push to Talk', '#44f');
  }

  enableMicrophone() {
    if (this.audioTrack && this.isConnected) {
      this.audioTrack.enabled = true;
      this.isMicActive = true;
      this.setPTTStatus('Talking', '#f00');
    } else {
      console.error('Cannot enable microphone - no audio track available'); // eslint-disable-line no-console
    }
  }

  disableMicrophone() {
    if (this.audioTrack) {
      this.audioTrack.enabled = false;
    }
    this.isMicActive = false;
    if (this.isConnected) {
      this.setPTTReadyStatus();
    }
  }

  async handlePTTPress() {
    if (this.isConnecting) {
      return { allowed: false, reason: 'connecting' };
    }

    this.resetPendingRecording();

    const limitCheck = await this.checkTokenLimit();
    if (!limitCheck.allowed) {
      return { allowed: false, reason: limitCheck.reason };
    }

    if (!this.isConnected) {
      try {
        await this.connect();
        if (!this.isConnected) {
          return { allowed: false, reason: 'not_connected' };
        }
      } catch (error) {
        console.error(`Connection failed: ${error.message}`); // eslint-disable-line no-console
        return { allowed: false, reason: 'connection_failed', error };
      }
    }

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'input_audio_buffer.clear',
        event_id: crypto.randomUUID()
      }));
    } else {
      console.error('Cannot clear buffer - data channel not open'); // eslint-disable-line no-console
    }

    this.userAudioMgr.startRecording();
    if (this.onEventCallback) {
      this.onEventCallback({ type: 'input_audio_buffer.speech_started' });
    }
    this.enableMicrophone();
    return { allowed: true };
  }

  handlePTTRelease({ bufferTime }) {
    if (this.userAudioMgr.isRecording) {
      this.pendingUserRecordPromise = this.userAudioMgr
        .stopRecording('...')
        .then((record) => {
          if (!record) return null;
          this.pendingUserRecord = record;
          return record;
        })
        .catch((err) => {
          console.error(`User stop error: ${err}`); // eslint-disable-line no-console
          return null;
        });
    }

    setTimeout(() => {
      this.disableMicrophone();
      if (this.onEventCallback) {
        this.onEventCallback({ type: 'input_audio_buffer.speech_stopped' });
      }
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({
          type: 'input_audio_buffer.commit',
          event_id: crypto.randomUUID()
        }));
        this.dataChannel.send(JSON.stringify({
          type: 'response.create',
          event_id: crypto.randomUUID()
        }));
      } else {
        console.error('Cannot commit audio - data channel not open'); // eslint-disable-line no-console
      }
    }, bufferTime);
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

      console.log('OpenAI Realtime connection established'); // eslint-disable-line no-console
      this.mobileDebug('🎉 OpenAI Realtime connection fully established!');
      this.isConnected = true;
      this.setPTTReadyStatus();
    } catch (error) {
      console.error(`OpenAI connection error: ${error.message}`); // eslint-disable-line no-console
      console.error('Error details:', error); // eslint-disable-line no-console
      this.handleConnectError(error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async initializeMobileMicrophone() {
    try {
      this.mobileDebug('Starting mobile audio initialization...');
      const mobileStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mobileDebug('Mobile microphone access granted successfully');
      this.audioTrack = mobileStream.getAudioTracks()[0];
      mobileStream.getTracks().forEach((track) => track.stop());
      this.mobileDebug('Mobile audio track stored and test stream stopped');
    } catch (mobileAudioError) {
      this.mobileDebug(`Mobile audio failed: ${mobileAudioError.name} - ${mobileAudioError.message}`);
      throw new Error(`Mobile microphone error: ${mobileAudioError.message}`);
    }
  }

  async verifyBackendReachable() {
    try {
      this.mobileDebug('Testing backend connectivity...');
      this.mobileDebug(`Backend URL: ${this.apiUrl}`);
      const healthResponse = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
        mode: 'cors',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      if (healthResponse.ok) {
        this.mobileDebug('Backend health check passed');
        const healthData = await healthResponse.text();
        this.mobileDebug(`Health response: ${healthData.substring(0, 50)}...`);
      } else {
        this.mobileDebug(`Backend health check failed: ${healthResponse.status}`);
        throw new Error(`Backend health check failed: ${healthResponse.status}`);
      }
    } catch (healthError) {
      this.mobileDebug(`Backend unreachable: ${healthError.name} - ${healthError.message}`);
      this.mobileDebug('Mobile browser can reach backend, trying simplified fetch...');
      try {
        const simpleResponse = await fetch(`${this.apiUrl}/health`, {
          signal: AbortSignal.timeout(5000)
        });
        if (simpleResponse.ok) {
          this.mobileDebug('Simplified fetch succeeded!');
        } else {
          throw new Error(`Simplified fetch failed: ${simpleResponse.status}`);
        }
      } catch (simpleError) {
        this.mobileDebug(`Simplified fetch failed: ${simpleError.message}`);
        this.mobileDebug('Continuing despite fetch failure since browser access works...');
      }
      this.mobileDebug('Proceeding with token request despite connectivity test failures...');
    }
  }

  async requestEphemeralKey() {
    this.mobileDebug('Requesting OpenAI token...');
    const tokenController = new AbortController();
    const tokenTimeout = setTimeout(() => {
      tokenController.abort();
      this.mobileDebug('Token request timed out after 10 seconds');
    }, 10000);

    try {
      let tokenResponse;
      try {
        this.mobileDebug('Trying minimal token fetch...');
        tokenResponse = await fetch(`${this.apiUrl}/token`, {
          signal: tokenController.signal
        });
      } catch (minimalError) {
        this.mobileDebug(`Minimal fetch failed: ${minimalError.message}`);
        this.mobileDebug('Trying CORS-explicit token fetch...');
        tokenResponse = await fetch(`${this.apiUrl}/token`, {
          signal: tokenController.signal,
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: { Accept: '*/*' }
        });
      }

      clearTimeout(tokenTimeout);

      if (!tokenResponse.ok) {
        this.mobileDebug(`Token request failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
        throw new Error(`Failed to get token: ${tokenResponse.status}`);
      }

      this.mobileDebug('Token response received, parsing JSON...');
      const data = await tokenResponse.json();
      const ephemeralKey = data.client_secret.value;
      if (this.tokenUsageCallback && data.tokenUsage) {
        this.tokenUsageCallback(data.tokenUsage);
      }
      this.mobileDebug('OpenAI token received and parsed successfully');
      return ephemeralKey;
    } catch (tokenError) {
      clearTimeout(tokenTimeout);
      if (tokenError.name === 'AbortError') {
        this.mobileDebug('Token request was aborted due to timeout');
        throw new Error('Token request timed out - check network connection');
      } else {
        this.mobileDebug(`Token request failed: ${tokenError.name} - ${tokenError.message}`);
        if (this.deviceType === 'mobile') {
          this.mobileDebug('MOBILE WORKAROUND: Try opening the backend URL directly in browser and copying the token manually if needed');
          this.mobileDebug(`Backend token URL: ${this.apiUrl}/token`);
        }
        throw new Error(`Token request failed: ${tokenError.message}`);
      }
    }
  }

  async establishPeerConnection(ephemeralKey) {
    this.mobileDebug('Creating WebRTC PeerConnection...');
    this.peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
    this.mobileDebug('PeerConnection created and audio transceiver added');

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;
      if (state === 'disconnected') {
        this.peerConnection.restartIce();
      }
      if (state === 'failed') {
        console.error('ICE connection failed - marking disconnected'); // eslint-disable-line no-console
        this.isConnected = false;
        this.setPTTStatus('Reconnect', '#888');
      }
    };

    const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioTrack = mediaStream.getTracks()[0];
    this.audioTrack.enabled = false;
    this.peerConnection.addTrack(this.audioTrack);
    this.dataChannel = this.peerConnection.createDataChannel('oai-events');

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
    this.setupDataChannelEvents();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    const baseUrl = 'https://api.openai.com/v1/realtime';
    const model = 'gpt-4o-mini-realtime-preview-2024-12-17';

    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: 'POST',
      body: this.peerConnection.localDescription.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp'
      }
    });

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      this.mobileDebug(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
      this.mobileDebug(`Error details: ${errorText.substring(0, 100)}...`);
      throw new Error(`SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`);
    }

    const sdpText = await sdpResponse.text();
    const answer = { type: 'answer', sdp: sdpText };
    await this.peerConnection.setRemoteDescription(answer);
    this.mobileDebug('Remote SDP description set successfully');
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
      console.error(`Failed to load system prompt YAML: ${err.message}`); // eslint-disable-line no-console
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
      console.error('Failed to send session configuration:', err); // eslint-disable-line no-console
    }
  }

  setupPeerTrackHandling() {
    this.peerConnection.ontrack = async (event) => {
      const remoteStream = event.streams[0];
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
      } catch (err) {
        console.error(`AI AudioManager init error: ${err}`); // eslint-disable-line no-console
      }
    };
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
          this.aiRecordingStartTime = performance.now();
          this.aiWordOffsets = [];
          this.aiAudioMgr.startRecording();
          this.aiTranscript = '';
        }
        const offsetMs = performance.now() - this.aiRecordingStartTime;
        this.aiWordOffsets.push({ word: event.delta, offsetMs });
        this.aiTranscript += event.delta;
        this.updateTokenUsageEstimate(event.delta);
      }

      if (event.type === 'output_audio_buffer.stopped') {
        if (this.aiAudioMgr.isRecording) {
          const transcript = this.aiTranscript.trim();
          this.stopAndTranscribe(this.aiAudioMgr, transcript).then((record) => {
            if (!record) {
              console.error('AI stopAndTranscribe returned null record'); // eslint-disable-line no-console
              return;
            }
            if (this.onEventCallback) {
              this.onEventCallback({ type: 'utterance.added', record });
            }
            this.aiRecordingStartTime = null;
            this.aiWordOffsets = [];
            this.aiTranscript = '';
          }).catch((err) => console.error(`AI transcription error: ${err}`)); // eslint-disable-line no-console
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
        console.error(`Word timing fetch failed: ${err.message}`); // eslint-disable-line no-console
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
      enhanceRecord(this.pendingUserRecord).catch((err) => console.error(`User record enhancement error: ${err}`)); // eslint-disable-line no-console
    } else if (this.pendingUserRecordPromise) {
      this.pendingUserRecordPromise
        .then((record) => {
          if (record) {
            enhanceRecord(record);
          } else {
            console.error('pendingUserRecordPromise resolved to null'); // eslint-disable-line no-console
          }
        })
        .catch((err) => console.error(`User transcription promise error: ${err}`)); // eslint-disable-line no-console
    } else {
      this.stopAndTranscribe(this.userAudioMgr, transcript)
        .then((record) => {
          if (record) enhanceRecord(record);
        })
        .catch((err) => console.error(`User transcription fallback error: ${err}`)); // eslint-disable-line no-console
    }
  }

  async handleFunctionCall(event) {
    let output;
    try {
      const args = JSON.parse(event.arguments);
      let result = null;
      if (event.name === 'get_user_profile') {
        result = await handleGetUserProfile(args);
      } else if (event.name === 'update_user_profile') {
        result = await handleUpdateUserProfile(args);
      } else if (event.name === 'search_knowledge') {
        if (this.onEventCallback) {
          this.onEventCallback({
            type: 'tool.search_knowledge.started',
            args
          });
        }
        const searchPayload = await this.searchKnowledge(args);
        result = searchPayload.data;
        if (this.onEventCallback) {
          this.onEventCallback({
            type: 'tool.search_knowledge.result',
            result: searchPayload.data,
            telemetry: searchPayload.telemetry,
            args
          });
        }
      } else {
        console.error(`Unknown function call: ${event.name}`); // eslint-disable-line no-console
        result = { error: `Unknown function: ${event.name}` };
      }
      output = result;
    } catch (error) {
      console.error(`Function call error: ${error.message}`); // eslint-disable-line no-console
      console.error(`Error stack: ${error.stack}`); // eslint-disable-line no-console
      output = { error: error.message };
      if (event.name === 'search_knowledge' && this.onEventCallback) {
        const parsedArgs = (() => {
          try {
            return JSON.parse(event.arguments || '{}');
          } catch (err) {
            return {};
          }
        })();
        this.onEventCallback({
          type: 'tool.search_knowledge.result',
          result: { results: [], error: error.message },
          telemetry: {
            queryOriginal: parsedArgs.query_original || '',
            queryEn: parsedArgs.query_en || '',
            language: parsedArgs.language || '',
            topK: parsedArgs.top_k || '',
            durationMs: 0,
            resultCount: 0,
            status: 'error',
            error: error.message
          },
          args: parsedArgs
        });
      }
    }

    try {
      const errorResultEvent = {
        type: 'conversation.item.create',
        event_id: crypto.randomUUID(),
        item: {
          type: 'function_call_output',
          call_id: event.call_id,
          output: JSON.stringify(output)
        }
      };
      this.dataChannel.send(JSON.stringify(errorResultEvent));

      const responseEvent = {
        type: 'response.create',
        event_id: crypto.randomUUID()
      };
      this.dataChannel.send(JSON.stringify(responseEvent));
    } catch (sendError) {
      console.error(`Failed to send function output/response.create: ${sendError.message}`); // eslint-disable-line no-console
    }
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
        console.log('Mobile microphone troubleshooting: Check browser permissions, try refreshing, or use Chrome/Safari'); // eslint-disable-line no-console
      } else {
        this.setPTTStatus('Try Again', '#44f');
      }
    }, 3000);
  }

  sendTextMessage(text) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.error('Cannot send message: data channel not open'); // eslint-disable-line no-console
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
        console.warn('Error closing data channel:', err); // eslint-disable-line no-console
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
        console.warn('Error closing peer connection:', err); // eslint-disable-line no-console
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
    if (this.tokenEstimationTimeout) {
      clearTimeout(this.tokenEstimationTimeout);
      this.tokenEstimationTimeout = null;
    }
    this.accumulatedText = '';
    this.accumulatedAudioDuration = 0;
  }
}
