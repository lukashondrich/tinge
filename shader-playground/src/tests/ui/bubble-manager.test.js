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
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
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
    delete global.window;
    delete global.document;
    delete global.navigator;
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
});
