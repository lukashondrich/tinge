import { createLogger } from '../utils/logger.js';

const logger = createLogger('utterance-event-processor');

export class UtteranceEventProcessor {
  constructor({
    bubbleManager,
    retrievalCoordinator,
    panel,
    scrollToBottom,
    addWord,
    textManager,
    wordIndices,
    optimizer,
    scale,
    log = (...args) => logger.log(...args),
    error = (...args) => logger.error(...args)
  }) {
    this.bubbleManager = bubbleManager;
    this.retrievalCoordinator = retrievalCoordinator;
    this.panel = panel;
    this.scrollToBottom = scrollToBottom;
    this.addWord = addWord;
    this.textManager = textManager;
    this.wordIndices = wordIndices;
    this.optimizer = optimizer;
    this.scale = scale;
    this.log = log;
    this.error = error;

    this.lastUtteranceWords = [];
    this.wordToUtteranceMap = new Map();
  }

  playAudioFor(word, playTTSFallback) {
    const utteranceData = this.wordToUtteranceMap.get(word.toLowerCase());
    if (utteranceData && utteranceData.audioURL) {
      const audio = new Audio(utteranceData.audioURL);
      audio.play().catch((err) => {
        this.error('Failed to play utterance audio:', err);
        playTTSFallback(word);
      });
      return;
    }
    playTTSFallback(word);
  }

  handleUtteranceAdded(eventRecord, eventDeviceType = 'unknown') {
    const { speaker = 'ai', id, text: rawText, wordTimings } = eventRecord;
    let text = rawText;

    if (!this.bubbleManager.shouldProcessUtterance(eventRecord, eventDeviceType)) {
      return false;
    }

    if (speaker === 'ai' && text && text !== '...') {
      text = this.retrievalCoordinator.remapAssistantTextWithPendingCitations(text);
      eventRecord.text = text;
      if (typeof eventRecord.fullText === 'string') {
        eventRecord.fullText = this.retrievalCoordinator.remapAssistantTextWithPendingCitations(eventRecord.fullText);
      }
      this.retrievalCoordinator.clearPendingAssistantCitationRemap();
    }

    this._mapUtteranceAudio(eventRecord, id, speaker, text);

    const isPlaceholder = text === '...' && (!wordTimings || wordTimings.length === 0);
    if (isPlaceholder) {
      this.bubbleManager.setUtteranceId(speaker, id);
      const placeholderDelay = speaker === 'user' ? 2000 : 1000;
      this.bubbleManager.scheduleFinalize(speaker, placeholderDelay, (words) => {
        words.forEach((word) => this.addWord(word, speaker, { skipBubble: true }));
      });
      return true;
    }

    this.bubbleManager.clearFinalizeTimer(speaker);
    this.bubbleManager.setUtteranceId(speaker, id);

    if (text && text !== '...') {
      this._updateUtteranceLabels(text, speaker);
    }

    this.panel.add(eventRecord);
    this.scrollToBottom();

    if (speaker === 'user') {
      this.bubbleManager.scheduleFinalize(speaker, 300);
    }
    return true;
  }

  handleOutputAudioStopped() {
    this.bubbleManager.scheduleFinalize('ai', 1000, (words) => {
      words.forEach((word) => this.addWord(word, 'ai', { skipBubble: true }));
    });
  }

  updateActiveTextLabels(camera) {
    try {
      if (this.lastUtteranceWords.length > 0) {
        const currentPositions = new Map();
        this.textManager.activeLabels.forEach((textGroup, word) => {
          const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
          if (cleanWord && this.wordIndices.has(cleanWord)) {
            const index = this.wordIndices.get(cleanWord);
            const optimizedPositions = this.optimizer.getPositions();
            if (optimizedPositions[index]) {
              const pos = optimizedPositions[index].clone().multiplyScalar(this.scale);
              currentPositions.set(cleanWord, pos);
            }
          }
        });
        this.textManager.updatePositions(currentPositions);
      }
      this.textManager.updateLabels(camera);
    } catch (err) {
      this.error('❌ TextManager update error:', err);
    }
  }

  _mapUtteranceAudio(eventRecord, id, speaker, text) {
    if (eventRecord.audioURL && eventRecord.wordTimings) {
      eventRecord.wordTimings.forEach((wordTiming) => {
        const word = wordTiming.word.toLowerCase().replace(/[^\w]/g, '');
        if (word) {
          this.wordToUtteranceMap.set(word, {
            audioURL: eventRecord.audioURL,
            wordTiming,
            utteranceId: id,
            speaker
          });
        }
      });
      return;
    }

    if (eventRecord.audioURL && text && text !== '...') {
      const words = text.toLowerCase().match(/\b\w+\b/g) || [];
      words.forEach((word) => {
        if (!this.wordToUtteranceMap.has(word)) {
          this.wordToUtteranceMap.set(word, {
            audioURL: eventRecord.audioURL,
            utteranceId: id,
            speaker
          });
        }
      });
    }
  }

  _updateUtteranceLabels(text, speaker) {
    try {
      const words = text.toLowerCase().match(/\b\w+\b/g) || [];
      this.lastUtteranceWords = words;
      this.log('🏷️ Processing utterance for 3D labels:', { text, words, speaker });

      const currentPositions = new Map();
      words.forEach((word) => {
        const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
        if (cleanWord && this.wordIndices.has(cleanWord)) {
          const index = this.wordIndices.get(cleanWord);
          const optimizedPositions = this.optimizer.getPositions();
          if (optimizedPositions[index]) {
            const pos = optimizedPositions[index].clone().multiplyScalar(this.scale);
            currentPositions.set(cleanWord, pos);
          }
        }
      });
      this.log('📍 Current positions for utterance:', currentPositions.size, 'words');
      this.textManager.showLabelsForUtterance(words, speaker, currentPositions);
    } catch (err) {
      this.error('❌ 3D text label error:', err);
    }
  }
}
