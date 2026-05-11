import { createMobileDebug, isMobileDevice } from '../utils/mobile.js';

const DEFAULT_CONNECTING_FEEDBACK_MS = 1200;
const DEFAULT_MOBILE_TOUCH_DEBOUNCE_MS = 100;
const DEFAULT_MOBILE_RELEASE_BUFFER_MS = 1000;
const DEFAULT_DESKTOP_RELEASE_BUFFER_MS = 500;

export function resolveRealtimeDeviceProfile({
  isMobileDeviceFn = isMobileDevice,
  createMobileDebugFn = createMobileDebug,
  connectingFeedbackMs = DEFAULT_CONNECTING_FEEDBACK_MS,
  mobileTouchDebounceMs = DEFAULT_MOBILE_TOUCH_DEBOUNCE_MS,
  mobileReleaseBufferMs = DEFAULT_MOBILE_RELEASE_BUFFER_MS,
  desktopReleaseBufferMs = DEFAULT_DESKTOP_RELEASE_BUFFER_MS
} = {}) {
  const isMobile = Boolean(isMobileDeviceFn());
  return {
    isMobile,
    deviceType: isMobile ? 'mobile' : 'desktop',
    mobileDebug: createMobileDebugFn(isMobile),
    connectingFeedbackMs,
    touchDebounceMs: isMobile ? mobileTouchDebounceMs : 0,
    releaseBufferMs: isMobile ? mobileReleaseBufferMs : desktopReleaseBufferMs
  };
}
