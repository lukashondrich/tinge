const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function isMobileDevice() {
  return MOBILE_REGEX.test(navigator.userAgent) ||
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0);
}

export function createMobileDebug(isMobile) {
  return function mobileDebug(message) {
    if (isMobile) {
      const debugPanel = document.getElementById('mobileDebug');
      const debugOutput = document.getElementById('debugOutput');
      if (debugPanel && debugOutput) {
        debugPanel.style.display = 'block';
        const timestamp = new Date().toLocaleTimeString();
        debugOutput.innerHTML += `<div>[${timestamp}] ${message}</div>`;
        debugOutput.scrollTop = debugOutput.scrollHeight;
      }
    }
    console.log(`[MOBILE] ${message}`); // eslint-disable-line no-console
  };
}

