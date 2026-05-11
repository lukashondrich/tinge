import { describe, it, expect, vi } from 'vitest';
import { resolveRealtimeDeviceProfile } from '../../realtime/deviceProfile.js';

describe('resolveRealtimeDeviceProfile', () => {
  it('returns mobile profile when detector reports mobile', () => {
    const mobileDebug = vi.fn();
    const profile = resolveRealtimeDeviceProfile({
      isMobileDeviceFn: () => true,
      createMobileDebugFn: () => mobileDebug
    });

    expect(profile.isMobile).toBe(true);
    expect(profile.deviceType).toBe('mobile');
    expect(profile.touchDebounceMs).toBe(100);
    expect(profile.releaseBufferMs).toBe(1000);
    expect(profile.mobileDebug).toBe(mobileDebug);
  });

  it('returns desktop profile when detector reports desktop', () => {
    const mobileDebug = vi.fn();
    const profile = resolveRealtimeDeviceProfile({
      isMobileDeviceFn: () => false,
      createMobileDebugFn: () => mobileDebug
    });

    expect(profile.isMobile).toBe(false);
    expect(profile.deviceType).toBe('desktop');
    expect(profile.touchDebounceMs).toBe(0);
    expect(profile.releaseBufferMs).toBe(500);
    expect(profile.mobileDebug).toBe(mobileDebug);
  });

  it('supports overriding timing defaults', () => {
    const profile = resolveRealtimeDeviceProfile({
      isMobileDeviceFn: () => true,
      createMobileDebugFn: () => () => {},
      connectingFeedbackMs: 3000,
      mobileTouchDebounceMs: 240,
      mobileReleaseBufferMs: 2222
    });

    expect(profile.connectingFeedbackMs).toBe(3000);
    expect(profile.touchDebounceMs).toBe(240);
    expect(profile.releaseBufferMs).toBe(2222);
  });
});
