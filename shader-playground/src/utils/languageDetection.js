/**
 * Language Detection Utility
 * 
 * Handles word-level language detection with caching for performance
 */

import { vocabularyStorage } from './vocabularyStorage.js';

// Get API URL from environment or default to localhost
const __API_URL__ = window.__API_URL__ || 'http://localhost:3000';

/**
 * Detect language for a word with caching
 * @param {string} word - The word to detect language for
 * @returns {Promise<Object>} Language detection result {detected, confidence, source}
 */
export async function detectLanguageWithCache(word) {
  const key = word.trim().toLowerCase();
  
  // Check cache first
  const cached = vocabularyStorage.getCachedLanguageDetection(key);
  if (cached) {
    console.log(`🗂️ Using cached language detection for: ${word} -> ${cached.detected}`);
    return {
      detected: cached.detected,
      confidence: cached.confidence,
      source: cached.source + '-cached'
    };
  }
  
  // Make API call for language detection
  try {
    console.log(`🌐 Detecting language for word: ${word}`);
    const res = await fetch(`${__API_URL__}/detect-language?text=${encodeURIComponent(word)}`);
    
    if (res.ok) {
      const languageData = await res.json();
      console.log(`🌐 Language detected for "${word}":`, languageData);
      
      // Cache the result
      vocabularyStorage.cacheLanguageDetection(word, languageData);
      
      return languageData;
    } else {
      console.warn('Language detection service unavailable, using fallback');
      const fallback = {
        detected: 'en',
        confidence: 0.5,
        source: 'fallback-http-error'
      };
      
      // Cache fallback result too (with lower confidence)
      vocabularyStorage.cacheLanguageDetection(word, fallback);
      
      return fallback;
    }
  } catch (err) {
    console.warn('Language detection service error, using fallback:', err.message);
    const fallback = {
      detected: 'en',
      confidence: 0.3,
      source: 'fallback-network-error'
    };
    
    // Cache fallback result
    vocabularyStorage.cacheLanguageDetection(word, fallback);
    
    return fallback;
  }
}

/**
 * Batch detect languages for multiple words (useful for optimizing API calls)
 * @param {Array<string>} words - Array of words to detect languages for
 * @returns {Promise<Map<string, Object>>} Map of word -> language detection result
 */
export async function batchDetectLanguages(words) {
  const results = new Map();
  const uncachedWords = [];
  
  // Check cache for all words first
  for (const word of words) {
    const cached = vocabularyStorage.getCachedLanguageDetection(word);
    if (cached) {
      results.set(word, {
        detected: cached.detected,
        confidence: cached.confidence,
        source: cached.source + '-cached'
      });
    } else {
      uncachedWords.push(word);
    }
  }
  
  // Detect languages for uncached words
  const detectionPromises = uncachedWords.map(word => 
    detectLanguageWithCache(word).then(result => [word, result])
  );
  
  const detectionResults = await Promise.all(detectionPromises);
  
  // Add uncached results to the map
  for (const [word, result] of detectionResults) {
    results.set(word, result);
  }
  
  console.log(`🌐 Batch language detection completed: ${results.size} words, ${uncachedWords.length} API calls`);
  
  return results;
}