import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'audio-tests',
    environment: 'jsdom',
    setupFiles: ['./src/tests/audio/setup.js'],
    include: ['src/tests/audio/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    globals: true,
    coverage: {
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/audio',
      include: [
        'src/audio/**/*.js',
        'src/ui/dialoguePanel.js',
        'src/core/storageService.js',
        'src/main.js'
      ],
      exclude: [
        'src/tests/**',
        'node_modules/**',
        'dist/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    testTimeout: 10000,
    reporters: ['verbose', 'junit'],
    outputFile: './test-results/audio-tests.xml'
  }
});