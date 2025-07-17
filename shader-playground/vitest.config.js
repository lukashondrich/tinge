import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'src/tests/**/*.test.js',
      'tests/integration/**/*.test.js'
    ],
    exclude: [
      'node_modules',
      'dist',
      'tests/e2e/**/*.spec.js',  // Exclude Playwright tests
      'tests/e2e/**/*.test.js'   // Exclude Playwright tests
    ],
    testTimeout: 10000,
    reporters: ['verbose']
  }
});