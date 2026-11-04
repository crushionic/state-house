#!/usr/bin/env node
/* =====================================================================
   page-effects.mjs — lift the lighting and paper texture off the book scan,
   so the images in PAGES look printed on that same paper.

   It paints the splats on the paper's top surface into a top-down picture
   (in the site's world x–z), then splits it into two maps:

   • LIGHT (RGB): the light falling on the paper — the warm cast, the
     shadow in the fold, the falloff toward the edges. The book's own
     printed text is taken out (only the paper between the letters counts).
   • GRAIN (grey): the fine, blotchy texture of the scanned paper, also
     without the text. Stored around mid-grey: grain = 1 + (value − 0.5) / 4.

   The light is 1.0 (white) where the paper is at its brightest, so the
   effects layer in props.js can multiply it over the page images.

   Usage (Node 22.15 or newer, nothing to install):
     node tools/page-effects.mjs splats/book.spz splats/book-surface.json images \
          --position 0.0641,-0.1778,0.0736 --rotation -103.74,1.78,29.14

   Writes images/book-light.png and images/book-grain.png. Use the same
   position / rotation as the book's entry in SPLATS, and the same area as
   "effects.area" in config-book.js (default --x -0.28,0.30 --z -0.21,0.20).
   Options: --res 2000 (pixels per unit)
===================================================================== */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1].split(",").map(Number);
  args.splice(i, 2);
  return v.length === 1 ? v[0] : v;
};
const POS = opt("--position", [0, 0, 0]);
const ROT = opt("--rotation", [0, 0, 0]);
const XR = opt("--x", [-0.28, 0.30]);
const ZR = opt("--z", [-0.21, 0.20]);
const RES = opt("--res", 2000);
const [input, surfaceFile, outDir] = args;
if (!input || !surfaceFile || !outDir) {
  console.log("usage: node tools/page-effects.mjs book.spz book-surface.json outDir --position x,y,z --rotation x,y,z");
  process.exit(1);
}

/* ---------- read the splat (SPZ v2–v3 gzip, v4 zstd) ---------- */
const MAGIC = 0x5053474e;
let raw = fs.readFileSync(input), n, frac, body;
if (raw.readUInt32LE(0) === MAGIC && raw.readUInt32LE(4) === 4) {
  n = raw.readUInt32LE(8); frac = raw[13];
  const nStreams = raw[15], toc = raw.readUInt32LE(16), parts = [];
  let cur = toc + nStreams * 16;
  for (let i = 0; i < nStreams; i++) {
    const size = Number(raw.readBigUInt64LE(toc + i * 16));
    parts.push(zlib.zstdDecompressSync(raw.subarray(cur, cur + size)));
    cur += size;
  }
  body = Buffer.concat(parts);
} else {
  raw = zlib.gunzipSync(raw);
  if (raw.readUInt32LE(0) !== MAGIC) throw new Error("not an SPZ file");
  n = raw.readUInt32LE(8); frac = raw[13]; body = raw.subarray(16);
}
const F = 1 << frac;
const i24 = (k) => { const v = body[k] | (body[k + 1] << 8) | (body[k + 2] << 16); return v & 0x800000 ? v - 0x1000000 : v; };
const A0 = n * 9, C0 = n * 10, S0 = n * 13;
const colour = (b) => Math.min(1, Math.max(0, 0.5 + 0.28209479 * ((b / 255 - 0.5) / 0.15)));

/* ---------- placement (three.js Euler XYZ) + paper height ---------- */
const [ra, rb, rc] = ROT.map((d) => (d * Math.PI) / 180);
const ca = Math.cos(ra), sa = Math.sin(ra), cb = Math.cos(rb), sb = Math.sin(rb), cc = Math.cos(rc), sc = Math.sin(rc);
const R = [cb * cc, -cb * sc, sb, ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb, sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb];
const surf = JSON.parse(fs.readFileSync(surfaceFile, "utf8"));
function paperY(x, z) {
  const fx = Math.min(surf.nx - 1.001, Math.max(0, (x - surf.x0) / surf.step));
  const fz = Math.min(surf.nz - 1.001, Math.max(0, (z - surf.z0) / surf.step));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, k = iz * surf.nx + ix, y = surf.y;
  const a = y[k] + (y[k + 1] - y[k]) * tx, b = y[k + surf.nx] + (y[k + surf.nx + 1] - y[k + surf.nx]) * tx;
  return a + (b - a) * tz;
}

