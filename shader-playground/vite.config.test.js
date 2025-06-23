import { defineConfig } from 'vitest/config';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  test: {
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.config.js',
        'dist/'
      ]
    }
  }
});