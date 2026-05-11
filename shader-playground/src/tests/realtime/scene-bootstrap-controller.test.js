import { describe, it, expect, vi } from 'vitest';
import { createSceneBootstrapController } from '../../realtime/sceneBootstrapController.js';

describe('createSceneBootstrapController', () => {
  function createDeps() {
    const renderer = { domElement: { id: 'canvas-1' } };
    const orbitDispose = vi.fn();
    const orbitControls = { id: 'orbit-controls' };
    const orbitInteractionController = {
      orbitControls,
      getIsUserOrbiting: vi.fn(() => false),
      getLastUserInteractionTime: vi.fn(() => 123),
      dispose: orbitDispose
    };
    const sceneInteractionDispose = vi.fn();
    const sceneInteractionController = {
      dispose: sceneInteractionDispose
    };
    const remoteEnsureElement = vi.fn();
    const remoteDispose = vi.fn();
    const remoteAudioController = {
      ensureElement: remoteEnsureElement,
      dispose: remoteDispose,
      attachRemoteStream: vi.fn()
    };
    const touchDispose = vi.fn();
    const getSpeed = vi.fn(() => ({ speed: 0 }));

    const createRendererFn = vi.fn(() => renderer);
    const createOrbitInteractionControllerFn = vi.fn(async () => orbitInteractionController);
    const createSceneInteractionControllerFn = vi.fn(() => sceneInteractionController);
    const createRemoteAudioControllerFn = vi.fn(() => remoteAudioController);
    const setupTouchRotationFn = vi.fn(() => ({ getSpeed, dispose: touchDispose }));
    const logger = { error: vi.fn() };

    return {
      renderer,
      orbitControls,
      orbitInteractionController,
      sceneInteractionController,
      remoteAudioController,
      getSpeed,
      createRendererFn,
      createOrbitInteractionControllerFn,
      createSceneInteractionControllerFn,
      createRemoteAudioControllerFn,
      setupTouchRotationFn,
      orbitDispose,
      sceneInteractionDispose,
      remoteEnsureElement,
      remoteDispose,
      touchDispose,
      logger
    };
  }

  it('builds scene controllers and exposes runtime dependencies', async () => {
    const deps = createDeps();
    const camera = { id: 'camera-1' };
    const mesh = { id: 'mesh-1' };
    const labels = ['a', 'b'];

    const controller = await createSceneBootstrapController({
      camera,
      mesh,
      labels,
      logger: deps.logger,
      createRendererFn: deps.createRendererFn,
      createOrbitInteractionControllerFn: deps.createOrbitInteractionControllerFn,
      createSceneInteractionControllerFn: deps.createSceneInteractionControllerFn,
      createRemoteAudioControllerFn: deps.createRemoteAudioControllerFn,
      setupTouchRotationFn: deps.setupTouchRotationFn
    });

    expect(deps.createRendererFn).toHaveBeenCalledTimes(1);
    expect(deps.createOrbitInteractionControllerFn).toHaveBeenCalledWith({
      camera,
      domElement: deps.renderer.domElement
    });
    expect(deps.createSceneInteractionControllerFn).toHaveBeenCalledWith({
      domElement: deps.renderer.domElement,
      camera,
      mesh,
      labels
    });
    expect(deps.createRemoteAudioControllerFn).toHaveBeenCalledWith({
      error: expect.any(Function)
    });
    expect(deps.remoteEnsureElement).toHaveBeenCalledTimes(1);
    expect(deps.setupTouchRotationFn).toHaveBeenCalledWith(mesh);
    expect(controller.renderer).toBe(deps.renderer);
    expect(controller.orbitControls).toBe(deps.orbitControls);
    expect(controller.getTouchSpeed).toBe(deps.getSpeed);
    expect(controller.getIsUserOrbiting).toBe(deps.orbitInteractionController.getIsUserOrbiting);
    expect(controller.getLastUserInteractionTime).toBe(deps.orbitInteractionController.getLastUserInteractionTime);
    expect(controller.remoteAudioController).toBe(deps.remoteAudioController);
  });

  it('dispose is idempotent and tears down all child controllers', async () => {
    const deps = createDeps();
    const controller = await createSceneBootstrapController({
      camera: {},
      mesh: {},
      labels: [],
      logger: deps.logger,
      createRendererFn: deps.createRendererFn,
      createOrbitInteractionControllerFn: deps.createOrbitInteractionControllerFn,
      createSceneInteractionControllerFn: deps.createSceneInteractionControllerFn,
      createRemoteAudioControllerFn: deps.createRemoteAudioControllerFn,
      setupTouchRotationFn: deps.setupTouchRotationFn
    });

    controller.dispose();
    controller.dispose();

    expect(deps.touchDispose).toHaveBeenCalledTimes(1);
    expect(deps.orbitDispose).toHaveBeenCalledTimes(1);
    expect(deps.sceneInteractionDispose).toHaveBeenCalledTimes(1);
    expect(deps.remoteDispose).toHaveBeenCalledTimes(1);
  });

  it('attaches beforeunload cleanup and supports listener removal', async () => {
    const deps = createDeps();
    const controller = await createSceneBootstrapController({
      camera: {},
      mesh: {},
      labels: [],
      logger: deps.logger,
      createRendererFn: deps.createRendererFn,
      createOrbitInteractionControllerFn: deps.createOrbitInteractionControllerFn,
      createSceneInteractionControllerFn: deps.createSceneInteractionControllerFn,
      createRemoteAudioControllerFn: deps.createRemoteAudioControllerFn,
      setupTouchRotationFn: deps.setupTouchRotationFn
    });

    const listeners = {};
    const windowRef = {
      addEventListener: vi.fn((type, handler) => {
        listeners[type] = handler;
      }),
      removeEventListener: vi.fn((type, handler) => {
        if (listeners[type] === handler) {
          delete listeners[type];
        }
      })
    };
    const globalCleanup = vi.fn();

    const detach = controller.attachBeforeUnloadCleanup({
      windowRef,
      getWindowCleanup: () => globalCleanup
    });

    expect(windowRef.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    listeners.beforeunload();

    expect(globalCleanup).toHaveBeenCalledTimes(1);
    expect(deps.touchDispose).toHaveBeenCalledTimes(1);
    expect(deps.orbitDispose).toHaveBeenCalledTimes(1);
    expect(deps.sceneInteractionDispose).toHaveBeenCalledTimes(1);
    expect(deps.remoteDispose).toHaveBeenCalledTimes(1);

    const addedHandler = windowRef.addEventListener.mock.calls[0]?.[1];
    detach();
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('beforeunload', addedHandler);
  });
});
