// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRemoteAudioController } from '../../realtime/remoteAudioController.js';

describe('createRemoteAudioController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates hidden remote audio element when missing', () => {
    const controller = createRemoteAudioController();

    const element = controller.ensureElement();

    expect(element).toBeTruthy();
    expect(element.id).toBe('remoteAiAudio');
    expect(element.autoplay).toBe(true);
    expect(element.playsInline).toBe(true);
    expect(element.muted).toBe(false);
    expect(element.volume).toBe(1);
    expect(element.style.position).toBe('fixed');
    expect(document.getElementById('remoteAiAudio')).toBe(element);
  });

  it('reuses existing remote audio element', () => {
    const existing = document.createElement('audio');
    existing.id = 'remoteAiAudio';
    document.body.appendChild(existing);

    const controller = createRemoteAudioController();
    const element = controller.ensureElement();

    expect(element).toBe(existing);
  });

  it('attaches stream, plays immediately, and retries on first gesture', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const controller = createRemoteAudioController();
    const element = controller.ensureElement();
    const play = vi.fn(() => Promise.resolve());
    element.play = play;

    controller.attachRemoteStream({ id: 'remote-stream' });
    expect(play).toHaveBeenCalledTimes(1);
    expect(element.srcObject).toEqual({ id: 'remote-stream' });

    window.dispatchEvent(new Event('pointerdown'));
    expect(play).toHaveBeenCalledTimes(2);
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    removeSpy.mockRestore();
  });

  it('logs play errors and disposes element', async () => {
    const error = vi.fn();
    const controller = createRemoteAudioController({ error });
    const element = controller.ensureElement();
    Object.defineProperty(element, 'play', {
      value: vi.fn(() => Promise.reject(new Error('blocked'))),
      configurable: true
    });

    controller.attachRemoteStream({ id: 'stream' });
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      error.mock.calls.some(([message, err]) => (
        message === 'Audio play error:'
        && err instanceof Error
      ))
    ).toBe(true);

    controller.dispose();
    expect(document.getElementById('remoteAiAudio')).toBeNull();
  });
});
