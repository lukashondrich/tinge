import { describe, it, expect, beforeEach } from 'vitest';
import { CorrectionStore } from '../../core/correctionStore.js';

describe('CorrectionStore', () => {
  beforeEach(() => {
    if (globalThis.localStorage) {
      globalThis.localStorage.clear();
    }
  });

  it('upserts detected correction records', () => {
    const store = new CorrectionStore({
      nowIso: () => '2026-02-16T12:00:00.000Z'
    });

    const record = store.upsertCorrection({
      id: 'corr-1',
      original: 'foo',
      corrected: 'bar',
      correction_type: 'grammar',
      status: 'detected'
    });

    expect(record.id).toBe('corr-1');
    const payload = store.load();
    expect(payload.corrections).toHaveLength(1);
    expect(payload.corrections[0].status).toBe('detected');
  });

  it('applies verification updates and feedback', () => {
    const store = new CorrectionStore({
      nowIso: () => '2026-02-16T12:00:00.000Z'
    });
    store.upsertCorrection({
      id: 'corr-2',
      original: 'a',
      corrected: 'b',
      correction_type: 'vocabulary',
      status: 'detected'
    });

    const verified = store.upsertVerification('corr-2', {
      status: 'verified',
      verification: {
        rule: 'Rule text',
        confidence: 0.77,
        category: 'lexical'
      }
    });
    const feedbackSet = store.setFeedback('corr-2', 'disagree');

    expect(verified).toBe(true);
    expect(feedbackSet).toBe(true);
    const payload = store.load();
    expect(payload.corrections[0].status).toBe('verified');
    expect(payload.corrections[0].confidence).toBe(0.77);
    expect(payload.corrections[0].user_feedback).toBe('disagree');
  });
});
