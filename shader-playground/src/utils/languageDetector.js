let FastTextModule;
let modelPromise;
const MODEL_PATH = '/models/lid.176.ftz';

async function loadFastTextScript() {
  return new Promise(resolve => {
    const existing = document.querySelector('script[data-fasttext]');
    if (existing) return existing.addEventListener('load', () => resolve());

    const script = document.createElement('script');
    script.src = '/vendor/fasttext.js';
    script.async = true;
    script.dataset.fasttext = 'true';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => resolve());
    document.head.appendChild(script);
  });
}

async function getFastText() {
  if (!FastTextModule) {
    try {
      // Prefer require() for non-ESM environments if available
      if (typeof require !== 'undefined') {
        FastTextModule = require('fasttext.js');
      } else {
        // Use @vite-ignore so the build works when fasttext.js isn't installed
        const mod = await import(/* @vite-ignore */ 'fasttext.js');
        FastTextModule = mod.default || mod;
      }
    } catch (err) {
      console.warn('fasttext.js module not available, trying script load:', err);
      await loadFastTextScript();
      FastTextModule = window.FastText || window.fastText;
    }
  }
  return FastTextModule ? new FastTextModule() : null;
}

/**
 * Lazily load the fastText language identification model.
 * The model file `lid.176.ftz` must be placed inside `shader-playground/public/models`.
 * @returns {Promise<Object>} Loaded fastText model
 */
async function loadModel() {
  if (!modelPromise) {
    const ft = await getFastText();
    if (!ft) return null;
    modelPromise = ft.loadModel(MODEL_PATH).catch(err => {
      console.warn('Failed to load fastText model:', err);
      modelPromise = null;
      return null;
    });
  }
  return modelPromise;
}

/**
 * Detect language for the given word.
 * @param {string} word - Text to analyse
 * @param {string[]} candidateLanguages - Preferred languages to consider
 * @returns {Promise<string>} Predicted ISO language code or 'unknown'
 */
export async function detectLanguage(word, candidateLanguages = []) {
  try {
    const model = await loadModel();
    if (model) {
      const predictions = await model.predict(word, 1);
      if (predictions && predictions.length) {
        const lang = predictions[0].label.replace(/^__label__/, '').toLowerCase();
        if (candidateLanguages.length) {
          const allowed = candidateLanguages.map(l => l.toLowerCase());
          if (allowed.includes(lang)) {
            return lang;
          }
          return heuristicDetect(word, candidateLanguages);
        }
        return lang;
      }
    }
    return heuristicDetect(word, candidateLanguages);
  } catch (err) {
    console.warn('Language detection failed:', err);
    return heuristicDetect(word, candidateLanguages);
  }
}

/**
 * Very basic heuristic language detection based on character sets.
 * @param {string} word - word to analyse
 * @param {string[]} candidateLanguages - candidate languages from user profile
 * @returns {string} guessed language or 'unknown'
 */
function heuristicDetect(word, candidateLanguages = []) {
  if (!word) return 'unknown';
  const scripts = {
    zh: /[\u4e00-\u9fff]/,
    ja: /[\u3040-\u30ff]/,
    ko: /[\uac00-\ud7a3]/,
    ru: /[а-яё]/i,
    el: /[α-ωάέίόύήώ]/i,
    ar: /[\u0600-\u06ff]/,
    he: /[\u0590-\u05ff]/,
    de: /[äöüß]/i,
    fr: /[éèêëàçùôûîôÿ]/i,
    es: /[ñáéíóúü]/i
  };
  const langs = candidateLanguages.length ? candidateLanguages : Object.keys(scripts);
  for (const lang of langs) {
    const regex = scripts[lang.toLowerCase()];
    if (regex && regex.test(word)) {
      return lang.toLowerCase();
    }
  }
  if (candidateLanguages.length === 1) {
    return candidateLanguages[0].toLowerCase();
  }
  return 'unknown';
}

/**
 * Retrieve languages known to the user from the stored profile.
 * @returns {string[]} Array of language codes/names
 */
export function getUserLanguages() {
  try {
    const profileKey = Object.keys(localStorage).find(k => k.startsWith('user_profile_'));
    if (!profileKey) return [];
    const profile = JSON.parse(localStorage.getItem(profileKey));
    const languages = [];
    if (profile.reference_language) languages.push(profile.reference_language);
    if (profile.l1 && profile.l1.language) languages.push(profile.l1.language);
    if (profile.l2 && profile.l2.language) languages.push(profile.l2.language);
    if (profile.l3 && profile.l3.language) languages.push(profile.l3.language);
    return languages.filter(Boolean);
  } catch (err) {
    console.warn('Failed to load user languages from profile:', err);
    return [];
  }
}

