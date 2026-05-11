// src/ui/dialoguePanel.js
import { CorrectionStore } from '../core/correctionStore.js';
import { CorrectionVerificationService } from '../realtime/correctionVerificationService.js';

// Single AudioContext for playback
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Track active audio sources for cleanup
let activeSources = [];

// Ensure AudioContext is resumed before playback to comply with
// browser autoplay restrictions. Some browsers start the context
// in a suspended state until a user gesture occurs which would
// prevent word‑level audio snippets from playing when clicked.
async function ensureAudioContext() {
  if (audioCtx.state === 'suspended') {
    try {
      // eslint-disable-next-line no-console
      console.log('🔈 Resuming AudioContext for playback');
      await audioCtx.resume();
      // eslint-disable-next-line no-console
      console.log('✅ AudioContext state:', audioCtx.state);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('AudioContext resume failed:', err);
    }
  }
}

const bufferCache = new Map();

function getAudioConstructor() {
  if (typeof globalThis !== 'undefined' && globalThis.Audio) {
    return globalThis.Audio;
  }
  if (typeof window !== 'undefined' && window.Audio) {
    return window.Audio;
  }
  return null;
}

async function playUtteranceAudio(record) {
  const ctor = getAudioConstructor();

  const sourceUrl = record.audioURL
    || (record.audioBlob && typeof URL !== 'undefined' && URL.createObjectURL
      ? URL.createObjectURL(record.audioBlob)
      : undefined);

  if (!sourceUrl) {
    // eslint-disable-next-line no-console
    console.warn('No audio URL or blob available for playback');
    return;
  }

  let audioElement = null;
  if (typeof ctor === 'function') {
    try {
      audioElement = new ctor(sourceUrl);
    } catch (err) {
      // Some environments still expose Audio as callable without new
      audioElement = ctor(sourceUrl);
    }
  }

  if (!audioElement) {
    // eslint-disable-next-line no-console
    console.warn('Audio constructor not available - cannot play utterance audio');
    return;
  }

  if (typeof audioElement.play === 'function') {
    try {
      await audioElement.play();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to play utterance audio:', err);
    }
  }
}

