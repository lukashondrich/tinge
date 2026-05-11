import { vocabularyStorage as defaultVocabularyStorage } from '../utils/vocabularyStorage.js';

export const ONBOARDING_DISMISSED_KEY = 'tinge-onboarding-dismissed';
export const DEMO_SEED_ENABLED_KEY = 'tinge-demo-seed-enabled';
export const DEMO_SEED_WORDS = [
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

export function seededPoint(index, total) {
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

export function shouldEnableDemoSeed(storage = window.localStorage) {
  const stored = storage.getItem(DEMO_SEED_ENABLED_KEY);
  if (stored === null) {
    storage.setItem(DEMO_SEED_ENABLED_KEY, '1');
    return true;
  }
  return stored === '1';
}

export function setDemoSeedEnabled(enabled, storage = window.localStorage) {
  storage.setItem(DEMO_SEED_ENABLED_KEY, enabled ? '1' : '0');
}

export function buildDemoSeedVocabulary(now = Date.now()) {
  return DEMO_SEED_WORDS.map((entry, index) => ({
    word: entry.word,
    speaker: entry.speaker,
    position: seededPoint(index, DEMO_SEED_WORDS.length),
    timestamp: now + index
  }));
}

export function applyDemoSeedVocabulary(vocabulary = defaultVocabularyStorage) {
  const entries = buildDemoSeedVocabulary();
  vocabulary.importVocabulary(JSON.stringify(entries));
  return entries.length;
}

function dismissOnboarding(overlay, storage, persistDismiss = false) {
  if (persistDismiss) {
    storage.setItem(ONBOARDING_DISMISSED_KEY, '1');
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

export function createOnboardingUI({
  vocabulary = defaultVocabularyStorage,
  storage = window.localStorage,
  documentRef = document,
  windowRef = window
} = {}) {
  const overlay = documentRef.createElement('section');
  overlay.id = 'onboardingOverlay';
  overlay.className = 'onboarding-overlay';

  const stats = vocabulary.getStats();
  overlay.innerHTML = `
    <div class="onboarding-card">
      <span class="memory-chip">Agentic memory active (local profile)</span>
      <h1>Voice-to-Meaning Language Playground</h1>
      <p class="onboarding-subtitle">
        Speak naturally while holding <strong>Push to Talk</strong>. Every new word appears in a live 3D meaning map. Ask about Spanish-speaking culture, and the tutor pulls real knowledge from a curated Wikipedia archive using Elasticsearch &amp; Haystack RAG.
      </p>
      <ol class="onboarding-steps">
        <li>Allow microphone access.</li>
        <li>Hold the button while you speak.</li>
        <li>Release to get AI feedback and new mapped words.</li>
      </ol>
      <p class="onboarding-note">
        Talk about anything: work, hobbies, travel - or ask about places, food, history and traditions in Spain &amp; Latin America. The tutor adapts in real time, cites its sources, and updates your learning profile over sessions.
      </p>
      <p class="onboarding-status">Current cloud size: <strong>${stats.total}</strong> words</p>
      <div class="onboarding-actions">
        <button id="onboardingUseDemo" class="onboarding-btn primary">Use Demo Cloud</button>
        <button id="onboardingStartFresh" class="onboarding-btn secondary">Start Fresh</button>
        <button id="onboardingDismiss" class="onboarding-btn ghost">Close</button>
      </div>
    </div>
  `;

  documentRef.body.appendChild(overlay);

  const dismissed = storage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
  if (dismissed) {
    overlay.style.display = 'none';
  }

  const useDemoBtn = overlay.querySelector('#onboardingUseDemo');
  const startFreshBtn = overlay.querySelector('#onboardingStartFresh');
  const dismissBtn = overlay.querySelector('#onboardingDismiss');

  useDemoBtn?.addEventListener('click', () => {
    setDemoSeedEnabled(true, storage);
    if (vocabulary.getStats().total === 0) {
      applyDemoSeedVocabulary(vocabulary);
    }
    dismissOnboarding(overlay, storage, true);
    windowRef.location.reload();
  });

  startFreshBtn?.addEventListener('click', () => {
    setDemoSeedEnabled(false, storage);
    vocabulary.clearVocabulary();
    dismissOnboarding(overlay, storage, true);
    windowRef.location.reload();
  });

  dismissBtn?.addEventListener('click', () => {
    dismissOnboarding(overlay, storage, true);
  });

  const launcher = documentRef.createElement('button');
  launcher.id = 'onboardingLauncher';
  launcher.className = 'onboarding-launcher';
  launcher.textContent = 'How it works';
  launcher.title = 'Show onboarding guide';
  launcher.addEventListener('click', () => {
    showOnboarding(overlay);
  });
  documentRef.body.appendChild(launcher);
}