/* ---------- paint the paper's top-surface splats, top-down ---------- */
const W = Math.round((XR[1] - XR[0]) * RES), H = Math.round((ZR[1] - ZR[0]) * RES);
const acc = new Float32Array(W * H * 3), wsum = new Float32Array(W * H);
let used = 0;
for (let i = 0; i < n; i++) {
  const al = body[A0 + i] / 255;
  if (al < 0.05) continue;
  const px = i24(i * 9) / F, py = i24(i * 9 + 3) / F, pz = i24(i * 9 + 6) / F;
  const x = R[0] * px + R[1] * py + R[2] * pz + POS[0];
  const y = R[3] * px + R[4] * py + R[5] * pz + POS[1];
  const z = R[6] * px + R[7] * py + R[8] * pz + POS[2];
  if (x < XR[0] || x > XR[1] || z < ZR[0] || z > ZR[1]) continue;
  if (Math.abs(y - paperY(x, z)) > 0.01) continue;           // only the paper's surface
  // footprint: the two larger of the splat's three sizes (it lies flat on the paper)
  const s = [0, 1, 2].map((a) => Math.exp(body[S0 + i * 3 + a] / 16 - 10)).sort((p, q) => q - p);
  const sigma = Math.min(0.006, Math.max(0.6 / RES, Math.sqrt(s[0] * s[1]))) * RES;   // pixels
  const r = Math.ceil(sigma * 2);
  const cx = (x - XR[0]) * RES, cz = (z - ZR[0]) * RES;
  const rgb = [colour(body[C0 + i * 3]), colour(body[C0 + i * 3 + 1]), colour(body[C0 + i * 3 + 2])];
  for (let v = Math.max(0, Math.floor(cz - r)); v <= Math.min(H - 1, Math.ceil(cz + r)); v++) {
    for (let u = Math.max(0, Math.floor(cx - r)); u <= Math.min(W - 1, Math.ceil(cx + r)); u++) {
      const d2 = ((u - cx) ** 2 + (v - cz) ** 2) / (sigma * sigma);
      if (d2 > 4) continue;
      const w = al * Math.exp(-0.5 * d2);
      const k = v * W + u;
      acc[k * 3] += rgb[0] * w; acc[k * 3 + 1] += rgb[1] * w; acc[k * 3 + 2] += rgb[2] * w;
      wsum[k] += w;
    }
  }
  used++;
}
console.log(`painted ${used.toLocaleString()} paper splats into ${W} × ${H}`);

const img = new Float32Array(W * H * 3), have = new Uint8Array(W * H);
for (let k = 0; k < W * H; k++) {
  if (wsum[k] > 0.05) { have[k] = 1; for (let c = 0; c < 3; c++) img[k * 3 + c] = acc[k * 3 + c] / wsum[k]; }
}
const lum = new Float32Array(W * H);
for (let k = 0; k < W * H; k++) lum[k] = 0.2126 * img[k * 3] + 0.7152 * img[k * 3 + 1] + 0.0722 * img[k * 3 + 2];

/* ---------- image helpers ---------- */
function maxFilter(src, rad) {        // separable max over (2·rad+1)², ignoring empty pixels
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    let m = -1; for (let d = -rad; d <= rad; d++) { const uu = u + d; if (uu >= 0 && uu < W && have[v * W + uu]) m = Math.max(m, src[v * W + uu]); }
    tmp[v * W + u] = m;
  }
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    let m = -1; for (let d = -rad; d <= rad; d++) { const vv = v + d; if (vv >= 0 && vv < H) m = Math.max(m, tmp[vv * W + u]); }
    out[v * W + u] = m;
  }
  return out;
}
// Gaussian blur, approximated by three box blurs (fast at any size), normalised by
// the mask so empty pixels don't darken their neighbours
function boxPass(src, out, r, horizontal) {
  const n1 = horizontal ? H : W, n2 = horizontal ? W : H;
  for (let a = 0; a < n1; a++) {
    const idx = (b) => (horizontal ? a * W + b : b * W + a);
    let sum = 0;
    for (let b = -r; b <= r; b++) if (b >= 0 && b < n2) sum += src[idx(b)];
    for (let b = 0; b < n2; b++) {
      out[idx(b)] = sum;
      const add = b + r + 1, rem = b - r;
      if (add < n2) sum += src[idx(add)];
      if (rem >= 0) sum -= src[idx(rem)];
    }
  }
}
function boxBlur3(src, sigma) {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = Float32Array.from(src), b = new Float32Array(W * H);
  for (let i = 0; i < 3; i++) { boxPass(a, b, r, true); boxPass(b, a, r, false); }
  return a;   // un-normalised sums: divide by a blurred mask to get averages
}
function blur(src, sigma, mask) {
  const m = mask ? Float32Array.from(mask) : new Float32Array(W * H).fill(1);
  const sm = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) sm[k] = src[k] * m[k];
  const num = boxBlur3(sm, sigma), den = boxBlur3(m, sigma), out = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) out[k] = den[k] > 1e-6 ? num[k] / den[k] : 0;
  return out;
}
const px = (m) => Math.max(1, Math.round(m * RES));

