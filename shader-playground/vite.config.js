// vite.config.js
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig(({ mode }) => {
  return {
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
    define: {
      // Make environment variables available to the frontend
      __API_URL__: JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3000'),
      __EMBEDDING_URL__: JSON.stringify(process.env.VITE_EMBEDDING_URL || 'http://localhost:3001'),
    },
    server: {
      allowedHosts: true,
      host: true,
      port: 5173,
      // Only use proxy in development mode
      ...(mode === 'development' && {
        proxy: {
          // REST: fetch('/token') → http://localhost:3000/token
          '/token': process.env.VITE_API_URL || 'http://localhost:3000',
          '/transcribe': process.env.VITE_API_URL || 'http://localhost:3000',
          '/embed-word': process.env.VITE_EMBEDDING_URL || 'http://localhost:3001'
          // Note: /profiles removed - now using localStorage instead of backend
          // Remove the WebSocket proxy since we're using WebRTC, not WebSockets
        }
      })
    },
  };
});

