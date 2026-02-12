// main.js
import { initOpenAIRealtime } from "./openaiRealtime";

import * as THREE from 'three';
// import { createVHSCRTPass } from './effects/vhsCrtPass.js';
import { createRenderer } from './core/renderer.js';
import { createScene } from './core/scene.js';
import { setupTouchRotation } from './utils/touchInput.js';
import { SCALE } from './core/scene.js';
import { DialoguePanel } from './ui/dialoguePanel.js';
import { TokenProgressBar } from './ui/tokenProgressBar.js';
import { vocabularyStorage } from './utils/vocabularyStorage.js';
import { BubbleManager } from './ui/bubbleManager.js';
import { SourcePanel } from './ui/sourcePanel.js';
import { isMobileDevice, createMobileDebug } from './utils/mobile.js';
import { createLogger } from './utils/logger.js';
import { createOnboardingUI, shouldEnableDemoSeed, applyDemoSeedVocabulary } from './ui/onboardingController.js';
import { CitationTurnState } from './realtime/citationState.js';
import { RetrievalCitationCoordinator } from './realtime/retrievalCitationCoordinator.js';
import { AsyncWordQueue } from './realtime/asyncWordQueue.js';
import { WordIngestionService } from './realtime/wordIngestionService.js';
import { VocabularyHydrator } from './realtime/vocabularyHydrator.js';
import { UtteranceEventProcessor } from './realtime/utteranceEventProcessor.js';
import { RealtimeEventCoordinator } from './realtime/realtimeEventCoordinator.js';
import { createSceneInteractionController } from './realtime/sceneInteractionController.js';
import { createSceneRuntimeController } from './realtime/sceneRuntimeController.js';
const logger = createLogger('main');
logger.log('📱 Main.js loading...');

// Check if animation is already running
if (window.__ANIMATING__) {
  logger.warn('🔥 animate() already running — skipping');
  throw new Error('animate() already running');
}
window.__ANIMATING__ = true;

//DialoguePanel.init();
const panel = new DialoguePanel('#transcriptContainer');

// Initialize token progress bar
const tokenProgressBar = new TokenProgressBar();

// Track words already visualized to avoid duplicates
const usedWords = new Set();

const wordPositions = new Map(); // word -> THREE.Vector3 position
const wordIndices = new Map(); // word -> index in optimizer

const MOBILE_BUBBLE_COOLDOWN = 500; // 500ms cooldown between bubble creation on mobile
const IS_MOBILE = isMobileDevice();
const IDLE_CONFIG = {
  targetSpeed: 0.5,
  accelPerSec: 0.1,
  decelPerSec: 1.2,
  resumeDelayMs: 1600
};

const panelEl = document.getElementById('transcriptContainer');

const mobileDebug = createMobileDebug(IS_MOBILE);
createOnboardingUI({ vocabulary: vocabularyStorage });

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
const sourcePanel = new SourcePanel({ maxVisible: 4 });
const citationTurnState = new CitationTurnState(sourcePanel);
const retrievalCoordinator = new RetrievalCitationCoordinator({
  citationTurnState,
  sourcePanel
});
let utteranceEventProcessor = null;
let realtimeEventCoordinator = null;

// Audio playback for 3D words
function playAudioFor(word) {
  if (utteranceEventProcessor) {
    utteranceEventProcessor.playAudioFor(word, playTTSFallback);
    return;
  }
  playTTSFallback(word);
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
    logger.warn('Speech synthesis not supported - no audio playback available');
  }
}

