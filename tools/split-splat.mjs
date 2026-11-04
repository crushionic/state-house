#!/usr/bin/env node
/* =====================================================================
   split-splat.mjs — make a big .spz lighter for the web.

   • drops nearly invisible splats (opacity below --min-alpha)
   • trims view-dependent colour (spherical harmonics) to --max-sh
   • cuts the scene into ZONES (boxes) so the site only draws the zone(s)
     you are standing in
   • writes each zone as a standard SPZ v3 file, readable by any Spark 2.x

   No installs needed: Node 22.15 or newer (it has zstd built in).

   Usage:
     node tools/split-splat.mjs splats/statehousepart1.spz tools/zones.json splats/zones \
          --min-alpha 0.02 --max-sh 1

   zones.json lists boxes in the SITE's world coordinates (after the
   rotation you use in config.js). The first zone that matches a splat
   gets it; a zone with no limits takes everything left over. Example:
     { "rotation": [180, 0, 0],
       "zones": [
         { "name": "exterior", "x": [0.85, null] },
         { "name": "rest" } ] }
   [min, max] per axis; null = no limit.
===================================================================== */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = Number(args[i + 1]);
  args.splice(i, 2);
  return v;
};
const MIN_ALPHA = flag("--min-alpha", 0.02);
const MAX_SH = flag("--max-sh", 1);
const [input, zonesFile, outDir] = args;
if (!input || !zonesFile || !outDir) {
  console.log("usage: node tools/split-splat.mjs input.spz zones.json outDir [--min-alpha 0.02] [--max-sh 1]");
  process.exit(1);
}

/* ---------- read (v1–v3 gzip, or v4 NGSP/zstd) ---------- */
const MAGIC = 0x5053474e;
function readSpz(file) {
  let raw = fs.readFileSync(file);
  let header, body;
  if (raw.readUInt32LE(0) === MAGIC && raw.readUInt32LE(4) === 4) {
    const n = raw.readUInt32LE(8), nStreams = raw[15], toc = raw.readUInt32LE(16);
    const parts = [];
    let cur = toc + nStreams * 16;
    for (let i = 0; i < nStreams; i++) {
      const size = Number(raw.readBigUInt64LE(toc + i * 16));
      parts.push(zlib.zstdDecompressSync(raw.subarray(cur, cur + size)));
      cur += size;
    }
    header = { n, sh: raw[12], frac: raw[13], flags: raw[14], version: 4 };
    body = Buffer.concat(parts);
  } else {
    raw = zlib.gunzipSync(raw);
    if (raw.readUInt32LE(0) !== MAGIC) throw new Error("not an SPZ file");
    header = { version: raw.readUInt32LE(4), n: raw.readUInt32LE(8), sh: raw[12], frac: raw[13], flags: raw[14] };
    if (header.version < 2) throw new Error("SPZ v1 is not supported");
    body = raw.subarray(16);
  }
  const { n } = header;
  const shBytes = 3 * [0, 3, 8, 15][header.sh];
  const qBytes = header.version >= 3 ? 4 : 3;
  let o = 0;
  const take = (len) => { const b = body.subarray(o, o + len); o += len; return b; };
  return {
    ...header, shBytes, qBytes,
    pos: take(n * 9), alpha: take(n), color: take(n * 3), scale: take(n * 3),
    rot: take(n * qBytes), shData: take(n * shBytes),
  };
}

/* ---------- zones ---------- */
const zcfg = JSON.parse(fs.readFileSync(zonesFile, "utf8"));
const [rx, ry, rz] = (zcfg.rotation || [0, 0, 0]).map((d) => (d * Math.PI) / 180);
// rotation matrix for Euler XYZ (three.js default order)
function rotMatrix(a, b, c) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [
    cb * cc, -cb * sc, sb,
    ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb,
    sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb,
  ];
}
const R = rotMatrix(rx, ry, rz);
const inRange = (v, r) => !r || ((r[0] == null || v >= r[0]) && (r[1] == null || v < r[1]));

/* ---------- go ---------- */
const s = readSpz(input);
console.log(`read ${s.n.toLocaleString()} splats (SPZ v${s.version}, SH degree ${s.sh})`);
const outSh = Math.min(MAX_SH, s.sh);
const outShBytes = 3 * [0, 3, 8, 15][outSh];
const frac = 1 << s.frac;
const i24 = (b, k) => { let v = b[k] | (b[k + 1] << 8) | (b[k + 2] << 16); return v & 0x800000 ? v - 0x1000000 : v; };

const assign = new Int16Array(s.n).fill(-1);
const counts = new Array(zcfg.zones.length).fill(0);
let dropped = 0;
for (let i = 0; i < s.n; i++) {
  if (s.alpha[i] / 255 < MIN_ALPHA) { dropped++; continue; }
  const px = i24(s.pos, i * 9) / frac, py = i24(s.pos, i * 9 + 3) / frac, pz = i24(s.pos, i * 9 + 6) / frac;
  const wx = R[0] * px + R[1] * py + R[2] * pz;
  const wy = R[3] * px + R[4] * py + R[5] * pz;
  const wz = R[6] * px + R[7] * py + R[8] * pz;
  for (let z = 0; z < zcfg.zones.length; z++) {
    const zn = zcfg.zones[z];
    if (inRange(wx, zn.x) && inRange(wy, zn.y) && inRange(wz, zn.z)) { assign[i] = z; counts[z]++; break; }
  }
}
console.log(`dropped ${dropped.toLocaleString()} splats under ${MIN_ALPHA} opacity`);

fs.mkdirSync(outDir, { recursive: true });
const base = path.basename(input).replace(/\.[^.]+$/, "");
zcfg.zones.forEach((zn, z) => {
  const m = counts[z];
  const head = Buffer.alloc(16);
  head.writeUInt32LE(MAGIC, 0); head.writeUInt32LE(3, 4); head.writeUInt32LE(m, 8);
  head[12] = outSh; head[13] = s.frac; head[14] = s.flags & 0x01; head[15] = 0;
  const pos = Buffer.alloc(m * 9), al = Buffer.alloc(m), col = Buffer.alloc(m * 3),
        sc = Buffer.alloc(m * 3), rot = Buffer.alloc(m * 4), sh = Buffer.alloc(m * outShBytes);
  let j = 0;
  for (let i = 0; i < s.n; i++) {
    if (assign[i] !== z) continue;
    s.pos.copy(pos, j * 9, i * 9, i * 9 + 9);
    al[j] = s.alpha[i];
    s.color.copy(col, j * 3, i * 3, i * 3 + 3);
    s.scale.copy(sc, j * 3, i * 3, i * 3 + 3);
    if (s.qBytes === 4) s.rot.copy(rot, j * 4, i * 4, i * 4 + 4);
    else throw new Error("SPZ v2 rotations: re-export as v3 or v4 first");
    if (outShBytes) s.shData.copy(sh, j * outShBytes, i * s.shBytes, i * s.shBytes + outShBytes);
    j++;
  }
  const file = path.join(outDir, `${base}-${zn.name}.spz`);
  fs.writeFileSync(file, zlib.gzipSync(Buffer.concat([head, pos, al, col, sc, rot, sh]), { level: 9 }));
  console.log(`${zn.name.padEnd(10)} ${m.toLocaleString().padStart(10)} splats  ${(fs.statSync(file).size / 1e6).toFixed(1)} MB  → ${file}`);
});
