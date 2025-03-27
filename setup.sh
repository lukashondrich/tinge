#!/bin/bash
set -e

# Create root project folder
mkdir -p shader-playground
cd shader-playground

# Init Vite project
npm create vite@latest . -- --template vanilla
npm install three

# Folder structure
mkdir -p public
mkdir -p src/{core,effects,materials,utils}

# index.html
cat > index.html <<EOF
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Shader Playground</title>
    <style>
      body { margin: 0; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
EOF

# src/main.js
cat > src/main.js <<EOF
import { createRenderer } from './core/renderer.js';
import { createScene } from './core/scene.js';

const { scene, camera, mesh } = createScene();
const renderer = createRenderer();

function animate(t) {
  requestAnimationFrame(animate);
  mesh.material.uniforms.u_time.value = t * 0.001;
  renderer.render(scene, camera);
}
animate();
EOF

# src/core/renderer.js
cat > src/core/renderer.js <<EOF
import * as THREE from 'three';

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return renderer;
}
EOF

# src/core/scene.js
cat > src/core/scene.js <<EOF
import * as THREE from 'three';
import { createShaderMaterial } from '../materials/basicShader.js';

export function createScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.z = 1;

  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = createShaderMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  return { scene, camera, mesh };
}
EOF

# run.sh to launch with --host
cat > run.sh <<'EOF'
#!/bin/bash
npm run dev -- --host
EOF
chmod +x run.sh