import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

// Patch for Three.js example modules
export default defineConfig({
  plugins: [glsl()],
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/postprocessing/EffectComposer.js',
      'three/examples/jsm/postprocessing/RenderPass.js',
      'three/examples/jsm/postprocessing/ShaderPass.js',
      'three/examples/jsm/shaders/RGBShiftShader.js'
    ]
  }
});


  