/* ---------- LIGHT: the paper's brightness with the printed text removed ----------
   A max filter a little wider than a letter keeps only the paper between the
   letters; a wide blur turns that into smooth light. */
// (wide enough to bridge whole lines of small print, so the page's old
// layout doesn't show as shading)
const envRaw = blur(maxFilter(lum, px(0.009)), px(0.012), have);
// fill gaps in the scan from the paper around them, at growing distances
const cover = blur(Float32Array.from(have), px(0.012));
function fillHoles(src) {
  const out = Float32Array.from(src), ok = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) ok[k] = cover[k] > 0.25 ? 1 : 0;
  for (const sg of [0.01, 0.02, 0.04, 0.08]) {
    const f = blur(out, px(sg), ok), fw = blur(ok, px(sg));
    for (let k = 0; k < W * H; k++) if (!ok[k] && fw[k] > 0.02) { out[k] = f[k]; ok[k] = 1; }
  }
  return out;
}
const env = fillHoles(envRaw);
const envMask = new Float32Array(W * H);
for (let k = 0; k < W * H; k++) envMask[k] = have[k];
// the reference "white" of the paper: the brightest few percent
const vals = []; for (let k = 0; k < W * H; k += 7) if (have[k]) vals.push(env[k]);
vals.sort((a, b) => a - b);
const white = vals[Math.floor(vals.length * 0.97)] || 1;
// colour of the light: the paper's colour where it's bright (not the ink), smoothed
const bright = new Float32Array(W * H);
for (let k = 0; k < W * H; k++) bright[k] = have[k] && lum[k] > env[k] * 0.9 ? 1 : 0;
const chan = [0, 1, 2].map((c) => {
  const ch = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) ch[k] = img[k * 3 + c];
  return blur(ch, px(0.008), bright);
});
const chanW = blur(bright, px(0.008));
for (let c = 0; c < 3; c++) {                 // the tint, filled across gaps like the light
  const t = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) t[k] = chanW[k] > 0.05 ? chan[c][k] : 0;   // (blur() already averages)
  chan[c] = fillHoles(t);
}
// average paper colour where it's brightest, to measure the tint against
let ref = [0, 0, 0], refN = 0;
for (let k = 0; k < W * H; k += 3) if (have[k] && env[k] >= white * 0.95 && chanW[k] > 0.05) { for (let c = 0; c < 3; c++) ref[c] += chan[c][k]; refN++; }
ref = ref.map((v) => (refN ? v / refN : 1));
const refL = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2];

/* ---------- GRAIN: the fine texture, without the text ---------- */
const local = blur(lum, px(0.0025), have);
const grain = new Float32Array(W * H).fill(1);
const ink = new Uint8Array(W * H);
for (let k = 0; k < W * H; k++) if (have[k] && lum[k] < env[k] * 0.82) ink[k] = 1;   // letters
// grow the ink mask a little so letter edges don't leave outlines
const inkGrown = maxFilter(Float32Array.from(ink), 2);
const real = new Uint8Array(W * H);
for (let k = 0; k < W * H; k++) {
  if (!have[k] || inkGrown[k] > 0) continue;
  grain[k] = Math.min(1.06, Math.max(0.9, lum[k] / Math.max(1e-3, local[k])));
  real[k] = 1;
}
// where there was ink or no scan, borrow real grain from nearby paper (a few
// shifted copies), so those areas aren't smooth patches in the texture
const SHIFTS = [[37, 53], [-61, 29], [83, -47], [-29, -71], [113, 17], [-97, -101], [151, 89], [-173, 61]];
for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
  const k = v * W + u;
  if (real[k]) continue;
  for (const [du, dv] of SHIFTS) {
    const uu = u + du, vv = v + dv;
    if (uu < 0 || uu >= W || vv < 0 || vv >= H) continue;
    const j = vv * W + uu;
    if (real[j]) { grain[k] = grain[j]; break; }
  }
}
const grainS = blur(grain, 0.8);
// stored around mid-grey so it can lighten as well as darken:
// grain = 1 + (stored - 0.5) / GRAIN_SCALE   (props.js decodes it the same way)
const GRAIN_SCALE = 4;

