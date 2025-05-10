import * as THREE from 'three';

export class ViscoElasticOptimizer {
  constructor(points, {
    learningRate = 1,
    viscosity = 0.1,
    springiness = 0.02,
    mass = 1,
    damping = 0.95,
    weights = {}
  }) {
    this.learningRate = learningRate;
    this.viscosity = viscosity;
    this.springiness = springiness;
    this.mass = mass;
    this.damping = damping;
    this.weights = {
      semanticAttraction: weights.semanticAttraction ?? 1,
      repulsion: weights.repulsion ?? 5,
      boundary: weights.boundary ?? 1
    };

    this.positions = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    this.original = this.positions.map(p => p.clone());
    this.velocities = this.positions.map(() => new THREE.Vector3());
  }

  step() {
    if (!this.stepCount) this.stepCount = 0;
    this.stepCount++;

    const grads = this.positions.map(() => new THREE.Vector3());

    // Semantic attraction
    for (let i = 0; i < this.positions.length; i++) {
      for (let j = i + 1; j < this.positions.length; j++) {
        const pi = this.positions[i];
        const pj = this.positions[j];
        const dir = new THREE.Vector3().subVectors(pi, pj);
        const dist = dir.length() + 0.0001;
        const delta = dist - this.original[i].distanceTo(this.original[j]);
        const force = dir.normalize().multiplyScalar(-delta * this.weights.semanticAttraction);
        grads[i].add(force);
        grads[j].sub(force);
      }
    }

    // Repulsion
    for (let i = 0; i < this.positions.length; i++) {
      for (let j = i + 1; j < this.positions.length; j++) {
        const pi = this.positions[i];
        const pj = this.positions[j];
        const dir = new THREE.Vector3().subVectors(pi, pj);
        const distSq = dir.lengthSq() + 0.0001;
        const strength = Math.min(this.weights.repulsion / distSq, 8.5);
        dir.normalize().multiplyScalar(strength);
        grads[i].add(dir);
        grads[j].sub(dir);
      }
    }

    // Boundary constraint
    for (let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      const radius = p.length();
      if (radius > 1) {
      p.normalize().multiplyScalar(1);
      }
    }

    // Viscosity (nonlinear drag)
    for (let i = 0; i < this.positions.length; i++) {
      const v = this.velocities[i];
      const speed = v.length();
      if (speed > 0) {
        const dragStrength = this.viscosity * Math.pow(speed, 1.5);
        const drag = v.clone().normalize().multiplyScalar(-dragStrength);
        grads[i].add(drag);
      }
    }

    // Elastic memory (pull back to original)
    for (let i = 0; i < this.positions.length; i++) {
      const current = this.positions[i];
      const home = this.original[i];
      const deviation = current.clone().sub(home);
      const elasticPull = deviation.multiplyScalar(-this.springiness);
      grads[i].add(elasticPull);
    }

    // Apply gradients
    for (let i = 0; i < this.positions.length; i++) {
      this.velocities[i].add(grads[i].clone().multiplyScalar(this.learningRate / this.mass));
      this.velocities[i].multiplyScalar(this.damping);
      this.positions[i].add(this.velocities[i]);
    }
  }
  addPoint(point) {
    const p = new THREE.Vector3(point.x, point.y, point.z);
    this.positions.push(p);
    this.original.push(p.clone());
    this.velocities.push(new THREE.Vector3());
  }
  
  getPositions() {
    return this.positions;
  }
}
