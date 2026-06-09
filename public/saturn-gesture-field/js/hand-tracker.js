// ----------------------------------------------------------------------------
//  hand-tracker.js — MediaPipe Hands wrapper.
//
//  Turns the webcam feed into a single scalar in [0,1]: how open the palm is.
//  0 = closed fist, 1 = fully spread hand. Also paints a small mirrored
//  skeleton preview so the user can see they're being tracked.
//
//  MediaPipe's legacy "Hands" solution is loaded globally via <script> tags in
//  index.html, so we read it off `window` here.
// ----------------------------------------------------------------------------

// Landmark indices: fingertip -> matching knuckle (MCP). The thumb is omitted
// because its geometry makes openness noisy.
const FINGER_PAIRS = [
  [8, 5],   // index
  [12, 9],  // middle
  [16, 13], // ring
  [20, 17], // pinky
];

const OPEN_MIN = 1.15; // average tip/knuckle ratio for a closed fist
const OPEN_MAX = 2.15; // ...and for a fully open hand

function dist3(a, b){
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// Distance-invariant palm openness: each extended finger pushes its tip much
// farther from the wrist than its knuckle; a curled finger does not.
function computeOpenness(lm){
  const wrist = lm[0];
  let sum = 0;
  for (const [tip, mcp] of FINGER_PAIRS){
    sum += dist3(lm[tip], wrist) / (dist3(lm[mcp], wrist) + 1e-6);
  }
  const avg = sum / FINGER_PAIRS.length;
  return Math.min(1, Math.max(0, (avg - OPEN_MIN) / (OPEN_MAX - OPEN_MIN)));
}

export class HandTracker {
  /**
   * @param {object} opts
   * @param {HTMLVideoElement} opts.video
   * @param {HTMLCanvasElement} opts.previewCanvas
   * @param {(openness:number, present:boolean)=>void} opts.onOpenness
   * @param {(state:string, detail?:string)=>void} opts.onStatus
   */
  constructor({ video, previewCanvas, onOpenness, onStatus }){
    this.video = video;
    this.previewCanvas = previewCanvas;
    this.ctx = previewCanvas.getContext('2d');
    this.onOpenness = onOpenness || (() => {});
    this.onStatus = onStatus || (() => {});
    this.hands = null;
    this.camera = null;
    this.running = false;
  }

  async start(){
    if (!window.Hands || !window.Camera){
      this.onStatus('error', 'MediaPipe failed to load. Check your network.');
      return false;
    }

    this.onStatus('loading', 'Loading hand model…');

    this.hands = new window.Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    this.hands.onResults((res) => this._onResults(res));

    try {
      this.camera = new window.Camera(this.video, {
        onFrame: async () => {
          if (this.running) await this.hands.send({ image: this.video });
        },
        width: 640,
        height: 480,
      });
      this.running = true;
      await this.camera.start();
      this.onStatus('ready', 'Show your hand ✋');
      return true;
    } catch (err){
      this.running = false;
      this.onStatus('denied', 'Camera unavailable — using manual control.');
      return false;
    }
  }

  stop(){
    this.running = false;
    if (this.camera && this.camera.stop) this.camera.stop();
    const s = this.video.srcObject;
    if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this._clearPreview();
  }

  _onResults(res){
    const hands = res.multiHandLandmarks;
    if (hands && hands.length){
      const lm = hands[0];
      this.onOpenness(computeOpenness(lm), true);
      this._drawPreview(lm);
    } else {
      this.onOpenness(0, false);
      this._drawPreview(null);
    }
  }

  _clearPreview(){
    const { width, height } = this.previewCanvas;
    this.ctx.clearRect(0, 0, width, height);
  }

  _drawPreview(lm){
    const cv = this.previewCanvas;
    const ctx = this.ctx;
    const w = cv.width, h = cv.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // mirrored selfie view
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    if (this.video.readyState >= 2){
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.video, 0, 0, w, h);
    }
    ctx.globalAlpha = 1;

    if (lm){
      const connections = window.HAND_CONNECTIONS;
      if (window.drawConnectors && connections){
        window.drawConnectors(ctx, lm, connections, {
          color: 'rgba(120, 200, 255, 0.9)', lineWidth: 2,
        });
      }
      if (window.drawLandmarks){
        window.drawLandmarks(ctx, lm, {
          color: 'rgba(255, 220, 150, 0.95)',
          fillColor: 'rgba(255, 240, 200, 0.6)',
          lineWidth: 1, radius: 2.5,
        });
      }
    }
    ctx.restore();
  }
}
