/* =====================================================================
   CONFIG — THE BOOK (book.html)
   Same engine and same knobs as js/config.js; only what differs is here.
   Anything not set here (focus, trail, rendering…) comes from config.js,
   so the two pages share one look.

   Progress runs from 0 (the start) to 1 (the very end).

   COORDINATES: book.spz is turned and moved (see SPLATS below) so that
   the open book sits squarely at the origin:
     +y is up          the pages are at y ≈ 0 (the gutter dips to ≈ -0.04)
     -x is the LEFT page,  +x the RIGHT page   (each about 0.25 wide)
     -z is the TOP edge of the pages, +z the BOTTOM edge (about -0.16 → +0.16)
     The reader stands on the +z side, looking toward -z.
   The book is about 0.5 across, so 0.01 is a small nudge.

   This book is used in two places: book.html on its own, and inside the
   State House page, opened from the library's book (LIBRARY.book.scene in
   config.js). Edit it in book.html?dev and both follow.

   Tip: open book.html?dev to fly around and edit keyframes live
   (the keyframe list in the dev panel; see README.md, "Dev mode").
===================================================================== */
import * as BASE from "./config.js";

/* ---------------------------------------------------------------------
   SCROLL — shorter than the State House walk
--------------------------------------------------------------------- */
export const SCROLL = {
  ...BASE.SCROLL,
  length: 600,       // the whole book, in vh × 2 of scrolling (12 screens)
  maxSpeed: 2,       // a touch calmer than the State House: the moves here are small and close
  freeze: null,      // (the State House's freeze at the library doesn't apply here)
  easing: 1,         // the camera settles fully on each smooth keyframe (as this path was made)
};

/* the camera comes to rest at smooth keyframes, so each move is shaped only by
   its own keyframes (two identical keyframes hold it still) */
export const PATH = { settle: true };

/* ---------------------------------------------------------------------
   SPLATS
--------------------------------------------------------------------- */
export const SPLATS = [
  {
    id: "book",
    url: "splats/book.spz",
    position: [0.0641, -0.1778, 0.0736],   // centres the open book on the origin
    rotation: [-103.74, 1.78, 29.14],      // stands the scan upright and squares the pages
    scale: 1,
    show: [0, 1],
    fade: 0,
    lod: false,           // only 200k splats: draw them all
  },
];

/* ---------------------------------------------------------------------
   CAMERA PATH — same keyframe format as config.js:
     at, pos, look, fov, ease ("smooth" = stop / "linear" = flow through),
     cut, grade, stop, hold
--------------------------------------------------------------------- */
const BOOK = [0, 0, 0];            // centre of the open book
const LEFT = [-0.125, 0, 0];       // centre of the left page
const RIGHT = [0.125, 0, 0];       // centre of the right page

export const CAMERA_PATH = [
  { at: 0.000, pos: [0, 0.62, 1.05], look: [0, 0, 0], fov: 48, grade: { wash: 1, bloom: 1.6, fade: 0.02, vignette: 1 } },
  { at: 0.150, pos: [-0.005, 0.4874, 0.7341], look: [0.0365, -0.0296, 0.0129], fov: 48, ease: "linear", hold: 2, grade: { wash: 0, bloom: 0.45 } },
  { at: 0.200, pos: [0.028, 0.6237, 0.1996], look: [0.0493, -0.5526, -0.1207], fov: 48, ease: "linear", hold: 2 },
  { at: 0.250, pos: [0.0291, 0.4933, 0.0501], look: [0.036, -0.7212, -0.0585], fov: 43, grade: {"soft":2.75,"bloom":0.1,"bloomRadius":0.8,"bloomThreshold":0.74,"saturation":2.54,"saturationRest":0.8,"warmth":0.12,"fade":0.02,"wash":0,"vignette":1,"grain":0.04,"pageSoft":null}},
  { at: 0.800, pos: [0.0291, 0.4933, 0.0501], look: [0.036, -0.7212, -0.0585], fov: 43 },
  { at: 0.850, pos: [0.028, 0.6237, 0.1996], look: [0.0493, -0.5526, -0.1207], fov: 48, ease: "linear", hold: 2 },
  { at: 0.900, pos: [-0.005, 0.4874, 0.7341], look: [0.0365, -0.0296, 0.0129], fov: 48, ease: "linear", hold: 2, grade: { wash: 0, bloom: 0.45 } },
  { at: 1.000, pos: [0, 0.62, 1.05], look: [0, 0, 0], fov: 48, grade: { wash: 1, bloom: 1.6, fade: 0.02, vignette: 1 } }
];

