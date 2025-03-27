import * as THREE from 'three';
import { Optimizer } from '../utils/Optimizer.js';

export async function createScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;
  camera.lookAt(0, 0, 0);

  // ✅ Load embedding data once
  const raw = await fetch('/embedding.json').then(r => r.json());

  // ✅ Create the optimizer instance inside createScene
  const optimizer = new Optimizer(raw, { 
    learningRate: 0.05,
    weights: {
      semanticAttraction: 1.0,
      repulsion: 1,
      boundary: 50.0
    }
  });

  const numPoints = raw.length;
  const geometry = new THREE.SphereGeometry(0.03, 12, 12);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffccdd,
    roughness: 0.4,
    metalness: 0.1
  });

  const instancedMesh = new THREE.InstancedMesh(geometry, material, numPoints);
  const dummy = new THREE.Object3D();

  // ⬇️ Initial positions
  const positions = optimizer.getPositions().map(v => v.clone().multiplyScalar(4));
  for (let i = 0; i < numPoints; i++) {
    dummy.position.copy(positions[i]);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }

  scene.add(instancedMesh);
  // Empty line geometry (will be filled dynamically)
  const lineGeometry = new THREE.BufferGeometry();
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffcccc,
    transparent: true,
    opacity: 0.2
  });
  const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(lineSegments);
  // 🧠 Optional: skip filaments for now or recalculate them inside animate loop later
  // ... (filament code can be added later based on updated positions)

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(2, 2, 5);
  scene.add(dirLight);

  return {
    scene,
    camera,
    mesh: instancedMesh,
    optimizer,         // ✅ Expose this for animation step
    dummy,
    numPoints,
    lineSegments // ✅
  };
}
