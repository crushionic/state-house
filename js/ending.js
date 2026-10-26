// The ending, played when the visitor returns from the last unvisited area:
// fade to glowing white, hold for 1.25 seconds, then the white flows like
// liquid into the words "What are we forgetting?" on black. A "Back to
// beginning" button then appears at the bottom centre.
//
// The liquid is a metaball field drawn at low resolution: hundreds of soft
// blobs start packed edge to edge (solid white) and flow to points sampled
// inside the text's letter shapes, shrinking as they go. Each frame the summed
// field is thresholded, which makes neighbouring blobs merge and pull apart
// like a liquid. At the end the crisp text cross-fades in over it.
import { el } from "./ui.js";

const TEXT = "What are we forgetting?";
const HOLD_MS = 1250;
const FADE_MS = 1500;
const MORPH_MS = 2600;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function playEnding() {
  const canvas = el("canvas", { class: "ending-liquid", "aria-hidden": "true" });
  const text = el("p", { class: "ending-text", text: TEXT });
  const back = el("button", {
    type: "button",
    class: "ending-back",
    text: "Back to beginning",
    onclick: () => location.assign(location.pathname), // fresh start, no URL options
  });
  const root = el("div", { class: "ending", role: "status" }, canvas, text, back);
  document.body.append(root);
  document.body.classList.add("is-ending");

  // Low-resolution drawing surface; the browser smooths it when scaling up.
  const scale = Math.min(1, 420 / window.innerWidth);
  const W = Math.max(160, Math.round(window.innerWidth * scale));
  const H = Math.max(90, Math.round(window.innerHeight * scale));
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  await wait(30); // let the start state paint so the transition runs
  root.classList.add("is-white"); // fade to white
  // Prepare the liquid while the screen is white.
  const liquid = await prepareLiquid(text, W, H, scale);
  await wait(FADE_MS + HOLD_MS);

  if (!reduceMotion && liquid) await runLiquid(ctx, liquid, W, H);
  root.classList.add("show-text"); // crisp text in, liquid out
  await wait(1600);
  root.classList.add("show-back");
  back.focus({ preventScroll: true });
}

// Sample target points inside the letters and set up the blobs.
async function prepareLiquid(textEl, W, H, scale) {
  try {
    await document.fonts.load(`1em "scotch-text-condensed"`);
  } catch {
    /* fall back to whatever font is available */
  }
  const style = getComputedStyle(textEl);
  const fontPx = parseFloat(style.fontSize) * scale;
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = H;
  const m = mask.getContext("2d");
  m.fillStyle = "#fff";
  m.textAlign = "center";
  m.textBaseline = "middle";
  m.font = `${style.fontWeight} ${fontPx}px ${style.fontFamily}`;
  // Shrink to fit narrow screens, like the HTML text wraps/clamps.
  const maxW = W * 0.9;
  const measured = m.measureText(TEXT).width;
  if (measured > maxW) m.font = `${style.fontWeight} ${(fontPx * maxW) / measured}px ${style.fontFamily}`;
  m.fillText(TEXT, W / 2, H / 2);
  const data = m.getImageData(0, 0, W, H).data;
  const inside = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 140) inside.push([x + 0.5, y + 0.5]);
  if (!inside.length) return null;

  // Start: a grid of overlapping blobs that covers the whole screen.
  const cols = 44;
  const cell = W / cols;
  const rows = Math.ceil(H / cell) + 1;
  const starts = [];
  for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++) starts.push([(i + 0.5) * cell, (j + 0.5) * cell]);
  // Targets: random points inside the letters, one per blob.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const targets = starts.map(() => inside[Math.floor(rnd() * inside.length)]);
  // Pair them left-to-right so the flow stays coherent.
  starts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  targets.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cx = W / 2;
  const cy = H / 2;
  const maxD = Math.hypot(cx, cy);
  const strokeR = Math.max(1.1, fontPx * 0.09);
  const blobs = starts.map((s, k) => ({
    x0: s[0], y0: s[1], x1: targets[k][0], y1: targets[k][1],
    r0: cell * 1.25, r1: strokeR * (0.8 + rnd() * 0.5),
    // the edges of the screen start moving first, so it closes in like liquid
    delay: (1 - Math.hypot(s[0] - cx, s[1] - cy) / maxD) * 0.35 + rnd() * 0.08,
  }));

  // A soft round "brush" used to build the field.
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const g = sprite.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);

  const field = document.createElement("canvas");
  field.width = W;
  field.height = H;
  return { blobs, sprite, field };
}

function runLiquid(ctx, { blobs, sprite, field }, W, H) {
  const f = field.getContext("2d", { willReadFrequently: true });
  const out = ctx.createImageData(W, H);
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const T = Math.min(1, (now - start) / MORPH_MS);
      // 1. sum the blobs into the field
      f.globalCompositeOperation = "source-over";
      f.clearRect(0, 0, W, H);
      f.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        const t = easeInOut(Math.min(1, Math.max(0, (T - b.delay) / (1 - b.delay))));
        const x = b.x0 + (b.x1 - b.x0) * t;
        const y = b.y0 + (b.y1 - b.y0) * t;
        const r = b.r0 + (b.r1 - b.r0) * t;
        const d = r * 2.2;
        f.drawImage(sprite, x - d / 2, y - d / 2, d, d);
      }
      // 2. threshold it with a narrow soft edge: liquid surfaces
      const src = f.getImageData(0, 0, W, H).data;
      const dst = out.data;
      for (let i = 0; i < src.length; i += 4) {
        const v = src[i + 3]; // summed field lives in the alpha channel
        const a = Math.min(1, Math.max(0, (v - 110) / 40));
        dst[i] = dst[i + 1] = dst[i + 2] = 255;
        dst[i + 3] = a * 255;
      }
      ctx.clearRect(0, 0, W, H);
      ctx.putImageData(out, 0, 0);
      if (T < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}
