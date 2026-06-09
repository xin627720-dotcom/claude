// ----------------------------------------------------------------------------
//  main.js — scene assembly, the gesture→physics mapping, and UI wiring.
// ----------------------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createSaturn } from './saturn-system.js';
import { createStarfield, createBackdrop } from './starfield.js';
import { HandTracker } from './hand-tracker.js';

// ---- tunable response curve ------------------------------------------------
const SCALE_MIN   = 0.5;   // closed fist  -> compact, distant Saturn
const SCALE_MAX   = 3.1;   // open hand    -> blown up toward the camera
const BRIGHT_MIN  = 0.16;  // dim when small (a low lamp)
const BRIGHT_MAX  = 1.0;   // full brightness when large
const CHAOS_START = 0.62;  // expansion at which the "fly swarm" begins
const REST_EXPANSION = 0.2;
const GRACE_MS    = 900;   // hold the last reading briefly after a hand drops
const TIME_SCALE  = 0.6;   // orbital clock multiplier

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp  = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---- DOM -------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas     = $('scene');
const video      = $('input-video');
const preview    = $('preview-canvas');
const loadingEl  = $('loading');
const statusText = $('status-text');
const meterFill  = $('meter-fill');
const handState  = $('hand-state');
const hintEl     = $('hint');

// ---- renderer / scene ------------------------------------------------------
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05060a, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  55, window.innerWidth / window.innerHeight, 0.1, 200,
);
camera.position.set(0, 2.3, 8.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 3.5;
controls.maxDistance = 18;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;
controls.target.set(0, 0, 0);

// ---- contents --------------------------------------------------------------
scene.add(createBackdrop());

const stars = createStarfield(pixelRatio);
scene.add(stars.points);

// The whole planet sits in a tilted group for the iconic Saturn lean.
const saturnGroup = new THREE.Group();
saturnGroup.rotation.z = 0.42;   // ~24° axial tilt
saturnGroup.rotation.x = 0.05;
scene.add(saturnGroup);

const saturn = createSaturn(pixelRatio);
saturnGroup.add(saturn.points);

// ---- post-processing (bloom is what sells the glow) ------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,   // strength (animated below)
  0.75,  // radius
  0.0,   // threshold — everything glows on the dark field
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---- gesture state ---------------------------------------------------------
let targetOpenness = REST_EXPANSION; // latest reading from the hand
let expansion = REST_EXPANSION;      // eased value actually driving the scene
let handPresent = false;
let lastHandTime = -1e9;
let manualTarget = REST_EXPANSION;   // keyboard / wheel fallback
let lastManualTime = -1e9;
let cameraActive = false;

const tracker = new HandTracker({
  video, previewCanvas: preview,
  onOpenness: (value, present) => {
    handPresent = present;
    if (present){
      targetOpenness = value;
      lastHandTime = performance.now();
    }
  },
  onStatus: (state, detail) => setStatus(state, detail),
});

// ---- status / UI -----------------------------------------------------------
function setStatus(state, detail){
  if (statusText) statusText.textContent = detail || state;
  if (state === 'ready' || state === 'denied' || state === 'error'){
    hideLoading();
  }
  if (state === 'denied' || state === 'error'){
    cameraActive = false;
    if (hintEl) hintEl.classList.add('show');
    document.body.classList.add('manual-mode');
  }
  if (state === 'ready'){
    cameraActive = true;
    document.body.classList.remove('manual-mode');
  }
}

let loadingHidden = false;
function hideLoading(){
  if (loadingHidden) return;
  loadingHidden = true;
  loadingEl.classList.add('hidden');
}

// ---- manual fallback (works with no camera) --------------------------------
function nudgeManual(delta){
  manualTarget = clamp(manualTarget + delta, 0, 1);
  lastManualTime = performance.now();
}
window.addEventListener('wheel', (e) => {
  // only hijack the wheel when we're effectively in manual control
  if (!handPresent) { nudgeManual(-e.deltaY * 0.0012); e.preventDefault(); }
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp')   nudgeManual(0.06);
  if (e.key === 'ArrowDown') nudgeManual(-0.06);
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

// ---- buttons ---------------------------------------------------------------
function toggleFullscreen(){
  if (!document.fullscreenElement){
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}
$('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  $('btn-fullscreen').classList.toggle('active', !!document.fullscreenElement);
});

$('btn-camera').addEventListener('click', async () => {
  if (cameraActive){
    tracker.stop();
    cameraActive = false;
    handPresent = false;
    document.body.classList.add('manual-mode');
    setStatus('denied', 'Camera off — manual control');
    if (hintEl) hintEl.classList.add('show');
  } else {
    await tracker.start();
  }
});

$('btn-info').addEventListener('click', () => {
  $('info-panel').classList.toggle('show');
});
$('info-close')?.addEventListener('click', () => {
  $('info-panel').classList.remove('show');
});

// ---- resize ----------------------------------------------------------------
function onResize(){
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ---- main loop -------------------------------------------------------------
const clock = new THREE.Clock();
let orbitalTime = 0;

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  orbitalTime += dt * TIME_SCALE;

  // Decide the target the field should ease toward.
  const now = performance.now();
  let target;
  if (handPresent && now - lastHandTime < GRACE_MS){
    target = targetOpenness;
    manualTarget = targetOpenness;          // stay in sync for smooth hand-off
  } else {
    // No hand: hold manual value, but if it's been a while and the user isn't
    // actively scrolling, let it settle back to a calm resting size.
    if (cameraActive && now - lastManualTime > 2500){
      manualTarget += (REST_EXPANSION - manualTarget) * (1 - Math.exp(-dt * 0.8));
    }
    target = manualTarget;
  }

  // Ease the actual expansion (frame-rate independent).
  expansion += (target - expansion) * (1 - Math.exp(-dt * 7));

  // Map expansion -> the physical responses.
  const scale = lerp(SCALE_MIN, SCALE_MAX, expansion);
  const chaos = smoothstep(CHAOS_START, 1.0, expansion);
  const brightness = lerp(BRIGHT_MIN, BRIGHT_MAX, expansion);

  const u = saturn.uniforms;
  u.uTime.value = orbitalTime;
  u.uTimeRaw.value = elapsed;
  u.uScale.value = scale;
  u.uChaos.value = chaos;
  u.uBrightness.value = brightness;

  // Bloom tracks the "lamp": brighter and hotter as it grows / scatters.
  bloom.strength = lerp(0.45, 1.7, expansion) + chaos * 0.8;
  bloom.radius = 0.7 + chaos * 0.15;

  stars.uniforms.uTime.value = elapsed;

  // Live UI readout.
  if (meterFill) meterFill.style.width = (expansion * 100).toFixed(0) + '%';
  if (handState){
    handState.textContent = handPresent
      ? 'Tracking ✋  ·  ' + Math.round(expansion * 100) + '%'
      : (cameraActive ? 'No hand in view' : 'Manual  ·  ' + Math.round(expansion * 100) + '%');
  }

  controls.update();
  composer.render();
}

// ---- boot ------------------------------------------------------------------
onResize();
animate();
// Kick off the camera/model after first paint so the scene shows immediately.
requestAnimationFrame(() => {
  setTimeout(() => tracker.start(), 60);
});
// Safety net: never leave the loader up forever.
setTimeout(hideLoading, 9000);
