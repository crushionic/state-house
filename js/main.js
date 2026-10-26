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
const opening = new Opening(app, { onProgress: () => {} });
const library = new Library(app);

let current = "intro";
let fade = 1; // white used for transitions (1 = fully white)

// Enter fades away; the screen stays white until the splat has loaded, then
// fades into the scene. No loading text is shown.
async function startOpening() {
  enterButton.disabled = true;
  enterButton.classList.add("is-fading");
  try {
    await opening.ready;
  } catch (err) {
    console.error("The opening scene couldn't be loaded:", err);
    return;
  }
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