async function blobToArrayBuffer(blob) {
  if (!blob) return null;
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  if (typeof blob.stream === 'function') {
    const reader = blob.stream().getReader();
    const chunks = [];
    let done = false;
    while (!done) {
      // eslint-disable-next-line no-await-in-loop
      const result = await reader.read();
      if (result.done) {
        done = true;
      } else if (result.value) {
        chunks.push(result.value);
      }
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    chunks.forEach(chunk => {
      buffer.set(chunk, offset);
      offset += chunk.length;
    });
    return buffer.buffer;
  }
  if (typeof Response !== 'undefined') {
    const response = new Response(blob);
    return response.arrayBuffer();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }
  // eslint-disable-next-line no-console
  console.warn('Unable to convert Blob to ArrayBuffer in this environment');
  return null;
}

// Stop all active audio sources
function stopActiveAudio() {
  activeSources.forEach(source => {
    try {
      source.stop();
    } catch (e) {
      // Source may already be stopped
    }
  });
  activeSources = [];
}

const DEFAULT_CLICK_DEBOUNCE_MS = 100;
const CORRECTION_FEEDBACK_VALUES = Object.freeze({
  AGREE: 'agree',
  DISAGREE: 'disagree'
});
const DEFAULT_MANUAL_CORRECTION_TYPE = 'grammar';

function makeManualCorrectionId() {
  const uuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  return `corr_manual_${uuid}`;
}

function normalizeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getCorrectionStatusLabel(status) {
  if (status === 'verified') return 'Verified';
  if (status === 'failed') return 'Verify failed';
  if (status === 'verifying') return 'Verifying...';
  return 'Detected';
}

export class DialoguePanel {
    constructor(containerSelector, options = {}) {
      this.container = document.querySelector(containerSelector);
      if (!this.container) {
        throw new Error(`DialoguePanel: container "${containerSelector}" not found`);
      }
      this.debounceMs = typeof options.debounceMs === 'number'
        ? Math.max(0, options.debounceMs)
        : DEFAULT_CLICK_DEBOUNCE_MS;
      this.lastClickTime = null;
      this.correctionStore = options.correctionStore || new CorrectionStore();
      this.makeCorrectionId = options.makeCorrectionId || makeManualCorrectionId;
      this.manualCorrectionType = options.manualCorrectionType || DEFAULT_MANUAL_CORRECTION_TYPE;
      this.manualCorrectionVerifier = options.manualCorrectionVerifier || null;
      const defaultApiUrl = typeof __API_URL__ === 'string' ? __API_URL__ : '';
      const manualCorrectionApiUrl = options.manualCorrectionApiUrl || defaultApiUrl;
      this.manualVerificationService = options.manualVerificationService
        || (manualCorrectionApiUrl
          ? new CorrectionVerificationService({ apiUrl: manualCorrectionApiUrl })
          : null);
      this.pendingCorrections = new Map();
    }

    isDebounced() {
      if (this.debounceMs === 0) {
        return false;
      }
      const now = Date.now();
      if (this.lastClickTime !== null && now - this.lastClickTime < this.debounceMs) {
        return true;
      }
      this.lastClickTime = now;
      return false;
    }

    getLatestBubbleForSpeaker(speaker) {
      const bubbles = this.container.querySelectorAll(`.bubble.${speaker}`);
      if (!bubbles.length) return null;
      return bubbles[bubbles.length - 1];
    }

    findBubbleByCorrectionId(correctionId) {
      const bubbles = this.container.querySelectorAll('.bubble');
      for (let i = 0; i < bubbles.length; i += 1) {
        const bubble = bubbles[i];
        if (!bubble.__corrections || !(bubble.__corrections instanceof Map)) continue;
        if (bubble.__corrections.has(correctionId)) {
          return bubble;
        }
      }
      return null;
    }

    ensureBubbleCorrectionMap(bubble) {
      if (!bubble.__corrections || !(bubble.__corrections instanceof Map)) {
        bubble.__corrections = new Map();
      }
      return bubble.__corrections;
    }

    upsertCorrectionForBubble(bubble, correction = {}) {
      const correctionId = typeof correction.id === 'string' ? correction.id.trim() : '';
      if (!bubble || !correctionId) return false;

      this.correctionStore.upsertCorrection(correction);

      const correctionMap = this.ensureBubbleCorrectionMap(bubble);
      const isNewCorrection = !correctionMap.has(correctionId);
      const existing = correctionMap.get(correctionId) || {};
      correctionMap.set(correctionId, {
        ...existing,
        ...correction,
        id: correctionId,
        status: correction.status || existing.status || 'detected'
      });
      if (isNewCorrection) {
        bubble.dataset.correctionOpen = '0';
      }
      this.pendingCorrections.delete(correctionId);
      this.renderCorrectionWidget(bubble);
      return true;
    }

    toggleCorrectionPanel(bubble) {
      if (!bubble) return false;
      const correctionMap = this.ensureBubbleCorrectionMap(bubble);
      if (!correctionMap.size) return false;
      const isOpen = bubble.dataset.correctionOpen === '1';
      bubble.dataset.correctionOpen = isOpen ? '0' : '1';
      this.renderCorrectionWidget(bubble);
      return true;
    }

    getBubbleTranscriptText(bubble) {
      if (!bubble) return '';
      const highlight = bubble.querySelector('.highlighted-text');
      return normalizeSpaces(highlight?.textContent || '');
    }

    findPreviousSpeakerBubbleText(bubble, speaker) {
      if (!bubble || !speaker) return '';
      let cursor = bubble.previousElementSibling;
      while (cursor) {
        if (cursor.classList?.contains('bubble') && cursor.classList.contains(speaker)) {
          return this.getBubbleTranscriptText(cursor);
        }
        cursor = cursor.previousElementSibling;
      }
      return '';
    }

    findNextSpeakerBubbleText(bubble, speaker) {
      if (!bubble || !speaker) return '';
      let cursor = bubble.nextElementSibling;
      while (cursor) {
        if (cursor.classList?.contains('bubble') && cursor.classList.contains(speaker)) {
          return this.getBubbleTranscriptText(cursor);
        }
        cursor = cursor.nextElementSibling;
      }
      return '';
    }

    findRelatedAssistantTextForUserBubble(userBubble) {
      const relatedAiBubble = this.findRelatedAssistantBubbleForUserBubble(userBubble);
      return this.getBubbleTranscriptText(relatedAiBubble);
    }

    findRelatedAssistantBubbleForUserBubble(userBubble) {
      if (!userBubble) return null;

      let cursor = userBubble.nextElementSibling;
      while (cursor) {
        if (cursor.classList?.contains('bubble') && cursor.classList.contains('ai')) {
          return cursor;
        }
        cursor = cursor.nextElementSibling;
      }

      cursor = userBubble.previousElementSibling;
      while (cursor) {
        if (cursor.classList?.contains('bubble') && cursor.classList.contains('ai')) {
          return cursor;
        }
        cursor = cursor.previousElementSibling;
      }
      return null;
    }

    deriveManualCorrectionCandidate({ assistantText, learnerText }) {
      const aiText = normalizeSpaces(assistantText)
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, '\'');
      const userText = normalizeSpaces(learnerText);
      if (!aiText) return null;

      const insteadMatch = aiText.match(
        /instead of\s*"([^"]+)"\s*,?\s*(?:you should|you can|say|use|try)\s*"([^"]+)"/i
      );
      if (insteadMatch) {
        return {
          original: normalizeSpaces(insteadMatch[1]),
          corrected: normalizeSpaces(insteadMatch[2]),
          correction_type: this.manualCorrectionType
        };
      }

      const enLugarMatch = aiText.match(
        /en lugar de\s*"([^"]+)"\s*,?\s*(?:deber[ií]as|puedes|di|usa|prueba)\s*"([^"]+)"/i
      );
      if (enLugarMatch) {
        return {
          original: normalizeSpaces(enLugarMatch[1]),
          corrected: normalizeSpaces(enLugarMatch[2]),
          correction_type: this.manualCorrectionType
        };
      }

      const quotedPhrases = Array.from(aiText.matchAll(/"([^"]{2,})"/g))
        .map((match) => normalizeSpaces(match[1]))
        .filter(Boolean);

      if (
        quotedPhrases.length >= 2
        && /(instead of|en lugar de|forma correcta|correct (?:way|form)|deber[ií]as decir|you should say)/i.test(aiText)
      ) {
        return {
          original: userText || quotedPhrases[0],
          corrected: quotedPhrases[quotedPhrases.length - 1],
          correction_type: this.manualCorrectionType
        };
      }

      const correctedOnlyMatch = aiText.match(
        /(?:you should say|the correct (?:way|form)[^"]* is|la forma correcta(?:\s+(?:ser[ií]a|es))?|la manera correcta(?:\s+(?:ser[ií]a|es))?|deber[ií]as decir|se dice)\s*:?\s*"([^"]+)"/i
      );
      if (correctedOnlyMatch && userText) {
        return {
          original: userText,
          corrected: normalizeSpaces(correctedOnlyMatch[1]),
          correction_type: this.manualCorrectionType
        };
      }

      return null;
    }

    async verifyManualCorrection(payload) {
      if (typeof this.manualCorrectionVerifier === 'function') {
        return this.manualCorrectionVerifier(payload);
      }
      if (this.manualVerificationService) {
        return this.manualVerificationService.verifyCorrection(payload, { forceRefresh: true });
      }
      throw new Error('Manual correction verifier is not configured');
    }

    async triggerManualCorrectionForBubble(bubble) {
      if (!bubble || this.isDebounced()) return;
      const isUserBubble = bubble.classList.contains('user');
      const relatedAiBubble = isUserBubble
        ? this.findRelatedAssistantBubbleForUserBubble(bubble)
        : null;
      const targetBubble = relatedAiBubble || bubble;

      if (bubble.dataset.manualCorrectionRequested === '1') {
        this.toggleCorrectionPanel(targetBubble);
        return;
      }

      const trigger = bubble.querySelector('.manual-correction-trigger');
      if (trigger) trigger.disabled = true;
      bubble.dataset.manualCorrectionRequested = '1';

      try {
        const learnerText = this.getBubbleTranscriptText(bubble);
        const assistantText = isUserBubble
          ? this.findRelatedAssistantTextForUserBubble(bubble)
          : this.getBubbleTranscriptText(targetBubble);
        const candidate = this.deriveManualCorrectionCandidate({
          assistantText,
          learnerText
        });
        const correctionId = targetBubble.dataset.manualCorrectionId || this.makeCorrectionId();
        bubble.dataset.manualCorrectionId = correctionId;
        targetBubble.dataset.manualCorrectionId = correctionId;

        if (!candidate) {
          this.upsertCorrectionForBubble(targetBubble, {
            id: correctionId,
            original: learnerText || 'Could not detect learner phrase',
            corrected: 'Could not infer corrected phrase',
            correction_type: this.manualCorrectionType,
            status: 'failed',
            error: 'Could not infer correction from nearby correction phrasing. Try where the tutor says "you should say..." or "la forma correcta sería...".',
            source: 'manual_trigger',
            detected_at: new Date().toISOString()
          });
          return;
        }

        const resolvedOriginal = normalizeSpaces(learnerText || candidate.original);
        const resolvedCorrected = normalizeSpaces(candidate.corrected);
        if (!resolvedOriginal || !resolvedCorrected) {
          throw new Error('Could not resolve original/corrected phrase pair from this turn');
        }

        this.upsertCorrectionForBubble(targetBubble, {
          id: correctionId,
          original: resolvedOriginal,
          corrected: resolvedCorrected,
          correction_type: candidate.correction_type || this.manualCorrectionType,
          learner_excerpt: learnerText,
          assistant_excerpt: assistantText,
          status: 'verifying',
          source: 'manual_trigger',
          detected_at: new Date().toISOString()
        });

        const verificationResult = await this.verifyManualCorrection({
          correction_id: correctionId,
          original: resolvedOriginal,
          corrected: resolvedCorrected,
          correction_type: candidate.correction_type || this.manualCorrectionType,
          conversation_context: [
            learnerText ? `user: ${learnerText}` : '',
            assistantText ? `assistant: ${assistantText}` : ''
          ].filter(Boolean)
        });
        const verification = verificationResult?.data || verificationResult;
        this.updateCorrectionVerification(correctionId, {
          status: 'verified',
          verification
        });
      } catch (error) {
        const correctionId = targetBubble.dataset.manualCorrectionId || this.makeCorrectionId();
        targetBubble.dataset.manualCorrectionId = correctionId;
        this.updateCorrectionVerification(correctionId, {
          status: 'failed',
          error: error?.message || String(error)
        });
      } finally {
        if (trigger) trigger.disabled = false;
      }
    }

    ensureManualCorrectionTrigger(bubble, record) {
      if (!bubble || record?.speaker !== 'user' || record?.text === '...') return;

      let trigger = bubble.querySelector('.manual-correction-trigger');
      if (!trigger) {
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'manual-correction-trigger';
        trigger.textContent = 'Check';
        trigger.title = 'Check this user utterance for correction';
        trigger.addEventListener('click', () => {
          void this.triggerManualCorrectionForBubble(bubble);
        });

        const transcriptNode = bubble.querySelector('.transcript');
        if (transcriptNode) {
          bubble.insertBefore(trigger, transcriptNode);
        } else {
          bubble.appendChild(trigger);
        }
      }
    }

    attachPendingCorrectionsToBubble(bubble) {
      if (!bubble || !bubble.classList.contains('ai') || this.pendingCorrections.size === 0) {
        return false;
      }

      const correctionMap = this.ensureBubbleCorrectionMap(bubble);
      let attached = false;

      for (const [correctionId, pendingCorrection] of this.pendingCorrections.entries()) {
        const existing = correctionMap.get(correctionId) || {};
        correctionMap.set(correctionId, {
          ...existing,
          ...pendingCorrection,
          id: correctionId,
          status: pendingCorrection.status || existing.status || 'detected'
        });
        this.pendingCorrections.delete(correctionId);
        attached = true;
      }

      if (attached) {
        this.renderCorrectionWidget(bubble);
      }
      return attached;
    }

    upsertCorrection(correction = {}) {
      const correctionId = typeof correction.id === 'string' ? correction.id.trim() : '';
      if (!correctionId) return false;

      this.correctionStore.upsertCorrection(correction);

      let bubble = this.findBubbleByCorrectionId(correctionId);
      if (!bubble) {
        bubble = this.getLatestBubbleForSpeaker('ai');
      }
      if (!bubble) {
        const pendingExisting = this.pendingCorrections.get(correctionId) || {};
        this.pendingCorrections.set(correctionId, {
          ...pendingExisting,
          ...correction,
          id: correctionId,
          status: correction.status || pendingExisting.status || 'detected'
        });
        return true;
      }

      return this.upsertCorrectionForBubble(bubble, correction);
    }

    updateCorrectionVerification(correctionId, {
      status,
      verification = null,
      error = ''
    } = {}) {
      if (!correctionId) return false;

      const bubble = this.findBubbleByCorrectionId(correctionId);
      if (!bubble) {
        const pending = this.pendingCorrections.get(correctionId);
        if (!pending) return false;

        const patch = {
          status: status || pending.status,
          error: error || ''
        };
        if (verification && typeof verification === 'object') {
          patch.rule = verification.rule;
          patch.confidence = verification.confidence;
          patch.category = verification.category;
          patch.is_ambiguous = verification.is_ambiguous;
          patch.model = verification.model;
          patch.verified_at = verification.verified_at;
        }

        this.pendingCorrections.set(correctionId, {
          ...pending,
          ...patch
        });
        this.correctionStore.upsertVerification(correctionId, {
          status: patch.status,
          verification,
          error: patch.error
        });
        return true;
      }

      const correctionMap = this.ensureBubbleCorrectionMap(bubble);
      const existing = correctionMap.get(correctionId);
      if (!existing) return false;

      const patch = {
        status: status || existing.status,
        error: error || ''
      };
      if (verification && typeof verification === 'object') {
        patch.rule = verification.rule;
        patch.confidence = verification.confidence;
        patch.category = verification.category;
        patch.is_ambiguous = verification.is_ambiguous;
        patch.model = verification.model;
        patch.verified_at = verification.verified_at;
      }

      correctionMap.set(correctionId, {
        ...existing,
        ...patch
      });

      this.correctionStore.upsertVerification(correctionId, {
        status: patch.status,
        verification,
        error: patch.error
      });
      this.renderCorrectionWidget(bubble);
      return true;
    }

    handleCorrectionFeedback(bubble, correctionId, feedback) {
      const correctionMap = this.ensureBubbleCorrectionMap(bubble);
      const existing = correctionMap.get(correctionId);
      if (!existing) return;

      correctionMap.set(correctionId, {
        ...existing,
        user_feedback: feedback
      });
      this.correctionStore.setFeedback(correctionId, feedback);
      this.renderCorrectionWidget(bubble);
    }

    renderCorrectionWidget(bubble) {
      const correctionMap = this.ensureBubbleCorrectionMap(bubble);
      const corrections = Array.from(correctionMap.values());
      let widget = bubble.querySelector('.correction-widget');

      if (!corrections.length) {
        if (widget) widget.remove();
        return;
      }

      if (!widget) {
        widget = document.createElement('div');
        widget.className = 'correction-widget';
        bubble.appendChild(widget);
      }

      if (!bubble.dataset.correctionOpen) {
        bubble.dataset.correctionOpen = '0';
      }
      const isOpen = bubble.dataset.correctionOpen === '1';
      widget.innerHTML = '';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'correction-toggle';
      toggle.textContent = isOpen
        ? (corrections.length > 1 ? `Hide Corrections (${corrections.length})` : 'Hide Correction')
        : (corrections.length > 1 ? `Corrections (${corrections.length})` : 'Correction');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggle.addEventListener('click', () => {
        const nextOpen = bubble.dataset.correctionOpen !== '1';
        bubble.dataset.correctionOpen = nextOpen ? '1' : '0';
        this.renderCorrectionWidget(bubble);
      });

      const details = document.createElement('div');
      details.className = 'correction-details';
      details.hidden = !isOpen;

      corrections.forEach((correction) => {
        const item = document.createElement('div');
        item.className = 'correction-item';
        item.dataset.correctionId = correction.id;

        const status = document.createElement('div');
        status.className = `correction-status status-${correction.status || 'detected'}`;
        status.textContent = getCorrectionStatusLabel(correction.status);
        item.appendChild(status);

        const original = document.createElement('div');
        original.className = 'correction-line original';
        original.textContent = `Your phrase: ${correction.original || ''}`;
        item.appendChild(original);

        const corrected = document.createElement('div');
        corrected.className = 'correction-line corrected';
        corrected.textContent = `Correction: ${correction.corrected || ''}`;
        item.appendChild(corrected);

        const rule = document.createElement('div');
        rule.className = 'correction-rule';
        if (correction.status === 'verified') {
          const confidence = typeof correction.confidence === 'number'
            ? ` (confidence ${Math.round(correction.confidence * 100)}%)`
            : '';
          rule.textContent = `${correction.rule || 'No rule explanation provided.'}${confidence}`;
        } else if (correction.status === 'failed') {
          rule.textContent = correction.error || 'Verification unavailable.';
        } else if (correction.status === 'verifying') {
          rule.textContent = 'Checking rule...';
        } else {
          rule.textContent = 'Correction detected.';
        }
        item.appendChild(rule);

        const feedbackRow = document.createElement('div');
        feedbackRow.className = 'correction-feedback';

        const agreeBtn = document.createElement('button');
        agreeBtn.type = 'button';
        agreeBtn.className = 'correction-feedback-btn';
        agreeBtn.textContent = 'Agree';
        if (correction.user_feedback === CORRECTION_FEEDBACK_VALUES.AGREE) {
          agreeBtn.classList.add('is-active');
        }
        agreeBtn.addEventListener('click', () => {
          this.handleCorrectionFeedback(
            bubble,
            correction.id,
            CORRECTION_FEEDBACK_VALUES.AGREE
          );
        });

        const disagreeBtn = document.createElement('button');
        disagreeBtn.type = 'button';
        disagreeBtn.className = 'correction-feedback-btn';
        disagreeBtn.textContent = 'Disagree';
        if (correction.user_feedback === CORRECTION_FEEDBACK_VALUES.DISAGREE) {
          disagreeBtn.classList.add('is-active');
        }
        disagreeBtn.addEventListener('click', () => {
          this.handleCorrectionFeedback(
            bubble,
            correction.id,
            CORRECTION_FEEDBACK_VALUES.DISAGREE
          );
        });

        feedbackRow.appendChild(agreeBtn);
        feedbackRow.appendChild(disagreeBtn);
        item.appendChild(feedbackRow);

        details.appendChild(item);
      });

      widget.appendChild(toggle);
      widget.appendChild(details);
    }
  
    /**
     * Add a new utterance to the panel, rendering per-word playback.
     * record.text         // original punctuated transcript
     * record.wordTimings  // [{word, start, end}, …] from Whisper
     */
    async add(record) {
      
      // For user speech, always look for the most recent unfinalized bubble to replace
      // This ensures the "Speaking..." placeholder gets replaced with final transcription
      let existing = null;
      if (record.speaker === 'user' && record.text !== '...') {
        existing = this.container.querySelector(`[data-utterance-id="${record.id}"]`);
        if (!existing) {
        const userBubbles = this.container.querySelectorAll(`.bubble.user`);
        for (let i = userBubbles.length - 1; i >= 0; i--) {
          const bubble = userBubbles[i];
          // Look for bubbles without utteranceId (unfinalized) or placeholder bubbles
          const isPlaceholder = bubble.querySelector('.highlighted-text')?.textContent?.includes('Speaking...');
          const isUnfinalized = !bubble.dataset.utteranceId || bubble.dataset.utteranceId === 'undefined';
          
          if (isUnfinalized || isPlaceholder) {
            existing = bubble;
            break;
  }

}
      }
      } else {
        // For AI speech, use the original detection logic
        existing = this.container.querySelector(`[data-utterance-id="${record.id}"]`);
        
        if (!existing && record.text !== '...') {
          const speakerBubbles = this.container.querySelectorAll(`.bubble.${record.speaker}`);
          for (let i = speakerBubbles.length - 1; i >= 0; i--) {
            const bubble = speakerBubbles[i];
            const bubbleUtteranceId = bubble.dataset.utteranceId || '';
            const isUnfinalized = !bubbleUtteranceId || bubbleUtteranceId === 'undefined';
            const isSyntheticAi = record.speaker === 'ai' && /^synthetic-ai-/.test(bubbleUtteranceId);
            if (isUnfinalized || isSyntheticAi) {
              existing = bubble;
              break;
            }
          }
        }
      }
      
      if (existing && record.text !== '...') {
        // Set the utteranceId on the existing bubble before enhancing
        existing.dataset.utteranceId = record.id;
        // If we have an existing bubble and this is a final record (not placeholder), enhance it
        await this.enhanceExistingBubble(existing, record);
        if (record.speaker === 'ai') {
          this.attachPendingCorrectionsToBubble(existing);
        }
        return;
      }
      
      // 1) Bubble wrapper
      const bubble = document.createElement('div');
      bubble.classList.add('bubble', record.speaker === 'ai' ? 'ai' : 'user');
      bubble.dataset.utteranceId = record.id;
      if (record.text === '...') {
        bubble.classList.add('placeholder');
      }
  
      // 2) Utterance-level play button (only if we have audio blob and it's not placeholder)
      let playBtn = null;
      let audioBuffer = null;
      
      if (record.audioBlob && record.text !== '...') {
        playBtn = document.createElement('button');
        playBtn.className = 'play-utterance';
        playBtn.textContent = '⏵';
        const handlePlay = async () => {
          if (this.isDebounced()) return;
          
          // eslint-disable-next-line no-console
          console.log('▶️ Play utterance', record.id);
          
          stopActiveAudio();
          await ensureAudioContext();
          await playUtteranceAudio(record);
        };
        playBtn.addEventListener('click', handlePlay);
        Object.defineProperty(playBtn, '__handlePlay', {
          value: handlePlay,
          configurable: true,
          writable: false,
          enumerable: false
        });
        bubble.appendChild(playBtn);

        // 3) Decode & cache AudioBuffer
        audioBuffer = bufferCache.get(record.id);
        if (!audioBuffer) {
          try {
            const raw = await blobToArrayBuffer(record.audioBlob);
            if (!raw) {
              // eslint-disable-next-line no-console
              console.warn(`⚠️ Unable to read audio blob for ${record.id}`);
              throw new Error('Blob conversion failed');
            }
            audioBuffer = await audioCtx.decodeAudioData(raw);
            bufferCache.set(record.id, audioBuffer);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`⚠️ Failed to decode audio for ${record.id}:`, err);
          }
        }
      } else {
        // No audio blob available for this record
      }
  
      // 4) Build the transcript with pastel highlighting
      const p = document.createElement('p');
      p.className = 'transcript';

      // Create highlighted container span
      const highlightedSpan = document.createElement('span');
      highlightedSpan.className = 'highlighted-text';

      // Split text into [non-word, word, non-word, word, …]
      const wordRe = /([\w’']+)/g;
      const parts = record.text.split(wordRe);

      let w = 0;  // index into record.wordTimings
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i % 2 === 1) {
          // odd indexes are words - always create spans for proper styling
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = part;
          
          // Only add click handler if we have audio timing data
          const timing = record.wordTimings && record.wordTimings[w];
          const handleWord = async () => {
            if (this.isDebounced()) return;
            if (!audioBuffer || !timing) return;
            
            const { start, end } = timing;
            // eslint-disable-next-line no-console
            console.log(`🔊 Play word "${part}" from ${start} to ${end}s`);
            
            stopActiveAudio();
            await ensureAudioContext();
            const src = audioCtx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(audioCtx.destination);
            
            // Track this source for cleanup
            activeSources.push(src);
            
            const playbackBuffer = 0.1;
            const bufferedStart = Math.max(0, start - playbackBuffer);
            const bufferedEnd = Math.min(audioBuffer.duration, end + playbackBuffer);
            src.start(0, bufferedStart, bufferedEnd - bufferedStart);
            
            src.onended = () => {
              const index = activeSources.indexOf(src);
              if (index > -1) {
                activeSources.splice(index, 1);
              }
            };
          };

          Object.defineProperty(span, '__handleWord', {
            value: handleWord,
            configurable: true,
            writable: false,
            enumerable: false
          });

          if (timing && audioBuffer) {
            span.addEventListener('click', handleWord);
          }
          w++; // increment word index regardless
          highlightedSpan.appendChild(span);
        } else {
          // even indexes are the exact "glue" (spaces, punctuation)—just text
          highlightedSpan.appendChild(document.createTextNode(part));
        }
      }

      // Append the highlighted span to the paragraph
      p.appendChild(highlightedSpan);
  
      // 5) Append bubble & auto-scroll, updating if already exists
      this.ensureManualCorrectionTrigger(bubble, record);
      bubble.appendChild(p);
      const existingAfterBuild = this.container.querySelector(`[data-utterance-id="${record.id}"]`);
      if (existingAfterBuild) {
        if (existingAfterBuild.__corrections instanceof Map) {
          bubble.__corrections = new Map(existingAfterBuild.__corrections);
          bubble.dataset.correctionOpen = existingAfterBuild.dataset.correctionOpen || '0';
          this.renderCorrectionWidget(bubble);
        }
        if (existingAfterBuild.dataset.manualCorrectionId) {
          bubble.dataset.manualCorrectionId = existingAfterBuild.dataset.manualCorrectionId;
        }
        if (existingAfterBuild.dataset.manualCorrectionRequested) {
          bubble.dataset.manualCorrectionRequested = existingAfterBuild.dataset.manualCorrectionRequested;
        }
        this.container.replaceChild(bubble, existingAfterBuild);
      } else {
        this.container.appendChild(bubble);
      }
      if (record.speaker === 'ai') {
        this.attachPendingCorrectionsToBubble(bubble);
      }
      this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Enhance an existing bubble with complete audio data and word timings
     */
    async enhanceExistingBubble(bubble, record) {
      // Remove placeholder class if present
      bubble.classList.remove('placeholder');
      
      // Add play button if we have audio and don't already have one
      if (record.audioBlob && !bubble.querySelector('.play-utterance')) {
        const playBtn = document.createElement('button');
        playBtn.className = 'play-utterance';
        playBtn.textContent = '⏵';
        const handlePlay = async () => {
          if (this.isDebounced()) return;
          
          // eslint-disable-next-line no-console
          console.log('▶️ Play utterance', record.id);
          
          stopActiveAudio();
          await ensureAudioContext();
          await playUtteranceAudio(record);
        };
        playBtn.addEventListener('click', handlePlay);
        Object.defineProperty(playBtn, '__handlePlay', {
          value: handlePlay,
          configurable: true,
          writable: false,
          enumerable: false
        });
        bubble.insertBefore(playBtn, bubble.firstChild);
        
        // Decode & cache AudioBuffer
        let audioBuffer = bufferCache.get(record.id);
        if (!audioBuffer) {
          try {
            const raw = await blobToArrayBuffer(record.audioBlob);
            if (!raw) {
              // eslint-disable-next-line no-console
              console.warn(`⚠️ Unable to read audio blob for ${record.id}`);
              throw new Error('Blob conversion failed');
            }
            audioBuffer = await audioCtx.decodeAudioData(raw);
            bufferCache.set(record.id, audioBuffer);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`⚠️ Failed to decode audio for ${record.id}:`, err);
          }
        }
        
        // Rebuild transcript content with enhanced features
        this.buildTranscriptContent(bubble, record, audioBuffer);
      } else {
        // Just update the transcript content
        this.buildTranscriptContent(bubble, record, null);
      }
      this.ensureManualCorrectionTrigger(bubble, record);
      
      this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Build or rebuild the transcript content within a bubble
     */
    buildTranscriptContent(bubble, record, audioBuffer) {
      // Remove existing transcript if present
      const existingTranscript = bubble.querySelector('.transcript');
      if (existingTranscript) {
        existingTranscript.remove();
      }

      const p = document.createElement('p');
      p.className = 'transcript';

      // Create highlighted container span
      const highlightedSpan = document.createElement('span');
      highlightedSpan.className = 'highlighted-text';

      // Split text into [non-word, word, non-word, word, …]
      const wordRe = /([\w'']+)/g;
      const parts = record.text.split(wordRe);

      let w = 0;  // index into record.wordTimings
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i % 2 === 1) {
          // odd indexes are words - always create spans for proper styling
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = part;
          
          // Only add click handler if we have audio timing data
          const timing = record.wordTimings && record.wordTimings[w];
          const handleWord = async () => {
            if (this.isDebounced()) return;
            if (!audioBuffer || !timing) return;
            
            const { start, end } = timing;
            // eslint-disable-next-line no-console
            console.log(`🔊 Play word "${part}" from ${start} to ${end}s`);
            
            stopActiveAudio();
            await ensureAudioContext();
            const src = audioCtx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(audioCtx.destination);
            
            activeSources.push(src);
            
            const playbackBuffer = 0.1;
            const bufferedStart = Math.max(0, start - playbackBuffer);
            const bufferedEnd = Math.min(audioBuffer.duration, end + playbackBuffer);
            src.start(0, bufferedStart, bufferedEnd - bufferedStart);
            
            src.onended = () => {
              const index = activeSources.indexOf(src);
              if (index > -1) {
                activeSources.splice(index, 1);
              }
            };
          };

          Object.defineProperty(span, '__handleWord', {
            value: handleWord,
            configurable: true,
            writable: false,
            enumerable: false
          });

          if (timing && audioBuffer) {
            span.addEventListener('click', handleWord);
          }
          w++; // increment word index regardless
          highlightedSpan.appendChild(span);
        } else {
          // even indexes are the exact "glue" (spaces, punctuation)—just text
          highlightedSpan.appendChild(document.createTextNode(part));
        }
      }

      // Append the highlighted span to the paragraph
      p.appendChild(highlightedSpan);
      const existingCorrectionWidget = bubble.querySelector('.correction-widget');
      if (existingCorrectionWidget) {
        bubble.insertBefore(p, existingCorrectionWidget);
      } else {
        bubble.appendChild(p);
      }
    }
  }

DialoguePanel.resetCache = function resetCache() {
  bufferCache.clear();
  stopActiveAudio();
};
