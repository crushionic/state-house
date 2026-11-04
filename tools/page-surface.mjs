#!/usr/bin/env node
/* =====================================================================
   page-surface.mjs — measure the shape of the book's paper from the splat,
   so the images in PAGES (config-book.js) lie exactly on it, curl into the
   spine and all.

   Writes a height map: for a grid over the book (in the site's world
   coordinates, after the SPLATS position + rotation), the height of the
   top surface of the paper. props.js reads it and drapes each page image
   over it.

   Usage (Node 22.15 or newer, nothing to install):
     node tools/page-surface.mjs splats/book.spz splats/book-surface.json \
          --position 0.0641,-0.1778,0.0736 --rotation -103.74,1.78,29.14

   Use the same position / rotation as the book's entry in SPLATS.
   Options: --step 0.003 (grid spacing), --x -0.30,0.30 --z -0.22,0.22 (area)
===================================================================== */
import fs from "node:fs";
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
const STEP = opt("--step", 0.003);
const XR = opt("--x", [-0.30, 0.30]);
const ZR = opt("--z", [-0.22, 0.22]);
const [input, output] = args;
if (!input || !output) {
  console.log("usage: node tools/page-surface.mjs book.spz book-surface.json --position x,y,z --rotation x,y,z");
  process.exit(1);
}

/* ---------- read positions + opacity (SPZ v2–v3 gzip, v4 zstd) ---------- */
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
const alphaAt = (i) => body[n * 9 + i] / 255;

/* ---------- three.js Euler XYZ rotation ---------- */
const [a, b, c] = ROT.map((d) => (d * Math.PI) / 180);
const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
const R = [
  cb * cc, -cb * sc, sb,
  ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb,
  sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb,
];

/* ---------- bin the splats ---------- */
const NX = Math.round((XR[1] - XR[0]) / STEP) + 1, NZ = Math.round((ZR[1] - ZR[0]) / STEP) + 1;
const bins = Array.from({ length: NX * NZ }, () => []);
const count = new Uint32Array(NX * NZ);   // splats whose centre is in the cell itself
for (let i = 0; i < n; i++) {
  if (alphaAt(i) < 0.08) continue;                        // faint haze isn't paper
  const px = i24(i * 9) / F, py = i24(i * 9 + 3) / F, pz = i24(i * 9 + 6) / F;
  const x = R[0] * px + R[1] * py + R[2] * pz + POS[0];
  const y = R[3] * px + R[4] * py + R[5] * pz + POS[1];
  const z = R[6] * px + R[7] * py + R[8] * pz + POS[2];
  if (y < -0.12 || y > 0.06) continue;                    // the table below, floaters above
  // each splat counts toward its cell and the 8 around it (a little smoothing)
  const gx = Math.round((x - XR[0]) / STEP), gz = Math.round((z - ZR[0]) / STEP);
  if (gx >= 0 && gx < NX && gz >= 0 && gz < NZ) count[gz * NX + gx]++;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ix = gx + dx, iz = gz + dz;
    if (ix >= 0 && ix < NX && iz >= 0 && iz < NZ) bins[iz * NX + ix].push(y);
  }
}

/* ---------- top surface = 85th percentile of height in each cell ---------- */
let h = new Float64Array(NX * NZ).fill(NaN);
bins.forEach((ys, k) => {
  // too few splats nearby to trust (parts of the scan are covered by a few
  // large splats): leave it as a hole and fill it from the rows around it
  if (ys.length < 12) return;
  ys.sort((p, q) => p - q);
  h[k] = ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.85))];
});
// fill holes along the spine first (z), between the measured rows on either
// side: the paper's cross-section changes slowly along the spine
for (let ix = 0; ix < NX; ix++) {
  let last = -1;
  for (let iz = 0; iz <= NZ; iz++) {
    const ok = iz < NZ && !Number.isNaN(h[iz * NX + ix]);
    if (!ok) continue;
    if (last >= 0 && iz - last > 1 && (iz - last) * STEP < 0.16) {
      const a = h[last * NX + ix], b = h[iz * NX + ix];
      for (let j = last + 1; j < iz; j++) h[j * NX + ix] = a + (b - a) * (j - last) / (iz - last);
    }
    last = iz;
  }
}
// then any remaining holes from their neighbours, and smooth gently (keeps the spine's curl)
for (let pass = 0; pass < 40; pass++) {
  let holes = 0;
  const next = h.slice();
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const k = iz * NX + ix;
    if (!Number.isNaN(h[k])) continue;
    let s = 0, m = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jx >= NX || jz < 0 || jz >= NZ) continue;
      const v = h[jz * NX + jx];
      if (!Number.isNaN(v)) { s += v; m++; }
    }
    if (m) next[k] = s / m; else holes++;
  }
  h = next;
  if (!holes) break;
}
// stray splats can lift a cell: replace any height far from its neighbourhood's
// median (5 × 5) with that median
{
  const next = h.slice();
  for (let iz = 2; iz < NZ - 2; iz++) for (let ix = 2; ix < NX - 2; ix++) {
    const v = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) v.push(h[(iz + dz) * NX + ix + dx]);
    v.sort((p, q) => p - q);
    const med = v[12], k = iz * NX + ix;
    if (Math.abs(h[k] - med) > 0.003) next[k] = med;
  }
  h = next;
}
// the paper changes slowly along the spine (z) but curls fast across it (x):
// a running median along z (±4 cells) evens out sparse patches without
// softening the curl
{
  const next = h.slice();
  for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) {
    const v = [];
    for (let dz = -4; dz <= 4; dz++) { const jz = iz + dz; if (jz >= 0 && jz < NZ) v.push(h[jz * NX + ix]); }
    v.sort((p, q) => p - q);
    next[iz * NX + ix] = v[v.length >> 1];
  }
  h = next;
}
for (let pass = 0; pass < 2; pass++) {
  const next = h.slice();
  for (let iz = 1; iz < NZ - 1; iz++) for (let ix = 1; ix < NX - 1; ix++) {
    let s = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) s += h[(iz + dz) * NX + ix + dx] * (dx || dz ? 1 : 4);
    next[iz * NX + ix] = s / 12;
  }
  h = next;
}

const out = {
  note: "Height of the book's paper (y) on a grid in the site's world coordinates. Made by tools/page-surface.mjs.",
  x0: XR[0], z0: ZR[0], step: STEP, nx: NX, nz: NZ,
  y: Array.from(h, (v) => (Number.isNaN(v) ? 0 : Math.round(v * 1e4) / 1e4)),
};
fs.writeFileSync(output, JSON.stringify(out));
console.log(`${NX} × ${NZ} heights → ${output} (${(fs.statSync(output).size / 1024).toFixed(0)} KB)`);
