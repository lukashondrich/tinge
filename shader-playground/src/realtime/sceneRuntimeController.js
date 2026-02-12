import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createRGBShiftPass } from '../effects/rgbShiftPass.js';
import { buildFilamentLinePositions, computeNextIdleRotateSpeed } from './sceneRuntimeMath.js';

export function computeRgbShiftAmount(speed, threshold = 0.1, multiplier = 0.002) {
  return speed > threshold ? speed * multiplier : 0.0;
}

export function computeLodPointScale(distToCam, nearLodDistance = 10) {
  let pointScale = 0.03 * (1 / (1 + distToCam * 0.3));
  if (distToCam > nearLodDistance) {
    pointScale *= 0.7;
  }
  return pointScale;
}

export function applyRecentGlowScale(pointScale, recentlyAdded, index, nowMs) {
  if (!recentlyAdded.has(index)) {
    return pointScale;
  }

  const age = (nowMs - recentlyAdded.get(index)) / 1000;
  if (age < 20) {
    const pulse = 1 + Math.sin(age * Math.PI) * 4;
    return pointScale * pulse;
  }
  recentlyAdded.delete(index);
  return pointScale;
}

export function createSceneRuntimeController({
  scene,
  camera,
  renderer,
  mesh,
  optimizer,
  dummy,
  lineSegments,
  recentlyAdded,
  orbitControls,
  getTouchSpeed,
  utteranceEventProcessor,
  getIsUserOrbiting,
  getLastUserInteractionTime,
  scale,
  idleConfig,
  warnTextLabelError = () => {},
  nowFn = () => performance.now(),
  requestAnimationFrameFn = (callback) => requestAnimationFrame(callback),
  windowRef = window,
  maxRenderDistance = 30
}) {
  const lodDistances = [10, 20, maxRenderDistance];
  let frameCount = 0;
  let lastFrameTimeMs = nowFn();
  let currentIdleRotateSpeed = 0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(windowRef.innerWidth, windowRef.innerHeight),
    0.9, 0.8, 0.2
  );
  composer.addPass(bloomPass);

  const rgbShiftPass = createRGBShiftPass();
  composer.addPass(rgbShiftPass);

  const renderFrame = (timestampMs) => {
    requestAnimationFrameFn(renderFrame);
    const t = Number.isFinite(timestampMs) ? timestampMs : nowFn();
    const deltaSeconds = Math.min(0.05, Math.max(0.0, (t - lastFrameTimeMs) / 1000));
    lastFrameTimeMs = t;

    optimizer.step();
    const updatedPositions = optimizer.getPositions();
    const nowMs = nowFn();
    frameCount++;
    const skipDistantUpdates = frameCount % 3 !== 0;

    for (let i = 0; i < updatedPositions.length; i++) {
      const pos = updatedPositions[i].clone().multiplyScalar(scale);
      dummy.position.copy(pos);
      const distToCam = camera.position.distanceTo(pos);

      if (distToCam > maxRenderDistance) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      if (skipDistantUpdates && distToCam > lodDistances[1]) {
        continue;
      }

      let pointScale = computeLodPointScale(distToCam, lodDistances[0]);
      pointScale = applyRecentGlowScale(pointScale, recentlyAdded, i, nowMs);

      dummy.scale.setScalar(pointScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = updatedPositions.length;

    const linePositions = buildFilamentLinePositions(updatedPositions, scale, {
      maxDistSq: 0.45 * 0.45,
      maxConnections: 10
    });

    lineSegments.geometry.dispose();
    lineSegments.geometry = new THREE.BufferGeometry();
    lineSegments.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );

    const idleElapsed = nowFn() - getLastUserInteractionTime();
    const shouldIdleRotate = !getIsUserOrbiting() && idleElapsed > idleConfig.resumeDelayMs;
    currentIdleRotateSpeed = computeNextIdleRotateSpeed({
      currentSpeed: currentIdleRotateSpeed,
      deltaSeconds,
      shouldIdleRotate,
      targetSpeed: idleConfig.targetSpeed,
      accelPerSec: idleConfig.accelPerSec,
      decelPerSec: idleConfig.decelPerSec
    });
    orbitControls.autoRotate = currentIdleRotateSpeed > 0;
    orbitControls.autoRotateSpeed = currentIdleRotateSpeed;
    orbitControls.update(deltaSeconds);

    const { speed } = getTouchSpeed();
    rgbShiftPass.uniforms.amount.value = computeRgbShiftAmount(speed);

    try {
      utteranceEventProcessor.updateActiveTextLabels(camera);
    } catch (error) {
      warnTextLabelError(error);
    }

    composer.render();
  };

  return {
    start() {
      requestAnimationFrameFn(renderFrame);
    }
  };
}
