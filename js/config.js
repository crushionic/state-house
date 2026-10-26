// ─────────────────────────────────────────────────────────────────
// Site configuration. Everything you'll swap or tune lives here.
// All text is lorem ipsum placeholder until the real copy arrives.
// ─────────────────────────────────────────────────────────────────

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";
const LOREM_SHORT = "Lorem ipsum dolor sit amet.";

// Shows a small note listing assets that aren't in place yet.
export const SHOW_PLACEHOLDER_NOTES = true;

// ── Assets ───────────────────────────────────────────────────────
// Camera moves come from Blender as .glb files (see assets/cameras/README.md).
// Any file that isn't there yet falls back to a placeholder.
export const ASSETS = {
  openingSplat: "assets/splat.spz",
  cameras: {
    opening: "assets/cameras/opening.glb",                 // scroll-driven walk-through
    library: "assets/cameras/library.glb",                 // library home view
    toBookshelf: "assets/cameras/library-to-bookshelf.glb", // played forward in, backward out
    toCeiling: "assets/cameras/library-to-ceiling.glb",
    toDesk: "assets/cameras/library-to-desk.glb",
  },
  // Not used yet. When these arrive they replace the placeholder geometry.
  libraryModel: null,
  bookModel: null,
  figureModel: null,
};

// How Blender exports line up with the splat. Calibrate with the first export.
export const BLENDER = {
  // If the .glb contains an Empty with this name, the splat is placed where
  // that Empty is (parent the splat to it in Blender).
  anchorName: "splat_anchor",
  // Rotation (degrees, XYZ) between the splat file's own axes and Blender's
  // object space once imported. Confirmed after the first test export.
  importCorrection: [-90, 0, 0],
};

// ── Look: hazy, slightly glowing white ───────────────────────────
// Tune live with ?look on the URL, then paste "Copy settings" here.
export const LOOK = {
  background: "#eeece8",
  splatSoftness: 0.6,   // enlarges splats slightly (Spark pre-blur)
  soft: 1.4,            // blur that grows toward the screen edges
  bloom: 0.45,          // glow strength
  bloomRadius: 0.85,
  bloomThreshold: 0.72,
  saturation: 0.55,
  warmth: 0.0,
  haze: 0.22,           // lifts everything toward the haze color
  hazeColor: [0.97, 0.96, 0.95],
  edgeGlow: 0.55,       // screen edges fade into glowing white
  grain: 0.025,
};

// ── Opening scene ────────────────────────────────────────────────
export const OPENING = {
  // Used only if the camera export has no splat_anchor (degrees, XYZ).
  splatRotation: [180, 0, 0],
  scrollScreens: 10,    // total scroll length, in screen heights
  fadeStart: 0.86,      // where the fade to white begins (0–1 of the scroll)
  // Text cards along the scroll, e.g. { at: 0.5, body: "…" } (`at` is 0–1 of
  // the scroll). Empty: the owner wants no text in the opening for now.
  text: [],
};

// ── Library home ─────────────────────────────────────────────────
export const LIBRARY = {
  areas: [
    { id: "desk", label: "Desk" },
    { id: "bookshelf", label: "Bookshelves" },
    { id: "ceiling", label: "Ceiling" },
  ],
  transitionSeconds: 1.8, // used when a Blender transition isn't in place yet
};

// ── Bookshelf: book, map foldout, scroll steps ───────────────────
export const BOOK = {
  pagesToFlip: 6,
  readingDistance: 1.0, // fallback distance from camera (scaled to fit screen)
  scrollScreensPerStep: 1.2,
  // One entry per scroll step. `marker` is a 0–1 position on the map.
  steps: [
    { caption: LOREM_SHORT, marker: [0.28, 0.32], focus: LOREM },
    { caption: LOREM_SHORT, marker: [0.62, 0.24], focus: LOREM },
    { caption: LOREM_SHORT, marker: [0.46, 0.6], focus: LOREM },
    { caption: LOREM_SHORT, marker: [0.74, 0.74], focus: LOREM },
  ],
  coverTitle: "Lorem Ipsum",
};

// ── Ceiling ──────────────────────────────────────────────────────
export const CEILING = {
  elements: [
    { id: "c1", shape: "ring", title: "Lorem ipsum", body: LOREM },
    { id: "c2", shape: "square", title: "Dolor sit", body: LOREM },
    { id: "c3", shape: "triangle", title: "Amet consectetur", body: LOREM },
    { id: "c4", shape: "diamond", title: "Adipiscing elit", body: LOREM },
  ],
};

// ── Desk dialog ──────────────────────────────────────────────────
// A small branching conversation. Each node has text and choices;
// a node with `end: true` finishes the dialog.
export const DIALOG = {
  start: "n1",
  nodes: {
    n1: {
      text: LOREM,
      choices: [
        { label: "Lorem ipsum dolor", next: "n2" },
        { label: "Sit amet consectetur", next: "n3" },
      ],
    },
    n2: { text: LOREM, choices: [{ label: "Adipiscing elit", next: "n4" }] },
    n3: { text: LOREM, choices: [{ label: "Sed do eiusmod", next: "n4" }] },
    n4: { text: LOREM, end: true },
  },
};
