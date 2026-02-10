// vite.config.js
import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';
import glsl from 'vite-plugin-glsl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Log environment variables during build for debugging
  console.log('🔧 Vite build mode:', mode);
  console.log('🔧 VITE_API_URL:', env.VITE_API_URL);
  console.log('🔧 NODE_ENV:', env.NODE_ENV || process.env.NODE_ENV);
  console.log('🔧 Build timestamp:', new Date().toISOString());
  
  // Ensure we have the correct API URL for production
  const API_URL = env.VITE_API_URL || 
                  (mode === 'production' ? 'https://tingebackend-production.up.railway.app' : 'http://localhost:3000');
  const EMBEDDING_URL = env.VITE_EMBEDDING_URL || 'http://localhost:3001';
  
  console.log('🔧 Final API_URL:', API_URL);
  console.log('🔧 Final EMBEDDING_URL:', EMBEDDING_URL);
  
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
      // Make environment variables available to the frontend with fallback
      __API_URL__: JSON.stringify(API_URL),
      __EMBEDDING_URL__: JSON.stringify(EMBEDDING_URL),
    },
    server: {
      allowedHosts: true,
      host: true,
      port: 5173,
      // Only use proxy in development mode
      ...(mode === 'development' && {
        proxy: {
          // REST: fetch('/token') → http://localhost:3000/token
          '/token': API_URL,
          '/transcribe': API_URL,
          '/token-usage': API_URL,
          '/token-stats': API_URL,
          '/knowledge/search': API_URL,
          '/embed-word': EMBEDDING_URL
          // Note: /profiles removed - now using localStorage instead of backend
          // Remove the WebSocket proxy since we're using WebRTC, not WebSockets
        }
      })
    },
  };
});
