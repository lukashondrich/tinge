export class DataChannelEventRouter {
  constructor({
    aiAudioMgr,
    getAiAudioReady,
    updateTokenUsageEstimate,
    updateTokenUsageActual,
    stopAndTranscribe,
    handleUserTranscription,
    handleFunctionCall,
    onEvent,
    onSessionConfigured = () => {},
    parseEvent = JSON.parse,
    now = () => performance.now(),
    timestamp = () => new Date().toLocaleTimeString(),
    schedule = (...args) => globalThis.setTimeout(...args),
    clearScheduled = (...args) => globalThis.clearTimeout(...args),
    interruptDrainTimeoutMs = 4000,
    warn = () => {},
    error = () => {}
  }) {
    this.aiAudioMgr = aiAudioMgr;
    this.getAiAudioReady = getAiAudioReady;
    this.updateTokenUsageEstimate = updateTokenUsageEstimate;
    this.updateTokenUsageActual = updateTokenUsageActual;
    this.stopAndTranscribe = stopAndTranscribe;
    this.handleUserTranscription = handleUserTranscription;
    this.handleFunctionCall = handleFunctionCall;
    this.onEvent = onEvent;
    this.onSessionConfigured = onSessionConfigured;
    this.parseEvent = parseEvent;
    this.now = now;
    this.timestamp = timestamp;
    this.schedule = schedule;
    this.clearScheduled = clearScheduled;
    this.interruptDrainTimeoutMs = interruptDrainTimeoutMs;
    this.warn = warn;
    this.error = error;

    this.dataChannel = null;
    this.boundMessageHandler = null;

    this.aiRecordingStartTime = null;
    this.aiWordOffsets = [];
    this.aiTranscript = '';
    this.aiAudioReadyWarningShown = false;
    this.assistantTurnState = 'idle';
    this.assistantResponseInFlight = false;
    this.assistantResponseId = null;
    this.interruptDrainTimeout = null;
  }

  bind(dataChannel) {
    this.unbind();
    if (!dataChannel) return;

    this.dataChannel = dataChannel;
    this.boundMessageHandler = (event) => {
      this.handleMessage(event);
    };
    this.dataChannel.addEventListener('message', this.boundMessageHandler);
  }

  unbind() {
    if (this.dataChannel && this.boundMessageHandler) {
      this.dataChannel.removeEventListener('message', this.boundMessageHandler);
    }
    this.dataChannel = null;
    this.boundMessageHandler = null;
  }

  reset() {
    this.clearInterruptDrainTimeout();
    this.resetAiCaptureState();
    this.aiAudioReadyWarningShown = false;
    this.assistantTurnState = 'idle';
    this.assistantResponseInFlight = false;
    this.assistantResponseId = null;
  }

  resetAiAudioWarning() {
    this.aiAudioReadyWarningShown = false;
  }

  abortAiTurnCapture({ interruptedUtteranceId = null } = {}) {
    const hadActiveTurn = this.hasActiveAssistantTurn();
    const interruptedTranscript = this.aiTranscript.trim();
    if (this.aiAudioMgr.isRecording) {
      this.finalizeInterruptedAiCapture(interruptedTranscript, interruptedUtteranceId);
    }
    this.resetAiCaptureState();
    this.resetAiAudioWarning();
    if (hadActiveTurn) {
      this.enterInterruptedState();
    } else {
      this.clearInterruptedState();
    }
  }

  async finalizeInterruptedAiCapture(transcript, interruptedUtteranceId) {
    try {
      const record = await this.stopAndTranscribe(this.aiAudioMgr, transcript);
      if (!record) return;

      if (interruptedUtteranceId) {
        record.id = interruptedUtteranceId;
      }
      this.onEvent?.({
        type: 'utterance.added',
        record,
        interrupted: true
      });
    } catch (err) {
      this.error(`AI stop recording during interrupt failed: ${err}`);
    }
  }

  enterInterruptedState() {
    this.assistantTurnState = 'interrupted';
    this.clearInterruptDrainTimeout();
    this.interruptDrainTimeout = this.schedule(() => {
      this.assistantTurnState = 'idle';
      this.interruptDrainTimeout = null;
    }, this.interruptDrainTimeoutMs);
  }

  clearInterruptedState() {
    this.assistantTurnState = 'idle';
    this.clearInterruptDrainTimeout();
  }

  markAssistantTurnActive() {
    this.assistantResponseInFlight = true;
    if (this.assistantTurnState !== 'interrupted') {
      this.assistantTurnState = 'active';
    }
  }

  markAssistantTurnIdle() {
    if (this.assistantTurnState !== 'interrupted') {
      this.assistantTurnState = 'idle';
    }
  }

  hasActiveAssistantTurn() {
    return (
      this.assistantTurnState === 'active'
      || this.aiAudioMgr.isRecording
      || this.aiTranscript.trim().length > 0
    );
  }

  hasOpenAssistantResponse() {
    return this.assistantResponseInFlight || this.hasActiveAssistantTurn();
  }

  getOpenAssistantResponseId() {
    return this.assistantResponseId;
  }

  trackAssistantResponse(event) {
    const responseId = event?.response_id || event?.response?.id;
    if (responseId) {
      this.assistantResponseId = responseId;
      this.assistantResponseInFlight = true;
    }
  }

  clearAssistantResponse(event) {
    const responseId = event?.response_id || event?.response?.id;
    if (!responseId || !this.assistantResponseId || responseId === this.assistantResponseId) {
      this.assistantResponseInFlight = false;
      this.assistantResponseId = null;
    }
  }

  clearInterruptDrainTimeout() {
    if (this.interruptDrainTimeout) {
      this.clearScheduled(this.interruptDrainTimeout);
      this.interruptDrainTimeout = null;
    }
  }

  isAssistantTranscriptEvent(eventType) {
    return (
      eventType === 'response.output_audio_transcript.delta'
      || eventType === 'response.output_audio_transcript.done'
      || eventType === 'response.output_text.delta'
      || eventType === 'response.output_text.done'
    );
  }

  isAssistantDrainSignal(eventType) {
    return (
      eventType === 'output_audio_buffer.stopped'
      || eventType === 'response.done'
    );
  }

  shouldSuppressAssistantEvent(event) {
    if (this.assistantTurnState !== 'interrupted') return false;
    if (!event || typeof event.type !== 'string') return false;
    return (
      this.isAssistantTranscriptEvent(event.type)
      || event.type === 'output_audio_buffer.stopped'
      || event.type === 'output_audio_buffer.started'
    );
  }

  resetAiCaptureState() {
    this.aiRecordingStartTime = null;
    this.aiWordOffsets = [];
    this.aiTranscript = '';
  }

  async handleMessage(rawMessageEvent) {
    let event;
    try {
      event = this.parseEvent(rawMessageEvent?.data);
    } catch (err) {
      this.error(`Failed to parse realtime event payload: ${err}`);
      return;
    }

    if (this.assistantTurnState === 'interrupted' && this.isAssistantDrainSignal(event.type)) {
      this.clearInterruptedState();
    }

    if (!event.timestamp) event.timestamp = this.timestamp();
    if (event.type === 'error') {
      this.warn('Realtime API error event:', event.error || event);
    }

    if (
      event.type === 'response.created'
      || event.type === 'response.output_audio_transcript.delta'
      || event.type === 'response.output_audio_transcript.done'
      || event.type === 'response.output_text.delta'
      || event.type === 'response.output_text.done'
      || event.type === 'output_audio_buffer.started'
      || event.type === 'output_audio_buffer.stopped'
    ) {
      this.trackAssistantResponse(event);
    }

    if (event.type === 'response.output_audio_transcript.done' && typeof event.transcript === 'string') {
      event.transcript = event.transcript.trim();
      event.speaker = 'ai';
    }

    const suppressAssistantEvent = this.shouldSuppressAssistantEvent(event);
    if (!suppressAssistantEvent) {
      if (
        event.type === 'output_audio_buffer.started'
        || event.type === 'response.output_audio_transcript.delta'
        || event.type === 'response.output_text.delta'
      ) {
        this.markAssistantTurnActive();
      }
      this.onEvent?.(event);
    }

    if (event.type === 'response.output_audio_transcript.delta' && typeof event.delta === 'string') {
      if (suppressAssistantEvent) return;
      this.handleAiTranscriptDelta(event.delta);
      return;
    }

    if (event.type === 'output_audio_buffer.started') {
      if (suppressAssistantEvent) return;
      this.ensureAiCaptureStarted();
      return;
    }

    if (event.type === 'output_audio_buffer.stopped') {
      if (suppressAssistantEvent) return;
      await this.finalizeAiTurnRecording();
      return;
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      await this.handleUserTranscription(event);
      return;
    }

    if (event.type === 'response.function_call_arguments.done') {
      await this.handleFunctionCall(event);
      return;
    }

    if (event.type === 'response.done') {
      this.clearAssistantResponse(event);
      this.markAssistantTurnIdle();
      if (event.response && event.response.usage) {
        this.updateTokenUsageActual(event.response.usage);
      }
      return;
    }

    if (event.type === 'session.updated') {
      this.onSessionConfigured(event.session || {});
      if (event.session && event.session.usage) {
        this.updateTokenUsageActual(event.session.usage);
      }
    }
  }

  handleAiTranscriptDelta(delta) {
    this.ensureAiCaptureStarted();

    if (this.aiRecordingStartTime !== null) {
      const offsetMs = this.now() - this.aiRecordingStartTime;
      this.aiWordOffsets.push({ word: delta, offsetMs });
      this.aiTranscript += delta;
    }
    this.updateTokenUsageEstimate(delta);
  }

  ensureAiCaptureStarted() {
    if (this.aiAudioMgr.isRecording) return true;

    if (!this.getAiAudioReady()) {
      if (!this.aiAudioReadyWarningShown) {
        this.warn('AI audio recorder not ready; skipping AI clip capture for this turn');
        this.aiAudioReadyWarningShown = true;
      }
      return false;
    }

    this.markAssistantTurnActive();
    this.aiRecordingStartTime = this.now();
    this.aiWordOffsets = [];
    this.aiTranscript = '';
    this.aiAudioMgr.startRecording();
    return true;
  }

  async finalizeAiTurnRecording() {
    if (!this.aiAudioMgr.isRecording) {
      this.resetAiCaptureState();
      this.markAssistantTurnIdle();
      return;
    }

    try {
      const record = await this.stopAndTranscribe(this.aiAudioMgr, this.aiTranscript.trim());
      if (!record) {
        this.error('AI stopAndTranscribe returned null record');
        return;
      }
      this.onEvent?.({ type: 'utterance.added', record });
    } catch (err) {
      this.error(`AI transcription error: ${err}`);
    } finally {
      this.resetAiCaptureState();
      this.markAssistantTurnIdle();
    }
  }
}
