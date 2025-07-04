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
    'minExposure': { value: 0.1 }, // Minimum exposure multiplier
    'maxExposure': { value: 3.0 }, // Maximum exposure multiplier
    'currentExposure': { value: 1.0 }, // Current exposure level (internal)
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
    
    // Smooth exposure adjustment using exponential smoothing
    float updateExposure(float currentExp, float targetExp, float speed) {
      return mix(currentExp, targetExp, speed);
    }
    
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      
      // Calculate current scene average luminance
      float avgLuminance = calculateAverageLuminance(tDiffuse, vUv);
      
      // Avoid division by zero
      avgLuminance = max(avgLuminance, 0.001);
      
      // Calculate desired exposure to reach target luminance
      float desiredExposure = targetLuminance / avgLuminance;
      
      // Clamp exposure within reasonable bounds
      desiredExposure = clamp(desiredExposure, minExposure, maxExposure);
      
      // Apply smooth adaptation (would be better with feedback from previous frame)
      float exposure = mix(currentExposure, desiredExposure, adaptationSpeed);
      
      // Apply exposure adjustment
      vec3 adjustedColor = color * exposure;
      
      // Optional: Apply slight tone mapping to prevent over-saturation
      // Simple Reinhard tone mapping
      adjustedColor = adjustedColor / (1.0 + adjustedColor);
      
      gl_FragColor = vec4(adjustedColor, 1.0);
    }
  `
};

export function createLuminanceNormalizationPass() {
  const pass = new ShaderPass(LuminanceNormalizationShader);
  
  // Configuration for word cloud visualization
  pass.uniforms['targetLuminance'].value = 0.4; // Slightly darker for better contrast
  pass.uniforms['adaptationSpeed'].value = 0.03; // Smooth but responsive
  pass.uniforms['minExposure'].value = 0.2; // Prevent scene from becoming too dark
  pass.uniforms['maxExposure'].value = 2.5; // Prevent over-brightening
  
  return pass;
}