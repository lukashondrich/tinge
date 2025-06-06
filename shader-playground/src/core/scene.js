import * as THREE from 'three';
import { ViscoElasticOptimizer } from '../utils/ViscoElasticOptimizer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export const SCALE = 4; // 🔁 central scale value
const recentlyAdded = new Map();

export async function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x112233); 
  scene.fog = new THREE.Fog(0x223344, 10, 50);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 15;

  // ✅ Load, scale, and center embedding data
  const raw = await fetch('/embedding.json').then(r => r.json());
  const scale = SCALE;


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
    learningRate: 0.002,
    viscosity: 0.1,
    springiness: 0.01,
    damping: 0.1,
    mass: 5.0,
    weights: {
      semanticAttraction: 15.9,
      repulsion: 5.9,
      boundary: 30000
    }
  });

  const numPoints = raw.length;
  const geometry = new THREE.SphereGeometry(1, 12, 12);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x223344,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    metalness: 0.1,
    transparent: false,
    opacity: 1.0,
    fog: true,
    vertexColors: true // allow per-instance colors
  });

  const instancedMesh = new THREE.InstancedMesh(geometry, material, numPoints + 100); // reserve extra space
  const dummy = new THREE.Object3D();
  const positions = optimizer.getPositions().map(p => p.clone().multiplyScalar(scale));
  for (let i = 0; i < numPoints; i++) {
    dummy.position.copy(positions[i]);
    const distToCam = camera.position.distanceTo(positions[i]);
    const scaleFactor = 0.03 * (1 / (1 + distToCam * 0.3));
    dummy.scale.setScalar(scaleFactor);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
    // initialize colors for existing points
    instancedMesh.setColorAt(i, new THREE.Color(0xffffff));
  }
  instancedMesh.instanceColor.needsUpdate = true;
  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.count = numPoints; // ✅ hides unused instances
  scene.add(instancedMesh);

  // 🧫 Add gel shell around the point cloud
  const gelGeometry = new THREE.SphereGeometry(4.3, 64, 64);
  const gelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff6677,
    transmission: 0.25,
    opacity: 0.45,
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
  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
  );
  scene.add(wire);

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
  const pointLight = new THREE.PointLight(0xffffff, 1.2, 15, 2);
  pointLight.position.set(0, 0, 5);
  scene.add(pointLight);

  // Add to scene
  scene.add(lineSegments);
  scene.add(gel);

  // Controls
  const controls = new OrbitControls(camera, document.body);
  controls.target.set(0, 0, 0);
  controls.update();

  // 🌟 Add test button for new word
  const button = document.createElement('button');
  button.innerText = 'Add “banana”';
  button.style.position = 'absolute';
  button.style.top = '10px';
  button.style.left = '10px';
  document.body.appendChild(button);

  button.onclick = () => {
    const newWord = {
      x: (Math.random() * 2 - 1) * scale,
      y: (Math.random() * 2 - 1) * scale,
      z: (Math.random() * 2 - 1) * scale
    };
    optimizer.addPoint(newWord); 
    const id = optimizer.getPositions().length - 1;
    recentlyAdded.set(id, performance.now());
    console.log('✨ Added new point:', newWord);
  };

  return {
    scene,
    camera,
    controls,
    mesh: instancedMesh,
    optimizer,
    dummy,
    numPoints,
    lineSegments,
    recentlyAdded
  };
}
