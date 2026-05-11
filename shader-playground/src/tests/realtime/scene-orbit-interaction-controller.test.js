// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createSceneOrbitInteractionController } from '../../realtime/sceneOrbitInteractionController.js';

describe('createSceneOrbitInteractionController', () => {
  it('initializes OrbitControls with expected defaults', async () => {
    let controlsInstance = null;
    class FakeOrbitControls {
      constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.target = { set: vi.fn() };
        this.enableDamping = false;
        this.dampingFactor = 0;
        this.autoRotate = true;
        this.autoRotateSpeed = 1;
        this.update = vi.fn();
        this.dispose = vi.fn();
        this.handlers = {};
        controlsInstance = this;
      }

      addEventListener(type, handler) {
        this.handlers[type] = handler;
      }

      removeEventListener(type, handler) {
        if (this.handlers[type] === handler) {
          delete this.handlers[type];
        }
      }
    }

    const domElement = document.createElement('canvas');
    const camera = { id: 'camera' };
    const controller = await createSceneOrbitInteractionController({
      camera,
      domElement,
      importOrbitControls: async () => ({ OrbitControls: FakeOrbitControls }),
      nowFn: () => 100
    });

    expect(controller.orbitControls).toBe(controlsInstance);
    expect(controlsInstance.camera).toBe(camera);
    expect(controlsInstance.domElement).toBe(domElement);
    expect(controlsInstance.target.set).toHaveBeenCalledWith(0, 0, 0);
    expect(controlsInstance.enableDamping).toBe(true);
    expect(controlsInstance.dampingFactor).toBe(0.06);
    expect(controlsInstance.autoRotate).toBe(false);
    expect(controlsInstance.autoRotateSpeed).toBe(0);
    expect(controlsInstance.update).toHaveBeenCalledTimes(1);
  });

  it('tracks user interaction from controls and pointer events and cleans up listeners', async () => {
    let controlsInstance = null;
    class FakeOrbitControls {
      constructor() {
        this.target = { set: vi.fn() };
        this.update = vi.fn();
        this.dispose = vi.fn();
        this.handlers = {};
        controlsInstance = this;
      }

      addEventListener(type, handler) {
        this.handlers[type] = handler;
      }

      removeEventListener(type, handler) {
        if (this.handlers[type] === handler) {
          delete this.handlers[type];
        }
      }

      emit(type) {
        this.handlers[type]?.();
      }
    }

    const nowValues = [100, 200, 300, 400, 500, 600];
    const domElement = document.createElement('canvas');
    const controller = await createSceneOrbitInteractionController({
      camera: {},
      domElement,
      importOrbitControls: async () => ({ OrbitControls: FakeOrbitControls }),
      nowFn: () => nowValues.shift() ?? 999
    });

    expect(controller.getIsUserOrbiting()).toBe(false);
    expect(controller.getLastUserInteractionTime()).toBe(100);

    controlsInstance.emit('start');
    expect(controller.getIsUserOrbiting()).toBe(true);
    expect(controller.getLastUserInteractionTime()).toBe(200);

    controlsInstance.emit('end');
    expect(controller.getIsUserOrbiting()).toBe(false);
    expect(controller.getLastUserInteractionTime()).toBe(300);

    domElement.dispatchEvent(new Event('pointerdown'));
    expect(controller.getLastUserInteractionTime()).toBe(400);

    domElement.dispatchEvent(new Event('wheel'));
    expect(controller.getLastUserInteractionTime()).toBe(500);

    domElement.dispatchEvent(new Event('touchstart'));
    expect(controller.getLastUserInteractionTime()).toBe(600);

    controller.dispose();
    const lastTimeBeforeAfterDisposeEvents = controller.getLastUserInteractionTime();
    controlsInstance.emit('start');
    domElement.dispatchEvent(new Event('pointerdown'));
    expect(controller.getIsUserOrbiting()).toBe(false);
    expect(controller.getLastUserInteractionTime()).toBe(lastTimeBeforeAfterDisposeEvents);
    expect(controlsInstance.dispose).toHaveBeenCalledTimes(1);
  });
});
