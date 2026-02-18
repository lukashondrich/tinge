import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { BubbleManager } from '../../ui/bubbleManager.js';

describe('BubbleManager', () => {
  let dom;
  let container;
  let manager;
  const playAudioFor = vi.fn();

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="transcriptContainer"></div>
        </body>
      </html>
    `);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    container = document.getElementById('transcriptContainer');
    manager = new BubbleManager({
      containerElement: container,
      playAudioFor,
      isMobile: false
    });
    playAudioFor.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.navigator;
  });

  it('creates placeholder bubble on beginTurn for user', () => {
    const bubble = manager.beginTurn('user');
    expect(bubble).toBeTruthy();
    expect(bubble.classList.contains('user')).toBe(true);
    const highlight = bubble.querySelector('.highlighted-text');
    expect(highlight.textContent).toContain('Speaking');
  });

  it('appendWord clears placeholder and binds audio handler', () => {
    manager.beginTurn('user');
    manager.appendWord({ speaker: 'user', word: 'hello', onWordClick: playAudioFor });
    const bubble = manager.getActiveBubble('user');
    const highlight = bubble.querySelector('.highlighted-text');
    expect(highlight.textContent.trim()).toBe('hello');
    const span = highlight.querySelector('.word');
    span.click();
    expect(playAudioFor).toHaveBeenCalledWith('hello');
  });

  it('appendDelta accumulates text and returns completed words', () => {
    manager.beginTurn('ai');
    const words = manager.appendDelta('ai', 'testing one two ');
    expect(words).toContain('testing');
    expect(words).toContain('one');
    expect(words).toContain('two');
    const bubble = manager.getActiveBubble('ai');
    expect(bubble.querySelector('.highlighted-text').textContent).toContain('testing one two');
  });

  it('shouldProcessUtterance prevents duplicates', () => {
    const record = { speaker: 'user', id: 'abc', text: 'Hi' };
    expect(manager.shouldProcessUtterance(record, 'desktop')).toBe(true);
    expect(manager.shouldProcessUtterance(record, 'desktop')).toBe(false);
  });

  it('shouldProcessUtterance keeps distinct id-based turns even when text prefixes match', () => {
    const first = {
      speaker: 'ai',
      id: 'ai-1',
      text: 'Got it! Let us correct this sentence now.'
    };
    const second = {
      speaker: 'ai',
      id: 'ai-2',
      text: 'Got it! Let us correct this sentence with another example.'
    };

    expect(manager.shouldProcessUtterance(first, 'desktop')).toBe(true);
    expect(manager.shouldProcessUtterance(second, 'desktop')).toBe(true);
  });

  it('shouldProcessUtterance dedupes text-only turns without stable ids', () => {
    const textOnly = {
      speaker: 'ai',
      text: 'Same text fallback'
    };

    expect(manager.shouldProcessUtterance(textOnly, 'desktop')).toBe(true);
    expect(manager.shouldProcessUtterance(textOnly, 'desktop')).toBe(false);
  });

  it('beginTurn creates a new bubble when previous active turn already has utterance id', () => {
    const first = manager.beginTurn('ai');
    manager.setUtteranceId('ai', 'ai-utterance-1');

    const second = manager.beginTurn('ai');
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(container.querySelectorAll('.bubble.ai').length).toBe(2);
  });

  it('beginTurn clears stale finalize timer before reusing active bubble', () => {
    manager.beginTurn('ai');
    manager.scheduleFinalize('ai', 1000);
    expect(manager.finalizeTimers.ai).toBeTruthy();

    const reused = manager.beginTurn('ai');
    expect(reused).toBeTruthy();
    expect(manager.finalizeTimers.ai).toBeNull();
  });

  it('beginTurn still creates bubble during mobile cooldown when no active/reusable bubble exists', () => {
    manager = new BubbleManager({
      containerElement: container,
      playAudioFor,
      isMobile: true,
      mobileCooldown: 10000
    });

    manager.lastBubbleCreation.ai = Date.now();
    const bubble = manager.beginTurn('ai');

    expect(bubble).toBeTruthy();
    expect(container.querySelectorAll('.bubble.ai').length).toBe(1);
  });

  it('finalize assigns synthetic utterance id so next AI turn does not reuse previous bubble', () => {
    const first = manager.beginTurn('ai');
    manager.appendDelta('ai', 'first answer');
    manager.finalize('ai');

    expect(first.dataset.utteranceId).toBeTruthy();
    expect(first.dataset.utteranceId).toMatch(/^synthetic-ai-/);

    const second = manager.beginTurn('ai');
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(container.querySelectorAll('.bubble.ai').length).toBe(2);
  });
});
