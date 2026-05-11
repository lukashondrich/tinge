import * as THREE from 'three';

export function createSceneInteractionController({
  domElement,
  camera,
  mesh,
  labels,
  documentRef = document,
  windowRef = window,
  createRaycaster = () => new THREE.Raycaster(),
  createVector2 = () => new THREE.Vector2()
}) {
  const tooltip = documentRef.createElement('div');
  tooltip.id = 'wordTooltip';
  Object.assign(tooltip.style, {
    position: 'absolute',
    pointerEvents: 'none',
    padding: '2px 6px',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: '12px',
    borderRadius: '4px',
    display: 'none',
    zIndex: 1000
  });
  documentRef.body.appendChild(tooltip);

  const raycaster = createRaycaster();
  const mouse = createVector2();

  const onPointerMove = (event) => {
    mouse.x = (event.clientX / windowRef.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / windowRef.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(mesh);
    if (hits.length > 0 && hits[0].instanceId != null) {
      const label = labels[hits[0].instanceId];
      if (label) {
        tooltip.textContent = label;
        tooltip.style.left = event.clientX + 8 + 'px';
        tooltip.style.top = event.clientY + 8 + 'px';
        tooltip.style.display = 'block';
        return;
      }
    }
    tooltip.style.display = 'none';
  };

  const onMouseLeave = () => {
    tooltip.style.display = 'none';
  };

  domElement.addEventListener('mousemove', onPointerMove);
  domElement.addEventListener('mouseleave', onMouseLeave);

  return {
    tooltip,
    dispose() {
      domElement.removeEventListener('mousemove', onPointerMove);
      domElement.removeEventListener('mouseleave', onMouseLeave);
      tooltip.remove();
    }
  };
}
