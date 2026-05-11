import { describe, it, expect } from 'vitest';
import {
  computeRgbShiftAmount,
  computeLodPointScale,
  applyRecentGlowScale
} from '../../realtime/sceneRuntimeController.js';

describe('sceneRuntimeController helpers', () => {
  it('computes rgb shift amount with threshold', () => {
    expect(computeRgbShiftAmount(0.05)).toBe(0);
    expect(computeRgbShiftAmount(0.2)).toBeCloseTo(0.0004);
  });

  it('reduces point scale for distant points', () => {
    const near = computeLodPointScale(5, 10);
    const far = computeLodPointScale(15, 10);
    expect(far).toBeLessThan(near);
  });

  it('applies recent glow pulse and expires old glow entries', () => {
    const recentlyAdded = new Map([[3, 10_000], [4, 1_000]]);
    const pulsed = applyRecentGlowScale(0.1, recentlyAdded, 3, 10_500);
    expect(pulsed).toBeGreaterThan(0.1);

    const unchanged = applyRecentGlowScale(0.1, recentlyAdded, 4, 30_000);
    expect(unchanged).toBe(0.1);
    expect(recentlyAdded.has(4)).toBe(false);
  });
});