export const CAMERA = {
  ...BASE.CAMERA,
  fov: 48,
  near: 0.003,        // the camera comes close to the paper
  parallax: 0.03,     // a little less lean: small moves look big up close
  parallaxY: 0.018,
  breathe: 0.0015,
};

/* ---------------------------------------------------------------------
   LOOK — starts from the State House look. The pages are bright, so the
   glow threshold sits a little higher to keep the paper from blowing out.
   Tune with G in ?dev, then paste the numbers here.
--------------------------------------------------------------------- */
export const LOOK = {
  ...BASE.LOOK,
  bloomThreshold: 0.74,
};

export const FOCUS = {
  ...BASE.FOCUS,
  // much less soft focus than the State House, so the whole open spread reads at once:
  // sharp over most of the screen, only the far edges soften a little
  inner: 0.75, outer: 1.6, sharpest: 0, follow: 5,
  blurScale: 1.2,     // and the blur that's left is about 40% as strong
};
export const TRAIL = {
  ...BASE.TRAIL,
  depth: 0.35,
  "radius":0.02,"colorIn":0.2,"linger":0,"fadeAfter":0.5,        // the paper is much closer than the State House walls
};
export const RENDER = { ...BASE.RENDER, lod: false };

/* ---------------------------------------------------------------------
   PAGES — images laid onto the book's pages, as if the book were printed
   with them. Each is a thin sheet that follows the curve of the scanned
   paper and covers it. Tune live in book.html?dev ("Pages" in the panel),
   then press "Copy page" and paste the entry here.

   The left page (measured from the scan):
     outer edge  x ≈ -0.180, straight, where the paper starts to bend down
                 (beyond it is the slanted side of the page stack)
     fold        slants from x ≈ 0.053 at the top to 0.029 at the bottom
     top edge    z ≈ -0.188 (outer) → -0.178 (spine)
     bottom edge z ≈ +0.162, pulling in to ≈ +0.155 at the spine
   The paper crests at x ≈ -0.045 and rolls down ≈ 0.035 into the fold.
   So the page is about 0.21 × 0.34, close to 2:3, and not quite a rectangle:
   it's set by its four corners. Other image shapes still work: see "fit".

   image       the PNG (any size; 2000 × 3000 matches a page exactly)
   sequence    (optional) several images that take turns on the same page as
               you scroll, cross-fading from one to the next: { images: [...],
               changes: [{ at, fade, hold }, ...], hold }. One change per step
               to the next image. Edit the timings live in ?dev (Pages → Page
               changes).
   side        "left" or "right" (which edge is the spine, for curve + shade)
   corners     the page's corners [x, z]: [outer-top, spine-top, spine-bottom,
               outer-bottom]. Edges between them are straight. In ?dev,
               press M (or "Drag edges") to drag corners and edges into place.
   center, size, rotationY   (instead of corners) a turned rectangle
   edgeInset   heights along the top, bottom and outer edges are read this
               far inside the page, so those edges stay straight
   ruled       (default true) the sheet runs straight from top to bottom, like
               real paper, while curling across the page into the spine. It
               keeps the edges free of kinks where the scan is ragged.
   surface     height map of the scanned paper (made by tools/page-surface.mjs).
               The sheet is draped over it, so it curls down into the spine
               exactly like the scan, wherever you move it.
   curve       (used only without "surface") height of the paper across the
               page, from its outer edge (0) to the spine (1): [[u, y], …]
   lift        how far above the paper it floats (hides the scan beneath)
   fit         "contain" (whole image, fill the rest), "cover" (fill the page,
               crop), or "stretch"
   fill        colour around a "contain" image. "auto" = the image's
               top-left pixel, so a flat background just carries on
   zoom, offset  scale the image on the page / nudge it ([x, y] as a
               fraction of the page; +y is down)
   brightness  1 = as drawn. Lower sits it into the scan's light
   effects     a layer over the image with the scan's own light (the warm cast,
               the shadow in the fold, the falloff to the edges) and paper
               grain, so the image looks printed on that paper. Maps made by
               tools/page-effects.mjs. lightStrength / grainStrength: 0 = off,
               1 = as scanned (grain can go higher). enabled: false = off.
   shade       an extra painted shadow toward the spine (0 = none; the
               effects layer already has the real one)
   feather     soft edge, as a fraction of the page width
   opacity     overall strength; show = [from, to] progress, fade = soft ends
--------------------------------------------------------------------- */


