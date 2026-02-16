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
import { UserTranscriptionService } from './userTranscriptionService.js';
import { DataChannelEventRouter } from './dataChannelEventRouter.js';
import { SessionConnectionState, CONNECTION_STATES } from './sessionConnectionState.js';
import { ConnectionLifecycleService } from './connectionLifecycleService.js';
import { buildSessionUpdate } from './sessionConfigurationBuilder.js';
import { SystemPromptService } from './systemPromptService.js';
import { RemoteAudioStreamService } from './remoteAudioStreamService.js';
import { TokenLimitService } from './tokenLimitService.js';
import { UtteranceTranscriptionService } from './utteranceTranscriptionService.js';
import { ConnectionErrorPresenter } from './connectionErrorPresenter.js';
import { OutboundMessageService } from './outboundMessageService.js';

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

    this.connectionStateMachine = new SessionConnectionState({
      warn: (...args) => logger.warn(...args)
    });
    const initialConnectionSnapshot = this.connectionStateMachine.getSnapshot();
    this.connectionState = initialConnectionSnapshot.state;
    this.isConnected = initialConnectionSnapshot.isConnected;
    this.isConnecting = initialConnectionSnapshot.isConnecting;

    this.isMicActive = false;
    this.currentEphemeralKey = null;
    this.pendingUserRecordPromise = null;
    this.pendingUserRecord = null;
    this.aiAudioReady = false;
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
    this.tokenLimitService = new TokenLimitService({
      apiUrl: this.apiUrl,
      getEphemeralKey: () => this.currentEphemeralKey,
      warn: (...args) => logger.warn(...args)
    });
    this.utteranceTranscriptionService = new UtteranceTranscriptionService({
      apiUrl: this.apiUrl,
      error: (...args) => logger.error(...args)
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
    this.userTranscriptionService = new UserTranscriptionService({
      deviceType: this.deviceType,
      userAudioMgr: this.userAudioMgr,
      fetchWordTimings: (blob) => this.fetchWordTimings(blob),
      stopAndTranscribe: (audioMgr, transcriptText) => this.stopAndTranscribe(audioMgr, transcriptText),
      updateTokenUsageEstimate: (text, audioDuration) => this.updateTokenUsageEstimate(text, audioDuration),
      onEvent: (payload) => {
        if (this.onEventCallback) this.onEventCallback(payload);
      },
      addUtterance: (record) => StorageService.addUtterance(record),
      getPendingUserRecord: () => this.pendingUserRecord,
      setPendingUserRecord: (record) => {
        this.pendingUserRecord = record;
      },
      getPendingUserRecordPromise: () => this.pendingUserRecordPromise,
      setPendingUserRecordPromise: (promise) => {
        this.pendingUserRecordPromise = promise;
      },
      error: (...args) => logger.error(...args)
    });
    this.dataChannelEventRouter = new DataChannelEventRouter({
      aiAudioMgr: this.aiAudioMgr,
      getAiAudioReady: () => this.aiAudioReady,
      updateTokenUsageEstimate: (text, audioDuration) => this.updateTokenUsageEstimate(text, audioDuration),
      updateTokenUsageActual: (usageData) => this.updateTokenUsageActual(usageData),
      stopAndTranscribe: (audioMgr, transcriptText) => this.stopAndTranscribe(audioMgr, transcriptText),
      handleUserTranscription: (event) => this.userTranscriptionService.handleTranscriptionCompleted(event),
      handleFunctionCall: (event) => this.handleFunctionCall(event),
      onEvent: (payload) => {
        if (this.onEventCallback) this.onEventCallback(payload);
      },
      warn: (...args) => logger.warn(...args),
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
      onIceDisconnected: () => {
        this.transitionConnectionState(CONNECTION_STATES.RECONNECTING, 'ice_disconnected');
        this.setPTTStatus('Reconnect', '#888');
      },
      onIceFailed: () => {
        logger.error('ICE connection failed - marking disconnected');
        this.transitionConnectionState(CONNECTION_STATES.FAILED, 'ice_failed');
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
      interruptAssistantResponse: (payload) => this.dataChannelEventRouter.abortAiTurnCapture(payload),
      userAudioMgr: this.userAudioMgr,
      onEvent: (event) => {
        if (this.onEventCallback) this.onEventCallback(event);
      },
      error: (...args) => logger.error(...args)
    });
    this.connectionLifecycleService = new ConnectionLifecycleService({
      deviceType: this.deviceType,
      getIsConnecting: () => this.isConnecting,
      getPTTButton: () => this.pttButton,
      setPTTStatus: (text, color) => this.setPTTStatus(text, color),
      setPTTReadyStatus: () => this.setPTTReadyStatus(),
      transitionConnectionState: (nextState, reason) => this.transitionConnectionState(nextState, reason),
      initializeMobileMicrophone: () => this.initializeMobileMicrophone(),
      verifyBackendReachable: () => this.verifyBackendReachable(),
      requestEphemeralKey: () => this.requestEphemeralKey(),
      setCurrentEphemeralKey: (ephemeralKey) => {
        this.currentEphemeralKey = ephemeralKey;
      },
      establishTransport: (ephemeralKey) => this.webrtcTransportService.establishPeerConnection(ephemeralKey),
      setTransport: ({ peerConnection, dataChannel, audioTrack }) => {
        this.peerConnection = peerConnection;
        this.dataChannel = dataChannel;
        this.audioTrack = audioTrack;
      },
      setupPeerTrackHandling: () => this.setupPeerTrackHandling(),
      tryHydrateExistingRemoteAudioTrack: () => this.tryHydrateExistingRemoteAudioTrack(),
      setupDataChannelEvents: () => this.setupDataChannelEvents(),
      sendSystemPrompt: () => this.sendSystemPrompt(),
      sendSessionConfiguration: () => this.sendSessionConfiguration(),
      handleConnectError: (error) => this.handleConnectError(error),
      getDataChannel: () => this.dataChannel,
      mobileDebug: (...args) => this.mobileDebug(...args),
      log: (...args) => logger.log(...args),
      error: (...args) => logger.error(...args)
    });
    this.systemPromptService = new SystemPromptService({
      error: (...args) => logger.error(...args)
    });
    this.connectionErrorPresenter = new ConnectionErrorPresenter({
      deviceType: this.deviceType,
      setPTTStatus: (text, color) => this.setPTTStatus(text, color),
      log: (...args) => logger.log(...args)
    });
    this.outboundMessageService = new OutboundMessageService({
      getDataChannel: () => this.dataChannel,
      error: (...args) => logger.error(...args)
    });
    this.remoteAudioStreamService = new RemoteAudioStreamService({
      aiAudioMgr: this.aiAudioMgr,
      dataChannelEventRouter: this.dataChannelEventRouter,
      getOnRemoteStreamCallback: () => this.onRemoteStreamCallback,
      setAiAudioReady: (ready) => {
        this.aiAudioReady = ready;
      },
      log: (...args) => logger.log(...args),
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
    return this.utteranceTranscriptionService.fetchWordTimings(blob);
  }

  async searchKnowledge(args) {
    return this.knowledgeSearchService.searchKnowledge(args);
  }

  attachCitationIndexes(results = []) {
    return this.knowledgeSearchService.attachCitationIndexes(results);
  }

  async stopAndTranscribe(audioMgr, transcriptText) {
    return this.utteranceTranscriptionService.stopAndTranscribe(audioMgr, transcriptText);
  }

  async checkTokenLimit() {
    return this.tokenLimitService.checkTokenLimit();
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

  transitionConnectionState(nextState, reason = '') {
    const snapshot = this.connectionStateMachine.transition(nextState, { reason });
    this.connectionState = snapshot.state;
    this.isConnected = snapshot.isConnected;
    this.isConnecting = snapshot.isConnecting;
    return snapshot;
  }

  async connect() {
    return this.connectionLifecycleService.connect();
  }

  async waitForDataChannelOpen(timeoutMs = 5000) {
    return this.connectionLifecycleService.waitForDataChannelOpen(timeoutMs);
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
    return this.connectionLifecycleService.establishPeerConnection(ephemeralKey);
  }

  async sendSystemPrompt() {
    return this.systemPromptService.sendSystemPrompt({
      dataChannel: this.dataChannel
    });
  }

  async sendSessionConfiguration() {
    const sessionUpdate = buildSessionUpdate({
      enableSemanticVad: ENABLE_SEMANTIC_VAD
    });

    try {
      this.dataChannel.send(JSON.stringify(sessionUpdate));
    } catch (err) {
      logger.error('Failed to send session configuration:', err);
    }
  }

  setupPeerTrackHandling() {
    this.remoteAudioStreamService.setupPeerTrackHandling(this.peerConnection);
  }

  async tryHydrateExistingRemoteAudioTrack() {
    return this.remoteAudioStreamService.tryHydrateExistingRemoteAudioTrack(this.peerConnection);
  }

  async handleIncomingRemoteStream(remoteStream) {
    return this.remoteAudioStreamService.handleIncomingRemoteStream(remoteStream);
  }

  setupDataChannelEvents() {
    this.dataChannelEventRouter.bind(this.dataChannel);
  }

  async handleFunctionCall(event) {
    return this.functionCallService.handleFunctionCall(event);
  }

  handleConnectError(error) {
    return this.connectionErrorPresenter.handleConnectError(error);
  }

  sendTextMessage(text) {
    return this.outboundMessageService.sendTextMessage(text);
  }

  isConnectedToOpenAI() {
    return this.isConnected;
  }

  cleanup() {
    this.dataChannelEventRouter.unbind();

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

    this.isMicActive = false;
    this.currentEphemeralKey = null;
    this.resetPendingRecording();
    this.remoteAudioStreamService.reset();
    this.dataChannelEventRouter.reset();
    this.tokenUsageTracker.reset();
    this.transitionConnectionState(CONNECTION_STATES.IDLE, 'cleanup');
  }
}
