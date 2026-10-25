// Small DOM helpers shared by the scenes.
import * as THREE from "three";
import { SHOW_PLACEHOLDER_NOTES } from "./config.js";

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

// Lists assets that are still placeholders, in a small corner note.
const notes = new Set();
let noteList = null;
let noteSummary = null;
export function placeholderNote(text) {
  if (!SHOW_PLACEHOLDER_NOTES || notes.has(text)) return;
  notes.add(text);
  if (!noteList) {
    noteList = el("ul");
    noteSummary = el("summary");
    document.body.append(el("details", { id: "placeholder-notes" }, noteSummary, noteList));
  }
  noteList.append(el("li", { text }));
  noteSummary.textContent = `Placeholders (${notes.size})`;
}

// World point → CSS pixel position. Returns null if behind the camera.
const _v = new THREE.Vector3();
export function toScreen(point, camera) {
  camera.updateMatrixWorld();
  _v.copy(point).project(camera);
  if (_v.z < -1 || _v.z > 1) return null;
  return {
    x: (_v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
    inView: Math.abs(_v.x) <= 1 && Math.abs(_v.y) <= 1,
  };
}

// Screen-space rectangle covering a list of world points.
export function screenRect(points, camera) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    const s = toScreen(p, camera);
    if (!s) continue;
    x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y);
  }
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0, right: x1, bottom: y1 };
}

export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
};
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
// Maps x from [a, b] to [0, 1], clamped.
export const range = (x, a, b) => clamp01((x - a) / (b - a));

// Simple time-based tween; resolves when done.
export function tween(seconds, onUpdate) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = seconds <= 0 ? 1 : clamp01((now - start) / (seconds * 1000));
      onUpdate(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
