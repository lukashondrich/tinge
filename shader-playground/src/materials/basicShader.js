import * as THREE from 'three';

export function createShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      u_time: { value: 0.0 },
    },
    vertexShader: `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float u_time;
      void main() {
        gl_FragColor = vec4(abs(sin(u_time)), 0.3, 0.6, 1.0);
      }
    `,
  });
}

