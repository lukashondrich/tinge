/*  scene.js  ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial        } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2       } from 'three/examples/jsm/lines/LineSegments2.js';

import { thetaGraph }      from '../utils/ThetaGraphSpanner.js';
import { createOptimizer } from '../utils/ViscoElasticOptimizer.js';

/* ─── tunables ──────────────────────────────────────────────── */
export const SCALE           = 4;      // central scale for embedding cloud
const BASE_LINE_WIDTH        = 0.6;
const MAX_LINE_WIDTH         = 0.9;
const GLOW_BOOST             = 3.5;    // filament glow strength

/* ─── module-scope state ───────────────────────────────────── */
const edgeUsage = new Map();           // "i_j" → count
let   lineMesh  = null;                // LineSegments2 instance

/* ───────────────────────────────────────────────────────────── */
export async function createScene() {

  /* Scene, camera, controls */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x112233);
  scene.fog        = new THREE.Fog(0x223344, 10, 50);

  const camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
  );
  camera.position.z = 4;

  const controls = new OrbitControls(camera, document.body);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.update();

  /* ── load & centre embedding --- */
  const raw = await fetch('/embedding.json').then(r => r.json());
  raw.forEach(p => { p.x *= SCALE; p.y *= SCALE; p.z *= SCALE; });

  const center = raw.reduce(
    (acc,p)=>acc.add(new THREE.Vector3(p.x,p.y,p.z)),
    new THREE.Vector3()
  ).divideScalar(raw.length);

  raw.forEach(p => { p.x -= center.x; p.y -= center.y; p.z -= center.z; });

  /* ── optimizer --- */
  const optimizer = createOptimizer(raw, {
    learningRate : 0.005,
    viscosity    : 0.1,
    springiness  : 0.01,
    damping      : 0.1,
    mass         : 6,
    weights : { semanticAttraction:10.9, repulsion:20.9, boundary:3e4 }
  });

  /* ── instanced point mesh --- */
  const numPoints = raw.length;
  const sphereGeom = new THREE.SphereGeometry(0.3,12,12);
  const sphereMat  = new THREE.MeshStandardMaterial({
    color:0xffffff, emissive:0x223344, emissiveIntensity:0.5,
    roughness:0.5,  metalness:0.1
  });
  let mesh  = new THREE.InstancedMesh(sphereGeom,sphereMat,numPoints+100);
  const dummy = new THREE.Object3D();
  const positions = optimizer.getPositions();

  for (let i=0; i<numPoints; i++){
    dummy.position.copy(positions[i]);
    const dist = camera.position.distanceTo(positions[i]);
    dummy.scale.setScalar(0.03/(1+dist*0.3));
    dummy.updateMatrix();
    mesh.setMatrixAt(i,dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = numPoints;
  scene.add(mesh);

  /* ── gel shell --- */
  const gel = new THREE.Mesh(
    new THREE.SphereGeometry(1.3,64,64),
    new THREE.MeshPhysicalMaterial({
      color:0xff6677, transmission:0.25, opacity:0.45, transparent:true,
      roughness:0.4, metalness:0.05, thickness:5,
      clearcoat:0.8, clearcoatRoughness:0.2,
      sheen:1, sheenColor:new THREE.Color(0xffcccc)
    })
  );
  gel.material.depthWrite = false;
  scene.add(gel);

  const lineGeom = new LineSegmentsGeometry();
  const lineMat  = new LineMaterial({
    color: 0x88bbff,
    linewidth: 0.8,                       // visible thickness
    transparent: false,
    opacity: 0.6,
    dashed: false,
    resolution: new THREE.Vector2()        // we fill it next line
  });
  lineMat.resolution.set(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () =>
    lineMat.resolution.set(window.innerWidth, window.innerHeight));
  
  const lineMesh = new LineSegments2(lineGeom, lineMat);
  scene.add(lineMesh);
  

  /* lights */
  scene.add(new THREE.AmbientLight(0xffffff,0.5));
  const dir = new THREE.DirectionalLight(0xffffff,0.6); dir.position.set(2,2,5); scene.add(dir);
  const pt  = new THREE.PointLight(0xffffff,1.2,15,2);  pt.position.set(0,0,5); scene.add(pt);

  /* recently-added map for glow pulses (used by main.js) */
  const recentlyAdded = new Map();

  /* === helper to rebuild the geometry =================================== */
  function updateLineSegments() {
    //console.info('[Θ] rebuild', performance.now().toFixed(0));
    const pts   = optimizer.getPositions();
    const edges = thetaGraph(pts, { k: 8}); 

    const verts = [];
    edges.forEach(([a, b]) => {
      const pa = pts[a], pb = pts[b];
      verts.push(
         pa.x, pa.y, pa.z,
         pb.x, pb.y, pb.z
      );
    });

    //console.info('segments built', edges.length);   // should be > 0

    lineMesh.geometry.dispose();

    const g = new LineSegmentsGeometry();
    g.setPositions(new Float32Array(verts));         // MUST be typed array
    lineMesh.geometry = g;
  }
  updateLineSegments();  
  /* ─── public API for main.js ─────────────────────────────── */
  return {
    scene,
    camera,
    controls,
    mesh,
    optimizer,
    dummy,
    numPoints,
    lineSegments : lineMesh,
    recentlyAdded,
    updateLineSegments
  };
}
