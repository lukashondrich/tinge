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

// Track the currently active chat bubble for each speaker
const activeBubbles = { user: null, ai: null };

// Track words already visualized to avoid duplicates
const usedWords = new Set();

// Track processed utterances to prevent duplicates
const processedUtterances = new Set();

const panelEl = document.getElementById('transcriptContainer');

// timer used to delay bubble finalization per speaker
const finalizeTimers = { user: null, ai: null };


function scrollToBottom() {
  panelEl.scrollTop = panelEl.scrollHeight;
}

// simple word playback helper (stubbed until audio timing is known)
function playAudioFor(word) {
  console.log('🔊 playAudioFor', word);
}

function startBubble(speaker) {
  if (activeBubbles[speaker]) return;
  const bubble = document.createElement('div');
  bubble.classList.add('bubble', speaker);
  const p = document.createElement('p');
  p.className = 'transcript';
  const span = document.createElement('span');
  span.className = 'highlighted-text';
  p.appendChild(span);
  bubble.appendChild(p);
  panelEl.appendChild(bubble);
  bubble.__highlight = span;
  activeBubbles[speaker] = bubble;
  scrollToBottom();
}

// Initialize scene and OpenAI Realtime
createScene().then(({ scene, camera, mesh, optimizer, dummy, numPoints, lineSegments, controls, recentlyAdded, labels }) => {
  console.log('📊 Scene created');
  const renderer = createRenderer();

  // 🏷 Tooltip for hovered words
  const tooltip = document.createElement('div');
  tooltip.id = 'wordTooltip';
  Object.assign(tooltip.style, {
    position: 'absolute',
    pointerEvents: 'none',
    padding: '2px 6px',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: '12px',
    borderRadius: '4px',
    display: 'none',
    zIndex: 1000
  });
  document.body.appendChild(tooltip);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onPointerMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(mesh);
    if (hits.length > 0 && hits[0].instanceId != null) {
      const id = hits[0].instanceId;
      const label = labels[id];
      if (label) {
        tooltip.textContent = label;
        tooltip.style.left = e.clientX + 8 + 'px';
        tooltip.style.top = e.clientY + 8 + 'px';
        tooltip.style.display = 'block';
        return;
      }
    }
    tooltip.style.display = 'none';
  }

  renderer.domElement.addEventListener('mousemove', onPointerMove);
  renderer.domElement.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

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

      if (event.type === 'input_audio_buffer.speech_started') {
        startBubble('user');
      }
      
      // ① Handle delta events by accumulating text in the bubble
      if (
        event.type === 'response.audio_transcript.delta' &&
        typeof event.delta === 'string'
      ) {
        const speaker = 'ai';
        console.log('🗣️ delta:', event.delta, 'speaker:', speaker);
        addDeltaToActiveBubble(event.delta, speaker);
      }

      // ② Handle individual word events (for user speech)
      if (event.type === 'transcript.word' && typeof event.word === 'string') {
        const speaker = event.speaker || 'ai';
        console.log('🗣️ word:', event.word, 'speaker:', speaker);
        addWord(event.word, speaker);
      }

      // ③ final utterance record with audio & timings
      if (event.type === 'utterance.added' && event.record) {
        const { speaker = 'ai', id, text, wordTimings } = event.record;
        
        // Prevent duplicate processing of the same utterance
        const utteranceKey = `${speaker}-${id}`;
        if (processedUtterances.has(utteranceKey)) {
          console.log(`⚠️ Duplicate utterance.added event detected for ${utteranceKey}, ignoring`);
          return;
        }
        processedUtterances.add(utteranceKey);
        
        const bubble = activeBubbles[speaker];

        // Handle placeholder records - they need processing to set up bubble tracking
        // even if they don't have final content yet
        const isPlaceholder = text === '...' && (!wordTimings || wordTimings.length === 0);
        
        if (isPlaceholder) {
          console.log('👉 Processing placeholder record for bubble tracking:', { speaker, id });
          // Set utteranceId on bubble for future replacement
          if (bubble) {
            bubble.dataset.utteranceId = id;
          }
          // Start finalization timer - when final transcription arrives, it will replace this
          clearTimeout(finalizeTimers[speaker]);
          finalizeTimers[speaker] = setTimeout(() => {
            finalizeBubble(speaker);
          }, 2000); // Longer timeout for user speech (server transcription takes time)
          return;
        }

        // If we have a final transcription but no active bubble, it's still valid
        if (bubble) {
          bubble.dataset.utteranceId = id;
        }
        
        console.log('✅ Adding final utterance to panel:', { speaker, id, text: text.substring(0, 50) + '...' });
        panel.add(event.record); // DialoguePanel will replace the bubble
        scrollToBottom();
        clearTimeout(finalizeTimers[speaker]);
        finalizeTimers[speaker] = setTimeout(() => {
          finalizeBubble(speaker);
        }, 300);
        return;
      }

      // ④ handle final AI transcript completion
      if (
        event.type === 'response.audio_transcript.done' &&
        typeof event.transcript === 'string'
      ) {
        const speaker = 'ai'; // This event is always from AI
        const transcript = event.transcript.trim();
        console.log('✅ AI final transcript done:', transcript);
        
        // If we have a final transcript but no utterance.added event yet,
        // this helps ensure we don't lose the final transcription
        // The actual processing will happen when utterance.added arrives
        if (transcript && !activeBubbles[speaker]) {
          console.log('⚠️ Got final transcript but no active AI bubble - transcript may be lost');
        }
      }
    }
  )
  .catch(err => console.error("⚠️ Realtime init error:", err));
  const { getSpeed, dispose: disposeTouch } = setupTouchRotation(mesh);

  // Queue to preserve word order while async embedding requests complete
  const wordQueue = [];
  let processingWordQueue = false;

  async function processWordQueue() {
    if (processingWordQueue) return;
    processingWordQueue = true;
    try {
      while (wordQueue.length > 0) {
        const { word, speaker } = wordQueue.shift();
        try {
          await processWord(word, speaker);
        } catch (err) {
          console.error('🚨 Error processing word:', word, 'Error:', err);
          // Continue processing other words even if one fails
        }
      }
    } finally {
      // Always reset the flag, even if errors occurred
      processingWordQueue = false;
    }
  }

  function addWord(word, speaker = 'ai') {
    wordQueue.push({ word, speaker });
    processWordQueue();
  }

  function addDeltaToActiveBubble(delta, speaker = 'ai') {
    let bubble = activeBubbles[speaker];
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.classList.add('bubble', speaker);
      const p = document.createElement('p');
      p.className = 'transcript';
      const span = document.createElement('span');
      span.className = 'highlighted-text';
      p.appendChild(span);
      bubble.appendChild(p);
      panelEl.appendChild(bubble);
      bubble.__highlight = span;
      activeBubbles[speaker] = bubble;
    }
    
    const target = bubble.__highlight || bubble.querySelector('.highlighted-text');
    
    // Simply append the delta as text (no word splitting needed)
    const textNode = document.createTextNode(delta);
    target.appendChild(textNode);
    
    scrollToBottom();
  }

  // Set up post-processing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9, 0.8, 0.2
  );
  composer.addPass(bloomPass);

  const rgbShiftPass = createRGBShiftPass();
  composer.addPass(rgbShiftPass);
  

  async function processWord(word, speaker = "ai") {
    try {
      // FIRST: Update UI immediately (synchronous) to preserve word order
      let bubble = activeBubbles[speaker];
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.classList.add('bubble', speaker);
        const p = document.createElement('p');
        p.className = 'transcript';
        const span = document.createElement('span');
        span.className = 'highlighted-text';
        p.appendChild(span);
        bubble.appendChild(p);
        panelEl.appendChild(bubble);
        bubble.__highlight = span;
        activeBubbles[speaker] = bubble;
      }
      const target = bubble.__highlight || bubble.querySelector('.highlighted-text');
      word.split(/\s+/).forEach(tok => {
        if (!tok) return;
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = tok + ' ';
        span.onclick = () => playAudioFor(tok);
        target.appendChild(span);
      });
      scrollToBottom();

      // SECOND: Process embeddings asynchronously (won't affect word order)
      const key = word.trim().toLowerCase();
      if (!usedWords.has(key)) {
        usedWords.add(key);
        let newPoint = { x: 0, y: 0, z: 0 };
        try {
          const res = await fetch(`/embed-word?word=${encodeURIComponent(word)}`);
          if (res.ok) {
            const data = await res.json();
            newPoint = { x: data.x, y: data.y, z: data.z };
          } else {
            console.warn('🟡 Embedding fetch returned non-OK status:', res.status, 'for word:', word);
          }
        } catch (err) {
          console.error('🔴 Embedding fetch failed for word:', word, 'Error:', err);
          // Continue with default position
        }
        
        try {
          optimizer.addPoint(newPoint);

          // --- make room first ---
          const id = optimizer.getPositions().length - 1;
          mesh.count = id + 1;                // ensure the new slot exists

          // pick the colour
          const colour = speaker === 'user'
            ? new THREE.Color('#69ea4f')       // green
            : new THREE.Color(0x5a005a);       // purple

          mesh.setColorAt(id, colour);
          mesh.instanceColor.needsUpdate = true;

          recentlyAdded.set(id, performance.now());
          labels[id] = word;
        } catch (err) {
          console.error('🔴 Error adding point to 3D scene for word:', word, 'Error:', err);
          // Don't rethrow - UI update was successful
        }
      }
    } catch (err) {
      console.error('🚨 Critical error in processWord for:', word, 'Error:', err);
      throw err; // Rethrow critical errors that affect UI
    }
  }

  function finalizeBubble(speaker) {
    activeBubbles[speaker] = null;
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
    const maxConnections = 10; // Maximum connections per point
    const connectionCounts = new Array(updatedPositions.length).fill(0); // Track connections

    for (let i = 0; i < updatedPositions.length; i++) {
      for (let j = i + 1; j < updatedPositions.length; j++) {
      if (connectionCounts[i] < maxConnections && connectionCounts[j] < maxConnections) {
        const a = updatedPositions[i];
        const b = updatedPositions[j];
        if (a.distanceToSquared(b) < maxDistSq) {
        const pa = a.clone().multiplyScalar(scale);
        const pb = b.clone().multiplyScalar(scale);
        linePositions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        connectionCounts[i]++;
        connectionCounts[j]++;
        }
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
    if (typeof disposeTouch === 'function') {
      disposeTouch();
    }
  });
});