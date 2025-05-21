// main.js  ── drop-in after adding ThetaGraphSpanner + scene changes
import { initOpenAIRealtime } from "./openaiRealtime";

import * as THREE from "three";
import {
  EffectComposer,
} from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { createRGBShiftPass } from "./effects/rgbShiftPass.js";
import { createRenderer } from "./core/renderer.js";
import { createScene } from "./core/scene.js";
import { setupTouchRotation } from "./utils/touchInput.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SCALE } from "./core/scene.js";


const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));

console.log("🚀 main.js loaded");

// ────────────────────────────────────────────────────────────
// global “only-once” guard
if (window.__ANIMATING__) {
  console.warn("🔥 animate() already running — skipping");
  throw new Error("animate() already running");
}
window.__ANIMATING__ = true;



const EDGE_INTERVAL = 500;   // ms – rebuild cadence
let   lastEdgeTime  = 0;     // timestamp of last rebuild

let updateLineSegments;
// ────────────────────────────────────────────────────────────
// scene boot
createScene().then(
  ({
    scene,
    camera,
    mesh,
    optimizer,
    dummy,
    numPoints,
    lineSegments,     // still returned, but no longer edited in-loop
    controls,
    recentlyAdded,
    updateLineSegments: _uls,   // NEW ← helper exported from scene.js
  }) => {
    updateLineSegments = _uls;          // expose to scheduler
    console.log("📊 Scene created");

    const renderer = createRenderer();

    //──────────────── OpenAI Realtime
    console.log("🔄 Initializing OpenAI Realtime…");
    initOpenAIRealtime(
      (remoteStream) => {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.autoplay = false;
        audio
          .play()
          .catch((err) => console.error("Audio play error:", err));
      },
      (event) => {
        if (
          event.type === "response.audio_transcript.delta" &&
          typeof event.delta === "string"
        ) {
          console.log("📝 interim:", event.delta);
          addWord(event.delta)
        }
      }
    ).catch((err) => console.error("⚠️ Realtime init error:", err));

    //─────────────  post-FX
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,
      0.9,
      0.7
    );
    composer.addPass(bloomPass);

    const rgbShiftPass = createRGBShiftPass();
    composer.addPass(rgbShiftPass);

    const getSpeed = setupTouchRotation(mesh);

    //──────────────── mock data (unchanged)
    const mockWords = [
      "banana",
      "is",
      "a",
      "fruit",
      "that",
      "grows",
      "in",
      "clusters",
    ];
    let mockIndex = 0;
    setInterval(() => {
      if (mockIndex < mockWords.length) addWord(mockWords[mockIndex++]);
    }, 800);

    //──────────────── addWord → point + rebuild trigger
    function addWord(word) {
      const newPoint = { x: 0, y: 0, z: 0 };   // ⇦ centre of the scene
      optimizer.addPoint(newPoint);
    
      const id = optimizer.getPositions().length - 1;
      recentlyAdded.set(id, performance.now());   // for glow pulse
    
      showWordLabel(word);      // your existing UI helper
      console.log('[addWord] positions length →', optimizer.getPositions().length);
      lastEdgeTime = 0;         // forces a rebuild ≤ 500 ms later
    }
    
    function ensureMeshCapacity(min) {
      if (mesh.instanceMatrix.count >= min) return;
      const newCap = Math.ceil(min * 1.5);
      const bigger = new THREE.InstancedMesh(mesh.geometry, mesh.material, newCap);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, dummy.matrix);
        bigger.setMatrixAt(i, dummy.matrix);
      }
      scene.remove(mesh);
      mesh.dispose?.();
      mesh = bigger;             // ← refresh the outer variable
      scene.add(mesh);
    }

    function showWordLabel(word) {
      const label = document.createElement("div");
      label.innerText = word;
      label.style.cssText = `
        position:absolute; left:50px; top:100px;
        color:#222; font:34px monospace; opacity:1; transition:opacity 2s`;
      document.body.appendChild(label);
      setTimeout(() => (label.style.opacity = "0"), 50);
      setTimeout(() => label.remove(), 2050);
    }

    //──────────────────────────────── animate loop
    function animate(t) {
      requestAnimationFrame(animate);

      optimizer.step();                        // physics



      const updatedPositions = optimizer.getPositions();
      const now   = performance.now();

      ensureMeshCapacity(updatedPositions.length); 

      const scale = SCALE;

      if (now - lastEdgeTime >= EDGE_INTERVAL) {
        updateLineSegments();                   // rebuild lines right now
        lastEdgeTime = now;
      }

      // update instanced points (unchanged)
      for (let i = 0; i < updatedPositions.length; i++) {
        const pos = updatedPositions[i].clone();//.multiplyScalar(scale);
        dummy.position.copy(pos);

        let pointScale =
          0.03 /
          (1 + camera.position.distanceTo(pos) * 0.3); // size vs distance

        // glow pulse for new points
        if (recentlyAdded.has(i)) {
          const age = (now - recentlyAdded.get(i)) / 1000;
          if (age < 20) pointScale *= 1 + Math.sin(age * Math.PI) * 4;
          else recentlyAdded.delete(i);
        }

        dummy.scale.setScalar(pointScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = updatedPositions.length;


      controls.update();
      const { speed } = getSpeed();
      camera.lookAt(0, 0, 0);
      rgbShiftPass.uniforms["amount"].value = speed > 0.1 ? speed * 0.002 : 0.0;
      composer.render();
    }
    animate();

    // cleanup on unload
    window.addEventListener("beforeunload", () => {
      renderer.dispose?.();
    });
  }
);
