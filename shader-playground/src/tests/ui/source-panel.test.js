import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { SourcePanel } from '../../ui/sourcePanel.js';

const SOURCE_REGISTRY_STORAGE_KEY = 'tinge-source-registry-v1';

function createSource(overrides = {}) {
  return {
    title: 'Barcelona',
    url: 'https://en.wikipedia.org/wiki/Barcelona',
    source: 'Wikipedia',
    language: 'en',
    ...overrides
  };
}

describe('SourcePanel', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM(
      '<!doctype html><html><body></body></html>',
      { url: 'http://localhost' }
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;
    globalThis.sessionStorage = dom.window.sessionStorage;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    try {
      sessionStorage.clear();
    } catch (error) {
      // ignore
    }
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.navigator;
    delete globalThis.sessionStorage;
  });

  it('assigns stable contiguous display indexes across updates', () => {
    const panel = new SourcePanel({ maxVisible: 4 });
    const sourceA = createSource({
      title: 'Parque Güell',
      url: 'https://es.wikipedia.org/wiki/Parque_G%C3%BCell',
      language: 'es'
    });
    const sourceB = createSource({
      title: 'Sagrada Família',
      url: 'https://en.wikipedia.org/wiki/Sagrada_Fam%C3%ADlia'
    });
    const sourceC = createSource({
      title: 'Eixample',
      url: 'https://en.wikipedia.org/wiki/Eixample'
    });

    panel.updateFromSearchResults([sourceA]);
    expect(panel.getDisplayIndexForSource(sourceA)).toBe(1);

    panel.updateFromSearchResults([sourceA, sourceB]);
    expect(panel.getDisplayIndexForSource(sourceA)).toBe(1);
    expect(panel.getDisplayIndexForSource(sourceB)).toBe(2);

    panel.updateFromSearchResults([sourceC]);
    expect(panel.getDisplayIndexForSource(sourceC)).toBe(3);

    const labels = Array.from(panel.list.querySelectorAll('.source-panel-link'))
      .map((node) => node.textContent.trim());
    expect(labels[0].startsWith('1.')).toBe(true);
    expect(labels[1].startsWith('2.')).toBe(true);
    expect(labels[2].startsWith('3.')).toBe(true);
  });

  it('does not persist sources across reload by default', () => {
    sessionStorage.setItem(SOURCE_REGISTRY_STORAGE_KEY, JSON.stringify({
      entries: [
        {
          key: 'stale-key',
          value: { title: 'Stale', display_index: 9 }
        }
      ],
      nextDisplayIndex: 10
    }));

    const panel = new SourcePanel();
    expect(sessionStorage.getItem(SOURCE_REGISTRY_STORAGE_KEY)).toBeNull();
    expect(panel.sources).toHaveLength(0);
    expect(panel.getNextDisplayIndex()).toBe(1);

    const index = panel.getDisplayIndexForSource(createSource({ title: 'Fresh Source' }));
    expect(index).toBe(1);
  });
});
