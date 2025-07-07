import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Luminance Normalization Shader Pass
 * Automatically adjusts scene brightness to maintain consistent luminosity
 * as word count increases in the 3D visualization
 */

const LuminanceNormalizationShader = {
  name: 'LuminanceNormalizationShader',

  uniforms: {
    'tDiffuse': { value: null },
    'targetLuminance': { value: 0.5 }, // Target average luminance (0.0 - 1.0)
    'adaptationSpeed': { value: 0.02 }, // How quickly to adapt (0.01 = slow, 0.1 = fast)
    'minExposure': { value: 0.3 }, // Minimum exposure multiplier
    'maxExposure': { value: 4.0 }, // Maximum exposure multiplier (higher for few words)
    'currentExposure': { value: 1.0 }, // Current exposure level (internal)
    'wordCount': { value: 0.0 }, // Number of words in scene
    'normalizationThreshold': { value: 1000.0 }, // Start strong normalization above this word count
    'time': { value: 0.0 } // For temporal smoothing
  },

  vertexShader: `
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float targetLuminance;
    uniform float adaptationSpeed;
    uniform float minExposure;
    uniform float maxExposure;
    uniform float currentExposure;
    uniform float wordCount;
    uniform float normalizationThreshold;
    uniform float time;
    
    varying vec2 vUv;
    
    // Calculate luminance using standard weights
    float getLuminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }
    
    // Sample the scene at multiple points to estimate average luminance
    float calculateAverageLuminance(sampler2D tex, vec2 uv) {
      float totalLuminance = 0.0;
      int sampleCount = 0;
      
      // Sample in a grid pattern across the frame
      for (int x = 0; x < 8; x++) {
        for (int y = 0; y < 8; y++) {
          vec2 sampleUV = vec2(float(x) / 7.0, float(y) / 7.0);
          vec3 color = texture2D(tex, sampleUV).rgb;
          totalLuminance += getLuminance(color);
          sampleCount++;
        }
      }
      
      return totalLuminance / float(sampleCount);
    }
    
    // Calculate adaptive target luminance based on word count
    float getAdaptiveTargetLuminance(float words, float threshold) {
      // Below threshold: ALWAYS brighter than no shader (boost luminance significantly)
      // Above threshold: start gentle normalization only
      
      if (words < threshold) {
        // Few words: massive brightness boost - ensure always brighter than 1.0 baseline
        float boostFactor = 2.0 + (threshold - words) / threshold * 2.0; // 2x to 4x boost
        return targetLuminance * boostFactor;
      } else {
        // Many words: gentle reduction towards baseline (but still bright)
        float excessFactor = (words - threshold) / threshold;
        float reductionFactor = 1.0 - min(excessFactor * 0.4, 0.5); // Max 50% reduction, very gradual
        return targetLuminance * reductionFactor;
      }
    }
    
    // Calculate adaptive exposure limits based on word count
    vec2 getAdaptiveExposureLimits(float words, float threshold) {
      if (words < threshold) {
        // Few words: very high exposure limits - ensure always brighter than no shader
        float maxExp = maxExposure + (threshold - words) / threshold * 6.0; // Up to +6.0 max exposure
        return vec2(minExposure, maxExp);
      } else {
        // Many words: gradually reduce towards baseline, but keep minimum high
        float excessFactor = (words - threshold) / threshold;
        float maxExp = maxExposure * (1.0 - min(excessFactor * 0.3, 0.4)); // Max 40% reduction
        return vec2(minExposure, maxExp); // Keep strong minimum
      }
    }
    
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      
      // Calculate current scene average luminance
      float avgLuminance = calculateAverageLuminance(tDiffuse, vUv);
      avgLuminance = max(avgLuminance, 0.001);
      
      // Get adaptive parameters based on word count
      float adaptiveTarget = getAdaptiveTargetLuminance(wordCount, normalizationThreshold);
      vec2 exposureLimits = getAdaptiveExposureLimits(wordCount, normalizationThreshold);
      
      // Calculate desired exposure to reach adaptive target luminance
      float desiredExposure = adaptiveTarget / avgLuminance;
      
      // Clamp exposure within adaptive bounds
      desiredExposure = clamp(desiredExposure, exposureLimits.x, exposureLimits.y);
      
      // Apply smooth adaptation
      float exposure = mix(currentExposure, desiredExposure, adaptationSpeed);
      
      // Apply exposure adjustment
      vec3 adjustedColor = color * exposure;
      
      // Apply tone mapping - less aggressive for few words, more aggressive for many words
      float toneMappingStrength = min(wordCount / normalizationThreshold, 1.0);
      adjustedColor = mix(adjustedColor, adjustedColor / (1.0 + adjustedColor), toneMappingStrength);
      
      gl_FragColor = vec4(adjustedColor, 1.0);
    }
  `
};

export function createLuminanceNormalizationPass() {
  const pass = new ShaderPass(LuminanceNormalizationShader);
  
  // Configuration - shader should make scene BRIGHTER for low word counts
  pass.uniforms['targetLuminance'].value = 1.2; // Very bright baseline target  
  pass.uniforms['adaptationSpeed'].value = 0.05; // More responsive
  pass.uniforms['minExposure'].value = 1.5; // Always brighter than 1.0 (no shader)
  pass.uniforms['maxExposure'].value = 8.0; // Very high max for few words
  pass.uniforms['normalizationThreshold'].value = 2000.0; // Only start dimming at very high word count
  
  return pass;
}