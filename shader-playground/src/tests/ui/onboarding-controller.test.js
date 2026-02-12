import { describe, it, expect, vi } from 'vitest';
import {
  DEMO_SEED_ENABLED_KEY,
  DEMO_SEED_WORDS,
  seededPoint,
  shouldEnableDemoSeed,
  buildDemoSeedVocabulary,
  applyDemoSeedVocabulary
} from '../../ui/onboardingController.js';

describe('onboardingController', () => {
  function createStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (key) => data.has(key) ? data.get(key) : null,
      setItem: (key, value) => data.set(key, value)
    };
  }

  it('creates deterministic seeded points', () => {
    const first = seededPoint(3, 40);
    const second = seededPoint(3, 40);
    expect(first).toEqual(second);
  });

  it('enables demo seed by default and persists the key', () => {
    const storage = createStorage();
    expect(storage.getItem(DEMO_SEED_ENABLED_KEY)).toBeNull();
    const enabled = shouldEnableDemoSeed(storage);
    expect(enabled).toBe(true);
    expect(storage.getItem(DEMO_SEED_ENABLED_KEY)).toBe('1');
  });

  it('respects existing disabled demo seed preference', () => {
    const storage = createStorage({ [DEMO_SEED_ENABLED_KEY]: '0' });
    expect(shouldEnableDemoSeed(storage)).toBe(false);
  });

  it('builds seeded vocabulary entries with stable ordering', () => {
    const entries = buildDemoSeedVocabulary(5000);
    expect(entries).toHaveLength(DEMO_SEED_WORDS.length);
    expect(entries[0].word).toBe(DEMO_SEED_WORDS[0].word);
    expect(entries[0].timestamp).toBe(5000);
    expect(entries[1].timestamp).toBe(5001);
  });

  it('imports demo seed entries through vocabulary storage', () => {
    const importVocabulary = vi.fn();
    const vocabulary = { importVocabulary };

    const count = applyDemoSeedVocabulary(vocabulary);

    expect(count).toBe(DEMO_SEED_WORDS.length);
    expect(importVocabulary).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(importVocabulary.mock.calls[0][0]);
    expect(payload).toHaveLength(DEMO_SEED_WORDS.length);
  });
});
