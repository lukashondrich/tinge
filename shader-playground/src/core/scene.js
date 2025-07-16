import * as THREE from 'three';
import { ViscoElasticOptimizer } from '../utils/ViscoElasticOptimizer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Text } from 'troika-three-text';
export const SCALE = 4; // 🔁 central scale value
const recentlyAdded = new Map();

// 3D Text Manager for last utterance labels
// This system displays 3D text labels for words from the last utterances
// (both AI and user) to make the connection between spoken language
// and the 3D vocabulary visualization clear.
class TextManager {
  constructor(scene) {
    this.scene = scene;
    this.activeLabels = new Map(); // word -> text mesh
    this.lastUserWords = new Set(); // track current user utterance words
    this.lastAIWords = new Set(); // track current AI utterance words
    this.fadeAnimations = new Map(); // track fade animations
  }

  // Show 3D text labels for words from the last utterance
  showLabelsForUtterance(words, speaker, wordPositions) {
    console.log('🏷️ TextManager.showLabelsForUtterance called:', { words, speaker, wordPositionsSize: wordPositions.size });
    
    // Clear only the labels for this speaker
    this.clearLabelsForSpeaker(speaker);
    
    let labelsCreated = 0;
    
    // Add new labels for current utterance
    words.forEach(word => {
      const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
      console.log('🏷️ Processing word:', { word, cleanWord, hasPosition: wordPositions.has(cleanWord) });
      
      if (cleanWord && wordPositions.has(cleanWord)) {
        const position = wordPositions.get(cleanWord);
        console.log('🏷️ Creating label for:', cleanWord, 'at position:', position);
        
        // Use speaker-specific key to allow same word for both speakers
        const labelKey = `${speaker}-${cleanWord}`;
        this.createLabel(labelKey, cleanWord, position, speaker);
        
        // Track words by speaker
        if (speaker === 'user') {
          this.lastUserWords.add(cleanWord);
        } else {
          this.lastAIWords.add(cleanWord);
        }
        labelsCreated++;
      }
    });
    
    console.log('🏷️ Total labels created:', labelsCreated);
  }

  // Create a 3D text label at the given position
  createLabel(labelKey, word, position, speaker) {
    console.log('🏷️ createLabel called for:', word, 'at position:', position, 'key:', labelKey);
    try {
      // Create a group to hold the text
      const textGroup = new THREE.Group();
      textGroup.position.copy(position);
      textGroup.position.y += 0.05; // Much closer to the word point
      
      // Create canvas-based 3D text
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = speaker === 'user' ? '#69ea4f' : '#8844ff'; // Green for user, purple for AI
      ctx.font = '64px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(word, 256, 80);
      
      const texture = new THREE.CanvasTexture(canvas);
      const planeMaterial = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false,
        side: THREE.DoubleSide
      });
      const planeGeometry = new THREE.PlaneGeometry(1.5, 0.375);
      const textPlane = new THREE.Mesh(planeGeometry, planeMaterial);
      textPlane.position.set(0, 0.1, 0);
      
      console.log('🏷️ Text plane created for:', word);
      
      // Add only the text plane to group
      textGroup.add(textPlane);
      
      // Add group to scene
      this.scene.add(textGroup);
      this.activeLabels.set(labelKey, textGroup);
      
      console.log('🏷️ Text group added to scene. Scene children count:', this.scene.children.length);
      console.log('🏷️ Text setup complete. Visible:', textGroup.visible);
    } catch (error) {
      console.error('❌ Error creating 3D text label for word:', word, error);
      // Continue without breaking
    }
  }

  // Clear labels for a specific speaker
  clearLabelsForSpeaker(speaker) {
    const labelsToRemove = [];
    
    this.activeLabels.forEach((textGroup, labelKey) => {
      // Check if this label belongs to the speaker by checking the key prefix
      if (labelKey.startsWith(`${speaker}-`)) {
        this.scene.remove(textGroup);
        // Dispose of the text mesh inside the group
        textGroup.children.forEach(child => {
          if (child.dispose) {
            child.dispose();
          }
        });
        labelsToRemove.push(labelKey);
      }
    });
    
    // Remove from active labels
    labelsToRemove.forEach(labelKey => {
      this.activeLabels.delete(labelKey);
    });
    
    // Clear speaker-specific word sets
    if (speaker === 'user') {
      this.lastUserWords.clear();
    } else {
      this.lastAIWords.clear();
    }
  }

  // Clear all active labels
  clearLabels() {
    this.activeLabels.forEach((textGroup, word) => {
      this.scene.remove(textGroup);
      // Dispose of the text mesh inside the group
      textGroup.children.forEach(child => {
        if (child.dispose) {
          child.dispose();
        }
      });
    });
    this.activeLabels.clear();
    this.lastUserWords.clear();
    this.lastAIWords.clear();
  }

  // Update positions of text labels to follow moving points
  updatePositions(currentPositions) {
    this.activeLabels.forEach((textGroup, labelKey) => {
      // Extract the word from the speaker-word key format
      const word = labelKey.split('-').slice(1).join('-'); // Handle words with hyphens
      if (currentPositions.has(word)) {
        const newPosition = currentPositions.get(word);
        textGroup.position.copy(newPosition);
        textGroup.position.y += 0.05; // Much closer to the word point
      }
    });
  }

  // Update labels to face camera with distance-based optimization
  updateLabels(camera) {
    if (this.activeLabels.size > 0) {
      console.log('🏷️ Updating', this.activeLabels.size, 'text labels');
    }
    
    this.activeLabels.forEach((textGroup, labelKey) => {
      // Distance-based culling for performance
      const distance = camera.position.distanceTo(textGroup.position);
      const maxDistance = 20; // Hide labels beyond this distance
      
      if (distance > maxDistance) {
        textGroup.visible = false;
        return;
      }
      
      textGroup.visible = true;
      
      // Billboard behavior - make text plane face camera
      textGroup.children.forEach(child => {
        if (child.material?.map) { // canvas plane
          child.lookAt(camera.position);
        }
      });
      
      // Distance-based scaling for better readability
      const scale = Math.max(0.8, Math.min(1.2, 1.0 + (distance - 10) * 0.02));
      textGroup.scale.setScalar(scale);
      
      if (this.activeLabels.size <= 3) { // Only log first few to avoid spam
        console.log('🏷️ Updated label:', labelKey, 'distance:', distance.toFixed(2), 'visible:', textGroup.visible);
      }
    });
  }

  // Fade in animation
  fadeIn(textMesh) {
    console.log('🏷️ Starting fade-in animation for text mesh');
    const startTime = Date.now();
    const duration = 500; // 500ms fade in
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      textMesh.material.opacity = progress;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log('🏷️ Fade-in animation complete. Final opacity:', textMesh.material.opacity);
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

  // Controls will be initialized later in main.js with the renderer
  let controls = null;

  // Initialize 3D text manager
  let textManager;
  try {
    textManager = new TextManager(scene);
    console.log('✅ TextManager initialized successfully');
  } catch (error) {
    console.error('❌ TextManager initialization failed:', error);
    // Create a fallback textManager with no-op methods
    textManager = {
      showLabelsForUtterance: () => {},
      updateLabels: () => {},
      clearLabels: () => {},
      dispose: () => {}
    };
  }

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
