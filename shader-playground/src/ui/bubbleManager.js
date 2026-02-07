const DEFAULT_MOBILE_COOLDOWN = 500;

export class BubbleManager {
  constructor({
    containerSelector = '#transcriptContainer',
    containerElement = null,
    isMobile = false,
    mobileCooldown = DEFAULT_MOBILE_COOLDOWN,
    playAudioFor = null,
    scrollBehavior = null
  } = {}) {
    this.container = containerElement || document.querySelector(containerSelector);
    if (!this.container) {
      throw new Error(`BubbleManager: container "${containerSelector}" not found`);
    }
    this.isMobile = isMobile;
    this.mobileCooldown = mobileCooldown;
    this.playAudioFor = playAudioFor;
    this.scrollBehavior = scrollBehavior || (() => {
      this.container.scrollTop = this.container.scrollHeight;
    });

    this.activeBubbles = { user: null, ai: null };
    this.lastBubbleCreation = { user: 0, ai: 0 };
    this.finalizeTimers = { user: null, ai: null };
    this.pendingDeltaText = '';
    this.processedUtterances = new Set();
    this.deviceUtterances = new Map();
  }

  beginTurn(speaker) {
    const now = Date.now();
    if (this.activeBubbles[speaker]) {
      return this.activeBubbles[speaker];
    }

    if (this.isMobile && (now - this.lastBubbleCreation[speaker]) < this.mobileCooldown) {
      return this.activeBubbles[speaker];
    }

    const existing = this._findReusableBubble(speaker);
    if (existing) {
      this.activeBubbles[speaker] = existing;
      this.scrollBehavior();
      return existing;
    }

    const bubble = this._createBubble(speaker);
    this.container.appendChild(bubble);
    this.activeBubbles[speaker] = bubble;
    this.lastBubbleCreation[speaker] = now;
    this.scrollBehavior();
    return bubble;
  }

  appendDelta(speaker, delta) {
    const bubble = this._ensureActiveBubble(speaker);
    if (!bubble) return [];

    const target = bubble.__highlight || bubble.querySelector('.highlighted-text');
    if (!bubble.__deltaText) {
      bubble.__deltaText = '';
    }
    bubble.__deltaText += delta;

    if (target) {
      target.textContent = bubble.__deltaText;
    }

    let completedWords = [];
    if (speaker === 'ai') {
      this.pendingDeltaText += delta;
      const words = this.pendingDeltaText.match(/\b\w+\b/g);
      if (words) {
        const lastWordMatch = this.pendingDeltaText.match(/.*\b(\w+)\b/);
        const lastWordEnd = lastWordMatch ? lastWordMatch.index + lastWordMatch[0].length : this.pendingDeltaText.length;
        completedWords = words.filter((word) => word.length > 2);
        this.pendingDeltaText = this.pendingDeltaText.substring(lastWordEnd);
      }
    }

    this.scrollBehavior();
    return completedWords;
  }

  appendWord({ speaker, word, onWordClick }) {
    const bubble = this._ensureActiveBubble(speaker);
    if (!bubble) return;

    const target = bubble.__highlight || bubble.querySelector('.highlighted-text');
    if (!target) return;

    if (speaker === 'user' && target.textContent?.includes('Speaking...')) {
      target.textContent = '';
      target.style.fontStyle = 'normal';
      target.style.opacity = '1';
    }

    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = `${word} `;
    if (onWordClick) {
      span.onclick = () => onWordClick(word);
    }
    target.appendChild(span);
    this.scrollBehavior();
  }

  scheduleFinalize(speaker, delay, onFinalize) {
    this.clearFinalizeTimer(speaker);
    this.finalizeTimers[speaker] = setTimeout(() => {
      const leftovers = this.finalize(speaker);
      if (onFinalize) {
        onFinalize(leftovers);
      }
    }, delay);
  }

  clearFinalizeTimer(speaker) {
    if (this.finalizeTimers[speaker]) {
      clearTimeout(this.finalizeTimers[speaker]);
      this.finalizeTimers[speaker] = null;
    }
  }

  finalize(speaker) {
    const bubble = this.activeBubbles[speaker];
    if (bubble) {
      bubble.__deltaText = '';
    }
    this.activeBubbles[speaker] = null;

    let leftoverWords = [];
    if (speaker === 'ai') {
      if (this.pendingDeltaText.trim()) {
        const words = this.pendingDeltaText.match(/\b\w+\b/g);
        if (words) {
          leftoverWords = words.filter((word) => word.length > 2);
        }
      }
      this.pendingDeltaText = '';
    }
    return leftoverWords;
  }

  shouldProcessUtterance(record, deviceType = 'unknown') {
    const speaker = record.speaker || 'ai';
    const id = record.id || record.utterance_id || '';
    const text = record.text || '';

    const utteranceKey = `${speaker}-${id}`;
    const deviceSpecificKey = `${deviceType}-${speaker}-${id}`;
    const contentKey = `${speaker}-${text.substring(0, 30)}`;

    if (
      (id && this.processedUtterances.has(utteranceKey)) ||
      this.processedUtterances.has(deviceSpecificKey) ||
      this.deviceUtterances.has(contentKey)
    ) {
      return false;
    }

    if (id) {
      this.processedUtterances.add(utteranceKey);
      this.processedUtterances.add(deviceSpecificKey);
    }
    this.deviceUtterances.set(contentKey, { deviceType, timestamp: Date.now() });
    return true;
  }

  handlePlaceholder(record, { delay = 2000 } = {}) {
    const speaker = record.speaker || 'ai';
    const bubble = this._ensureActiveBubble(speaker);
    if (bubble) {
      bubble.dataset.utteranceId = record.id;
    }
    this.scheduleFinalize(speaker, delay);
  }

  setUtteranceId(speaker, utteranceId) {
    const bubble = this.activeBubbles[speaker];
    if (bubble) {
      bubble.dataset.utteranceId = utteranceId;
    }
  }

  getActiveBubble(speaker) {
    return this.activeBubbles[speaker] || null;
  }

  hasActiveDelta(speaker) {
    const bubble = this.activeBubbles[speaker];
    return Boolean(bubble && bubble.__deltaText && bubble.__deltaText.length > 0);
  }

  _ensureActiveBubble(speaker) {
    return this.activeBubbles[speaker] || this.beginTurn(speaker);
  }

  _findReusableBubble(speaker) {
    const bubbles = this.container.querySelectorAll(`.bubble.${speaker}`);
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = bubbles[i];
      if (!bubble.dataset.utteranceId || bubble.dataset.utteranceId === 'undefined') {
        return bubble;
      }
    }
    return null;
  }

  _createBubble(speaker) {
    const bubble = document.createElement('div');
    bubble.classList.add('bubble', speaker);
    const p = document.createElement('p');
    p.className = 'transcript';
    const span = document.createElement('span');
    span.className = 'highlighted-text';

    if (speaker === 'user') {
      span.textContent = 'Speaking...';
      span.style.fontStyle = 'italic';
      span.style.opacity = '0.7';
    }

    p.appendChild(span);
    bubble.appendChild(p);
    bubble.__highlight = span;
    return bubble;
  }
}