/* ---------- the light as a clean model of the scan's lighting ----------
   The scan is too soft to resolve letters: blocks of print show up as grey
   patches, which would print the old page layout onto the new images. So
   the light is rebuilt from what lighting actually does here:
   • ACROSS the page it depends on the distance from the fold (the shadow
     where the paper curls in, the falloff toward the outer edges). For each
     distance, the brightest paper along the spine sets the level, so text
     blocks can't pull it down.
   • ALONG the spine it changes gently (light falloff toward the top/bottom).
   • Its colour is the paper's broad warm cast. */
// where the fold is: the lowest point of the paper near the middle, per row, fitted with a line
const foldPts = [];
for (let iz = 0; iz < surf.nz; iz += 2) {
  const z = surf.z0 + iz * surf.step;
  if (z < -0.17 || z > 0.15) continue;
  let best = 1e9, bx = 0;
  for (let ix = 0; ix < surf.nx; ix++) {
    const x = surf.x0 + ix * surf.step;
    if (x < -0.02 || x > 0.09) continue;
    const y = surf.y[iz * surf.nx + ix];
    if (y < best) { best = y; bx = x; }
  }
  foldPts.push([z, bx]);
}
const mz = foldPts.reduce((a, p) => a + p[0], 0) / foldPts.length, mx = foldPts.reduce((a, p) => a + p[1], 0) / foldPts.length;
const fs1 = foldPts.reduce((a, p) => a + (p[0] - mz) * (p[1] - mx), 0) / foldPts.reduce((a, p) => a + (p[0] - mz) ** 2, 0);
const foldX = (z) => mx + fs1 * (z - mz);
console.log(`fold: x = ${mx.toFixed(3)} ${fs1 >= 0 ? "+" : "-"} ${Math.abs(fs1).toFixed(3)}·(z ${mz >= 0 ? "-" : "+"} ${Math.abs(mz).toFixed(3)})`);
const ok = new Uint8Array(W * H);
for (let k = 0; k < W * H; k++) ok[k] = have[k] && cover[k] > 0.5 ? 1 : 0;
// across: profile by signed distance from the fold
const S_MIN = -0.36, S_MAX = 0.36, NB = Math.round((S_MAX - S_MIN) * RES) + 1;
const binVals = Array.from({ length: NB }, () => []);
const sOf = (u, v) => (XR[0] + (u + 0.5) / RES) - foldX(ZR[0] + (v + 0.5) / RES);
for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
  const k = v * W + u;
  if (!ok[k]) continue;
  const b = Math.round((sOf(u, v) - S_MIN) * RES);
  if (b >= 0 && b < NB) binVals[b].push(env[k]);
}
let prof = new Float32Array(NB).fill(NaN);
binVals.forEach((vals2, b) => {
  if (vals2.length < 20) return;
  vals2.sort((p, q) => p - q);
  prof[b] = vals2[Math.floor(vals2.length * 0.85)];
});
// fill + smooth the profile
for (let b = 1; b < NB; b++) if (Number.isNaN(prof[b])) prof[b] = prof[b - 1];
for (let b = NB - 2; b >= 0; b--) if (Number.isNaN(prof[b])) prof[b] = prof[b + 1];
{
  const sg = 3, out = new Float32Array(NB);
  for (let b = 0; b < NB; b++) { let s2 = 0, w2 = 0; for (let d = -9; d <= 9; d++) { const j = b + d; if (j < 0 || j >= NB) continue; const w = Math.exp(-0.5 * (d / sg) ** 2); s2 += prof[j] * w; w2 += w; } out[b] = s2 / w2; }
  prof = out;
}
const profAt = (s2) => prof[Math.min(NB - 1, Math.max(0, Math.round((s2 - S_MIN) * RES)))];
// along: how each row compares with the profile (gently smoothed)
let rowF = new Float32Array(H).fill(NaN);
for (let v = 0; v < H; v++) {
  const r = [];
  for (let u = 0; u < W; u++) { const k = v * W + u; if (ok[k]) r.push(env[k] / Math.max(1e-3, profAt(sOf(u, v)))); }
  if (r.length < 40) continue;
  r.sort((p, q) => p - q);
  rowF[v] = r[Math.floor(r.length * 0.8)];
}
for (let v = 1; v < H; v++) if (Number.isNaN(rowF[v])) rowF[v] = rowF[v - 1];
for (let v = H - 2; v >= 0; v--) if (Number.isNaN(rowF[v])) rowF[v] = rowF[v + 1];
{
  const sg = px(0.02), out = new Float32Array(H);
  for (let v = 0; v < H; v++) { let s2 = 0, w2 = 0; for (let d = -3 * sg; d <= 3 * sg; d++) { const j = v + d; if (j < 0 || j >= H) continue; const w = Math.exp(-0.5 * (d / sg) ** 2); s2 += rowF[j] * w; w2 += w; } out[v] = s2 / w2; }
  rowF = out;
}
// colour: the broad warm cast of the paper (saturated splats — the red cover,
// orange reflections — don't count)
const paper = new Float32Array(W * H);
for (let k = 0; k < W * H; k++) {
  if (!ok[k]) continue;
  const r = img[k * 3], g = img[k * 3 + 1], b = img[k * 3 + 2];
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (lum[k] > env[k] * 0.85 && sat < 0.14) paper[k] = 1;
}
const castW = blur(paper, px(0.03));
const cast = [0, 1, 2].map((c) => {
  const ch = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) ch[k] = img[k * 3 + c];
  return fillHoles(blur(ch, px(0.03), paper));
});
let lightMax = 0;
const light = new Float32Array(W * H);
for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
  const k = v * W + u;
  light[k] = profAt(sOf(u, v)) * rowF[v];
  if (ok[k]) lightMax = Math.max(lightMax, light[k]);
}
// the brightest few percent of lit paper = 1.0
const lv = []; for (let k = 0; k < W * H; k += 5) if (ok[k]) lv.push(light[k]);
lv.sort((p, q) => p - q);
const lightWhite = lv[Math.floor(lv.length * 0.98)] || lightMax || 1;

