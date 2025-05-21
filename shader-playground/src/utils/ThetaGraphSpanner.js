/* ThetaGraphSpanner.js  –  isotropic cones + candidate cap */

import KDBush from 'kdbush';
import { Vector3 } from 'three';

export function thetaGraph(pts, { k = 1 } = {}) {

  /* grid resolution on the sphere */
  const nElev  = Math.max(1, Math.round(Math.sqrt(k)));   // rows
  const nAzim  = nElev;                                   // cols
  const buckets = nElev * nAzim;

  const maxCandidates = k * 1;    // tweak: how many nearest points to test
  const edges = [];

  /* KD-tree (x,y only) */
  const kd = new KDBush(pts.length, 16, Float32Array);
  pts.forEach(p => kd.add(p.x, p.y));
  kd.finish();

  const tmp = new Vector3();

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];

    /* grab a generous but bounded candidate set */
    const ids = kd.within(p.x, p.y, 1e9)             // all ids
                  .filter(j => j !== i)              // skip self
                  .sort((a, b) =>
                    pts[a].distanceToSquared(p) - pts[b].distanceToSquared(p))
                  .slice(0, maxCandidates);          // cap size

    /* one best neighbour per bucket */
    const best = new Array(buckets).fill(null);

    for (const j of ids) {
      const q = pts[j];
      tmp.subVectors(q, p);
      const dist = tmp.length();

      const MAX_LEN = 0.8 * 1;      // tweak this factor
      if (dist > MAX_LEN) continue;     // ← skip very long edges
    
      const dir  = tmp.divideScalar(dist);           // unit vector
      /* spherical coords */
      const elev = Math.asin(dir.z);                 // −π/2 … π/2
      const azim = Math.atan2(dir.y, dir.x);         // −π … π

      /* map to grid slot */
      const elevSlot = Math.floor((elev + Math.PI/2)  / Math.PI    * nElev);
      const azimSlot = Math.floor((azim + Math.PI)    / (2*Math.PI) * nAzim);
      const slot     = elevSlot * nAzim + azimSlot;

      const b = best[slot];
      if (!b || dist < b.dist) best[slot] = { j, dist };


    }

    best.forEach(b => b && edges.push([i, b.j]));
  }

  return edges;
}
