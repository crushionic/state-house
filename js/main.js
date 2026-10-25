import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { SPLAT_URL, FOV, SHOTS, DWELL, HOTSPOTS } from "./scene-config.js";

const params = new URLSearchParams(location.search);
const CAMERA_TOOL = params.has("camera");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LAST = SHOTS.length - 1;

// ── Renderer, scene, camera ──────────────────────────────────
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x050505);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.002, 100);
const spark = new SparkRenderer({ renderer });
scene.add(spark);

// ── Splat ────────────────────────────────────────────────────
const loader = document.getElementById("loader");
const loaderText = document.getElementById("loader-text");

const splat = new SplatMesh({
  url: SPLAT_URL,
  onProgress: (e) => {
    loaderText.textContent = e.lengthComputable && e.total
      ? `Loading ${Math.round((e.loaded / e.total) * 100)}%`
      : `Loading ${(e.loaded / 1e6).toFixed(1)} MB`;
  },
});
// Splat captures are usually y-down; flip 180° about x so up is +y.
splat.quaternion.set(1, 0, 0, 0);
scene.add(splat);

splat.initialized
  .then(() => {
    loader.classList.add("is-done");
    document.body.classList.add("is-ready");
  })
  .catch((err) => {
    console.error(err);
    loaderText.textContent = "Couldn't load the scene.";
  });

// ── Camera path ──────────────────────────────────────────────
const vec = (a) => new THREE.Vector3(...a);
const posCurve = new THREE.CatmullRomCurve3(SHOTS.map((s) => vec(s.pos)), false, "centripetal");
const lookCurve = new THREE.CatmullRomCurve3(SHOTS.map((s) => vec(s.look)), false, "centripetal");
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const smoothstep = (x) => x * x * (3 - 2 * x);

// t runs from 0 (first shot) to LAST (last shot). DWELL holds the
// camera still around each whole number before easing to the next.
function shotAt(t) {
  if (LAST === 0) {
    camPos.copy(vec(SHOTS[0].pos));
    camLook.copy(vec(SHOTS[0].look));
    return;
  }
  const seg = Math.min(Math.floor(t), LAST - 1);
  const f = smoothstep(clamp((t - seg - DWELL / 2) / (1 - DWELL), 0, 1));
  const u = (seg + f) / LAST;
  posCurve.getPoint(u, camPos);
  lookCurve.getPoint(u, camLook);
}

// ── Scroll → camera ──────────────────────────────────────────
let targetT = 0;
let currentT = 0;

function readScroll() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  targetT = clamp(window.scrollY / max, 0, 1) * LAST;
}
window.addEventListener("scroll", readScroll, { passive: true });
readScroll();
currentT = targetT;

// ── Hotspots ─────────────────────────────────────────────────
const hotspotLayer = document.getElementById("hotspots");
const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panel-title");
const panelBody = document.getElementById("panel-body");
const panelClose = document.getElementById("panel-close");
let lastFocus = null;

const hotspots = HOTSPOTS.map((h) => {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "hotspot";
  const dot = document.createElement("span");
  dot.className = "hotspot-dot";
  const label = document.createElement("span");
  label.className = "hotspot-label";
  label.textContent = h.label;
  el.append(dot, label);
  el.addEventListener("click", () => openPanel(h, el));
  hotspotLayer.append(el);
  return { h, el, point: vec(h.at) };
});

function openPanel(h, from) {
  lastFocus = from;
  panelTitle.textContent = h.label;
  panelBody.textContent = h.body;
  panel.hidden = false;
  panelClose.focus();
}
function closePanel() {
  panel.hidden = true;
  lastFocus?.focus();
}
panelClose.addEventListener("click", closePanel);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !panel.hidden) closePanel();
});

const projected = new THREE.Vector3();
function updateHotspots() {
  for (const { h, el, point } of hotspots) {
    projected.copy(point).project(camera);
    const inView = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
    const inRange = CAMERA_TOOL || (currentT >= h.from - 0.2 && currentT <= h.to + 0.2);
    const show = inView && inRange && document.body.classList.contains("is-ready");
    el.classList.toggle("is-visible", show);
    el.tabIndex = show ? 0 : -1;
    if (inView) {
      const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}

// ── Camera tool (?camera) ────────────────────────────────────
let controls = null;
const keys = new Set();

if (CAMERA_TOOL) {
  document.body.classList.add("camera-tool");
  const startShot = clamp(parseInt(params.get("camera"), 10) || 0, 0, LAST);
  shotAt(startShot);
  camera.position.copy(camPos);
  controls = new OrbitControls(camera, canvas);
  controls.target.copy(camLook);
  controls.enableDamping = true;
  controls.minDistance = 0.005;
  controls.zoomSpeed = 0.6;
  buildCameraTool();
}

function buildCameraTool() {
  const tool = document.getElementById("camera-tool");
  tool.hidden = false;
  const readout = document.getElementById("camera-readout");
  const jumps = document.getElementById("camera-jumps");
  const copyBtn = document.getElementById("camera-copy");

  SHOTS.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${i + 1} ${s.name}`;
    b.addEventListener("click", () => jumpTo(i));
    jumps.append(b);
  });

  const round = (v) => v.toArray().map((n) => +n.toFixed(3));
  const shotText = () =>
    `{ name: "new", pos: [${round(camera.position).join(", ")}], look: [${round(controls.target).join(", ")}] },`;

  copyBtn.addEventListener("click", async () => {
    const text = shotText();
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied ✓";
    } catch {
      window.prompt("Copy this shot:", text);
    }
    setTimeout(() => (copyBtn.textContent = "Copy shot"), 1200);
  });

  setInterval(() => (readout.textContent = shotText()), 100);

  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea")) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= SHOTS.length) jumpTo(n - 1);
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
}

function jumpTo(i) {
  shotAt(i);
  camera.position.copy(camPos);
  controls.target.copy(camLook);
}

// WASD to walk, Q/E down/up, Shift for faster. Moves camera and
// orbit target together so you can explore, not just orbit.
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
function flyStep(dt) {
  if (!keys.size) return;
  const speed = (keys.has("shift") ? 0.6 : 0.15) * dt;
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  fwd.normalize();
  right.crossVectors(fwd, camera.up).normalize();
  move.set(0, 0, 0);
  if (keys.has("w")) move.add(fwd);
  if (keys.has("s")) move.sub(fwd);
  if (keys.has("d")) move.add(right);
  if (keys.has("a")) move.sub(right);
  if (keys.has("e")) move.y += 1;
  if (keys.has("q")) move.y -= 1;
  if (move.lengthSq() === 0) return;
  move.normalize().multiplyScalar(speed);
  camera.position.add(move);
  controls.target.add(move);
}

// ── Resize & loop ────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  readScroll();
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (CAMERA_TOOL) {
    flyStep(dt);
    controls.update();
  } else {
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 6);
    currentT += (targetT - currentT) * k;
    shotAt(currentT);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }
  updateHotspots();
  renderer.render(scene, camera);
});
