// ----------------------------------------------------------------------------
//  starfield.js — twinkling background stars + a gradient space backdrop.
// ----------------------------------------------------------------------------
import * as THREE from 'three';
import {
  STAR_VERTEX, STAR_FRAGMENT,
  BACKDROP_VERTEX, BACKDROP_FRAGMENT,
} from './shaders.js';

export function createStarfield(pixelRatio, count = 3500){
  const positions = new Float32Array(count * 3);
  const aSize = new Float32Array(count);
  const aSeed = new Float32Array(count);

  for (let i = 0; i < count; i++){
    // scatter on a large shell around the scene
    const r = 40 + Math.random() * 40;
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i*3+0] = r * s * Math.cos(phi);
    positions[i*3+1] = r * u;
    positions[i*3+2] = r * s * Math.sin(phi);
    aSize[i] = 0.6 + Math.pow(Math.random(), 3) * 3.2;
    aSeed[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, uniforms };
}

export function createBackdrop(){
  const geo = new THREE.SphereGeometry(90, 32, 32);
  const material = new THREE.ShaderMaterial({
    vertexShader: BACKDROP_VERTEX,
    fragmentShader: BACKDROP_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}
