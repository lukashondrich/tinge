import { describe, it, expect } from 'vitest';
import { buildRecentConversationContext } from '../../realtime/sessionContextBuilder.js';

describe('sessionContextBuilder', () => {
  const now = 1700000000000;

  it('returns an empty string when there is no usable recent dialogue', () => {
    expect(buildRecentConversationContext([], { now })).toBe('');
    expect(buildRecentConversationContext([
      { speaker: 'user', timestamp: now, text: '...' },
      { speaker: 'system', timestamp: now, text: 'ignore me' },
      { speaker: 'ai', timestamp: now - 61 * 60 * 1000, text: 'too old' }
    ], { now })).toBe('');
  });

  it('formats bounded recent learner and tutor turns', () => {
    const context = buildRecentConversationContext([
      { speaker: 'user', timestamp: now - 4000, text: 'Hola, quiero practicar pedir cafe.' },
      { speaker: 'ai', timestamp: now - 3000, text: 'Claro. Hazme el pedido en espanol.' },
      { speaker: 'user', timestamp: now - 2000, text: 'Quiero un cafe con leche.' }
    ], {
      now,
      limit: 2
    });

    expect(context).toContain('Recent conversation context from this browser');
    expect(context).not.toContain('Hola, quiero practicar');
    expect(context).toContain('Tutor: Claro. Hazme el pedido en espanol.');
    expect(context).toContain('Learner: Quiero un cafe con leche.');
  });

  it('filters dialogue before the current browser session start', () => {
    const context = buildRecentConversationContext([
      { speaker: 'user', timestamp: now - 20000, text: 'old page session' },
      { speaker: 'ai', timestamp: now - 1000, text: 'current page session' }
    ], {
      now,
      minTimestamp: now - 5000
    });

    expect(context).not.toContain('old page session');
    expect(context).toContain('current page session');
  });

  it('keeps the newest turns when constrained by character budget', () => {
    const context = buildRecentConversationContext([
      { speaker: 'user', timestamp: now - 3000, text: 'first turn with many details' },
      { speaker: 'ai', timestamp: now - 2000, text: 'second turn with many details' },
      { speaker: 'user', timestamp: now - 1000, text: 'third turn' }
    ], {
      now,
      maxChars: 48
    });

    expect(context).not.toContain('first turn');
    expect(context).toContain('third turn');
  });
});
