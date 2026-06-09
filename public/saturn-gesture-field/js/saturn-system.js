// ----------------------------------------------------------------------------
//  saturn-system.js — builds the particle Saturn (core body + Keplerian rings)
//  and exposes the uniforms that the hand gesture drives every frame.
// ----------------------------------------------------------------------------
import * as THREE from 'three';
import { PARTICLE_VERTEX, PARTICLE_FRAGMENT } from './shaders.js';

// Generous counts — the brief asks for the richest possible image, not the
// most frugal. Modern GPUs handle a quarter-million additive points fine.
const CORE_COUNT  = 60000;
const RING_COUNT  = 190000;
const TOTAL       = CORE_COUNT + RING_COUNT;

const CORE_RADIUS = 1.0;
const RING_INNER  = 1.55;
const RING_OUTER  = 3.5;

// Radial bands & gaps (normalised 0..1 across the ring span) to evoke the real
// ring structure — notably a Cassini-like division.
const RING_GAPS = [
  [0.00, 0.04], // inner edge fade
  [0.46, 0.55], // Cassini division
  [0.78, 0.82], // a thinner gap
];

// A warm Saturn palette with occasional icy sparkles.
const C_CORE_HOT  = new THREE.Color('#fff1c9');
const C_CORE_COOL = new THREE.Color('#d9a752');
const C_RING_A    = new THREE.Color('#efe0b4');
const C_RING_B    = new THREE.Color('#c9a86a');
const C_RING_C    = new THREE.Color('#8f7240');
const C_ICE       = new THREE.Color('#bfe2ff');

function rand(a, b){ return a + Math.random() * (b - a); }
function inGap(t){
  for (const [g0, g1] of RING_GAPS) if (t >= g0 && t <= g1) return true;
  return false;
}

// Density profile across the rings: brighter "B-ring" zone, sparse C-ring.
function ringDensity(t){
  if (t < 0.18) return 0.35;          // faint C-ring
  if (t < 0.45) return 1.0;           // bright B-ring
  if (t < 0.78) return 0.7;           // A-ring
  return 0.45;                        // outer haze
}

