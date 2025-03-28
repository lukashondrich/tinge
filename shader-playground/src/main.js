import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { createRGBShiftPass } from './effects/rgbShiftPass.js';
import { createRenderer } from './core/renderer.js';
import { createScene } from './core/scene.js';
import { setupTouchRotation } from './utils/touchInput.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

if (window.__ANIMATING__) {
  console.warn('🔥 animate() already running — skipping');
  throw new Error('animate() already running');
}
window.__ANIMATING__ = true;

createScene().then(({ scene, camera, mesh, optimizer, dummy, numPoints, lineSegments }) => {
  const renderer = createRenderer();
  const getSpeed = setupTouchRotation(mesh);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.7, 0.5, 0.5
  );
  composer.addPass(bloomPass);

  const rgbShiftPass = createRGBShiftPass();
  composer.addPass(rgbShiftPass);
  rgbShiftPass.uniforms['amount'].value = 0.01; // Adjust the value as needed
  function animate(t) {
    //console.log('🌀 animate() running...');
    requestAnimationFrame(animate);
  
    // 👉 Update positions via gradient descent
    optimizer.step(); // perform 1 gradient descent step
    const updatedPositions = optimizer.getPositions();
  
    for (let i = 0; i < numPoints; i++) {
      dummy.position.copy(updatedPositions[i]).multiplyScalar(4); // ✅ scale for rendering
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    const maxDistSq = 0.25 * 0.25;

    const linePositions = [];

    for (let i = 0; i < numPoints; i++) {
      for (let j = i + 1; j < numPoints; j++) {
        const a = updatedPositions[i];
        const b = updatedPositions[j];
        const distSq = a.distanceToSquared(b);
        if (distSq < maxDistSq) {
          const pa = a.clone().multiplyScalar(4);
          const pb = b.clone().multiplyScalar(4);
          linePositions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        }
      }
    }

    // Update line geometry
    lineSegments.geometry.dispose();
    lineSegments.geometry = new THREE.BufferGeometry();
    lineSegments.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );
    

  
    // 👉 Touch interaction + camera control
    const { speed, offsetX, offsetY } = getSpeed();
    camera.position.x = offsetX * 2.5;
    camera.position.y = -offsetY * 1.5;
    camera.lookAt(0, 0, 0);
  
    // 👉 Update postprocessing
    rgbShiftPass.uniforms['amount'].value = speed * 0.001;

  
    // 👉 Render
    composer.render();
  }
  

  animate();
});


