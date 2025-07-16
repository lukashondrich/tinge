import * as THREE from 'three';
import { ViscoElasticOptimizer } from '../utils/ViscoElasticOptimizer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Text } from 'troika-three-text';
export const SCALE = 4; // 🔁 central scale value
const recentlyAdded = new Map();

// 3D Text Manager for last utterance labels
// This system displays 3D text labels for words from the most recent utterance
// (spoken by either user or AI) to make the connection between spoken language
// and the 3D vocabulary visualization clear.
class TextManager {
  constructor(scene) {
    this.scene = scene;
    this.activeLabels = new Map(); // word -> text mesh
    this.lastUtteranceWords = new Set(); // track current utterance words
    this.fadeAnimations = new Map(); // track fade animations
  }

  // Show 3D text labels for words from the last utterance
  showLabelsForUtterance(words, speaker, wordPositions) {
    // Clear previous utterance labels
    this.clearLabels();
    
    // Add new labels for current utterance
    words.forEach(word => {
      const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
      if (cleanWord && wordPositions.has(cleanWord)) {
        const position = wordPositions.get(cleanWord);
        this.createLabel(cleanWord, position, speaker);
        this.lastUtteranceWords.add(cleanWord);
      }
    });
  }

  // Create a 3D text label at the given position
  createLabel(word, position, speaker) {
    const textMesh = new Text();
    textMesh.text = word;
    textMesh.fontSize = 0.12;
    textMesh.font = 'monospace'; // Use system monospace font
    textMesh.color = speaker === 'user' ? 0x69ea4f : 0x8844ff; // Match point colors: green for user, purple for AI
    textMesh.anchorX = 'center';
    textMesh.anchorY = 'middle';
    textMesh.position.copy(position);
    textMesh.position.y += 0.25; // Offset above the word point
    
    // Billboard behavior - always face camera
    textMesh.lookAt = null; // Will be set in update loop
    
    // Add retro glow effect
    textMesh.outlineWidth = 0.015;
    textMesh.outlineColor = speaker === 'user' ? 0x2a5a1f : 0x44226f;
    
    // VHS-style text effects
    textMesh.strokeColor = speaker === 'user' ? 0x1a4a0f : 0x22115f;
    textMesh.strokeWidth = 0.01;
    
    // Start with fade-in animation
    textMesh.material.transparent = true;
    textMesh.material.opacity = 0;
    
    this.scene.add(textMesh);
    this.activeLabels.set(word, textMesh);
    
    // Fade in animation
    this.fadeIn(textMesh);
  }

  // Clear all active labels
  clearLabels() {
    this.activeLabels.forEach((textMesh, word) => {
      this.fadeOut(textMesh, () => {
        this.scene.remove(textMesh);
        textMesh.dispose();
      });
    });
    this.activeLabels.clear();
    this.lastUtteranceWords.clear();
  }

  // Update labels to face camera with distance-based optimization
  updateLabels(camera) {
    this.activeLabels.forEach(textMesh => {
      // Distance-based culling for performance
      const distance = camera.position.distanceTo(textMesh.position);
      const maxDistance = 20; // Hide labels beyond this distance
      
      if (distance > maxDistance) {
        textMesh.visible = false;
        return;
      }
      
      textMesh.visible = true;
      textMesh.lookAt(camera.position);
      
      // Distance-based scaling for better readability
      const scale = Math.max(0.8, Math.min(1.2, 1.0 + (distance - 10) * 0.02));
      textMesh.scale.setScalar(scale);
    });
  }

  // Fade in animation
  fadeIn(textMesh) {
    const startTime = Date.now();
    const duration = 500; // 500ms fade in
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      textMesh.material.opacity = progress;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  // Fade out animation
  fadeOut(textMesh, callback) {
    const startTime = Date.now();
    const duration = 300; // 300ms fade out
    const startOpacity = textMesh.material.opacity;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      textMesh.material.opacity = startOpacity * (1 - progress);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (callback) callback();
      }
    };
    
    animate();
  }

  // Clean up
  dispose() {
    this.clearLabels();
  }
}

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

  // ✅ Start with empty scene - no pre-loaded words for clean start
  const raw = []; // Empty array - words will be added only when spoken
  
  // Keep labels for hit‑testing - starts empty, will be populated as words are spoken
  const labels = [];
  const scale = SCALE;


  // No initial data to process - raw array is empty

  const optimizer = new ViscoElasticOptimizer(raw, {
    learningRate: 0.002,
    viscosity: 0.1,
    springiness: 0.01,
    damping: 0.1,
    mass: 5.0,
    weights: {
      semanticAttraction: 15.9,
      repulsion: 5.9,
      boundary: 3000
    }
  });

  const numPoints = raw.length;
  let geometry;
  try {
    geometry = new THREE.SphereGeometry(1, 12, 12);
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius *= 1.5; // further enlarge raycast hit area
  // --- NEW: give every vertex a white colour so the shader’s vertexColor
  // component is (1,1,1) instead of the default (0,0,0) ---
  const nVerts = geometry.attributes.position.count;   // # of vertices
  const white   = new Float32Array(nVerts * 3).fill(1); // 1,1,1 for each
  geometry.setAttribute('color', new THREE.BufferAttribute(white, 3));
  } catch (error) {
    console.error('❌ Geometry creation error:', error);
    throw error;
  }

  // Use an unlit material so per-instance vertex colors display correctly
  let material;
  try {
    material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      fog:   true,
      vertexColors: true          // keep this boolean flag for r174
    });
  } catch (error) {
    console.error('❌ Material creation error:', error);
    throw error;
  }

  const instancedMesh = new THREE.InstancedMesh(geometry, material, 5500); // reserve space for 5000+ words
  const dummy = new THREE.Object3D();
  
  // ✅ No initial points to set up - mesh starts completely empty
  // Start with empty visualization - points appear only when spoken
  instancedMesh.count = 0; // ✅ Hide all points initially
  
  // Only update color/matrix flags if the attributes exist
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.needsUpdate = true;
  } else {
    console.log('⚠️ InstancedMesh instanceColor not available yet');
  }

  if (instancedMesh.instanceMatrix) {
    instancedMesh.instanceMatrix.needsUpdate = true;
  } else {
    console.log('⚠️ InstancedMesh instanceMatrix not available yet');
  }
  
  scene.add(instancedMesh);
  console.log('🎭 Adding scene elements...');

  // 🧫 Add gel shell around the point cloud
  const gelGeometry = new THREE.SphereGeometry(4.3, 64, 64);
  const gelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff6677,
    transmission: 0.25,
    opacity: 0.15,
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
  gel.visible = false; // ✅ Start hidden - appears when first words are spoken

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
    opacity: 0.32,
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

  // Initialize 3D text manager
  const textManager = new TextManager(scene);

  return {
    scene,
    camera,
    controls,
    mesh: instancedMesh,
    optimizer,
    dummy,
    numPoints,
    lineSegments,
    gel, // ✅ Return gel object for showing/hiding
    recentlyAdded,
    labels,
    textManager // ✅ Return text manager for 3D utterance labels
  };
}
