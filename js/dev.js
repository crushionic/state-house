/* =====================================================================
   DEV / AUTHORING TOOLS — only loaded when the address ends in ?dev
   (works the same on index.html?dev and book.html?dev)

   CAMERA
   F        free camera on/off (drag to look, W A S D move, Q / E down / up,
            Shift = faster, Alt = slower)
   L        show / hide the camera path in 3D (selected keyframe in white)
   [ / ]    jump to + select the previous / next keyframe

   KEYFRAMES (the list in the panel; edits apply live, nothing is saved
   to config until you paste)
   click    a keyframe in the list: select it and jump there
   U        set the selected keyframe from the camera (pos, look, fov)
   I        insert a new keyframe here, from the camera
   Delete   delete the selected keyframe
   Z        undo the last keyframe edit
   C        copy the whole CAMERA_PATH, ready to paste into the config file
   K        copy one keyframe line for the current camera (as before)
   P        copy a point 0.3 in front of the camera (for HOTSPOTS)

   OTHER
   G        show / hide the look sliders
   N        go on to the next page (if the config has NEXT)
   H        hide this whole panel

   PAGES (book.html: images laid onto the pages) — sliders to move, size,
   turn and shade each one live; "Copy page" gives the entry for PAGES.
   M        drag edges: handles appear on the selected page's corners and
            edge midpoints. Drag a corner to move it, or an edge to move
            that whole edge. M or Esc to stop.

   Edits are kept as a draft in this browser, per config file, so a reload
   doesn't lose them. "Load draft" brings them back; "Revert" goes back to
   what the config file says.
===================================================================== */
import * as THREE from "three";
import { samplePath } from "./path.js";

const r3 = (n) => Math.round(n * 1000) / 1000;
const r4 = (n) => Math.round(n * 10000) / 10000;
const fmt = (a) => `[${a.map(r3).join(", ")}]`;
const fmt4 = (a) => `[${a.map(r4).join(", ")}]`;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const SLIDERS = [
  ["soft", "Soft (max blur)", 0, 6, 0.05],
  ["bloom", "Glow", 0, 2, 0.05],
  ["bloomRadius", "Glow radius", 0, 1.5, 0.01],
  ["bloomThreshold", "Glow threshold", 0, 1, 0.01],
  ["saturation", "Saturation (coloured)", 0, 5.5, 0.01],
  ["saturationRest", "Saturation (rest)", 0, 5.5, 0.01],
  ["warmth", "Warmth", -0.2, 0.3, 0.01],
  ["fade", "Haze", 0, 0.5, 0.01],
  ["wash", "Wash", 0, 1, 0.01],
  ["vignette", "Vignette", 0, 1, 0.01],
  ["grain", "Grain", 0, 0.2, 0.005],
  ["pageSoft", "Soft on page images", 0, 1, 0.01],
];
const FOCUS_SLIDERS = [
  ["inner", "Focus radius", 0, 0.6, 0.01],
  ["outer", "Blur reaches max", 0.05, 1.5, 0.01],
  ["sharpest", "Blur at cursor", 0, 1, 0.01],
  ["follow", "Focus follow", 0.5, 20, 0.5],
];

const TRAIL_SLIDERS = [
  ["radius", "Colour brush size", 0.02, 0.5, 0.01],
  ["colorIn", "Colour-in speed", 0.2, 15, 0.1],
  ["linger", "Colour linger (s)", 0, 15, 0.5],
  ["fadeAfter", "Colour fade (s)", 0.5, 30, 0.5],
  ["softness", "Colour brush softness", 0, 1, 0.01],
  ["strength", "Colour brush strength", 0.1, 1, 0.01],
];

