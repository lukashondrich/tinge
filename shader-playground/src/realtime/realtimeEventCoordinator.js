import { createLogger } from '../utils/logger.js';

const logger = createLogger('realtime-event-coordinator');

export class RealtimeEventCoordinator {
  constructor({
    bubbleManager,
    retrievalCoordinator,
    addWord,
    playAudioFor,
    usedWords,
    now = () => Date.now(),
    warn = (...args) => logger.warn(...args)
  }) {
    this.bubbleManager = bubbleManager;
    this.retrievalCoordinator = retrievalCoordinator;
    this.addWord = addWord;
    this.playAudioFor = playAudioFor;
    this.usedWords = usedWords;
    this.now = now;
    this.warn = warn;
    this.utteranceEventProcessor = null;
    this.pendingResponseTextBuffer = '';
    this.pendingResponseTextMode = 'idle';
  }

  setUtteranceEventProcessor(processor) {
    this.utteranceEventProcessor = processor;
  }

  handleEvent(event) {
    if (!event || typeof event.type !== 'string') return;

    if (event.type === 'assistant.interrupted') {
      const interruptedUtteranceId = event.utteranceId || `interrupted-${this.now()}`;
      this.pendingResponseTextMode = 'idle';
      this.pendingResponseTextBuffer = '';
      if (typeof this.retrievalCoordinator?.resetStreamingTranscript === 'function') {
        this.retrievalCoordinator.resetStreamingTranscript();
      }
      if (typeof this.bubbleManager?.setUtteranceId === 'function') {
        this.bubbleManager.setUtteranceId('ai', interruptedUtteranceId);
      }
      this.bubbleManager.scheduleFinalize('ai', 0, (words) => {
        words.forEach((word) => this.addWord(word, 'ai', { skipBubble: true }));
      });
      return;
    }

    if (event.type === 'input_audio_buffer.speech_started') {
      this.bubbleManager.beginTurn('user');
      return;
    }

    if (event.type === 'output_audio_buffer.started') {
      this.bubbleManager.beginTurn('ai');
      return;
    }

    if (event.type === 'response.audio_transcript.delta' && typeof event.delta === 'string') {
      const remappedStreamingTranscript = this.retrievalCoordinator.appendStreamingDelta(event.delta);
      const completedWords = this.bubbleManager.appendDelta('ai', event.delta, {
        displayText: remappedStreamingTranscript
      });
      completedWords.forEach((word) => this.addWord(word, 'ai', { skipBubble: true }));
      return;
    }

    if (event.type === 'response.text.delta' && typeof event.delta === 'string') {
      const acceptedDelta = this.consumeResponseTextDelta(event.delta);
      if (!acceptedDelta) return;

      const remappedStreamingTranscript = this.retrievalCoordinator.appendStreamingDelta(acceptedDelta);
      const completedWords = this.bubbleManager.appendDelta('ai', acceptedDelta, {
        displayText: remappedStreamingTranscript
      });
      completedWords.forEach((word) => this.addWord(word, 'ai', { skipBubble: true }));
      return;
    }

    if (event.type === 'transcript.word' && typeof event.word === 'string') {
      const speaker = event.speaker || 'ai';
      if (speaker === 'user') {
        this.bubbleManager.appendWord({ speaker, word: event.word, onWordClick: this.playAudioFor });
        this.addWord(event.word, speaker, { skipBubble: true });
        return;
      }

      if (!this.bubbleManager.hasActiveDelta(speaker)) {
        this.addWord(event.word, speaker);
      } else {
        const key = event.word.trim().toLowerCase();
        if (!this.usedWords.has(key)) {
          this.addWord(event.word, speaker, { skipBubble: true });
        }
      }
      return;
    }

    if (event.type === 'utterance.added' && event.record) {
      if (!this.utteranceEventProcessor) {
        this.warn('Utterance processor not ready; dropping utterance event');
        return;
      }
      this.utteranceEventProcessor.handleUtteranceAdded(
        event.record,
        event.deviceType || 'unknown'
      );
      return;
    }

    if (event.type === 'output_audio_buffer.stopped') {
      if (this.utteranceEventProcessor) {
        this.utteranceEventProcessor.handleOutputAudioStopped();
      }
      return;
    }

    if (
      (event.type === 'response.audio_transcript.done' && typeof event.transcript === 'string')
      || (event.type === 'response.text.done' && typeof event.text === 'string')
    ) {
      const rawTranscript = event.type === 'response.text.done'
        ? this.consumeResponseTextDone(event.text)
        : event.transcript;
      if (!rawTranscript) {
        return;
      }
      const transcript = this.retrievalCoordinator.handleFinalTranscript(rawTranscript);
      if (transcript) {
        this.bubbleManager.appendDelta('ai', '', {
          displayText: transcript
        });
      }
      // Finalize even when output_audio_buffer.stopped is missing (text-only or missing audio events).
      this.bubbleManager.scheduleFinalize('ai', 300, (words) => {
        words.forEach((word) => this.addWord(word, 'ai', { skipBubble: true }));
      });
      return;
    }

    if (event.type === 'tool.search_knowledge.result') {
      const remappedStreamingTranscript = this.retrievalCoordinator.handleToolSearchResult({
        results: event?.result?.results || [],
        telemetry: event?.telemetry || null
      });

      if (remappedStreamingTranscript) {
        this.bubbleManager.appendDelta('ai', '', {
          displayText: remappedStreamingTranscript
        });
      }
      return;
    }

    if (event.type === 'tool.search_knowledge.started') {
      this.retrievalCoordinator.handleToolSearchStarted(event?.args || {});
    }
  }