/* ---------- write the maps ---------- */
function writePNG(file, w, h, channels, get) {
  const rowLen = w * channels + 1, rawData = Buffer.alloc(rowLen * h);
  for (let v = 0; v < h; v++) {
    rawData[v * rowLen] = 0;
    for (let u = 0; u < w; u++) for (let c = 0; c < channels; c++)
      rawData[v * rowLen + 1 + u * channels + c] = Math.round(Math.min(1, Math.max(0, get(u, v, c))) * 255);
  }
  const crcTable = Array.from({ length: 256 }, (_, nn) => { let c = nn; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = channels === 3 ? 2 : 0; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rawData, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}
fs.mkdirSync(outDir, { recursive: true });
// rows run from z min (top of the pages) down; columns from x min
const lightFile = path.join(outDir, "book-light.png"), grainFile = path.join(outDir, "book-grain.png");
writePNG(lightFile, W, H, 3, (u, v, c) => {
  const k = v * W + u;
  const shade = light[k] / lightWhite;                                    // how lit the paper is
  const l = 0.2126 * cast[0][k] + 0.7152 * cast[1][k] + 0.0722 * cast[2][k];
  const tint = l > 0 ? (cast[c][k] / ref[c]) * (refL / l) : 1;            // colour cast only
  return shade * Math.min(1.05, Math.max(0.95, tint));
});
writePNG(grainFile, W, H, 1, (u, v) => 0.5 + (grainS[v * W + u] - 1) * GRAIN_SCALE);
console.log(`paper white ${white.toFixed(3)}, colour ${ref.map((v) => v.toFixed(3)).join(" ")}`);
console.log(`→ ${lightFile} (${(fs.statSync(lightFile).size / 1024).toFixed(0)} KB), ${grainFile} (${(fs.statSync(grainFile).size / 1024).toFixed(0)} KB)`);