// Initialize scene and OpenAI Realtime
logger.log('🚀 Starting scene initialization...');
createScene().then(async ({ scene, camera, mesh, optimizer, dummy, numPoints: _numPoints, lineSegments, gel, controls: _controls, recentlyAdded, labels, textManager }) => {
  logger.log('✅ Scene created successfully');
  const renderer = createRenderer();
  
  // Initialize controls with the renderer's DOM element
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.target.set(0, 0, 0);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.06;
  orbitControls.autoRotate = false;
  orbitControls.autoRotateSpeed = 0;
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

  const sceneInteractionController = createSceneInteractionController({
    domElement: renderer.domElement,
    camera,
    mesh,
    labels
  });

  // Initialize OpenAI Realtime with a callback to handle the remote audio stream
  if (IS_MOBILE) {
    mobileDebug('Initializing OpenAI Realtime for mobile device');
  }
  
  logger.log('🎤 Initializing OpenAI Realtime...');
  let remoteAudioEl = document.getElementById('remoteAiAudio');
  if (!remoteAudioEl) {
    remoteAudioEl = document.createElement('audio');
    remoteAudioEl.id = 'remoteAiAudio';
    remoteAudioEl.autoplay = true;
    remoteAudioEl.playsInline = true;
    remoteAudioEl.muted = false;
    remoteAudioEl.volume = 1.0;
    remoteAudioEl.preload = 'auto';
    remoteAudioEl.style.position = 'fixed';
    remoteAudioEl.style.width = '1px';
    remoteAudioEl.style.height = '1px';
    remoteAudioEl.style.left = '-9999px';
    remoteAudioEl.style.top = '0';
    remoteAudioEl.style.opacity = '0';
    remoteAudioEl.style.pointerEvents = 'none';
    document.body.appendChild(remoteAudioEl);
  }
  remoteAudioEl.muted = false;
  remoteAudioEl.volume = 1.0;
  remoteAudioEl.playsInline = true;
  remoteAudioEl.autoplay = true;

  initOpenAIRealtime(
    (remoteStream) => {
      remoteAudioEl.srcObject = remoteStream;
      const tryPlay = () => {
        remoteAudioEl.play().catch(err => logger.error('Audio play error:', err));
      };
      tryPlay();

      const retryOnGesture = () => {
        tryPlay();
        window.removeEventListener('pointerdown', retryOnGesture);
        window.removeEventListener('touchstart', retryOnGesture);
        window.removeEventListener('keydown', retryOnGesture);
      };
      window.addEventListener('pointerdown', retryOnGesture, { once: true });
      window.addEventListener('touchstart', retryOnGesture, { once: true });
      window.addEventListener('keydown', retryOnGesture, { once: true });
    },
    (event) => {
      realtimeEventCoordinator.handleEvent(event);
    }
  ,
  // Token usage callback for progress bar
  (usage) => {
    tokenProgressBar.updateUsage(usage);
  }
  )
  .then(() => {
    logger.log('✅ OpenAI Realtime initialized successfully');
  })
  .catch(err => logger.error('⚠️ Realtime init error:', err));
  const { getSpeed, dispose: disposeTouch } = setupTouchRotation(mesh);

  const vocabularyHydrator = new VocabularyHydrator({
    vocabularyStorage,
    usedWords,
    optimizer,
    mesh,
    labels,
    wordPositions,
    wordIndices,
    gel,
    scale: SCALE,
    makeColorForSpeaker: (speaker) => (
      speaker === 'user'
        ? new THREE.Color('#69ea4f')
        : new THREE.Color(0x5a005a)
    ),
    makeVector3: (x, y, z) => new THREE.Vector3(x, y, z),
    shouldEnableDemoSeed: () => shouldEnableDemoSeed(localStorage),
    applyDemoSeedVocabulary: () => applyDemoSeedVocabulary(vocabularyStorage)
  });

  const wordIngestionService = new WordIngestionService({
    bubbleManager,
    onWordClick: playAudioFor,
    usedWords,
    optimizer,
    mesh,
    gel,
    recentlyAdded,
    labels,
    wordPositions,
    wordIndices,
    scale: SCALE,
    vocabularyStorage,
    apiUrl: __API_URL__
  });

  // Queue preserves word order while async embedding requests complete.
  const wordQueue = new AsyncWordQueue({
    processor: async ({ word, speaker, options = {} }) => {
      await wordIngestionService.processWord(word, speaker, options);
    },
    onError: (err, item) => {
      logger.error('Error processing word:', item?.word, 'Error:', err);
      // Continue processing other words even if one fails.
    }
  });

  function addWord(word, speaker = 'ai', options = {}) {
    wordQueue.enqueue({ word, speaker, options });
  }

  realtimeEventCoordinator = new RealtimeEventCoordinator({
    bubbleManager,
    retrievalCoordinator,
    addWord,
    playAudioFor,
    usedWords,
    warn: (message) => logger.warn(message)
  });

  utteranceEventProcessor = new UtteranceEventProcessor({
    bubbleManager,
    retrievalCoordinator,
    panel,
    scrollToBottom,
    addWord,
    textManager,
    wordIndices,
    optimizer,
    scale: SCALE
  });
  realtimeEventCoordinator.setUtteranceEventProcessor(utteranceEventProcessor);

  const sceneRuntimeController = createSceneRuntimeController({
    scene,
    camera,
    renderer,
    mesh,
    optimizer,
    dummy,
    lineSegments,
    recentlyAdded,
    orbitControls,
    getTouchSpeed: getSpeed,
    utteranceEventProcessor,
    getIsUserOrbiting: () => isUserOrbiting,
    getLastUserInteractionTime: () => lastUserInteractionTime,
    scale: SCALE,
    idleConfig: IDLE_CONFIG,
    warnTextLabelError: (error) => {
      logger.error('❌ TextManager update error:', error);
    }
  });

  // Load existing vocabulary before starting animation
  logger.log('📚 Loading vocabulary...');
  try {
    await vocabularyHydrator.loadExistingVocabulary();
    logger.log('✅ Vocabulary loaded successfully');
  } catch (error) {
    logger.error('❌ Vocabulary loading failed:', error);
  }
  
  logger.log('🎬 Starting animation...');
  sceneRuntimeController.start();
  
  // Handle cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (typeof window.cleanup === 'function') {
      window.cleanup();
    }
    if (typeof disposeTouch === 'function') {
      disposeTouch();
    }
    sceneInteractionController.dispose();
    if (remoteAudioEl) {
      remoteAudioEl.srcObject = null;
      remoteAudioEl.remove();
    }
  });
}).catch(error => {
  logger.error('❌ Scene initialization failed:', error);
});
