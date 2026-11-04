/* =====================================================================
   STAND-INS for things that don't have a splat yet:
   • the catalog card (until your team's scan exists)
   • images laid onto the book's pages (PAGES in config-book.js)
   All are ordinary three.js objects, so they go through the same
   memory look (bloom, blur, grade) as the splats.
===================================================================== */
import * as THREE from "three";

/* ---------- the title card: a flat image (PNG with transparency) ----------
   Transparent parts (around the edges, the punched hole) show the void
   behind. `width` is in scene units; the height follows the image. */
export async function createImageCard(url, width = 0.5, brightness = 1) {
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const { width: w, height: h } = tex.image;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * h / w),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(brightness, brightness, brightness),
                                  transparent: true, alphaTest: 0.02, depthWrite: false,
                                  side: THREE.DoubleSide, toneMapped: false })
  );
  mesh.name = "title-card";
  return mesh;
}

/* ---------- an image laid onto a page of the book ----------
   A thin sheet draped over the scanned paper: a grid in the x–z plane whose
   height comes from "surface" (a height map measured from the splat by
   tools/page-surface.mjs, so it curls into the spine exactly like the scan,
   wherever you move it), or else from "curve" (height across the page,
   outer edge → spine), plus "lift". Drawn over the splats (like the door), so it covers the
   scanned paper underneath.

   A page can show one image, or a SEQUENCE of images that fade from one to
   the next as you scroll (each image is its own layer on the same sheet).
   Returns { group, rebuild(def), update(progress, opacity), stops(), … }. */

// which images a page shows, in order
const imagesOf = (d) => (d.sequence?.images?.length ? d.sequence.images : [d.image]);
const smoothstep = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** The opacity of each image's layer at scroll progress p.
 *  Each change CROSS-FADES from one image to the next, starting at "at" and
 *  lasting "fade": the outgoing image stays solid underneath while the
 *  incoming one fades in on top of it, so on screen they always add up to
 *  100% (95/5 → 50/50 → 5/95) and the scanned page never shows through. */
export function sequenceWeights(d, p) {
  const n = imagesOf(d).length;
  const w = new Array(n).fill(0);
  const changes = (d.sequence?.changes || []).slice(0, n - 1);
  const span = (c) => [c.at ?? 1, (c.at ?? 1) + Math.max(0, c.fade ?? 0.08)];
  // a change in progress: old image solid underneath, new one fading in on top
  for (let i = 0; i < changes.length; i++) {
    const [a, b] = span(changes[i]);
    if (p >= a && p < b) {
      w[i] = 1;
      w[i + 1] = smoothstep(clamp01((p - a) / Math.max(1e-6, b - a)));
      return w;
    }
  }
  // otherwise: the latest image whose change has finished
  let k = 0;
  changes.forEach((c, i) => { if (p >= span(c)[1]) k = i + 1; });
  w[k] = 1;
  return w;
}
/** Progress values where each new image has fully faded in (the scroll rests there). */
export function sequenceStops(d) {
  const seq = d.sequence;
  if (!seq || seq.stop === false) return [];
  return (seq.changes || []).slice(0, imagesOf(d).length - 1).map((c) => ({
    at: Math.min(1, (c.at ?? 1) + (c.fade ?? 0.08)),
    hold: c.hold ?? seq.hold,
  }));
}

