export function detectSwipe(start, end, threshold = 30) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absY > absX && absY > threshold) {
    return dy > 0 ? 'down' : 'up';
  }
  if (absX > absY && absX > threshold) {
    return dx > 0 ? 'right' : 'left';
  }
  return null;
}
