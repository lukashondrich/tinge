// main.js
import { initOpenAIRealtime } from "./openaiRealtime";

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { createRGBShiftPass } from './effects/rgbShiftPass.js';
import { createRenderer } from './core/renderer.js';
import { createScene } from './core/scene.js';
import { setupTouchRotation } from './utils/touchInput.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SCALE } from './core/scene.js';
import { DialoguePanel } from './ui/dialoguePanel.js';


console.log('🚀 main.js loaded');

// Check if animation is already running
if (window.__ANIMATING__) {
  console.warn('🔥 animate() already running — skipping');
  throw new Error('animate() already running');
}
window.__ANIMATING__ = true;

//DialoguePanel.init();
const panel = new DialoguePanel('#transcriptContainer');

// Initialize scene and OpenAI Realtime
createScene().then(({ scene, camera, mesh, optimizer, dummy, numPoints, lineSegments, controls, recentlyAdded }) => {
  console.log('📊 Scene created');
  const renderer = createRenderer();

  // Initialize OpenAI Realtime with a callback to handle the remote audio stream
  console.log('🔄 Initializing OpenAI Realtime...');
  
  initOpenAIRealtime(
    (remoteStream) => {
      console.log("🔊 Received remote audio stream");
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.play().catch(err => console.error("Audio play error:", err));
    },
    (event) => {
      console.log("💬 eventCallback got event:", event.type, event);
      
      // ① our per-word transcript hook
      if (event.type === 'transcript.word' && typeof event.word === 'string') {
        console.log('🗣️ user spoke word:', event.word);
        addWord(event.word, 'user');
        //return;  // don’t fall through
      }
      
      // ② (optional) keep your old delta transcript support
      if (event.type === "response.audio_transcript.delta" && typeof event.delta === "string") {
        console.log("👉 transcript delta:", event.delta);
        addWord(event.delta, 'ai');
      }
      
      // ③ (optional) final phrase
      if (event.type === "response.audio_transcript.done" && typeof event.transcript === "string") {
        console.log("✅ final transcript:", event.transcript);
      }
      if (event.type === 'utterance.added' && event.record) {
        panel.add(event.record);
      }
    }
  )
  .catch(err => console.error("⚠️ Realtime init error:", err));
  const getSpeed = setupTouchRotation(mesh);

  // Set up post-processing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9, 0.9, 0.1
  );
  composer.addPass(bloomPass);

  const rgbShiftPass = createRGBShiftPass();
  composer.addPass(rgbShiftPass);
  
  // 🧪 Fake "speech" stream for testing
  const mockWords = ["banana", "is", "a", "fruit", "that", "grows", "in", "clusters"];
  let mockIndex = 0;

  setInterval(() => {
    if (mockIndex < mockWords.length) {
      const word = mockWords[mockIndex++];
      addWord(word);
    }
  }, 800);

  function addWord(word, speaker = "ai") {
    const newPoint = { x: 0, y: 0, z: 0 }; // 🔥 Always center


    optimizer.addPoint(newPoint);
  
    const id = optimizer.getPositions().length - 1;
    recentlyAdded.set(id, performance.now());
    showWordLabel(word);
    console.log('🆕 word added:', word);
  }

  function showWordLabel(word) {
    const label = document.createElement('div');
    label.innerText = word;
    label.style.position = 'absolute';
    label.style.left = '50px';
    label.style.top = '100px';
    label.style.color = '#222';
    label.style.fontSize = '34px';
    label.style.fontFamily = 'monospace';
    label.style.opacity = '1';
    label.style.transition = 'opacity 2s ease-out';
    label.style.top = `${60 + 48 * mockIndex}px`;

    document.body.appendChild(label);
  
    setTimeout(() => {
      label.style.opacity = '0';
      setTimeout(() => label.remove(), 2000);
    }, 1000);
  }

  // Animation loop
  function animate(t) {
    requestAnimationFrame(animate);
    optimizer.step();
  
    const updatedPositions = optimizer.getPositions();
    const now = performance.now();
    const scale = SCALE;  
    for (let i = 0; i < updatedPositions.length; i++) {
      const pos = updatedPositions[i].clone().multiplyScalar(scale);
      dummy.position.copy(pos);
  
      const distToCam = camera.position.distanceTo(pos);
      let pointScale = 0.03 * (1 / (1 + distToCam * 0.3));
  
      // 🌟 Apply glow effect to newly added points
      if (recentlyAdded.has(i)) {
        const age = (now - recentlyAdded.get(i)) / 1000; // in seconds
        if (age < 20) {
          const pulse = 1 + Math.sin(age * Math.PI) * 4;
          pointScale *= pulse;
        } else {
          recentlyAdded.delete(i);
        }
      }
  
      dummy.scale.setScalar(pointScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
  
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = updatedPositions.length; 

    // 🔁 Rebuild filaments (also scale-aligned)
    const maxDistSq = 0.45 * 0.45;
    const linePositions = [];
  
    for (let i = 0; i < updatedPositions.length; i++) {
      for (let j = i + 1; j < updatedPositions.length; j++) {
        const a = updatedPositions[i];
        const b = updatedPositions[j];
        if (a.distanceToSquared(b) < maxDistSq) {
          const pa = a.clone().multiplyScalar(scale);
          const pb = b.clone().multiplyScalar(scale);
          linePositions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        }
      }
    }
  
    lineSegments.geometry.dispose();
    lineSegments.geometry = new THREE.BufferGeometry();
    lineSegments.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3)
    );
    
    controls.update();

    const { speed, offsetX, offsetY } = getSpeed();
    camera.lookAt(0, 0, 0);

    // ✨ Apply RGB shift only when user is dragging
    rgbShiftPass.uniforms['amount'].value = speed > 0.1 ? speed * 0.002 : 0.0;
    composer.render();
  }

  animate();
  
  // Handle cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (typeof cleanup === 'function') {
      cleanup();
    }
  });
});