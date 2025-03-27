import * as THREE from 'three';

export class Optimizer {
  constructor(points, { learningRate = 1, weights = {} }) {
    this.learningRate = learningRate;
    this.weights = {
      semanticAttraction: weights.semanticAttraction ?? 10,
      repulsion: weights.repulsion ?? 50,
      boundary: weights.boundary ?? 10
    };

    this.positions = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    this.original = this.positions.map(p => p.clone()); // ✅ deep copy
    this.velocities = this.positions.map(() => new THREE.Vector3());
  }

  step() {
    if (!this.stepCount) this.stepCount = 0;
      this.stepCount++;
      //console.log('🧠 Optimizer step', this.stepCount);

    const grads = this.positions.map(() => new THREE.Vector3());
    const mass = 4.4; // you can vary this per node later
    const damping = 0.7; // friction/drag

    // Semantic attraction
    for (let i = 0; i < this.positions.length; i++) {
      for (let j = i + 1; j < this.positions.length; j++) {


        
        const pi = this.positions[i];
        const pj = this.positions[j];
        const dir = new THREE.Vector3().subVectors(pi, pj);
        
        const dist = dir.length() + 0.0001; 
        const delta = dist - this.original[i].distanceTo(this.original[j]);
        const force = dir.normalize().multiplyScalar(-delta * this.weights.semanticAttraction);

        if (this.stepCount % 300 === 0 && i === 0 && j === 1) {
          const dist = pi.distanceTo(pj);
          const originalDist = this.original[i].distanceTo(this.original[j]);
          const delta = dist - originalDist;
          const force = dir.clone().normalize().multiplyScalar(-delta * this.weights.semanticAttraction);
        
          console.log(`🧠 Step ${this.stepCount}`);
          console.log('🔍 dist:', dist.toFixed(4));
          console.log('🔍 originalDist:', originalDist.toFixed(4));
          console.log('🔍 delta:', delta.toFixed(4));
          console.log('💥 force length:', force.length().toFixed(4));
        }
    
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

        const strength = Math.min(this.weights.repulsion / distSq, 1.5);
        dir.normalize().multiplyScalar(strength);

        grads[i].add(dir);
        grads[j].sub(dir);
      }
    }

    // Boundary constraint
    for (let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      const radius = p.length();
      if (radius > 2) {
        const pull = p.clone().normalize().multiplyScalar((radius - 2) * this.weights.boundary);
        grads[i].sub(pull);
      }
    }

    // Apply gradients
    for (let i = 0; i < this.positions.length; i++) {
      // Apply acceleration = force / mass
      this.velocities[i].add(grads[i].clone().multiplyScalar(this.learningRate / mass));
      if (i === 0 && this.stepCount % 300 === 0) {
        console.log('🌀 grad[0]:', grads[i].toArray());
        console.log('🌀 vel[0]:', this.velocities[i].toArray());
      }
      // Apply damping
      this.velocities[i].multiplyScalar(damping);

      // Update position
      this.positions[i].add(this.velocities[i]);
    }
  }

  getPositions() {
    return this.positions;
  }
}
