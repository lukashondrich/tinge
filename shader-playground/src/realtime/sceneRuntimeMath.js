export function buildFilamentLinePositions(
  updatedPositions,
  scale,
  {
    maxDistSq = 0.45 * 0.45,
    maxConnections = 10
  } = {}
) {
  const linePositions = [];
  const connectionCounts = new Array(updatedPositions.length).fill(0);

  for (let i = 0; i < updatedPositions.length; i++) {
    for (let j = i + 1; j < updatedPositions.length; j++) {
      if (connectionCounts[i] < maxConnections && connectionCounts[j] < maxConnections) {
        const a = updatedPositions[i];
        const b = updatedPositions[j];
        if (a.distanceToSquared(b) < maxDistSq) {
          const pa = a.clone().multiplyScalar(scale);
          const pb = b.clone().multiplyScalar(scale);
          linePositions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
          connectionCounts[i] += 1;
          connectionCounts[j] += 1;
        }
      }
    }
  }

  return linePositions;
}

export function computeNextIdleRotateSpeed({
  currentSpeed,
  deltaSeconds,
  shouldIdleRotate,
  targetSpeed,
  accelPerSec,
  decelPerSec
}) {
  if (shouldIdleRotate) {
    return Math.min(targetSpeed, currentSpeed + accelPerSec * deltaSeconds);
  }
  return Math.max(0, currentSpeed - decelPerSec * deltaSeconds);
}
