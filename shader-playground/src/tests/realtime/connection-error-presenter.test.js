import { describe, it, expect, vi } from 'vitest';
import { ConnectionErrorPresenter } from '../../realtime/connectionErrorPresenter.js';

describe('ConnectionErrorPresenter', () => {
  function createPresenter(overrides = {}) {
    let scheduled = null;
    const setPTTStatus = vi.fn();
    const log = vi.fn();
    const mobileHelp = { style: { display: 'none' } };
    const presenter = new ConnectionErrorPresenter({
      deviceType: 'desktop',
      setPTTStatus,
      getMobileHelpElement: () => mobileHelp,
      schedule: (fn) => {
        scheduled = fn;
        return 1;
      },
      log,
      ...overrides
    });

    return {
      presenter,
      setPTTStatus,
      log,
      mobileHelp,
      runScheduled: () => {
        if (scheduled) scheduled();
      }
    };
  }

  it('maps desktop permission errors to mic error and retry status', () => {
    const ctx = createPresenter();

    const result = ctx.presenter.handleConnectError(new Error('Permission denied by browser'));
    ctx.runScheduled();

    expect(result).toBe('Mic Error');
    expect(ctx.setPTTStatus).toHaveBeenNthCalledWith(1, 'Mic Error', '#c00');
    expect(ctx.setPTTStatus).toHaveBeenNthCalledWith(2, 'Try Again', '#44f');
  });

  it('maps mobile permission errors to allow mic and reveals help', () => {
    const ctx = createPresenter({
      deviceType: 'mobile'
    });

    const result = ctx.presenter.handleConnectError(new Error('getUserMedia failed'));
    ctx.runScheduled();

    expect(result).toBe('Mic Access');
    expect(ctx.setPTTStatus).toHaveBeenNthCalledWith(1, 'Mic Access', '#c00');
    expect(ctx.setPTTStatus).toHaveBeenNthCalledWith(2, 'Allow Mic', '#44f');
    expect(ctx.mobileHelp.style.display).toBe('block');
    expect(ctx.log).toHaveBeenCalledWith(
      'Mobile microphone troubleshooting: Check browser permissions, try refreshing, or use Chrome/Safari'
    );
  });

  it('maps SDP and WebRTC errors by device type', () => {
    const desktop = createPresenter();
    const mobile = createPresenter({ deviceType: 'mobile' });

    expect(desktop.presenter.resolveErrorText(new Error('SDP negotiation failed'))).toBe('WebRTC Error');
    expect(mobile.presenter.resolveErrorText(new Error('WebRTC setup failed'))).toBe('Connection');
  });

  it('maps token/fetch errors to network', () => {
    const ctx = createPresenter();

    expect(ctx.presenter.resolveErrorText(new Error('token fetch failed'))).toBe('Network');
  });

  it('falls back to generic error text', () => {
    const ctx = createPresenter();

    expect(ctx.presenter.resolveErrorText(new Error('unexpected issue'))).toBe('Error');
    expect(ctx.presenter.resolveErrorText({})).toBe('Error');
  });
});
