// ─────────────────────────────────────────────────────────────
// Everything you'll want to tweak lives in this file.
// ─────────────────────────────────────────────────────────────

// The splat file. Swap in the final export here (or keep the same
// filename and just replace the file).
export const SPLAT_URL = "assets/splat.spz";

// Camera field of view in degrees.
export const FOV = 50;

// Camera shots, in scroll order. Each shot lines up with one
// <section class="shot"> in index.html, so keep the counts equal.
//   pos  — where the camera sits [x, y, z]
//   look — the point it looks at  [x, y, z]
// Scene units: the building is roughly 0.33 tall, ground is y = 0,
// and the facade faces +x. Use the camera tool (add ?camera to the
// URL) to fly around and copy new values.
export const SHOTS = [
  { name: "establishing", pos: [1.45, 0.11, -0.08], look: [-0.4, 0.1, 0.04] },
  { name: "approach",     pos: [0.6, 0.07, -0.04],  look: [-0.38, 0.12, 0.07] },
  { name: "facade",       pos: [0.15, 0.11, 0.06],  look: [-0.38, 0.13, 0.07] },
  { name: "doorway",      pos: [-0.1, 0.09, 0.07],  look: [-0.4, 0.11, 0.07] },
  { name: "rise",         pos: [0.12, 0.34, 0.07],  look: [-0.38, 0.1, 0.07] },
];

// How long the camera lingers on each shot before moving on.
// 0 = constant motion, 1 = long pause at every shot.
export const DWELL = 0.35;

// Interactive hotspots pinned to points in the scene. Each is
// visible only while the scroll is between shot `from` and shot `to`
// (shot indexes, 0-based). Clicking one opens its panel.
export const HOTSPOTS = [
  {
    id: "door",
    at: [-0.34, 0.11, 0.07],
    from: 2,
    to: 3,
    label: "The entrance",
    body: "Placeholder text for the first interactive element. Replace with your content.",
  },
];
