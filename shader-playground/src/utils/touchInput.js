export function setupTouchRotation(mesh) {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let rotationY = 0;
    let dragSpeed = 0;
  
    const onPointerDown = (e) => {
      if (e.target.closest && e.target.closest('#ptt-button')) {
        isDragging = false;
        return;
      }
      isDragging = true;
      lastX = e.clientX || e.touches?.[0]?.clientX || 0;
      lastY = e.clientY || e.touches?.[0]?.clientY || 0;
    };
  
    const onPointerMove = (e) => {
      if (!isDragging) return;
      const currentX = e.clientX || e.touches?.[0]?.clientX || 0;
      const currentY = e.clientY || e.touches?.[0]?.clientY || 0;
      const delta = currentX - lastX;
      dragSpeed = Math.abs(delta);
      rotationY += delta * 0.005;
      lastX = currentX;
      lastY = currentY;
    };
  
    const onPointerUp = () => {
      isDragging = false;
    };
  
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
  
    window.addEventListener('touchstart', onPointerDown);
    window.addEventListener('touchmove', onPointerMove);
    window.addEventListener('touchend', onPointerUp);

    const getSpeed = () => {
      const speed = dragSpeed;
      dragSpeed *= 0.9;

      const normalizedX = (lastX / window.innerWidth) * 2 - 1;
      const normalizedY = (lastY / window.innerHeight) * 2 - 1;

      return { speed, offsetX: normalizedX, offsetY: normalizedY };
    };

    const dispose = () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    return { getSpeed, dispose };
  }
  