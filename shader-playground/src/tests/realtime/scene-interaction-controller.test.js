// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createSceneInteractionController } from '../../realtime/sceneInteractionController.js';

describe('createSceneInteractionController', () => {
  function createRaycasterWithHits(hits) {
    return {
      setFromCamera: vi.fn(),
      intersectObject: vi.fn(() => hits)
    };
  }

  it('shows tooltip for hovered labeled instance', () => {
    const domElement = document.createElement('canvas');
    document.body.appendChild(domElement);
    const raycaster = createRaycasterWithHits([{ instanceId: 1 }]);

    const controller = createSceneInteractionController({
      domElement,
      camera: { id: 'camera' },
      mesh: { id: 'mesh' },
      labels: ['zero', 'hola'],
      createRaycaster: () => raycaster,
      createVector2: () => ({ x: 0, y: 0 })
    });

    domElement.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 50 }));

    expect(raycaster.setFromCamera).toHaveBeenCalledTimes(1);
    expect(controller.tooltip.textContent).toBe('hola');
    expect(controller.tooltip.style.display).toBe('block');
    expect(controller.tooltip.style.left).toBe('108px');
    expect(controller.tooltip.style.top).toBe('58px');
    controller.dispose();
  });

  it('hides tooltip when no labeled hit is found', () => {
    const domElement = document.createElement('canvas');
    document.body.appendChild(domElement);
    const raycaster = createRaycasterWithHits([]);

    const controller = createSceneInteractionController({
      domElement,
      camera: {},
      mesh: {},
      labels: [],
      createRaycaster: () => raycaster,
      createVector2: () => ({ x: 0, y: 0 })
    });

    controller.tooltip.style.display = 'block';
    domElement.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 2 }));
    expect(controller.tooltip.style.display).toBe('none');
    controller.dispose();
  });

  it('removes tooltip and listeners on dispose', () => {
    const domElement = document.createElement('canvas');
    document.body.appendChild(domElement);
    const raycaster = createRaycasterWithHits([{ instanceId: 0 }]);

    const controller = createSceneInteractionController({
      domElement,
      camera: {},
      mesh: {},
      labels: ['label'],
      createRaycaster: () => raycaster,
      createVector2: () => ({ x: 0, y: 0 })
    });

    controller.dispose();
    expect(document.getElementById('wordTooltip')).toBeNull();
    domElement.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
    expect(raycaster.setFromCamera).not.toHaveBeenCalled();
  });
});