export function createBookPage(def, { anisotropy = 8 } = {}) {
  const group = new THREE.Group();
  group.name = `page-${def.id}`;
  let geom = new THREE.BufferGeometry();
  // one layer per image, all on the same sheet
  const layers = imagesOf(def).map((src, i) => {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, side: THREE.DoubleSide,
      toneMapped: false, depthWrite: false,
      depthTest: false,   // always over the scanned paper (the camera stays above the book)
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 8 + i * 0.01;   // after the splats, in sequence order
    group.add(mesh);
    return { src, img: null, mat, mesh, weight: i === 0 ? 1 : 0 };
  });

  // EFFECTS LAYER: the scan's own light and paper grain, multiplied over the
  // image (maps made by tools/page-effects.mjs). Same shape as the sheet; it
  // reads the maps by position on the book, so it stays put when the sheet's
  // corners are moved.
  let fx = null;
  if (def.effects) {
    const e = def.effects, load = new THREE.TextureLoader();
    const lightTex = e.light ? load.load(e.light) : null;
    if (lightTex) lightTex.colorSpace = THREE.SRGBColorSpace;   // a colour multiplier, as seen
    const grainTex = e.grain ? load.load(e.grain) : null;      // plain numbers, decoded below
    const area = e.area || { x: [-0.28, 0.30], z: [-0.21, 0.20] };
    const fxMat = new THREE.ShaderMaterial({
      uniforms: {
        lightMap: { value: lightTex }, grainMap: { value: grainTex },
        hasLight: { value: lightTex ? 1 : 0 }, hasGrain: { value: grainTex ? 1 : 0 },
        areaMin: { value: new THREE.Vector2(area.x[0], area.z[0]) },
        areaSize: { value: new THREE.Vector2(area.x[1] - area.x[0], area.z[1] - area.z[0]) },
        light: { value: 1 }, grain: { value: 1 }, strength: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vXZ;
        void main() {
          // position on the book (the sheet's own coordinates, so it still works
          // when the book sits somewhere else in the scene, as in the library)
          vXZ = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D lightMap, grainMap;
        uniform float hasLight, hasGrain, light, grain, strength;
        uniform vec2 areaMin, areaSize;
        varying vec2 vXZ;
        void main() {
          vec2 uv = (vXZ - areaMin) / areaSize;
          uv.y = 1.0 - uv.y;                       // the maps' top row is the top of the pages
          vec3 f = vec3(1.0);
          if (hasLight > 0.5) f *= mix(vec3(1.0), texture2D(lightMap, uv).rgb, light);
          if (hasGrain > 0.5) {
            // grain is stored around mid-grey: 1 + (value - 0.5) / 4, scaled by "grain"
            float g = 1.0 + (texture2D(grainMap, uv).r - 0.5) * 0.25 * grain;
            f *= pow(g / (1.0 + 0.05 * grain), 2.2);   // as a linear multiplier, kept ≤ 1
          }
          gl_FragColor = vec4(mix(vec3(1.0), min(f, vec3(1.0)), strength), 1.0);
        }`,
      transparent: true, premultipliedAlpha: true, blending: THREE.MultiplyBlending,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    fx = new THREE.Mesh(geom, fxMat);
    fx.renderOrder = 9;   // right after the image
    group.add(fx);
  }

  let cur = { ...def }, opacity = 0, surface = null;

  // height of the paper at u (0 = outer edge, 1 = spine), from def.curve
  function heightAt(u, curve) {
    if (!curve?.length) return 0;
    if (u <= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i++) {
      const [u0, y0] = curve[i - 1], [u1, y1] = curve[i];
      if (u <= u1) { const t = (u - u0) / Math.max(1e-6, u1 - u0); return y0 + (y1 - y0) * t * t * (3 - 2 * t) ; }
    }
    return curve[curve.length - 1][1];
  }

  // the page's four corners in x–z, [outer-top, spine-top, spine-bottom, outer-bottom]:
  // either given directly ("corners"), or made from center / size / rotationY
  function cornersOf(d) {
    if (d.corners) return d.corners;
    const [cx, cz] = d.center, [w, h] = d.size;
    const a = THREE.MathUtils.degToRad(d.rotationY || 0), ca = Math.cos(a), sa = Math.sin(a);
    const outer = d.side === "right" ? 1 : -1;
    const at = (lx, lz) => [cx + lx * ca + lz * sa, cz - lx * sa + lz * ca];
    return [at(outer * w / 2, -h / 2), at(-outer * w / 2, -h / 2), at(-outer * w / 2, h / 2), at(outer * w / 2, h / 2)];
  }
  const dist2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // average width (outer edge → spine) and height (top → bottom) of the page
  function pageSize(d) {
    const [ot, it, ib, ob] = cornersOf(d);
    return [(dist2(ot, it) + dist2(ob, ib)) / 2, (dist2(ot, ob) + dist2(it, ib)) / 2];
  }

  // Height of the sheet at each grid point, [column across the page][row].
  // Real paper curls across the page (into the spine) but runs straight from
  // top to bottom, so by default ("ruled", on unless ruled: false) each column
  // is a straight line through the scan's heights, fitted while ignoring
  // outliers. Ragged or thin scan data at the edges then can't put kinks or
  // notches in the sheet's edges.
  let heights = null, gridNU = 96, gridNV = 32;
  function sheetHeights(d, NU, NV, at, io, iv) {
    gridNU = NU; gridNV = NV;
    const cols = [];
    for (let i = 0; i <= NU; i++) {
      const o = i / NU, col = [];
      for (let j = 0; j <= NV; j++) {
        const v = j / NV;
        const [sx, sz] = at(Math.max(io, o), Math.max(iv, Math.min(1 - iv, v)));
        col.push(surface ? surface(sx, sz) : heightAt(o, d.curve));
      }
      if (surface && d.ruled !== false) {
        // fit y = a + b·v over the inner rows, drop points > 2 mm off, fit again
        const rows = [];
        for (let j = 0; j <= NV; j++) { const v = j / NV; if (v >= iv && v <= 1 - iv) rows.push([v, col[j]]); }
        let a = 0, b = 0, use = rows;
        for (let pass = 0; pass < 3; pass++) {
          const n = use.length || 1;
          const mv = use.reduce((t, r) => t + r[0], 0) / n, my = use.reduce((t, r) => t + r[1], 0) / n;
          const sxx = use.reduce((t, r) => t + (r[0] - mv) ** 2, 0), sxy = use.reduce((t, r) => t + (r[0] - mv) * (r[1] - my), 0);
          b = sxx > 1e-9 ? sxy / sxx : 0; a = my - b * mv;
          const keep = rows.filter((r) => Math.abs(r[1] - (a + b * r[0])) < 0.002);
          if (keep.length < 4 || keep.length === use.length) break;
          use = keep;
        }
        for (let j = 0; j <= NV; j++) col[j] = a + b * (j / NV);
      }
      cols.push(col);
    }
    return cols;
  }

  function buildGeometry(d) {
    const NU = 96, NV = 32;   // fine across the page, so the curl into the spine is smooth
    const [ot, it, ib, ob] = cornersOf(d);
    const [w, h] = pageSize(d);
    // point on the page: o = 0 at the outer edge → 1 at the spine, v = 0 top → 1 bottom
    const at = (o, v) => {
      const tx = ot[0] + (it[0] - ot[0]) * o, tz = ot[1] + (it[1] - ot[1]) * o;
      const bx = ob[0] + (ib[0] - ob[0]) * o, bz = ob[1] + (ib[1] - ob[1]) * o;
      return [tx + (bx - tx) * v, tz + (bz - tz) * v];
    };
    // heights along the top, bottom and outer edges are read a little inside the
    // page, so those edges stay straight instead of following the scan's ragged
    // drop-off at the paper's edge (the spine side keeps its curl into the fold)
    const inset = d.edgeInset ?? 0.012;
    const io = Math.min(0.4, inset / w), iv = Math.min(0.4, inset / h);
    const right = d.side === "right";
    heights = sheetHeights(d, NU, NV, at, io, iv);
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      for (let i = 0; i <= NU; i++) {
        const s = i / NU;                     // 0 = left of the image, 1 = right
        const o = right ? 1 - s : s;          // the left page's outer edge is the image's left
        const [x, z] = at(o, v);
        const y = heights[Math.round(o * NU)][j];
        pos.push(x, y + (d.lift ?? 0.002), z);
        uv.push(s, 1 - v);
      }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a0 = j * (NU + 1) + i, b0 = a0 + NU + 1;
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    geom.dispose();
    geom = g;
    for (const l of layers) l.mesh.geometry = g;
    if (fx) fx.geometry = g;
  }

  // the image, fitted to the page's shape, with soft edges and a shadow
  // toward the spine, drawn into a canvas the size of the page
  function buildTexture(d) { for (const l of layers) drawLayer(l, d); }
  function drawLayer(layer, d) {
    const img = layer.img, mat = layer.mat;
    if (!img) return;
    const [w, h] = pageSize(d);
    // full resolution (up to 4096 tall, the safe texture limit), so the image stays crisp up close
    const H = Math.min(4096, img.naturalHeight || 2500), W = Math.round(H * (w / h));
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    // fill: "auto" = the image's top-left pixel (a flat background extends seamlessly)
    let fill = d.fill ?? "auto";
    if (fill === "auto") {
      const p = document.createElement("canvas"); p.width = p.height = 1;
      const pg = p.getContext("2d"); pg.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
      const [r, gg, b] = pg.getImageData(0, 0, 1, 1).data;
      fill = `rgb(${r},${gg},${b})`;
    }
    if (fill && fill !== "none") { g.fillStyle = fill; g.fillRect(0, 0, W, H); }
    // fit: "contain" shows the whole image, "cover" fills the page (crops), "stretch" squashes
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const k = d.fit === "cover" ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
    let dw = iw * k, dh = ih * k;
    if (d.fit === "stretch") { dw = W; dh = H; }
    const zoom = d.zoom ?? 1;
    dw *= zoom; dh *= zoom;
    const [ox, oy] = d.offset || [0, 0];   // nudge the image on the page, as a fraction of the page
    g.drawImage(img, (W - dw) / 2 + ox * W, (H - dh) / 2 + oy * H, dw, dh);
    // shadow toward the spine, where the paper curves away from the light
    const shade = d.shade ?? 0;
    if (shade > 0) {
      const inner = d.side === "right" ? 0 : W;
      const grd = g.createLinearGradient(inner, 0, inner + (d.side === "right" ? 1 : -1) * W * 0.22, 0);
      grd.addColorStop(0, `rgba(30,20,12,${shade})`); grd.addColorStop(1, "rgba(30,20,12,0)");
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
    // soft edges, so the sheet melts into the scanned paper
    const f = d.feather ?? 0;
    if (f > 0) {
      g.globalCompositeOperation = "destination-in";
      const fx = W * f, fy = H * f * (w / h);
      const gx = g.createLinearGradient(0, 0, W, 0);
      gx.addColorStop(0, "rgba(0,0,0,0)"); gx.addColorStop(fx / W, "#000");
      gx.addColorStop(1 - fx / W, "#000"); gx.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gx; g.fillRect(0, 0, W, H);
      const gy = g.createLinearGradient(0, 0, 0, H);
      gy.addColorStop(0, "rgba(0,0,0,0)"); gy.addColorStop(fy / H, "#000");
      gy.addColorStop(1 - fy / H, "#000"); gy.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gy; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "source-over";
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;   // crisp when the page is seen at an angle
    mat.map?.dispose();
    mat.map = tex;
    mat.needsUpdate = true;
  }

  function applyMaterial(d) {
    const b = d.brightness ?? 1;
    let clear = 1;                       // how much of the scanned paper still shows through
    for (const l of layers) {
      l.mat.color.setRGB(b, b, b);
      l.mat.opacity = l.img ? opacity * (d.opacity ?? 1) * l.weight : 0;
      l.mesh.visible = l.mat.opacity > 0.002;
      clear *= 1 - l.mat.opacity;
    }
    const cover = 1 - clear;
    group.visible = cover > 0.002;
    if (fx) {
      const e = d.effects || {}, u = fx.material.uniforms;
      u.light.value = e.lightStrength ?? 1;
      u.grain.value = e.grainStrength ?? 1;
      u.strength.value = cover * (e.enabled === false ? 0 : 1);   // one layer of light, fading with the images
    }
  }

  // what changed decides how much to rebuild (the texture is the slow part)
  const TEX_KEYS = ["size", "corners", "fit", "fill", "zoom", "offset", "shade", "feather"];
  function rebuild(d) {
    const texChanged = TEX_KEYS.some((k) => JSON.stringify(d[k]) !== JSON.stringify(cur[k]));
    cur = { ...d };
    buildGeometry(cur);
    if (texChanged) buildTexture(cur);
    applyMaterial(cur);
  }

  buildGeometry(cur);
  if (def.surface) {
    loadSurface(def.surface).then((fn) => { surface = fn; buildGeometry(cur); })
      .catch(() => console.warn(`Page surface "${def.surface}" not found; using "curve".`));
  }
  for (const layer of layers) {
    const loader = new Image();
    loader.decoding = "async";
    loader.onload = () => { layer.img = loader; drawLayer(layer, cur); applyMaterial(cur); };
    loader.onerror = () => console.warn(`Page image "${layer.src}" not found.`);
    loader.src = layer.src;
  }

  // a point on the sheet (o = 0 outer edge → 1 spine, v = 0 top → 1 bottom), for ?dev handles
  function pointAt(o, v) {
    const [ot, it, ib, ob] = cornersOf(cur);
    const tx = ot[0] + (it[0] - ot[0]) * o, tz = ot[1] + (it[1] - ot[1]) * o;
    const bx = ob[0] + (ib[0] - ob[0]) * o, bz = ob[1] + (ib[1] - ob[1]) * o;
    const x = tx + (bx - tx) * v, z = tz + (bz - tz) * v;
    const [w, h] = pageSize(cur), inset = cur.edgeInset ?? 0.012;
    const so = Math.max(Math.min(0.4, inset / w), o), sv = Math.max(Math.min(0.4, inset / h), Math.min(1 - Math.min(0.4, inset / h), v));
    const sx = (ot[0] + (it[0] - ot[0]) * so) * (1 - sv) + (ob[0] + (ib[0] - ob[0]) * so) * sv;
    const sz = (ot[1] + (it[1] - ot[1]) * so) * (1 - sv) + (ob[1] + (ib[1] - ob[1]) * so) * sv;
    let y = surface ? surface(sx, sz) : heightAt(o, cur.curve);
    if (heights) {                          // the sheet's own (straightened) height there
      const fo = Math.min(1, Math.max(0, o)) * gridNU, fv = Math.min(1, Math.max(0, v)) * gridNV;
      const i0 = Math.floor(fo), j0 = Math.floor(fv), i1 = Math.min(gridNU, i0 + 1), j1 = Math.min(gridNV, j0 + 1);
      const tu = fo - i0, tv = fv - j0;
      const h0 = heights[i0][j0] + (heights[i1][j0] - heights[i0][j0]) * tu;
      const h1 = heights[i0][j1] + (heights[i1][j1] - heights[i0][j1]) * tu;
      y = h0 + (h1 - h0) * tv;
    }
    y += cur.lift ?? 0.002;
    return [x, y, z];
  }

  return {
    group,
    get current() { return cur; },
    corners: () => cornersOf(cur).map((p) => [...p]),
    pointAt,
    rebuild,
    setOpacity(o) { opacity = o; applyMaterial(cur); },
    /** each frame: scroll progress (picks the image) and overall visibility */
    update(p, o) {
      const w = sequenceWeights(cur, p);
      layers.forEach((l, i) => { l.weight = w[i] ?? 0; });
      opacity = o;
      applyMaterial(cur);
    },
    stops: () => sequenceStops(cur),
  };
}

/* ---------- the stand-in catalog card ---------- */
// A 5 × 3 card, 0.5 wide, facing +z, with a small flag (anchor in the middle)
// drawn at x = +0.12 so it lines up with ANCHOR in config.js.
export function createPlaceholderCard() {
  const W = 1000, H = 600;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");

  // card stock
  const grd = g.createRadialGradient(W * 0.3, H * 0.2, 50, W * 0.5, H * 0.5, W * 0.7);
  grd.addColorStop(0, "#f6efdf"); grd.addColorStop(1, "#e0d3b8");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // ruled lines + red header rule
  g.strokeStyle = "rgba(80,120,160,0.25)"; g.lineWidth = 2;
  for (let y = 120; y < H; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = "rgba(190,70,60,0.6)"; g.beginPath(); g.moveTo(0, 78); g.lineTo(W, 78); g.stroke();
  // typed lines (abstract, not real text)
  g.fillStyle = "rgba(43,38,32,0.55)";
  for (let i = 0; i < 6; i++) {
    const y = 98 + i * 42, x0 = i === 0 ? 50 : 150, len = [250, 380, 300, 340, 220, 260][i];
    for (let x = x0; x < x0 + len; x += 14) g.fillRect(x, y, 9, 12);
  }
  // punched hole
  g.fillStyle = "#000"; g.beginPath(); g.arc(W / 2, H - 40, 16, 0, Math.PI * 2); g.fill();

  // small flag on the right: white field, gold anchor (centre = anchor point)
  const fx = W / 2 + 0.12 * (W / 0.5), fy = H / 2;   // 0.12 world units right of centre
  g.fillStyle = "#fbfaf6"; g.fillRect(fx - 95, fy - 65, 190, 130);
  g.strokeStyle = "rgba(0,0,0,0.15)"; g.lineWidth = 2; g.strokeRect(fx - 95, fy - 65, 190, 130);
  drawAnchor(g, fx, fy, 1);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.3),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false })
  );
  mesh.name = "placeholder-card";
  return mesh;
}

function drawAnchor(g, x, y, s) {
  g.save();
  g.translate(x, y); g.scale(s, s);
  g.strokeStyle = "#c9a227"; g.fillStyle = "#c9a227";
  g.lineWidth = 7; g.lineCap = "round";
  g.beginPath(); g.arc(0, -36, 8, 0, Math.PI * 2); g.stroke();      // ring
  g.beginPath(); g.moveTo(0, -28); g.lineTo(0, 38); g.stroke();      // shank
  g.beginPath(); g.moveTo(-20, -16); g.lineTo(20, -16); g.stroke();  // stock
  g.beginPath(); g.arc(0, 10, 30, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); // arms
  for (const sx of [-1, 1]) {                                        // flukes
    g.beginPath(); g.moveTo(sx * 27, 18); g.lineTo(sx * 36, 10); g.lineTo(sx * 31, 26); g.closePath(); g.fill();
  }
  g.restore();
}

/* ---------- the paper's height map (tools/page-surface.mjs) ---------- */
const surfaces = new Map();
function loadSurface(url) {
  if (!surfaces.has(url)) {
    surfaces.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(url);
      return r.json();
    }).then(({ x0, z0, step, nx, nz, y }) => (x, z) => {
      // bilinear between the four nearest heights
      const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / step));
      const fz = Math.min(nz - 1.001, Math.max(0, (z - z0) / step));
      const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      const k = iz * nx + ix;
      const a = y[k] + (y[k + 1] - y[k]) * tx;
      const b = y[k + nx] + (y[k + nx + 1] - y[k + nx]) * tx;
      return a + (b - a) * tz;
    }));
  }
  return surfaces.get(url);
}