export function createDev({
  camera, scene, keys, getProgress, scrollToProgress, LOOK, FOCUS, TRAIL, CAMERA, dom,
  rawPath = [], configName = "config.js", onPathEdit = null, next = null, pages = [], onPageEdit = null,
}) {
  document.body.classList.add("dev");
  const hud = document.createElement("div");
  hud.id = "dev";
  hud.innerHTML = `
    <div class="dev-head"><strong>dev · ${configName}</strong><span class="dev-mode">path</span></div>
    <pre class="dev-readout"></pre>
    <div class="dev-btns">
      <button data-act="free">Free cam (F)</button>
      <button data-act="line">Path (L)</button>
      <button data-act="prev">◀ key ([)</button>
      <button data-act="next">key (]) ▶</button>
      <button data-act="key">Copy keyframe (K)</button>
      <button data-act="point">Copy point (P)</button>
      <button data-act="grade">Look (G)</button>
      ${next ? `<button data-act="nextpage">Next page (N)</button>` : ""}
    </div>
    <div class="dev-keys">
      <h4><span>Keyframes</span><span class="dev-dirty"></span></h4>
      <div class="dev-draft" hidden></div>
      <ol class="dev-klist"></ol>
      <div class="dev-kedit">
        <label>at <input data-k="at" type="number" step="0.005" min="0" max="1"></label>
        <label>fov <input data-k="fov" type="number" step="1" min="10" max="120"></label>
        <label>ease <select data-k="ease"><option value="smooth">smooth (eases in)</option><option value="linear">linear (flow)</option></select></label>
        <label>hold <input data-k="hold" type="number" step="0.1" min="0" placeholder="default"></label>
      </div>
      <div class="dev-btns">
        <button data-act="setcam">Set from camera (U)</button>
        <button data-act="insert">Add here (I)</button>
        <button data-act="del">Delete (Del)</button>
        <button data-act="copyall">Copy all (C)</button>
        <button data-act="revert">Revert to file</button>
        <button data-act="goto">Go to selected</button>
        <button data-act="undo">Undo (Z)</button>
      </div>
    </div>
    <div class="dev-pages" ${pages.length ? "" : "hidden"}></div>
    <div class="dev-grade" hidden></div>
    <div class="dev-toast"></div>`;
  document.body.appendChild(hud);

  const readout = hud.querySelector(".dev-readout");
  const modeEl = hud.querySelector(".dev-mode");
  const toastEl = hud.querySelector(".dev-toast");
  const gradeEl = hud.querySelector(".dev-grade");
  const listEl = hud.querySelector(".dev-klist");
  const dirtyEl = hud.querySelector(".dev-dirty");
  const draftEl = hud.querySelector(".dev-draft");
  const editEl = hud.querySelector(".dev-kedit");

  let free = false;
  let yaw = 0, pitch = 0, dragging = false;
  // free-cam speed in scene units per second (Shift ×3, Alt ×¼), scaled to the
  // size of the path so it suits both the State House and the much smaller book
  let pathSpan = 0;
  for (const a of rawPath) for (const b of rawPath) pathSpan = Math.max(pathSpan, dist(a.pos, b.pos));
  const speed = Math.min(0.3, Math.max(0.03, pathSpan * 0.08));
  let pathKeys = null;      // the prepared path main.js samples
  let lineGroup = null;
  let live = null;          // last sample from the path, so overrides know the base

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove("on"), 1800);
  }
  async function copy(text, label) {
    console.log(text);
    try { await navigator.clipboard.writeText(text); toast(`${label} copied`); }
    catch { toast(`${label} printed to console`); }
  }

  /* ---------- free camera ---------- */
  function setFree(on) {
    free = on;
    modeEl.textContent = on ? "free cam" : "path";
    document.body.classList.toggle("dev-free", on);
    if (on) syncYawPitch();
  }
  function syncYawPitch() {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yaw = e.y; pitch = e.x;
  }
  dom.addEventListener("pointerdown", (e) => {
    if (!free) return;
    dragging = true; dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener("pointerup", () => { dragging = false; });
  dom.addEventListener("pointermove", (e) => {
    if (!free || !dragging) return;
    yaw -= e.movementX * 0.003;
    pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.003));
  });

  const _dir = new THREE.Vector3(), _right = new THREE.Vector3();
  function fly(dt) {
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    camera.getWorldDirection(_dir);
    _right.crossVectors(_dir, camera.up).normalize();
    let v = speed * dt;
    if (keys.has("ShiftLeft") || keys.has("ShiftRight")) v *= 3;
    if (keys.has("AltLeft") || keys.has("AltRight")) v *= 0.25;
    if (keys.has("KeyW")) camera.position.addScaledVector(_dir, v);
    if (keys.has("KeyS")) camera.position.addScaledVector(_dir, -v);
    if (keys.has("KeyD")) camera.position.addScaledVector(_right, v);
    if (keys.has("KeyA")) camera.position.addScaledVector(_right, -v);
    if (keys.has("KeyE")) camera.position.y += v;
    if (keys.has("KeyQ")) camera.position.y -= v;
  }

  /* ---------- copying single lines ---------- */
  function lookTarget(d = 0.5) {
    camera.getWorldDirection(_dir);
    return camera.position.clone().addScaledVector(_dir, d);
  }
  function copyKeyframe() {
    const p = getProgress();
    const t = lookTarget(lookDistance());
    copy(`{ at: ${p.toFixed(3)}, pos: ${fmt4(camera.position.toArray())}, look: ${fmt4(t.toArray())}, fov: ${Math.round(camera.fov)} },`, "keyframe");
  }
  function copyPoint() {
    copy(`point: ${fmt(lookTarget(0.3).toArray())},`, "point");
  }

  /* =================================================================
     KEYFRAME EDITOR
     raw = an editable copy of the config's CAMERA_PATH, always sorted
     by "at". Every edit rebuilds the live path through onPathEdit.
  ================================================================= */
  const DRAFT_KEY = `dev-keyframes:${location.pathname}:${configName}`;
  const clone = (arr) => arr.map((k) => JSON.parse(JSON.stringify(k)));
  const original = clone(rawPath).sort((a, b) => a.at - b.at);
  let raw = clone(original);
  let selected = raw[0] || null;
  const sortRaw = () => raw.sort((a, b) => a.at - b.at);
  const history = [];           // snapshots for undo (Z)
  function remember() {
    history.push({ raw: clone(raw), sel: raw.indexOf(selected) });
    if (history.length > 100) history.shift();
  }
  function undo() {
    const h = history.pop();
    if (!h) return toast("nothing to undo");
    raw = h.raw; selected = raw[h.sel] || raw[0] || null;
    applyEdit(); toast("undone");
  }
  const sameAsFile = () => JSON.stringify(raw) === JSON.stringify(original);

  // a typical look distance, so new keyframes' look points sit at a sensible range
  function lookDistance() {
    const k = selected || raw[0];
    return k ? Math.max(0.05, dist(k.pos, k.look)) : 0.5;
  }

  function applyEdit({ save = true } = {}) {
    sortRaw();
    if (onPathEdit) pathKeys = onPathEdit(raw);
    const dirty = !sameAsFile();
    dirtyEl.textContent = dirty ? "edited · not in the file yet (C to copy)" : "";
    if (save) {
      try {
        if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ t: Date.now(), raw }));
        else localStorage.removeItem(DRAFT_KEY);
      } catch { /* storage unavailable: edits just aren't kept across reloads */ }
    }
    renderList();
    if (lineGroup) { removeLine(); buildLine(); }
  }

  function renderList() {
    listEl.innerHTML = "";
    const p = getProgress();
    raw.forEach((k, i) => {
      const li = document.createElement("li");
      const ease = k.cut ? "cut" : (k.ease ?? "smooth");
      const tags = [ease === "smooth" && k.stop !== false ? "● stop" : ease,
                    k.hold != null ? `hold ${k.hold}` : "", k.grade ? "grade" : "", k.fov != null ? `fov ${k.fov}` : ""]
        .filter(Boolean).join(" · ");
      li.innerHTML = `<b>${String(i).padStart(2, " ")}</b> <span>${k.at.toFixed(3)}</span> <i>${tags}</i>`;
      li.classList.toggle("sel", k === selected);
      li.classList.toggle("here", Math.abs(k.at - p) < 0.0015);
      li.addEventListener("click", () => select(k, true));
      listEl.appendChild(li);
    });
    syncEditor();
  }

  function syncEditor() {
    const on = !!selected;
    editEl.classList.toggle("off", !on);
    for (const el of editEl.querySelectorAll("[data-k]")) {
      el.disabled = !on;
      if (!on || document.activeElement === el) continue;
      const key = el.dataset.k;
      if (key === "at") el.value = selected.at.toFixed(3);
      else if (key === "ease") el.value = selected.ease ?? "smooth";
      else if (key === "fov") el.value = selected.fov ?? "";
      else if (key === "hold") el.value = selected.hold ?? "";
    }
  }

  for (const el of editEl.querySelectorAll("[data-k]")) {
    el.addEventListener("change", () => {
      if (!selected) return;
      remember();
      const key = el.dataset.k, v = el.value;
      if (key === "at") selected.at = Math.min(1, Math.max(0, Number(v)));
      else if (key === "ease") { if (v === "smooth") delete selected.ease; else selected.ease = v; }
      else if (key === "fov") { if (v === "") delete selected.fov; else selected.fov = Number(v); }
      else if (key === "hold") { if (v === "") delete selected.hold; else selected.hold = Number(v); }
      applyEdit();
      if (key === "at") goTo(selected);
    });
    // typing in a field shouldn't fly the camera or trigger shortcuts
    el.addEventListener("keydown", (e) => e.stopPropagation());
  }

  // put the camera on a keyframe (and, in free cam, start flying from there)
  function goTo(k) {
    scrollToProgress(k.at);
    if (free) {
      camera.position.set(...k.pos);
      camera.lookAt(new THREE.Vector3(...k.look));
      if (k.fov) { camera.fov = k.fov; camera.updateProjectionMatrix(); }
      syncYawPitch();
    }
  }
  function select(k, jumpThere = false) {
    selected = k;
    if (jumpThere && k) goTo(k);
    renderList();
    if (lineGroup) { removeLine(); buildLine(); }
  }

  function setFromCamera() {
    if (!selected) return toast("select a keyframe first");
    remember();
    const d = Math.max(0.05, dist(selected.pos, selected.look));
    selected.pos = camera.position.toArray().map(r4);
    selected.look = lookTarget(d).toArray().map(r4);
    selected.fov = Math.round(camera.fov);
    applyEdit();
    toast(`keyframe ${raw.indexOf(selected)} set from camera`);
  }

  function insertHere() {
    const at = r3(getProgress());
    if (raw.some((k) => Math.abs(k.at - at) < 0.0005)) return toast("there's already a keyframe here");
    const k = {
      at,
      pos: camera.position.toArray().map(r4),
      look: lookTarget(lookDistance()).toArray().map(r4),
      fov: Math.round(camera.fov),
    };
    // between two keyframes, a new one usually wants to flow, not stop
    const after = raw.find((x) => x.at > at);
    if (after && raw.some((x) => x.at < at)) k.ease = "linear";
    remember();
    raw.push(k);
    selected = k;
    applyEdit();
    toast(`added keyframe at ${at.toFixed(3)}${k.ease ? " (linear)" : ""}`);
  }

  function deleteSelected() {
    if (!selected) return;
    if (raw.length <= 2) return toast("a path needs at least 2 keyframes");
    remember();
    const i = raw.indexOf(selected);
    raw.splice(i, 1);
    selected = raw[Math.min(i, raw.length - 1)] || null;
    applyEdit();
    toast(`deleted keyframe ${i}`);
  }

  function revert() {
    remember();
    raw = clone(original);
    selected = raw[0] || null;
    applyEdit();
    toast("back to the config file");
  }

  // the whole path as config-file text
  function serialize() {
    const val = (v) =>
      Array.isArray(v) ? fmt4(v)
      : typeof v === "object" && v ? `{ ${Object.entries(v).map(([a, b]) => `${a}: ${val(b)}`).join(", ")} }`
      : typeof v === "string" ? JSON.stringify(v)
      : typeof v === "number" ? String(r4(v)) : String(v);
    const order = ["at", "cut", "pos", "look", "fov", "ease", "stop", "hold", "grade"];
    const lines = raw.map((k) => {
      const keysIn = [...order.filter((x) => x in k), ...Object.keys(k).filter((x) => !order.includes(x) && !x.startsWith("_"))];
      const parts = keysIn.map((x) => (x === "at" ? `at: ${k.at.toFixed(3)}` : `${x}: ${val(k[x])}`));
      return `  { ${parts.join(", ")} },`;
    });
    return `export const CAMERA_PATH = [\n${lines.join("\n")}\n];`;
  }
  function copyAll() {
    copy(serialize(), `CAMERA_PATH (${raw.length} keyframes) — paste over the one in ${configName},`);
  }

  // a draft from an earlier session?
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (saved?.raw?.length && JSON.stringify(saved.raw) !== JSON.stringify(original)) {
      const when = new Date(saved.t).toLocaleString();
      draftEl.hidden = false;
      draftEl.innerHTML = `Unsaved edits from ${when}. <button>Load draft</button> <button>Discard</button>`;
      const [load, discard] = draftEl.querySelectorAll("button");
      load.addEventListener("click", () => {
        raw = saved.raw; selected = raw[0]; draftEl.hidden = true;
        applyEdit({ save: false }); toast("draft loaded");
      });
      discard.addEventListener("click", () => {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        draftEl.hidden = true;
      });
    }
  } catch { /* no storage */ }

  /* ---------- path preview ---------- */
  function removeLine() { if (lineGroup) { scene.remove(lineGroup); lineGroup = null; } }
  function buildLine() {
    if (!pathKeys) return;
    lineGroup = new THREE.Group();
    const segs = [], looks = [];   // the path, split wherever a "cut" jumps
    let pts = [];
    // scale the dots to the scene: the book is far smaller than the State House
    let span = 0;
    for (const k of pathKeys) for (const j of pathKeys) span = Math.max(span, dist(k.pos, j.pos));
    const jump = Math.max(0.05, span * 0.15), dotR = Math.max(0.002, span * 0.004);
    for (let i = 0; i <= 800; i++) {
      const s = samplePath(pathKeys, i / 800);
      const v = new THREE.Vector3(...s.pos);
      if (pts.length && v.distanceTo(pts[pts.length - 1]) > jump) { segs.push(pts); pts = []; }
      pts.push(v);
      if (i % 20 === 0) looks.push(v.clone(), new THREE.Vector3(...s.look));
    }
    segs.push(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffcc66, depthTest: false, transparent: true });
    for (const sp of segs) lineGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sp), lineMat));
    lineGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(looks),
      new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.5, depthTest: false })));
    const dotGeo = new THREE.SphereGeometry(dotR, 12, 8);
    const selAt = selected?.at;
    for (const k of pathKeys) {
      const isSel = selAt !== undefined && Math.abs(k.at - selAt) < 1e-9;
      const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: isSel ? 0xffffff : 0xff6644, depthTest: false, transparent: true }));
      m.position.set(...k.pos);
      if (isSel) m.scale.setScalar(1.8);
      lineGroup.add(m);
    }
    lineGroup.traverse((o) => { o.renderOrder = 20; });
    scene.add(lineGroup);
  }
  function toggleLine() { if (lineGroup) removeLine(); else buildLine(); }

  function jump(dir) {
    if (!raw.length) return;
    const p = getProgress();
    const target = dir > 0 ? raw.find((k) => k.at > p + 0.001) : [...raw].reverse().find((k) => k.at < p - 0.001);
    if (target) select(target, true);
  }

  /* ---------- look sliders ---------- */
  const override = {};   // values you drag here win over the path's grade until you reset
  function buildSliders() {
    const mk = (obj, [key, label, min, max, step], onInput) => {
      const row = document.createElement("label");
      row.className = "dev-row";
      row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
      const input = row.querySelector("input"), out = row.querySelector("output");
      input.value = obj[key] ?? 1; out.textContent = obj[key] ?? 1;
      input.addEventListener("input", () => { out.textContent = input.value; onInput(Number(input.value)); });
      row._sync = (val) => { if (val == null) return; input.value = val; out.textContent = r3(val); };
      gradeEl.appendChild(row);
      return row;
    };
    const h1 = document.createElement("h4"); h1.textContent = "Look (overrides the path while set)";
    gradeEl.appendChild(h1);
    const rows = {};
    for (const s of SLIDERS) rows[s[0]] = mk(LOOK, s, (v) => { override[s[0]] = v; });
    const h2 = document.createElement("h4"); h2.textContent = "Cursor focus";
    gradeEl.appendChild(h2);
    for (const s of FOCUS_SLIDERS) mk(FOCUS, s, (v) => { FOCUS[s[0]] = v; });
    const h3 = document.createElement("h4"); h3.textContent = "Colour trail";
    gradeEl.appendChild(h3);
    for (const s of TRAIL_SLIDERS) mk(TRAIL, s, (v) => { TRAIL[s[0]] = v; });
    const btns = document.createElement("div");
    btns.className = "dev-btns";
    btns.innerHTML = `<button data-g="reset">Reset to path</button><button data-g="copy">Copy look</button>
                      <button data-g="tokey">Look → selected key</button>`;
    gradeEl.appendChild(btns);
    btns.querySelector('[data-g="reset"]').addEventListener("click", () => {
      for (const k in override) delete override[k];
      toast("look follows the path again");
    });
    btns.querySelector('[data-g="copy"]').addEventListener("click", () => {
      const g = { ...(live?.grade || LOOK), ...override };
      const out = {};
      for (const [k] of SLIDERS) out[k] = r3(g[k]);
      const focusOut = {}, trailOut = {};
      for (const [k] of FOCUS_SLIDERS) focusOut[k] = FOCUS[k];
      for (const [k] of TRAIL_SLIDERS) trailOut[k] = TRAIL[k];
      copy(`grade: ${JSON.stringify(out)},\n// FOCUS: ${JSON.stringify(focusOut)}\n// TRAIL: ${JSON.stringify(trailOut)}`, "look");
    });
    // store the sliders you've moved as a grade on the selected keyframe
    btns.querySelector('[data-g="tokey"]').addEventListener("click", () => {
      if (!selected) return toast("select a keyframe first");
      if (!Object.keys(override).length) return toast("move a look slider first");
      remember();
      selected.grade = { ...(selected.grade || {}) };
      for (const k in override) { selected.grade[k] = r3(override[k]); delete override[k]; }
      applyEdit();
      toast(`grade stored on keyframe ${raw.indexOf(selected)}`);
    });
    return rows;
  }
  const rows = buildSliders();

  /* ---------- page images (PAGES) ---------- */
  // pages set by "corners" get a slider per corner; others get center / size / turn
  const CORNER_SLIDERS = [
    ["corners.0.0", "Outer-top x", -0.4, 0.4, 0.001], ["corners.0.1", "Outer-top z", -0.3, 0.3, 0.001],
    ["corners.1.0", "Spine-top x", -0.4, 0.4, 0.001], ["corners.1.1", "Spine-top z", -0.3, 0.3, 0.001],
    ["corners.2.0", "Spine-bottom x", -0.4, 0.4, 0.001], ["corners.2.1", "Spine-bottom z", -0.3, 0.3, 0.001],
    ["corners.3.0", "Outer-bottom x", -0.4, 0.4, 0.001], ["corners.3.1", "Outer-bottom z", -0.3, 0.3, 0.001],
  ];
  const BOX_SLIDERS = [
    ["center.0", "Left / right (x)", -0.4, 0.4, 0.001],
    ["center.1", "Up / down page (z)", -0.4, 0.4, 0.001],
    ["size.0", "Width", 0.05, 0.4, 0.001],
    ["size.1", "Height", 0.05, 0.5, 0.001],
    ["rotationY", "Turn (°)", -15, 15, 0.1],
  ];
  const PAGE_SLIDERS = [
    ["lift", "Lift off paper", 0, 0.02, 0.0005],
    ["zoom", "Image zoom", 0.3, 2.5, 0.01],
    ["offset.0", "Image nudge x", -0.5, 0.5, 0.005],
    ["offset.1", "Image nudge y", -0.5, 0.5, 0.005],
    ["brightness", "Brightness", 0.3, 1.5, 0.01],
    ["effects.lightStrength", "Scan light", 0, 1.5, 0.01],
    ["effects.grainStrength", "Scan grain", 0, 4, 0.05],
    ["shade", "Spine shadow", 0, 0.8, 0.01],
    ["feather", "Soft edge", 0, 0.15, 0.005],
    ["opacity", "Opacity", 0, 1, 0.01],
  ];
  const pagesEl = hud.querySelector(".dev-pages");
  const pageOriginal = pages.map((p) => JSON.parse(JSON.stringify(p.current)));
  let pageSel = 0;
  // "corners.2.0" → d.corners[2][0]
  const getK = (d, key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), d);
  function setK(d, key, v) {
    const parts = key.split(".");
    let o = d;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null) o[parts[i]] = [];
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = v;
  }
  function pageText(d) {
    const v = (x) => Array.isArray(x)
      ? (x.every((n) => typeof n === "number") ? fmt4(x) : `[${x.map(v).join(", ")}]`)
      : x && typeof x === "object" ? `{ ${Object.entries(x).map(([k, y]) => `${k}: ${v(y)}`).join(", ")} }`
      : typeof x === "string" ? JSON.stringify(x) : String(typeof x === "number" ? r4(x) : x);
    return `  {\n${Object.entries(d).map(([k, x]) => `    ${k}: ${v(x)},`).join("\n")}\n  },`;
  }
  let syncPages = () => {};
  function buildPages() {
    if (!pages.length) return;
    pagesEl.innerHTML = `<h4>Pages</h4>
      <label class="dev-row"><span>Page</span><select class="dev-psel">${pages.map((p, i) =>
        `<option value="${i}">${p.current.id || i}</option>`).join("")}</select><output></output></label>
      <label class="dev-row"><span>Fit</span><select class="dev-pfit">
        <option value="contain">contain (whole image)</option><option value="cover">cover (crop)</option>
        <option value="stretch">stretch</option></select><output></output></label>
      <div class="dev-prows"></div>
      <div class="dev-seq"></div>
      <div class="dev-btns"><button data-p="drag">Drag edges (M)</button><button data-p="copy">Copy page</button>
        <button data-p="revert">Revert page</button></div>`;
    const sel = pagesEl.querySelector(".dev-psel"), fit = pagesEl.querySelector(".dev-pfit");
    const rowsEl = pagesEl.querySelector(".dev-prows");
    const prow = {};
    const ALL = [...CORNER_SLIDERS, ...BOX_SLIDERS, ...PAGE_SLIDERS];
    for (const [key, label, min, max, step] of ALL) {
      const row = document.createElement("label");
      row.className = "dev-row";
      row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
      const input = row.querySelector("input"), out = row.querySelector("output");
      input.addEventListener("input", () => {
        const d = JSON.parse(JSON.stringify(pages[pageSel].current));
        setK(d, key, Number(input.value));
        out.textContent = r4(Number(input.value));
        pages[pageSel].rebuild(d);
      });
      input.addEventListener("keydown", (e) => e.stopPropagation());
      prow[key] = { input, out, row };
      rowsEl.appendChild(row);
    }
    const sync = syncPages = () => {
      const d = pages[pageSel].current;
      fit.value = d.fit || "contain";
      const shown = new Set([...(d.corners ? CORNER_SLIDERS : BOX_SLIDERS), ...PAGE_SLIDERS]
        .map((x) => x[0]).filter((k) => d.effects || !k.startsWith("effects.")));
      for (const [key] of ALL) {
        prow[key].row.hidden = !shown.has(key);
        if (!shown.has(key)) continue;
        const val = getK(d, key) ?? (["zoom", "opacity", "brightness", "effects.lightStrength", "effects.grainStrength"].includes(key) ? 1 : 0);
        prow[key].input.value = val; prow[key].out.textContent = r4(val);
      }
    };
    // the image sequence: one row per change of page, with its fade timings
    const seqEl = pagesEl.querySelector(".dev-seq");
    const SEQ_FIELDS = [["at", "starts"], ["fade", "cross-fade"], ["hold", "rest (s)"]];
    function buildSeq() {
      const d = pages[pageSel].current, seq = d.sequence;
      seqEl.innerHTML = "";
      if (!seq?.images?.length) return;
      const name = (src) => src.split("/").pop().replace(/\.[^.]+$/, "");
      const head = document.createElement("h4");
      head.textContent = "Page changes (progress 0–1)";
      seqEl.appendChild(head);
      (seq.changes || []).slice(0, seq.images.length - 1).forEach((c, i) => {
        const box = document.createElement("div");
        box.className = "dev-change";
        box.innerHTML = `<div class="dev-change-head"><span>${name(seq.images[i])} → ${name(seq.images[i + 1])}</span>
          <button title="jump to just before this change">▶</button></div>
          <div class="dev-change-fields">${SEQ_FIELDS.map(([k, label]) =>
            `<label>${label}<input data-f="${k}" type="number" step="${k === "hold" ? 0.1 : 0.005}" min="0"
              value="${c[k] ?? (k === "fade" ? 0.08 : k === "hold" ? (seq.hold ?? "") : "")}"></label>`).join("")}</div>`;
        box.querySelector("button").addEventListener("click", () => scrollToProgress(Math.max(0, (c.at ?? 0) - 0.01)));
        box.querySelectorAll("input").forEach((inp) => {
          inp.addEventListener("keydown", (e) => e.stopPropagation());
          inp.addEventListener("change", () => {
            const nd = JSON.parse(JSON.stringify(pages[pageSel].current));
            if (inp.value === "") delete nd.sequence.changes[i][inp.dataset.f];
            else nd.sequence.changes[i][inp.dataset.f] = r3(Number(inp.value));
            pages[pageSel].rebuild(nd);
            onPageEdit?.();
            toast("timing updated · Copy page to keep it");
          });
        });
        seqEl.appendChild(box);
      });
    }
    buildSeq();
    sel.addEventListener("change", () => { pageSel = Number(sel.value); sync(); buildSeq(); if (editing) placeHandles(); });
    pagesEl.querySelector('[data-p="drag"]').addEventListener("click", () => setEditing(!editing));
    fit.addEventListener("change", () => {
      const d = JSON.parse(JSON.stringify(pages[pageSel].current)); d.fit = fit.value; pages[pageSel].rebuild(d);
    });
    pagesEl.querySelector('[data-p="copy"]').addEventListener("click", () =>
      copy(pageText(pages[pageSel].current), `page "${pages[pageSel].current.id}" — paste over its entry in PAGES,`));
    pagesEl.querySelector('[data-p="revert"]').addEventListener("click", () => {
      pages[pageSel].rebuild(JSON.parse(JSON.stringify(pageOriginal[pageSel]))); sync(); buildSeq(); onPageEdit?.(); toast("page back to the config file");
    });
    sync();
  }

  /* ---------- drag the page's corners and edges in the 3D view ---------- */
  // handle: where it sits on the page (o: 0 outer edge → 1 spine, v: 0 top → 1 bottom)
  // and which corners it moves (corners are [outer-top, spine-top, spine-bottom, outer-bottom])
  const HANDLES = [
    { o: 0, v: 0, c: [0] }, { o: 1, v: 0, c: [1] }, { o: 1, v: 1, c: [2] }, { o: 0, v: 1, c: [3] },
    { o: 0.5, v: 0, c: [0, 1] }, { o: 1, v: 0.5, c: [1, 2] }, { o: 0.5, v: 1, c: [2, 3] }, { o: 0, v: 0.5, c: [3, 0] },
  ];
  let editing = false, handleGroup = null, drag = null, hoverIdx = -1;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hitP = new THREE.Vector3();
  const _v = new THREE.Vector3();
  function setEditing(on) {
    if (on && !pages.length) return;
    editing = on;
    document.body.classList.toggle("dev-dragging", on);
    if (on) {
      // pages set by center / size / turn switch to corners so each edge can move on its own
      const p = pages[pageSel];
      if (!p.current.corners) {
        const d = JSON.parse(JSON.stringify(p.current));
        d.corners = p.corners().map((q) => q.map(r4));
        delete d.center; delete d.size; delete d.rotationY;
        p.rebuild(d); syncPages();
      }
      handleGroup = new THREE.Group();
      const geo = new THREE.SphereGeometry(1, 16, 10);
      for (const h of HANDLES) {
        const corner = h.c.length === 1;
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: corner ? 0xffffff : 0x66ccff, depthTest: false, transparent: true, opacity: 0.95 }));
        m.renderOrder = 30;
        m.userData.h = h;
        handleGroup.add(m);
      }
      scene.add(handleGroup);
      placeHandles();
      toast("drag a corner (white) or an edge (blue) · M to stop");
    } else if (handleGroup) {
      scene.remove(handleGroup); handleGroup = null; drag = null;
    }
  }
  function placeHandles() {
    if (!handleGroup) return;
    const p = pages[pageSel];
    handleGroup.children.forEach((m, i) => {
      m.position.set(...p.pointAt(m.userData.h.o, m.userData.h.v));
      // keep handles a steady size on screen
      const s = Math.max(0.0012, camera.position.distanceTo(m.position) * 0.012);
      m.scale.setScalar(i === hoverIdx || (drag && drag.i === i) ? s * 1.6 : s);
    });
  }
  function nearestHandle(e) {
    if (!handleGroup) return -1;
    let best = -1, bestD = 18;            // pixels
    handleGroup.children.forEach((m, i) => {
      _v.copy(m.position).project(camera);
      if (_v.z > 1) return;
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      const dd = Math.hypot(sx - e.clientX, sy - e.clientY);
      if (dd < bestD) { bestD = dd; best = i; }
    });
    return best;
  }
  function pointerOnPlane(e, y) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.set(new THREE.Vector3(0, 1, 0), -y);
    return ray.ray.intersectPlane(plane, hitP) ? hitP.clone() : null;
  }
  // capture phase, so grabbing a handle never starts a free-cam drag
  dom.addEventListener("pointerdown", (e) => {
    if (!editing) return;
    const i = nearestHandle(e);
    if (i < 0) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const m = handleGroup.children[i];
    const start = pointerOnPlane(e, m.position.y);
    if (!start) return;
    drag = { i, y: m.position.y, start, corners: pages[pageSel].corners() };
    dom.setPointerCapture(e.pointerId);
  }, { capture: true });
  dom.addEventListener("pointermove", (e) => {
    if (!editing) return;
    if (!drag) { hoverIdx = nearestHandle(e); dom.style.cursor = hoverIdx >= 0 ? "grab" : ""; return; }
    e.stopImmediatePropagation();
    const p = pointerOnPlane(e, drag.y);
    if (!p) return;
    const dx = p.x - drag.start.x, dz = p.z - drag.start.z;
    const d = JSON.parse(JSON.stringify(pages[pageSel].current));
    d.corners = drag.corners.map((q) => [...q]);
    for (const c of handleGroup.children[drag.i].userData.h.c) {
      d.corners[c] = [r4(drag.corners[c][0] + dx), r4(drag.corners[c][1] + dz)];
    }
    pages[pageSel].rebuild(d);
    syncPages();
  }, { capture: true });
  const endDrag = () => { if (drag) { drag = null; toast("Copy page when it fits"); } };
  dom.addEventListener("pointerup", endDrag, { capture: true });
  dom.addEventListener("pointercancel", endDrag, { capture: true });
  window.addEventListener("keydown", (e) => { if (e.code === "Escape" && editing) setEditing(false); });

  buildPages();

  /* ---------- keys and buttons ---------- */
  const actions = {
    dragedges: () => setEditing(!editing),
    free: () => setFree(!free),
    key: copyKeyframe,
    point: copyPoint,
    line: toggleLine,
    prev: () => jump(-1),
    next: () => jump(1),
    grade: () => { gradeEl.hidden = !gradeEl.hidden; },
    setcam: setFromCamera,
    insert: insertHere,
    del: deleteSelected,
    copyall: copyAll,
    revert,
    goto: () => selected && goTo(selected),
    nextpage: () => next && next(),
    undo,
  };
  hud.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", () => actions[b.dataset.act]()));
  window.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.metaKey || e.ctrlKey) return;                 // leave ⌘C / Ctrl+C etc. alone
    const map = { KeyF: "free", KeyK: "key", KeyP: "point", KeyL: "line",
                  BracketLeft: "prev", BracketRight: "next", KeyG: "grade",
                  KeyU: "setcam", KeyI: "insert", KeyC: "copyall",
                  Delete: "del", Backspace: "del", KeyN: "nextpage", KeyZ: "undo", KeyM: "dragedges" };
    if (map[e.code]) { e.preventDefault(); actions[map[e.code]](); }
    if (e.code === "KeyH") hud.classList.toggle("hidden");
    // keep WASD from scrolling the page in free cam
    if (free && ["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  });

  /* ---------- per-frame ---------- */
  let lastReadout = 0, lastListP = -1;
  return {
    get free() { return free; },
    setPath(keysArr) { pathKeys = keysArr; renderList(); },
    /** Called every frame. Returns the grade with any slider overrides applied. */
    update(dt, sample) {
      live = sample;
      if (free) fly(dt);
      if (editing) placeHandles();
      const now = performance.now();
      if (now - lastReadout > 100) {
        lastReadout = now;
        const p = getProgress();
        const seg = sample ? `between keyframe ${sample.index} and ${sample.index + 1}` : "";
        readout.textContent =
          `scroll  ${p.toFixed(3)}  ${seg}\n` +
          `pos     ${fmt(camera.position.toArray())}\n` +
          `look    ${fmt(lookTarget(lookDistance()).toArray())}\n` +
          `fov     ${Math.round(camera.fov)}`;
        if (!gradeEl.hidden && sample) {
          for (const [k] of SLIDERS) if (!(k in override)) rows[k]._sync(sample.grade[k]);
        }
        // mark the keyframe you're sitting on
        if (Math.abs(p - lastListP) > 0.0005) {
          lastListP = p;
          listEl.querySelectorAll("li").forEach((li, i) =>
            li.classList.toggle("here", !!raw[i] && Math.abs(raw[i].at - p) < 0.0015));
        }
      }
      return sample ? { ...sample.grade, ...override } : { ...LOOK, ...override };
    },
  };
}
