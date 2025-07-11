import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// VHS CRT TV Shader for retro 80s aesthetic
const VHSCRTShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    scanlineIntensity: { value: 0.3 },
    noiseIntensity: { value: 0.1 },
    distortion: { value: 0.02 },
    colorBleeding: { value: 0.15 },
    brightness: { value: 1.1 },
    contrast: { value: 1.2 },
    saturation: { value: 1.3 },
    vignetteIntensity: { value: 0.8 },
    chromaShift: { value: 0.003 },
    scanlineCount: { value: 800.0 },
    rollSpeed: { value: 0.02 }
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
    uniform float time;
    uniform float scanlineIntensity;
    uniform float noiseIntensity;
    uniform float distortion;
    uniform float colorBleeding;
    uniform float brightness;
    uniform float contrast;
    uniform float saturation;
    uniform float vignetteIntensity;
    uniform float chromaShift;
    uniform float scanlineCount;
    uniform float rollSpeed;
    
    varying vec2 vUv;
    
    // Random noise function
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    
    // VHS noise
    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    
    // CRT barrel distortion
    vec2 barrelDistortion(vec2 coord) {
      vec2 cc = coord - 0.5;
      float dist = dot(cc, cc);
      return coord + cc * (dist + distortion * dist * dist) * distortion;
    }
    
    void main() {
      vec2 uv = vUv;
      
      // Apply barrel distortion
      uv = barrelDistortion(uv);
      
      // Add vertical roll effect
      float roll = sin(time * rollSpeed + uv.y * 20.0) * 0.002;
      uv.x += roll;
      
      // Chromatic aberration / color bleeding
      float r = texture2D(tDiffuse, uv + vec2(chromaShift, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(chromaShift, 0.0)).b;
      
      vec3 color = vec3(r, g, b);
      
      // Add color bleeding effect
      vec3 bleed = texture2D(tDiffuse, uv + vec2(colorBleeding * sin(time * 0.5), 0.0)).rgb;
      color = mix(color, bleed, 0.1);
      
      // Scanlines
      float scanline = sin(uv.y * scanlineCount) * 0.5 + 0.5;
      scanline = pow(scanline, 2.0);
      color *= 1.0 - scanlineIntensity + scanlineIntensity * scanline;
      
      // VHS noise
      float noiseValue = noise(uv * 100.0 + time * 5.0);
      color += noiseValue * noiseIntensity;
      
      // Static noise bands (VHS tracking issues)
      float band = step(0.99, sin(uv.y * 10.0 + time * 2.0));
      color *= 1.0 - band * 0.3;
      
      // Brightness and contrast
      color = (color - 0.5) * contrast + 0.5;
      color *= brightness;
      
      // Saturation
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(gray), color, saturation);
      
      // Vignette effect
      vec2 vignetteUv = uv * (1.0 - uv.yx);
      float vignette = vignetteUv.x * vignetteUv.y * 15.0;
      vignette = pow(vignette, vignetteIntensity);
      color *= vignette;
      
      // Add some retro color tinting (slight magenta/cyan)
      color.r *= 1.05;
      color.b *= 1.02;
      
      // Random horizontal interference lines
      float interference = step(0.98, sin(uv.y * 1000.0 + time * 50.0));
      color *= 1.0 - interference * 0.4;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

export function createVHSCRTPass() {
  const pass = new ShaderPass(VHSCRTShader);
  
  // Set default values for very subtle retro look - reduced by ~50%
  pass.uniforms.scanlineIntensity.value = 0.04;
  pass.uniforms.noiseIntensity.value = 0.01;
  pass.uniforms.distortion.value = 0.0025;
  pass.uniforms.colorBleeding.value = 0.02;
  pass.uniforms.brightness.value = 1.01;
  pass.uniforms.contrast.value = 1.025;
  pass.uniforms.saturation.value = 1.04;
  pass.uniforms.vignetteIntensity.value = 0.975;
  pass.uniforms.chromaShift.value = 0.0005;
  pass.uniforms.scanlineCount.value = 400.0;
  pass.uniforms.rollSpeed.value = 0.0025;
  
  return pass;
}

export { VHSCRTShader };