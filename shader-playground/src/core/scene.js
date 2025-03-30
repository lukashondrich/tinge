import * as THREE from 'three';
import { Optimizer } from '../utils/Optimizer.js';
import { ViscoElasticOptimizer } from '../utils/ViscoElasticOptimizer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const recentlyAdded = new Map();

export async function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000); // black would be? 0x000000
  scene.fog = new THREE.Fog(0x000000, 10, 50);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 20;

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
    viscosity: 0.2,
    springiness: 0.01,
    damping: 0.1,
    mass: 6.0,
    weights: {
      semanticAttraction: 1.9,
      repulsion: 0.6,
      boundary: 30000
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

  const instancedMesh = new THREE.InstancedMesh(geometry, material, numPoints + 100);
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
  instancedMesh.count = numPoints;
  scene.add(instancedMesh);

  // 🧫 Updated Gel
  const gelGeometry = new THREE.SphereGeometry(5, 64, 64);
  const gelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xfff1f1,
    transmission: 0.92,
    ior: 1.35,
    thickness: 4.0,
    attenuationColor: 0xffcccc,
    attenuationDistance: 0.8,
    roughness: 0.25,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    transparent: true,
    opacity: 1.0
  });
  gelMaterial.depthWrite = false;
  const gel = new THREE.Mesh(gelGeometry, gelMaterial);
  gel.position.set(0, 0, 0);
  gel.renderOrder = 1;

  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
  );
  scene.add(wire);

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

  // 🌅 Gradient Dome Backdrop
  const skyGeo = new THREE.SphereGeometry(500, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x000000) },
      bottomColor: { value: new THREE.Color(0x4b0082) }, // whats the color? -- purple: 0x4b0082
      offset: { value: 33 },
      exponent: { value: 0.6 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  scene.add(new THREE.AmbientLight(0xffffff, 0.03));
  const dirLight = new THREE.DirectionalLight(0xfff0e5, 0.25);
  dirLight.position.set(4, 2, 4);
  scene.add(dirLight);
  const pointLight = new THREE.PointLight(0xffeedd, 0.6, 15, 2);
  pointLight.position.set(-2, 2, 4);
  scene.add(pointLight);
  const backlight = new THREE.PointLight(0xffcccc, 0.3, 20);
  backlight.position.set(0, 0, -10);
  scene.add(backlight);

  // 🧱 Soft matte floor
  const floorGeo = new THREE.PlaneGeometry(200, 200);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0,
    roughness: 1.0,
    metalness: 0.0
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -10;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(lineSegments);
  scene.add(gel);

  const controls = new OrbitControls(camera, document.body);
  controls.target.set(0, 0, 0);
  controls.update();

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
