# Saturn · Gesture Field

A real-time, interactive **3D particle Saturn** built with **Three.js**, sculpted
with your **hand** through the webcam (via MediaPipe Hands).

Open your palm and the field expands toward you and brightens like a lamp; close
to a fist and it shrinks back into a small, dim, distant world. Push it fully
open and the orderly orbits shatter into a chaotic, fly-like swarm as the
particles blow past the screen.

## What it does

| Requirement | How it's implemented |
|---|---|
| **Palm open/close controls scale & diffusion** | MediaPipe Hands → a distance-invariant "openness" scalar (`0` fist … `1` open) drives a single `expansion` value, eased every frame. |
| **Saturn: a particle core + rotating rings** | A Fibonacci-sphere body (≈60k pts) + a banded ring disk with a Cassini-like gap (≈190k pts). |
| **Real-time gesture response** | Openness streams straight into the GPU uniforms; the field reacts within a frame or two (critically-damped easing). |
| **Kepler's laws** | Each ring particle is a true elliptical orbit. Kepler's equation `M = E − e·sinE` is solved per-particle **in the vertex shader**; mean motion `n = √(GM/a³)` gives proper differential rotation (inner = fast). |
| **Chaos near the screen** | Past ~62% expansion a high-frequency 3D-simplex "Brownian" field + a radial blow-out break the orbits into an erratic swarm. |
| **Lamp-like brightness** | Brightness and bloom scale with size: small = dim, large = bright. |
| **Clean modern UI + fullscreen** | Glassmorphic dark UI, live hand preview + gesture meter, fullscreen button. |

Visual quality is favoured over frugality (per the brief): ~250k additive
points, `UnrealBloomPass`, ACES tone-mapping, a twinkling starfield and a
gradient space backdrop.

## Run it

The webcam needs a **secure context** (HTTPS or `localhost`) — `file://`
won't grant camera access.

**Hosted (easiest):** this folder lives in the Next.js app's `public/`, so it
ships with the normal deploy and is served at **`/saturn-gesture-field/`**
(e.g. `https://<your-deploy>.vercel.app/saturn-gesture-field/`). HTTPS there
means the webcam just works — open it and **allow camera access**.

**Local:** serve over `localhost` (not `file://`):

```bash
# from this folder — any static server works:
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL and allow camera access.

> First load fetches Three.js and the MediaPipe model from a CDN, so an
> internet connection is required.

## Controls

- **Hand** — open/close your palm to expand/contract the field.
- **No camera?** It falls back to manual control: **scroll** or **↑ / ↓**.
- **Drag** to orbit the view · **F** or the ⛶ button for fullscreen · **ⓘ** for help.

## Layout

Lives at `public/saturn-gesture-field/` (served at `/saturn-gesture-field/`).

```
saturn-gesture-field/
├── index.html          # shell: import map + MediaPipe scripts + UI
├── style.css           # dark glass UI
└── js/
    ├── main.js         # scene, post-processing, gesture→physics mapping
    ├── saturn-system.js# builds the particle Saturn (core + Keplerian rings)
    ├── shaders.js      # GLSL: Kepler solver, chaos field, glow, backdrop
    ├── starfield.js    # background stars + gradient backdrop
    └── hand-tracker.js # MediaPipe Hands wrapper → palm openness
```

No build step — it's plain ES modules loaded straight in the browser.
