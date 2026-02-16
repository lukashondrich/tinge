import { createRenderer } from '../core/renderer.js';
import { setupTouchRotation } from '../utils/touchInput.js';
import { createSceneInteractionController } from './sceneInteractionController.js';
import { createRemoteAudioController } from './remoteAudioController.js';
import { createSceneOrbitInteractionController } from './sceneOrbitInteractionController.js';

export async function createSceneBootstrapController({
  camera,
  mesh,
  labels,
  logger,
  createRendererFn = createRenderer,
  createOrbitInteractionControllerFn = createSceneOrbitInteractionController,
  createSceneInteractionControllerFn = createSceneInteractionController,
  createRemoteAudioControllerFn = createRemoteAudioController,
  setupTouchRotationFn = setupTouchRotation
}) {
  const renderer = createRendererFn();
  const orbitInteractionController = await createOrbitInteractionControllerFn({
    camera,
    domElement: renderer.domElement
  });
  const sceneInteractionController = createSceneInteractionControllerFn({
    domElement: renderer.domElement,
    camera,
    mesh,
    labels
  });
  const remoteAudioController = createRemoteAudioControllerFn({
    error: (...args) => logger?.error?.(...args)
  });
  remoteAudioController.ensureElement();

  const { getSpeed, dispose: disposeTouch } = setupTouchRotationFn(mesh);

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (typeof disposeTouch === 'function') {
      disposeTouch();
    }
    orbitInteractionController?.dispose?.();
    sceneInteractionController?.dispose?.();
    remoteAudioController?.dispose?.();
  };

  const attachBeforeUnloadCleanup = ({
    windowRef = window,
    getWindowCleanup = () => windowRef.cleanup
  } = {}) => {
    const onBeforeUnload = () => {
      const globalCleanup = getWindowCleanup();
      if (typeof globalCleanup === 'function') {
        globalCleanup();
      }
      dispose();
    };
    windowRef.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      windowRef.removeEventListener('beforeunload', onBeforeUnload);
    };
  };

  return {
    renderer,
    orbitControls: orbitInteractionController.orbitControls,
    getTouchSpeed: getSpeed,
    getIsUserOrbiting: orbitInteractionController.getIsUserOrbiting,
    getLastUserInteractionTime: orbitInteractionController.getLastUserInteractionTime,
    remoteAudioController,
    attachBeforeUnloadCleanup,
    dispose
  };
}
