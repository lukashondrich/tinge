export async function createSceneOrbitInteractionController({
  camera,
  domElement,
  importOrbitControls = () => import('three/examples/jsm/controls/OrbitControls.js'),
  nowFn = () => performance.now()
}) {
  const { OrbitControls } = await importOrbitControls();
  const orbitControls = new OrbitControls(camera, domElement);
  orbitControls.target.set(0, 0, 0);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.06;
  orbitControls.autoRotate = false;
  orbitControls.autoRotateSpeed = 0;
  orbitControls.update();

  let isUserOrbiting = false;
  let lastUserInteractionTime = nowFn();

  const markUserInteraction = () => {
    lastUserInteractionTime = nowFn();
  };

  const onOrbitStart = () => {
    isUserOrbiting = true;
    markUserInteraction();
  };
  const onOrbitEnd = () => {
    isUserOrbiting = false;
    markUserInteraction();
  };
  const onWheel = () => markUserInteraction();
  const onPointerDown = () => markUserInteraction();
  const onTouchStart = () => markUserInteraction();

  orbitControls.addEventListener('start', onOrbitStart);
  orbitControls.addEventListener('end', onOrbitEnd);

  domElement.addEventListener('wheel', onWheel, { passive: true });
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('touchstart', onTouchStart, { passive: true });

  return {
    orbitControls,
    getIsUserOrbiting: () => isUserOrbiting,
    getLastUserInteractionTime: () => lastUserInteractionTime,
    dispose() {
      orbitControls.removeEventListener('start', onOrbitStart);
      orbitControls.removeEventListener('end', onOrbitEnd);
      domElement.removeEventListener('wheel', onWheel);
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('touchstart', onTouchStart);
      if (typeof orbitControls.dispose === 'function') {
        orbitControls.dispose();
      }
    }
  };
}
