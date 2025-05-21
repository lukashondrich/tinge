// vite.config.js
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  /* optional: keeps Three.js sub-modules pre-bundled for faster dev reloads */
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/postprocessing/EffectComposer.js',
      'three/examples/jsm/postprocessing/RenderPass.js',
      'three/examples/jsm/postprocessing/ShaderPass.js',
      'three/examples/jsm/shaders/RGBShiftShader.js'
    ],
    esbuildOptions: { sourcemap: false }
  },
  server: {
    allowedHosts: true,
    host: true,
    port: 5173,
    proxy: {
      // REST: fetch('/token') → http://localhost:3000/token
      '/token': 'http://localhost:3000'
      // Remove the WebSocket proxy since we're using WebRTC, not WebSockets
    }
  },
});