  consumeResponseTextDelta(delta) {
    this.pendingResponseTextBuffer += delta;
    if (this.pendingResponseTextMode === 'tool_payload') {
      return '';
    }

    if (this.pendingResponseTextMode === 'plain_text') {
      return delta;
    }

    const trimmed = this.pendingResponseTextBuffer.trimStart();
    if (!trimmed) return '';

    if (!this.isJsonLikeStart(trimmed)) {
      this.pendingResponseTextMode = 'plain_text';
      const flush = this.pendingResponseTextBuffer;
      this.pendingResponseTextBuffer = '';
      return flush;
    }

    if (this.looksLikeToolPayloadPrefix(trimmed)) {
      this.pendingResponseTextMode = 'tool_payload';
      return '';
    }

    // Keep buffering JSON-like start until we can confidently classify.
    if (trimmed.length < 80) {
      return '';
    }

    // JSON-like but not a tool payload signature: treat as plain text.
    this.pendingResponseTextMode = 'plain_text';
    const flush = this.pendingResponseTextBuffer;
    this.pendingResponseTextBuffer = '';
    return flush;
  }

  consumeResponseTextDone(text) {
    const mode = this.pendingResponseTextMode;
    this.pendingResponseTextMode = 'idle';
    this.pendingResponseTextBuffer = '';

    if (mode === 'tool_payload' || this.looksLikeToolPayloadString(text)) {
      return '';
    }

    return text;
  }

  isJsonLikeStart(text) {
    return text.startsWith('{') || text.startsWith('[');
  }

  looksLikeToolPayloadPrefix(text) {
    return (
      text.includes('"tool_uses"')
      || text.includes('"recipient_name"')
      || text.includes('"parameters"')
      || text.includes('"function_call"')
    );
  }

  looksLikeToolPayloadString(text) {
    const trimmed = (text || '').trim();
    if (!this.isJsonLikeStart(trimmed)) return false;

    if (this.looksLikeToolPayloadPrefix(trimmed)) return true;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.some((item) => (
          item && typeof item === 'object'
          && (item.recipient_name || item.parameters || item.type === 'function_call')
        ));
      }

      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.tool_uses)) return true;
        if (parsed.type === 'function_call' || parsed.type === 'function_call_output') return true;
      }
    } catch {
      return false;
    }

    return false;
  }
}
