import { describe, it, expect } from 'vitest';
import { buildFilamentLinePositions, computeNextIdleRotateSpeed } from '../../realtime/sceneRuntimeMath.js';

function vec(x, y, z) {
  return {
    x,
    y,
    z,
    clone() {
      return vec(this.x, this.y, this.z);
    },
    multiplyScalar(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    },
    distanceToSquared(other) {
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dz = this.z - other.z;
      return dx * dx + dy * dy + dz * dz;
    }
  };
}

describe('sceneRuntimeMath', () => {
  it('builds filament positions only for nearby points', () => {
    const points = [
      vec(0, 0, 0),
      vec(0.1, 0, 0),
      vec(10, 0, 0)
    ];
    const line = buildFilamentLinePositions(points, 2, {
      maxDistSq: 0.2 * 0.2,
      maxConnections: 10
    });

    expect(line).toEqual([0, 0, 0, 0.2, 0, 0]);
  });

  it('respects maxConnections cap', () => {
    const points = [
      vec(0, 0, 0),
      vec(0.1, 0, 0),
      vec(0.2, 0, 0)
    ];
    const line = buildFilamentLinePositions(points, 1, {
      maxDistSq: 1,
      maxConnections: 1
    });

    // Only one edge can include each point with maxConnections=1.
    expect(line.length).toBe(6);
  });

  it('accelerates and decelerates idle rotate speed within bounds', () => {
    expect(computeNextIdleRotateSpeed({
      currentSpeed: 0.2,
      deltaSeconds: 1,
      shouldIdleRotate: true,
      targetSpeed: 0.5,
      accelPerSec: 0.1,
      decelPerSec: 1.2
    })).toBeCloseTo(0.3);

    expect(computeNextIdleRotateSpeed({
      currentSpeed: 0.45,
      deltaSeconds: 1,
      shouldIdleRotate: true,
      targetSpeed: 0.5,
      accelPerSec: 0.1,
      decelPerSec: 1.2
    })).toBeCloseTo(0.5);

    expect(computeNextIdleRotateSpeed({
      currentSpeed: 0.4,
      deltaSeconds: 0.5,
      shouldIdleRotate: false,
      targetSpeed: 0.5,
      accelPerSec: 0.1,
      decelPerSec: 1.2
    })).toBeCloseTo(0);
  });
});
