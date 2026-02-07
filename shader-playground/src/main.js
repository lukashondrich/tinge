// main.js
console.log('📱 Main.js loading...');
import { initOpenAIRealtime } from "./openaiRealtime";

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { createRGBShiftPass } from './effects/rgbShiftPass.js';
// import { createVHSCRTPass } from './effects/vhsCrtPass.js';
import { createRenderer } from './core/renderer.js';
import { createScene } from './core/scene.js';
import { setupTouchRotation } from './utils/touchInput.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SCALE } from './core/scene.js';
import { DialoguePanel } from './ui/dialoguePanel.js';
import { TokenProgressBar } from './ui/tokenProgressBar.js';
import { vocabularyStorage } from './utils/vocabularyStorage.js';
import { BubbleManager } from './ui/bubbleManager.js';
import { isMobileDevice, createMobileDebug } from './utils/mobile.js';

const ONBOARDING_DISMISSED_KEY = 'tinge-onboarding-dismissed';
const DEMO_SEED_ENABLED_KEY = 'tinge-demo-seed-enabled';
const DEMO_SEED_WORDS = [
  { word: 'travel', speaker: 'user' },
  { word: 'career', speaker: 'user' },
  { word: 'confidence', speaker: 'user' },
  { word: 'fluency', speaker: 'user' },
  { word: 'interview', speaker: 'user' },
  { word: 'pronunciation', speaker: 'user' },
  { word: 'practice', speaker: 'user' },
  { word: 'listening', speaker: 'user' },
  { word: 'feedback', speaker: 'ai' },
  { word: 'goal', speaker: 'ai' },
  { word: 'motivation', speaker: 'ai' },
  { word: 'context', speaker: 'ai' },
  { word: 'grammar', speaker: 'ai' },
  { word: 'vocabulary', speaker: 'ai' },
  { word: 'mistake', speaker: 'ai' },
  { word: 'progress', speaker: 'ai' },
  { word: 'culture', speaker: 'ai' },
  { word: 'conversation', speaker: 'ai' },
  { word: 'clarity', speaker: 'ai' },
  { word: 'routine', speaker: 'ai' },
  { word: 'daily', speaker: 'user' },
  { word: 'work', speaker: 'user' },
  { word: 'friends', speaker: 'user' },
  { word: 'family', speaker: 'user' },
  { word: 'hobby', speaker: 'user' },
  { word: 'music', speaker: 'user' },
  { word: 'reading', speaker: 'user' },
  { word: 'writing', speaker: 'user' },
  { word: 'speaking', speaker: 'user' },
  { word: 'story', speaker: 'user' },
  { word: 'question', speaker: 'ai' },
  { word: 'answer', speaker: 'ai' },
  { word: 'pattern', speaker: 'ai' },
  { word: 'revision', speaker: 'ai' },
  { word: 'memory', speaker: 'ai' },
  { word: 'profile', speaker: 'ai' },
  { word: 'style', speaker: 'ai' },
  { word: 'challenge', speaker: 'ai' },
  { word: 'improve', speaker: 'ai' },
  { word: 'momentum', speaker: 'ai' }
];

function seededPoint(index, total) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const t = total > 1 ? index / (total - 1) : 0.5;
  const y = 1 - 2 * t;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * goldenAngle;
  const jitter = Math.sin(index * 12.9898) * 0.07;

  return {
    x: radius * Math.cos(theta) * 0.82 + jitter,
    y: y * 0.82 + jitter * 0.2,
    z: radius * Math.sin(theta) * 0.82 - jitter * 0.2
  };
}

function shouldEnableDemoSeed() {
  const stored = localStorage.getItem(DEMO_SEED_ENABLED_KEY);
  if (stored === null) {
    localStorage.setItem(DEMO_SEED_ENABLED_KEY, '1');
    return true;
  }
  return stored === '1';
}

function setDemoSeedEnabled(enabled) {
  localStorage.setItem(DEMO_SEED_ENABLED_KEY, enabled ? '1' : '0');
}

function buildDemoSeedVocabulary() {
  const now = Date.now();
  return DEMO_SEED_WORDS.map((entry, index) => ({
    word: entry.word,
    speaker: entry.speaker,
    position: seededPoint(index, DEMO_SEED_WORDS.length),
    timestamp: now + index
  }));
}