export function createSaturn(pixelRatio){
  const positions = new Float32Array(TOTAL * 3);
  const aType  = new Float32Array(TOTAL);
  const aSeed  = new Float32Array(TOTAL);
  const aSize  = new Float32Array(TOTAL);
  const aColor = new Float32Array(TOTAL * 3);
  const aA     = new Float32Array(TOTAL);
  const aE     = new Float32Array(TOTAL);
  const aM0    = new Float32Array(TOTAL);
  const aInc   = new Float32Array(TOTAL);
  const aOmega = new Float32Array(TOTAL);
  const aPeri  = new Float32Array(TOTAL);

  const tmp = new THREE.Color();

  // ---- CORE BODY: Fibonacci sphere shell with a little radial volume ----
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < CORE_COUNT; i++){
    const k = i;
    const y = 1 - (k / (CORE_COUNT - 1)) * 2;       // 1 .. -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * k;
    // shell with inward jitter so the body reads as a volume, not a hollow skin
    const depth = Math.pow(Math.random(), 1.5);     // bias toward the surface
    const rad = CORE_RADIUS * (0.55 + 0.45 * depth);
    const px = Math.cos(theta) * r * rad;
    const pz = Math.sin(theta) * r * rad;
    const py = y * rad;

    positions[i*3+0] = px;
    positions[i*3+1] = py;
    positions[i*3+2] = pz;

    aType[i] = 0.0;
    aSeed[i] = Math.random();
    aSize[i] = rand(1.1, 2.6);

    // hotter toward the surface, cooler/denser toward the core
    tmp.copy(C_CORE_COOL).lerp(C_CORE_HOT, depth * rand(0.6, 1.0));
    aColor[i*3+0] = tmp.r;
    aColor[i*3+1] = tmp.g;
    aColor[i*3+2] = tmp.b;

    // orbital attrs unused for the core
    aA[i] = 1; aE[i] = 0; aM0[i] = 0; aInc[i] = 0; aOmega[i] = 0; aPeri[i] = 0;
  }

  // ---- RINGS: Keplerian orbits in a thin disk with bands, gaps, sparkles ----
  let placed = 0;
  let guard = 0;
  while (placed < RING_COUNT && guard < RING_COUNT * 40){
    guard++;
    const t = Math.random();                 // normalised radial position
    if (inGap(t)) continue;
    if (Math.random() > ringDensity(t)) continue;

    const idx = CORE_COUNT + placed;
    const a = RING_INNER + t * (RING_OUTER - RING_INNER);

    // mostly circular, a few mildly eccentric for life
    const e = Math.random() < 0.12 ? rand(0.02, 0.10) : rand(0.0, 0.02);
    // very thin disk; a sparse halo of higher-inclination motes for atmosphere
    const inc = Math.random() < 0.08
      ? rand(-0.10, 0.10)
      : rand(-0.018, 0.018);

    positions[idx*3+0] = 0; // computed on the GPU from orbital elements
    positions[idx*3+1] = 0;
    positions[idx*3+2] = 0;

    aType[idx]  = 1.0;
    aSeed[idx]  = Math.random();
    aSize[idx]  = rand(0.7, 2.0) * (0.8 + 0.4 * ringDensity(t));
    aA[idx]     = a;
    aE[idx]     = e;
    aM0[idx]    = rand(0, Math.PI * 2);
    aInc[idx]   = inc;
    aOmega[idx] = rand(0, Math.PI * 2);
    aPeri[idx]  = rand(0, Math.PI * 2);

    // colour bands across the rings, with occasional icy-blue sparkles
    if (t < 0.18)       tmp.copy(C_RING_C);
    else if (t < 0.45)  tmp.copy(C_RING_A);
    else if (t < 0.78)  tmp.copy(C_RING_B);
    else                tmp.copy(C_RING_C).lerp(C_RING_B, 0.4);
    tmp.lerp(C_RING_A, rand(-0.1, 0.25));
    if (Math.random() < 0.05) tmp.lerp(C_ICE, rand(0.3, 0.8));

    aColor[idx*3+0] = tmp.r;
    aColor[idx*3+1] = tmp.g;
    aColor[idx*3+2] = tmp.b;

    placed++;
  }

  // If the accept/reject loop under-filled, the tail stays at the origin with
  // type 0 attrs; collapse the buffers to what we actually placed.
  const used = CORE_COUNT + placed;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, used*3), 3));
  geo.setAttribute('aType',  new THREE.BufferAttribute(aType.subarray(0, used), 1));
  geo.setAttribute('aSeed',  new THREE.BufferAttribute(aSeed.subarray(0, used), 1));
  geo.setAttribute('aSize',  new THREE.BufferAttribute(aSize.subarray(0, used), 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(aColor.subarray(0, used*3), 3));
  geo.setAttribute('aA',     new THREE.BufferAttribute(aA.subarray(0, used), 1));
  geo.setAttribute('aE',     new THREE.BufferAttribute(aE.subarray(0, used), 1));
  geo.setAttribute('aM0',    new THREE.BufferAttribute(aM0.subarray(0, used), 1));
  geo.setAttribute('aInc',   new THREE.BufferAttribute(aInc.subarray(0, used), 1));
  geo.setAttribute('aOmega', new THREE.BufferAttribute(aOmega.subarray(0, used), 1));
  geo.setAttribute('aPeri',  new THREE.BufferAttribute(aPeri.subarray(0, used), 1));
  geo.computeBoundingSphere();

  const uniforms = {
    uTime:       { value: 0 },
    uTimeRaw:    { value: 0 },
    uScale:      { value: 1 },
    uChaos:      { value: 0 },
    uBrightness: { value: 1 },
    uGM:         { value: 1.0 },
    uCoreSpin:   { value: 0.12 },
    uSizeScale:  { value: 1.0 },
    uPixelRatio: { value: pixelRatio },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false; // particles fly far past their bounds under chaos

  return { points, uniforms, count: used };
}
