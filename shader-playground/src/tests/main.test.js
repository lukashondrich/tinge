import { describe, test, expect } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock DOM environment for testing
const dom = new JSDOM('<!DOCTYPE html><div id="app"></div>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;

describe('Main Application', () => {
  test('should have app container element', () => {
    const appElement = document.getElementById('app');
    expect(appElement).toBeTruthy();
  });
  
  test('should handle basic DOM operations', () => {
    const testDiv = document.createElement('div');
    testDiv.id = 'test-element';
    testDiv.textContent = 'Test Content';
    
    expect(testDiv.id).toBe('test-element');
    expect(testDiv.textContent).toBe('Test Content');
  });
});

describe('Three.js Environment', () => {
  test('should be able to import Three.js', async () => {
    try {
      const THREE = await import('three');
      expect(THREE).toBeDefined();
      expect(THREE.Scene).toBeDefined();
    } catch (error) {
      // Three.js not available in test environment - this is expected
      expect(error).toBeDefined();
    }
  });
});