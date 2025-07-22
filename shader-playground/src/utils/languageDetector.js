import FastText from 'fasttext.js';

let modelPromise;
const MODEL_PATH = '/models/lid.176.ftz';

/**
 * Lazily load the fastText language identification model.
 * The model file `lid.176.ftz` must be placed inside `shader-playground/public/models`.
 * @returns {Promise<Object>} Loaded fastText model
 */
async function loadModel() {
  if (!modelPromise) {
    const ft = new FastText();
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
    if (!model) return 'unknown';
    const predictions = await model.predict(word, 1);
    if (!predictions || !predictions.length) return 'unknown';
    let lang = predictions[0].label.replace(/^__label__/, '').toLowerCase();
    if (candidateLanguages.length) {
      const allowed = candidateLanguages.map(l => l.toLowerCase());
      if (!allowed.includes(lang)) {
        return 'unknown';
      }
    }
    return lang;
  } catch (err) {
    console.warn('Language detection failed:', err);
    return 'unknown';
  }
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

