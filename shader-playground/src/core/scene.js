import * as THREE from 'three';
import { Optimizer } from '../utils/Optimizer.js';
import { ViscoElasticOptimizer } from '../utils/ViscoElasticOptimizer.js';

export async function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x223344); //wahats white -- 
  scene.fog = new THREE.Fog(0xffffff, 2, 25);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 13;

  // ✅ Load, scale, and center embedding data
  const raw = await fetch('/embedding.json').then(r => r.json());
  const scale = 4;
  raw.forEach(p => {
    p.x *= scale;
    p.y *= scale;
    p.z *= scale;
  });
  const center = new THREE.Vector3();
  raw.forEach(p => center.add(new THREE.Vector3(p.x, p.y, p.z)));
  center.divideScalar(raw.length);
  raw.forEach(p => {
    p.x -= center.x;
    p.y -= center.y;
    p.z -= center.z;
  });

  const optimizer = new ViscoElasticOptimizer(raw, {
    learningRate: 0.001,
    viscosity: 0.9,
    springiness: 0.1,
    damping: 0.2,
    mass: 10.0,
    weights: {
      semanticAttraction: 2.9,
      repulsion: 2,
      boundary: 3
    }
  });

  const numPoints = raw.length;
  const geometry = new THREE.SphereGeometry(0.05, 12, 12);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x223344,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    metalness: 0.1,
    transparent: false,
    opacity: 1.0,
    fog: true
  });

  const instancedMesh = new THREE.InstancedMesh(geometry, material, numPoints);
  const dummy = new THREE.Object3D();
  const positions = optimizer.getPositions().map(p => p.clone().multiplyScalar(scale));
  for (let i = 0; i < numPoints; i++) {
    dummy.position.copy(positions[i]);
    const distToCam = camera.position.distanceTo(positions[i]);
    const scaleFactor = 0.03 * (1 / (1 + distToCam * 0.3));
    dummy.scale.setScalar(scaleFactor);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
  scene.add(instancedMesh);

  // 🧫 Add gel shell around the point cloud
  const gelGeometry = new THREE.SphereGeometry(4.5, 64, 64);
  const gelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff6677,
    transmission: 0.25,
    opacity: 0.25,
    transparent: true,
    roughness: 0.4,
    metalness: 0.05,
    thickness: 5.0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    sheen: 1.0,
    sheenColor: new THREE.Color(0xffcccc)
  });
  gelMaterial.depthWrite = false;
  const gel = new THREE.Mesh(gelGeometry, gelMaterial);
  gel.position.set(0, 0, 0);
  gel.renderOrder = 1;

  // Debug origin marker
  //const wire = new THREE.Mesh(
  //  new THREE.SphereGeometry(0.1, 12, 12),
  //  new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
  //);
  //scene.add(wire);

  // Filaments
  const lineGeometry = new THREE.BufferGeometry();
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x88bbff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    fog: true
  });
  const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
  lineSegments.renderOrder = 0;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(2, 2, 5);
  scene.add(dirLight);
  const pointLight = new THREE.PointLight(0xffffff, 4.2, 15, 2);
  pointLight.position.set(0, 0, 1);
  scene.add(pointLight);

  scene.add(lineSegments);
  scene.add(gel);

  return {
    scene,
    camera,
    mesh: instancedMesh,
    optimizer,
    dummy,
    numPoints,
    lineSegments
  };
}