function applyDemoSeedVocabulary() {
  const entries = buildDemoSeedVocabulary();
  vocabularyStorage.importVocabulary(JSON.stringify(entries));
  return entries.length;
}

function dismissOnboarding(overlay, persistDismiss = false) {
  if (persistDismiss) {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
  }
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function showOnboarding(overlay) {
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

function createOnboardingUI() {
  const overlay = document.createElement('section');
  overlay.id = 'onboardingOverlay';
  overlay.className = 'onboarding-overlay';

  const stats = vocabularyStorage.getStats();
  overlay.innerHTML = `
    <div class="onboarding-card">
      <span class="memory-chip">Agentic memory active (local profile)</span>
      <h1>Voice-to-Meaning Language Playground</h1>
      <p class="onboarding-subtitle">
        Speak naturally while holding <strong>Push to Talk</strong>. Every new word appears in a live 3D meaning map.
      </p>
      <ol class="onboarding-steps">
        <li>Allow microphone access.</li>
        <li>Hold the button while you speak.</li>
        <li>Release to get AI feedback and new mapped words.</li>
      </ol>
      <p class="onboarding-note">
        Talk about anything: work, hobbies, travel, interviews. The tutor adapts in real time and updates your learning profile over sessions.
      </p>
      <p class="onboarding-status">Current cloud size: <strong>${stats.total}</strong> words</p>
      <div class="onboarding-actions">
        <button id="onboardingUseDemo" class="onboarding-btn primary">Use Demo Cloud</button>
        <button id="onboardingStartFresh" class="onboarding-btn secondary">Start Fresh</button>
        <button id="onboardingDismiss" class="onboarding-btn ghost">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
  if (dismissed) {
    overlay.style.display = 'none';
  }

  const useDemoBtn = overlay.querySelector('#onboardingUseDemo');
  const startFreshBtn = overlay.querySelector('#onboardingStartFresh');
  const dismissBtn = overlay.querySelector('#onboardingDismiss');

  useDemoBtn?.addEventListener('click', () => {
    setDemoSeedEnabled(true);
    if (vocabularyStorage.getStats().total === 0) {
      applyDemoSeedVocabulary();
    }
    dismissOnboarding(overlay, true);
    window.location.reload();
  });

  startFreshBtn?.addEventListener('click', () => {
    setDemoSeedEnabled(false);
    vocabularyStorage.clearVocabulary();
    dismissOnboarding(overlay, true);
    window.location.reload();
  });

  dismissBtn?.addEventListener('click', () => {
    dismissOnboarding(overlay, true);
  });

  const launcher = document.createElement('button');
  launcher.id = 'onboardingLauncher';
  launcher.className = 'onboarding-launcher';
  launcher.textContent = 'How it works';
  launcher.title = 'Show onboarding guide';
  launcher.addEventListener('click', () => {
    showOnboarding(overlay);
  });
  document.body.appendChild(launcher);
}



// Check if animation is already running
if (window.__ANIMATING__) {
  // eslint-disable-next-line no-console
  console.warn('🔥 animate() already running — skipping');
  throw new Error('animate() already running');
}
window.__ANIMATING__ = true;

//DialoguePanel.init();
const panel = new DialoguePanel('#transcriptContainer');

// Initialize token progress bar
const tokenProgressBar = new TokenProgressBar();

// Track words already visualized to avoid duplicates
const usedWords = new Set();

// Track last utterance for 3D text labels
let lastUtteranceWords = [];
// let lastUtteranceSpeaker = null;
const wordPositions = new Map(); // word -> THREE.Vector3 position
const wordIndices = new Map(); // word -> index in optimizer

const MOBILE_BUBBLE_COOLDOWN = 500; // 500ms cooldown between bubble creation on mobile
const IS_MOBILE = isMobileDevice();
const IDLE_AUTO_ROTATE_SPEED = 0.62;
const IDLE_RESUME_DELAY_MS = 1600;

const panelEl = document.getElementById('transcriptContainer');

const mobileDebug = createMobileDebug(IS_MOBILE);
createOnboardingUI();

function scrollToBottom() {
  panelEl.scrollTop = panelEl.scrollHeight;
}

const bubbleManager = new BubbleManager({
  containerElement: panelEl,
  isMobile: IS_MOBILE,
  mobileCooldown: MOBILE_BUBBLE_COOLDOWN,
  playAudioFor,
  scrollBehavior: scrollToBottom
});

// Word to utterance mapping for audio playback
const wordToUtteranceMap = new Map();

// Audio playback for 3D words
function playAudioFor(word) {
  const utteranceData = wordToUtteranceMap.get(word.toLowerCase());
  
  if (utteranceData && utteranceData.audioURL) {
    // Play the original utterance audio
    const audio = new Audio(utteranceData.audioURL);
    audio.play().catch(err => {
      console.warn('Failed to play utterance audio:', err);
      // Fallback to TTS
      playTTSFallback(word);
    });
  } else {
    // Fallback to Text-to-Speech
    playTTSFallback(word);
  }
}

// Text-to-Speech fallback for words without utterance audio
function playTTSFallback(word) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 0.8;
    utterance.pitch = 1.0;
    utterance.volume = 0.7;
    speechSynthesis.speak(utterance);
  } else {
    console.warn('Speech synthesis not supported - no audio playback available');
  }
}

// Initialize scene and OpenAI Realtime
console.log('🚀 Starting scene initialization...');
createScene().then(async ({ scene, camera, mesh, optimizer, dummy, numPoints: _numPoints, lineSegments, gel, controls: _controls, recentlyAdded, labels, textManager }) => {
  console.log('✅ Scene created successfully');
  const renderer = createRenderer();
  
  // Initialize controls with the renderer's DOM element
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.target.set(0, 0, 0);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.06;
  orbitControls.autoRotate = false;
  orbitControls.autoRotateSpeed = IDLE_AUTO_ROTATE_SPEED;
  orbitControls.update();

  let isUserOrbiting = false;
  let lastUserInteractionTime = performance.now();

  function markUserInteraction() {
    lastUserInteractionTime = performance.now();
  }

  orbitControls.addEventListener('start', () => {
    isUserOrbiting = true;
    markUserInteraction();
  });
  orbitControls.addEventListener('end', () => {
    isUserOrbiting = false;
    markUserInteraction();
  });

  renderer.domElement.addEventListener('wheel', markUserInteraction, { passive: true });
  renderer.domElement.addEventListener('pointerdown', markUserInteraction);
  renderer.domElement.addEventListener('touchstart', markUserInteraction, { passive: true });

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
  if (IS_MOBILE) {
    mobileDebug('Initializing OpenAI Realtime for mobile device');
  }
  
  console.log('🎤 Initializing OpenAI Realtime...');
  initOpenAIRealtime(
    (remoteStream) => {
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      // eslint-disable-next-line no-console
      audio.play().catch(err => console.error("Audio play error:", err));
    },
    (event) => {

      if (event.type === 'input_audio_buffer.speech_started') {
        bubbleManager.beginTurn('user');
      }
      
      if (event.type === 'input_audio_buffer.speech_stopped') {
        // User stopped speaking - the final transcription will replace the placeholder
      }
      
      // ① Handle delta events by accumulating text in the bubble
      if (
        event.type === 'response.audio_transcript.delta' &&
        typeof event.delta === 'string'
      ) {
        const completedWords = bubbleManager.appendDelta('ai', event.delta);
        completedWords.forEach((word) => addWord(word, 'ai', { skipBubble: true }));
      }

      // ② Handle individual word events 
      if (event.type === 'transcript.word' && typeof event.word === 'string') {
        const speaker = event.speaker || 'ai';
        
        // For user speech, only process words if there's an active bubble (from PTT press)
        // This prevents creating new bubbles but allows updating existing placeholder
        if (speaker === 'user') {
          bubbleManager.appendWord({ speaker, word: event.word, onWordClick: playAudioFor });
          addWord(event.word, speaker, { skipBubble: true });
          return;
        }
        
        // For AI speech, only process word events if we don't have an active delta-based bubble
        // This prevents conflicts between delta and word event processing
        if (!bubbleManager.hasActiveDelta(speaker)) {
          addWord(event.word, speaker);
        } else {
          // We have delta-based content, just add to word cloud without UI update
          const key = event.word.trim().toLowerCase();
          if (!usedWords.has(key)) {
            addWord(event.word, speaker, { skipBubble: true });
          }
        }
      }

      // ③ final utterance record with audio & timings with mobile-specific duplicate prevention
      if (event.type === 'utterance.added' && event.record) {
        const { speaker = 'ai', id, text, wordTimings } = event.record;
        const eventDeviceType = event.deviceType || 'unknown';
        
        if (!bubbleManager.shouldProcessUtterance(event.record, eventDeviceType)) {
          return;
        }
        
        // Map words to utterance for audio playback
        if (event.record.audioURL && event.record.wordTimings) {
          event.record.wordTimings.forEach(wordTiming => {
            const word = wordTiming.word.toLowerCase().replace(/[^\w]/g, ''); // Clean word
            if (word) {
              wordToUtteranceMap.set(word, {
                audioURL: event.record.audioURL,
                wordTiming: wordTiming,
                utteranceId: id,
                speaker: speaker
              });
            }
          });
        } else if (event.record.audioURL && text && text !== '...') {
          // If no word timings, map entire text for utterance-level playback
          const words = text.toLowerCase().match(/\b\w+\b/g) || [];
          words.forEach(word => {
            if (!wordToUtteranceMap.has(word)) {
              wordToUtteranceMap.set(word, {
                audioURL: event.record.audioURL,
                utteranceId: id,
                speaker: speaker
              });
            }
          });
        }
        
        const bubble = bubbleManager.getActiveBubble(speaker);

        // Handle placeholder records - they need processing to set up bubble tracking
        // even if they don't have final content yet
        const isPlaceholder = text === '...' && (!wordTimings || wordTimings.length === 0);
        
        if (isPlaceholder) {
          bubbleManager.setUtteranceId(speaker, id);
          const placeholderDelay = speaker === 'user' ? 2000 : 1000;
          bubbleManager.scheduleFinalize(speaker, placeholderDelay, (words) => {
            words.forEach((word) => addWord(word, speaker, { skipBubble: true }));
          });
          return;
        }

        // Cancel any pending finalization timer since we're processing the final utterance now
        bubbleManager.clearFinalizeTimer(speaker);
        bubbleManager.setUtteranceId(speaker, id);
        
        // 🏷️ Track last utterance for 3D text labels
        if (text && text !== '...') {
          try {
            const words = text.toLowerCase().match(/\b\w+\b/g) || [];
            lastUtteranceWords = words;
            // lastUtteranceSpeaker = speaker;
            
            console.log('🏷️ Processing utterance for 3D labels:', { text, words, speaker });
            console.log('🏷️ WordPositions map size:', wordPositions.size);
            console.log('🏷️ Available positions:', Array.from(wordPositions.keys()).slice(0, 10));
            
            // Get current positions from optimizer
            const currentPositions = new Map();
            words.forEach(word => {
              const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
              if (cleanWord && wordIndices.has(cleanWord)) {
                const index = wordIndices.get(cleanWord);
                const optimizedPositions = optimizer.getPositions();
                if (optimizedPositions[index]) {
                  const pos = optimizedPositions[index].clone().multiplyScalar(SCALE);
                  currentPositions.set(cleanWord, pos);
                }
              }
            });
            
            console.log('📍 Current positions for utterance:', currentPositions.size, 'words');
            
            // Show 3D text labels for the last utterance with current positions
            textManager.showLabelsForUtterance(words, speaker, currentPositions);
          } catch (error) {
            console.error('❌ 3D text label error:', error);
            // Don't break utterance processing
          }
        }
        
        panel.add(event.record); // DialoguePanel should now find and replace the existing bubble
        scrollToBottom();
        
        // For AI responses, don't set a short finalization timer since we're handling it in output_audio_buffer.stopped
        // For user responses, set a short timer since they don't have buffer events
        if (speaker === 'user') {
          bubbleManager.scheduleFinalize(speaker, 300);
        }
        // AI finalization is handled by output_audio_buffer.stopped event
        return;
      }

      // ④ handle AI buffer stopped - this signals end of AI response
      if (event.type === 'output_audio_buffer.stopped') {
        bubbleManager.scheduleFinalize('ai', 1000, (words) => {
          words.forEach((word) => addWord(word, 'ai', { skipBubble: true }));
        });
      }

      // ⑤ handle final AI transcript completion
      if (
        event.type === 'response.audio_transcript.done' &&
        typeof event.transcript === 'string'
      ) {
        const speaker = 'ai'; // This event is always from AI
        const transcript = event.transcript.trim();
        
        // If we have a final transcript but no utterance.added event yet,
        // this helps ensure we don't lose the final transcription
        // The actual processing will happen when utterance.added arrives
        if (transcript && !bubbleManager.getActiveBubble(speaker)) {
          // eslint-disable-next-line no-console
          console.warn('Got final transcript but no active AI bubble - transcript may be lost');
        }
      }
    }
  ,
  // Token usage callback for progress bar
  (usage) => {
    tokenProgressBar.updateUsage(usage);
  }
  )
  .then(() => {
    console.log('✅ OpenAI Realtime initialized successfully');
  })
  // eslint-disable-next-line no-console
  .catch(err => console.error("⚠️ Realtime init error:", err));
  const { getSpeed, dispose: disposeTouch } = setupTouchRotation(mesh);

  // Performance optimization: Load vocabulary in stages for 5000+ words
  let totalVocabularySize = 0;
  let loadedWordCount = 0;
  let isLoadingBatch = false;

  async function loadExistingVocabulary() {
    console.log('📚 Loading vocabulary with performance optimization...');
    try {
      // Quick check of total vocabulary size
      let fullVocabulary = vocabularyStorage.loadVocabulary();
      totalVocabularySize = fullVocabulary.length;
      
      if (totalVocabularySize === 0) {
        const demoEnabled = shouldEnableDemoSeed();
        if (demoEnabled) {
          const seededCount = applyDemoSeedVocabulary();
          console.log(`📚 Added ${seededCount} demo seed words for first-time experience`);
          fullVocabulary = vocabularyStorage.loadVocabulary();
          totalVocabularySize = fullVocabulary.length;
        } else {
          console.log('📚 No previous vocabulary found - starting fresh');
          return;
        }
      }

      console.log(`📚 Found ${totalVocabularySize} words total - using progressive loading`);
      
      // Stage 1: Load recent words immediately (fast startup)
      const recentWords = vocabularyStorage.loadRecentWords(150);
      if (recentWords.length > 0) {
        gel.visible = true;
        await loadWordsToScene(recentWords, 'recent');
        
        // Stage 2: Progressive loading of older words in background
        if (totalVocabularySize > 150) {
          setTimeout(() => loadOlderWordsBatch(), 1000);
        }
      }
    } catch (error) {
      console.warn('📚 Error loading vocabulary:', error);
    }
  }

  async function loadWordsToScene(words, batchType = 'batch') {
    //console.log(`📚 Loading ${words.length} words to scene (${batchType})`);
    
    for (const item of words) {
      try {
        const key = item.word.trim().toLowerCase();
        if (!usedWords.has(key)) {
          usedWords.add(key);
          
          // Add to optimizer
          optimizer.addPoint(item.position);
          const id = optimizer.getPositions().length - 1;
          mesh.count = id + 1;
          
          // Set color based on speaker
          const colour = item.speaker === 'user'
            ? new THREE.Color('#69ea4f')       // green
            : new THREE.Color(0x5a005a);       // purple
          
          mesh.setColorAt(id, colour);
          
          // Set label for tooltip
          labels[id] = item.word;
          
          // 📍 Track word position and index for 3D text labels
          const position = new THREE.Vector3(item.position.x * SCALE, item.position.y * SCALE, item.position.z * SCALE);
          wordPositions.set(key, position);
          wordIndices.set(key, id); // Track the index in the optimizer
          console.log('📍 Loaded word position:', key, position, 'index:', id);
          
          loadedWordCount++;
        }
      } catch (error) {
        console.warn(`📚 Failed to restore word "${item.word}":`, error);
      }
    }
    
    // Batch update for better performance
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    
    //console.log(`📚 ${batchType}: Loaded ${loadedWordCount}/${totalVocabularySize} words`);
  }

  async function loadOlderWordsBatch() {
    if (isLoadingBatch || loadedWordCount >= totalVocabularySize) return;
    
    isLoadingBatch = true;
    try {
      const batchSize = 100;
      const remainingWords = totalVocabularySize - loadedWordCount;
      const wordsToLoad = Math.min(batchSize, remainingWords);
      
      // Load older words (excluding the recent ones already loaded)
      const offset = Math.max(0, totalVocabularySize - 150 - wordsToLoad);
      const batch = vocabularyStorage.loadVocabularyBatch(offset, wordsToLoad);
      
      if (batch.length > 0) {
        await loadWordsToScene(batch, 'background');
        
        // Continue loading if more words remain
        if (loadedWordCount < totalVocabularySize) {
          setTimeout(() => loadOlderWordsBatch(), 500);
        }
      }
    } catch (error) {
      console.warn('📚 Error loading vocabulary batch:', error);
    } finally {
      isLoadingBatch = false;
    }
  }

  // Queue to preserve word order while async embedding requests complete
  const wordQueue = [];
  let processingWordQueue = false;

  async function processWordQueue() {
    if (processingWordQueue) return;
    processingWordQueue = true;
    try {
      while (wordQueue.length > 0) {
        const { word, speaker, options = {} } = wordQueue.shift();
        try {
          await processWord(word, speaker, options);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error processing word:', word, 'Error:', err);
          // Continue processing other words even if one fails
        }
      }
    } finally {
      // Always reset the flag, even if errors occurred
      processingWordQueue = false;
    }
  }

  function addWord(word, speaker = 'ai', options = {}) {
    wordQueue.push({ word, speaker, options });
    processWordQueue();
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

  // Add VHS CRT shader pass for retro 80s aesthetic
  // const vhsCrtPass = createVHSCRTPass();
  // composer.addPass(vhsCrtPass);
  

  async function processWord(word, speaker = "ai", options = {}) {
    try {
      if (!options.skipBubble) {
        bubbleManager.appendWord({ speaker, word, onWordClick: playAudioFor });
      }

      // SECOND: Process embeddings asynchronously (won't affect word order)
      const key = word.trim().toLowerCase();
      if (!usedWords.has(key)) {
        usedWords.add(key);
        let newPoint = {
          x: (Math.random() - 0.5) * 2, // Random between -1 and 1
          y: (Math.random() - 0.5) * 2, // Random between -1 and 1
          z: (Math.random() - 0.5) * 2  // Random between -1 and 1
        };
        
        try {
          const res = await fetch(`${__API_URL__}/embed-word?word=${encodeURIComponent(word)}`);
          if (res.ok) {
            const data = await res.json();
            newPoint = { x: data.x, y: data.y, z: data.z };
            // eslint-disable-next-line no-console
            console.log('Got embedding for word:', word, newPoint);
          } else {
            // eslint-disable-next-line no-console
            console.warn('Embedding service unavailable, using random position for word:', word);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Embedding service unavailable, using random fallback position for word:', word, err.message);
        }
        
        try {
          optimizer.addPoint(newPoint);

          // --- make room first ---
          const id = optimizer.getPositions().length - 1;
          mesh.count = id + 1;                // ensure the new slot exists

          // ✅ Show gel shell when first word is added
          if (mesh.count === 1) {
            gel.visible = true;
          }

          // pick the colour
          const colour = speaker === 'user'
            ? new THREE.Color('#69ea4f')       // green
            : new THREE.Color(0x5a005a);       // purple

          mesh.setColorAt(id, colour);
          mesh.instanceColor.needsUpdate = true;

          recentlyAdded.set(id, performance.now());
          labels[id] = word;
          
          // 📍 Track word position and index for 3D text labels
          const position = new THREE.Vector3(newPoint.x * SCALE, newPoint.y * SCALE, newPoint.z * SCALE);
          wordPositions.set(key, position);
          wordIndices.set(key, id); // Track the index in the optimizer
          console.log('📍 Tracked word position:', key, position, 'index:', id);
          
          // 💾 Save new word to vocabulary storage for persistence
          vocabularyStorage.saveWord(word, newPoint, speaker);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error adding point to 3D scene for word:', word, 'Error:', err);
          // Don't rethrow - UI update was successful
        }
      } else {
        // Word already exists - make sure it's tracked for 3D text labels
        if (!wordIndices.has(key)) {
          // Find the existing word in the labels array
          for (let i = 0; i < labels.length; i++) {
            if (labels[i] && labels[i].toLowerCase() === key) {
              wordIndices.set(key, i);
              
              // Also get the current position from the optimizer
              const optimizedPositions = optimizer.getPositions();
              if (optimizedPositions[i]) {
                const position = new THREE.Vector3(
                  optimizedPositions[i].x * SCALE,
                  optimizedPositions[i].y * SCALE,
                  optimizedPositions[i].z * SCALE
                );
                wordPositions.set(key, position);
              }
              
              console.log('📍 Found existing word index:', key, 'index:', i);
              break;
            }
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Critical error in processWord for:', word, 'Error:', err);
      throw err; // Rethrow critical errors that affect UI
    }
  }

  // Performance optimization variables
  const MAX_RENDER_DISTANCE = 30; // Hide points beyond this distance
  const LOD_DISTANCES = [10, 20, MAX_RENDER_DISTANCE]; // Different detail levels
  let frameCount = 0;
  let lastFrameTimeMs = performance.now();

  // Animation loop with LOD optimization
  function animate(t) {
    requestAnimationFrame(animate);
    const deltaSeconds = Math.min(0.05, Math.max(0.0, (t - lastFrameTimeMs) / 1000));
    lastFrameTimeMs = t;

    optimizer.step();
  
    const updatedPositions = optimizer.getPositions();
    const now = performance.now();
    const scale = SCALE;
    frameCount++;
    
    // LOD optimization: skip distant point updates on some frames for performance
    const skipDistantUpdates = frameCount % 3 !== 0; // Update distant points every 3rd frame
    
    for (let i = 0; i < updatedPositions.length; i++) {
      const pos = updatedPositions[i].clone().multiplyScalar(scale);
      dummy.position.copy(pos);
  
      const distToCam = camera.position.distanceTo(pos);
      
      // LOD: Hide very distant points to improve performance
      if (distToCam > MAX_RENDER_DISTANCE) {
        dummy.scale.setScalar(0); // Hide point
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }
      
      // LOD: Skip updates for distant points on some frames
      if (skipDistantUpdates && distToCam > LOD_DISTANCES[1]) {
        continue; // Keep previous matrix
      }
      
      let pointScale = 0.03 * (1 / (1 + distToCam * 0.3));
      
      // LOD: Reduce detail for distant points
      if (distToCam > LOD_DISTANCES[0]) {
        pointScale *= 0.7; // Smaller scale for distant points
      }
  
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
    
    const idleElapsed = performance.now() - lastUserInteractionTime;
    orbitControls.autoRotate = !isUserOrbiting && idleElapsed > IDLE_RESUME_DELAY_MS;
    orbitControls.update(deltaSeconds);

    // eslint-disable-next-line no-unused-vars
    const { speed, offsetX: _offsetX, offsetY: _offsetY } = getSpeed();

    // ✨ Apply RGB shift only when user is dragging
    rgbShiftPass.uniforms['amount'].value = speed > 0.1 ? speed * 0.002 : 0.0;
    
    // Update VHS CRT shader time for animated effects
    // vhsCrtPass.uniforms.time.value = performance.now() * 0.001;
    
    // 🏷️ Update 3D text labels to face camera and follow moving points
    try {
      // Update positions of text labels to follow the optimized positions
      if (lastUtteranceWords.length > 0) {
        const currentPositions = new Map();
        
        // Get positions for all active labels (both user and AI)
        textManager.activeLabels.forEach((textGroup, word) => {
          const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
          if (cleanWord && wordIndices.has(cleanWord)) {
            const index = wordIndices.get(cleanWord);
            const optimizedPositions = optimizer.getPositions();
            if (optimizedPositions[index]) {
              const pos = optimizedPositions[index].clone().multiplyScalar(SCALE);
              currentPositions.set(cleanWord, pos);
            }
          }
        });
        
        // Update text manager with current positions
        textManager.updatePositions(currentPositions);
      }
      
      textManager.updateLabels(camera);
    } catch (error) {
      console.error('❌ TextManager update error:', error);
      // Don't break the animation loop
    }
    
    composer.render();
  }

  // Load existing vocabulary before starting animation
  console.log('📚 Loading vocabulary...');
  try {
    await loadExistingVocabulary();
    console.log('✅ Vocabulary loaded successfully');
  } catch (error) {
    console.error('❌ Vocabulary loading failed:', error);
  }
  
  console.log('🎬 Starting animation...');
  animate();
  
  // Handle cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (typeof window.cleanup === 'function') {
      window.cleanup();
    }
    if (typeof disposeTouch === 'function') {
      disposeTouch();
    }
  });
}).catch(error => {
  console.error('❌ Scene initialization failed:', error);
});
