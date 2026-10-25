// Entry point: sets up rendering and runs the flow
// intro button → opening scroll → fade to white → library home.
// Add ?start=library to the URL to jump straight to the library.
import * as THREE from "three";
import { SparkRenderer } from "@sparkjsdev/spark";
import { Look } from "./look.js";
import { ScrollDriver } from "./scroll.js";
import { Opening } from "./scenes/opening.js";
import { Library } from "./scenes/library.js";
import { tween, ease } from "./ui.js";

// ── Rendering ────────────────────────────────────────────────────
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 200);
const spark = new SparkRenderer({ renderer });
scene.add(spark);

const look = new Look(renderer, scene, camera, spark);
const scroll = new ScrollDriver();
scroll.disable();

const app = { renderer, scene, camera, spark, look, scroll };

// ── Scenes ───────────────────────────────────────────────────────
const intro = document.getElementById("intro");
const enterButton = document.getElementById("enter");
const status = document.getElementById("intro-status");

let loadText = "";
const opening = new Opening(app, {
  onProgress: (e) => {
    loadText = e.lengthComputable && e.total
      ? `Loading ${Math.round((e.loaded / e.total) * 100)}%`
      : `Loading ${(e.loaded / 1e6).toFixed(1)} MB`;
    if (enterButton.disabled) status.textContent = loadText;
  },
});
const library = new Library(app);

let current = "intro";
let fade = 1; // white used for transitions (1 = fully white)

async function startOpening() {
  enterButton.disabled = true;
  status.textContent = loadText || "Loading";
  try {
    await opening.ready;
  } catch (err) {
    console.error(err);
    status.textContent = "The scene couldn't be loaded.";
    return;
  }
  status.textContent = "";
  intro.classList.add("is-leaving");
  current = "opening";
  opening.enter();
  await tween(1.6, (t) => (fade = 1 - ease.out(t)));
  intro.hidden = true;
}

async function startLibrary() {
  fade = 1;
  await library.ready;
  if (current === "opening") opening.exit();
  intro.hidden = true;
  current = "library";
  library.enter();
  await tween(0.5, () => {}); // hold on white for a moment
  await tween(1.8, (t) => (fade = 1 - ease.inOut(t)));
}

enterButton.addEventListener("click", startOpening);
opening.onFinish = startLibrary;

if (new URLSearchParams(location.search).get("start") === "library") startLibrary();

// ── Loop ─────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  look.setSize(w, h);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (current === "opening") opening.update(dt);
  if (current === "library") library.update(dt);
  look.white = Math.max(fade, current === "opening" ? opening.white : 0);
  look.render(dt);
});