export const PAGES = [
  {
    id: "left",
    image: "images/book-left-precolonial.png",
    sequence: { images: ["images/book-left-precolonial.png", "images/book-left-1650.png", "images/book-left-1750.png", "images/book-left-snowtown.png"], changes: [{ at: 0.25, fade: 0.08 }, { at: 0.45, fade: 0.08 }, { at: 0.65, fade: 0.08 }], hold: 1.2 },
    side: "left",
    corners: [[-0.1696, -0.1834], [0.054, -0.178], [0.0284, 0.1668], [-0.1773, 0.1567]],
    surface: "splats/book-surface.json",
    curve: [[0, 0.0095], [0.5, 0.0115], [0.65, 0.0156], [0.8, 0.012], [0.9, 0.002], [1, -0.016]],
    lift: 0.001,
    edgeInset: 0.012,
    fit: "contain",
    fill: "auto",
    zoom: 1,
    offset: [0, 0],
    effects: { light: "images/book-light.png", grain: "images/book-grain.png", area: { x: [-0.28, 0.3], z: [-0.21, 0.2] }, lightStrength: 1, grainStrength: 0.35 },
    brightness: 1,
    shade: 0.12,
    feather: 0.005,
    opacity: 0.95,
    show: [0, 1],
    fade: 0,
  },
    {
    id: "right",
    image: "images/book-left-precolonial.png",
    sequence: { images: ["images/book-right-precolonial.png", "images/book-right-1650.png", "images/book-right-1750.png", "images/book-right-snowtown.png"], changes: [{ at: 0.25, fade: 0.08 }, { at: 0.45, fade: 0.08 }, { at: 0.65, fade: 0.08 }], hold: 1.2 },
    side: "right",
    corners: [[0.279, -0.1554], [0.0536, -0.1779], [0.0289, 0.1662], [0.2425, 0.1852]],
    surface: "splats/book-surface.json",
    curve: [[0, -0.002], [0.5, -0.002], [0.8, -0.006], [1, -0.02]],
    lift: 0.001,
    edgeInset: 0.012,
    fit: "contain",
    fill: "auto",
    zoom: 1,
    offset: [0, 0],
    effects: { light: "images/book-light.png", grain: "images/book-grain.png", area: { x: [-0.28, 0.3], z: [-0.21, 0.2] }, lightStrength: 1, grainStrength: 0.35 },
    brightness: 1,
    shade: 0.12,
    feather: 0.005,
    opacity: 0.9,
    show: [0, 1],
    fade: 0,
  },
];

/* No hotspots or next page here (yet). */
export const HOTSPOTS = [];
export const NEXT = null;
