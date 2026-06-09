// ----------------------------------------------------------------------------
//  shaders.js — GLSL for the particle field.
//
//  All orbital mechanics (Kepler's equation), the chaotic "fly swarm" field
//  and the lamp-like brightness response live on the GPU so that 240k+
//  particles can be animated per-frame without breaking a sweat.
// ----------------------------------------------------------------------------

// Ashima Arts 3D simplex noise — used to build the high-frequency Brownian
// "fly swarm" displacement when the field is pushed close to the camera.
const SIMPLEX_NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2  C = vec2(1.0/6.0, 1.0/3.0);
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const PARTICLE_VERTEX = /* glsl */ `
precision highp float;

uniform float uTime;        // orbital clock (Kepler), eased
uniform float uTimeRaw;     // wall clock, for high-frequency chaos
uniform float uScale;       // master zoom / diffusion (hand openness)
uniform float uChaos;       // 0..1 chaotic-explosion amount
uniform float uBrightness;  // lamp response: dim when small, bright when large
uniform float uGM;          // gravitational parameter (tunes orbital speed)
uniform float uCoreSpin;    // angular speed of the core body
uniform float uSizeScale;   // global point-size multiplier
uniform float uPixelRatio;

attribute float aType;      // 0 = core body, 1 = ring
attribute float aSeed;      // per-particle random
attribute float aSize;      // per-particle base size
attribute vec3  aColor;     // per-particle base colour
attribute float aA;         // semi-major axis
attribute float aE;         // eccentricity
attribute float aM0;        // mean anomaly at t=0
attribute float aInc;       // inclination
attribute float aOmega;     // longitude of ascending node
attribute float aPeri;      // argument of periapsis

varying vec3  vColor;
varying float vAlpha;

${SIMPLEX_NOISE}

// A decorrelated 3-axis noise vector — reads as erratic insect-like jitter
// once driven at high temporal frequency.
vec3 chaosField(vec3 p, float seed){
  float f = uTimeRaw * 3.4;
  float nx = snoise(vec3(p.x * 0.55 + seed * 11.0, p.y * 0.55, f));
  float ny = snoise(vec3(p.y * 0.55 + seed * 23.0, p.z * 0.55, f + 17.0));
  float nz = snoise(vec3(p.z * 0.55 + seed * 37.0, p.x * 0.55, f + 41.0));
  return vec3(nx, ny, nz);
}

void main(){
  vec3 pos;
  vec3 col   = aColor;
  float alpha = 1.0;

  if (aType < 0.5){
    // ---- CORE: a sphere of particles, slowly spinning about the Y axis ----
    float a = uCoreSpin * uTime;
    float c = cos(a), s = sin(a);
    pos = vec3(position.x * c + position.z * s,
               position.y,
              -position.x * s + position.z * c);
    // faint breathing so the body shimmers rather than sits dead still
    pos *= 1.0 + 0.012 * sin(uTime * 0.8 + aSeed * 6.2831);
  } else {
    // ---- RING: a true Keplerian elliptical orbit ----
    // Mean motion n = sqrt(GM / a^3)  =>  inner particles orbit faster
    // (Kepler's 3rd law). Equal areas in equal time falls out for free.
    float n = sqrt(uGM / (aA * aA * aA));
    float M = aM0 + n * uTime;

    // Solve Kepler's equation  M = E - e*sin(E)  by Newton iteration.
    float E = M;
    for (int i = 0; i < 6; i++){
      E = E - (E - aE * sin(E) - M) / (1.0 - aE * cos(E));
    }
    float cosE = cos(E), sinE = sin(E);
    float b = aA * sqrt(1.0 - aE * aE);

    // Position in the orbital plane, focus at the origin (the body).
    vec2 o = vec2(aA * (cosE - aE), b * sinE);

    // Rotate by argument of periapsis within the plane.
    float cw = cos(aPeri), sw = sin(aPeri);
    vec2 q = vec2(o.x * cw - o.y * sw, o.x * sw + o.y * cw);

    // Lift into 3D via inclination + ascending node (standard transform,
    // reference plane = XY, normal = Z) ...
    float ci = cos(aInc), si = sin(aInc);
    float cO = cos(aOmega), sO = sin(aOmega);
    vec3 P;
    P.x = q.x * cO - q.y * sO * ci;
    P.y = q.x * sO + q.y * cO * ci;
    P.z = q.y * si;

    // ... then swap so the ring normal becomes +Y (horizontal disk) for the
    // classic Saturn silhouette.
    pos = P.xzy;
  }

  // Master zoom + diffusion driven by the hand.
  pos *= uScale;

  // ---- CHAOS: high-frequency Brownian buzz + radial blow-out near the
  //      camera. Breaks the orbital order into a "fly swarm". ----
  float chaos = uChaos;
  if (chaos > 0.001){
    vec3 buzz = chaosField(pos, aSeed);
    pos += buzz * (chaos * 2.4);

    vec3 dir = normalize(pos + 1e-4);
    float burst = 0.5 + 0.5 * snoise(vec3(aSeed * 5.0, uTimeRaw * 0.6, 0.0));
    pos += dir * chaos * burst * 3.2;

    // energise colour toward a hot white-blue as it scatters
    col = mix(col, vec3(0.78, 0.88, 1.0) * 1.5, chaos * 0.6);
    alpha *= 1.0 + chaos * 0.5;
  }

  // Lamp-like brightness: small => dim, large => bright.
  col *= uBrightness;

  vColor = col;
  vAlpha = alpha;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float dist = max(-mvPosition.z, 0.001);
  gl_PointSize = aSize * uSizeScale * uPixelRatio * (300.0 / dist);
  gl_PointSize = clamp(gl_PointSize, 0.0, 460.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
precision highp float;

varying vec3  vColor;
varying float vAlpha;

void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);

  // Soft glowing disc with a hot core.
  float glow = smoothstep(0.5, 0.0, d);
  glow = pow(glow, 1.6);
  float core = smoothstep(0.16, 0.0, d) * 0.7;

  vec3 c = vColor * (1.0 + core * 2.2);
  float a = (glow * 0.85 + core) * vAlpha;

  if (a < 0.003) discard;
  gl_FragColor = vec4(c, a);
}
`;

// Tiny twinkling background stars (reuses the soft-disc fragment idea).
export const STAR_VERTEX = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uPixelRatio;
attribute float aSize;
attribute float aSeed;
varying float vTwinkle;
void main(){
  vTwinkle = 0.6 + 0.4 * sin(uTime * (0.5 + aSeed) + aSeed * 30.0);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * (300.0 / max(-mvPosition.z, 0.001));
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const STAR_FRAGMENT = /* glsl */ `
precision highp float;
varying float vTwinkle;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = pow(a, 2.0) * vTwinkle;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a);
}
`;

// Vertical gradient backdrop for depth (deep space, slightly lit from below).
export const BACKDROP_VERTEX = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const BACKDROP_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vDir;
void main(){
  float t = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 top = vec3(0.012, 0.016, 0.030);
  vec3 bot = vec3(0.030, 0.024, 0.040);
  vec3 col = mix(bot, top, t);
  // a faint warm glow toward the lower centre, like distant light
  float glow = smoothstep(0.6, 0.0, length(vDir.xy)) * 0.04;
  col += vec3(0.10, 0.08, 0.06) * glow;
  gl_FragColor = vec4(col, 1.0);
}
`;
