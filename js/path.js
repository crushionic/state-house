/* =====================================================================
   CAMERA PATH MATH
   Pure functions (no three.js), so they are easy to test.
   Given the keyframes and a scroll progress 0–1, returns where the
   camera is, what it looks at, its field of view and the color grade.
===================================================================== */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// How much the camera slows into "smooth" keyframes: 1 = comes fully to rest
// on each one, 0 = moves exactly as fast as you scroll. Set from SCROLL.easing.
export const PATH_OPTIONS = { easing: 1 };

// Catmull-Rom spline through p1..p2, with "knots" at the keyframes' times
// (t0..t3). Using the real times keeps the camera's speed continuous as it
// passes through a keyframe, even when segments differ in length.
function catmull(p0, p1, p2, p3, k0, k1, k2, k3, t) {
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a1 = ((k1 - t) * p0[i] + (t - k0) * p1[i]) / (k1 - k0);
    const a2 = ((k2 - t) * p1[i] + (t - k1) * p2[i]) / (k2 - k1);
    const a3 = ((k3 - t) * p2[i] + (t - k2) * p3[i]) / (k3 - k2);
    const b1 = ((k2 - t) * a1 + (t - k0) * a2) / (k2 - k0);
    const b2 = ((k3 - t) * a2 + (t - k1) * a3) / (k3 - k1);
    out[i] = ((k2 - t) * b1 + (t - k1) * b2) / (k2 - k1);
  }
  return out;
}

// Mirror a point to make a phantom neighbour at the ends of the path.
const mirror = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]];

/**
 * Prepares keyframes once: sorts them and resolves the "sticky" grade
 * values so every keyframe carries a complete set of look numbers.
 */
export function preparePath(keyframes, baseLook, defaultFov, opts = {}) {
  const keys = [...keyframes].sort((a, b) => a.at - b.at).map((k) => ({ ...k }));
  // settle: the camera comes to rest at smooth keyframes, so each move between
  // them is shaped only by its own keyframes (the book uses this: two identical
  // keyframes then hold the camera still instead of looping out and back)
  keys.settle = !!opts.settle;
  keys.easing = opts.easing;          // overrides PATH_OPTIONS.easing for this path
  let current = { ...baseLook };
  let fov = defaultFov;
  for (const k of keys) {
    current = { ...current, ...(k.grade || {}) };
    k._grade = current;
    fov = k.fov ?? fov;          // fov is sticky too
    k._fov = fov;
  }
  return keys;
}

/**
 * Samples the path at progress p (0–1).
 * Returns { pos, look, fov, grade, index, t }
 *   index = which segment we are in (keyframe index we are leaving)
 *
 * Easing works on whole "moves": from one smooth keyframe to the next, the
 * camera speeds up and slows down ONCE, gliding straight through any
 * "linear" keyframes in between, so there are no bumps along a walk.
 */
const isAnchor = (k) => (k.ease ?? "smooth") !== "linear";

export function samplePath(keys, p) {
  const n = keys.length;
  if (n === 0) return null;
  if (n === 1 || p <= keys[0].at) return snapshot(keys, 0, 0);
  if (p >= keys[n - 1].at) return snapshot(keys, n - 1, 0);

  // the move we're in: between the anchors (smooth keyframes) around p
  let ia = 0;
  for (let j = 0; j < n; j++) if ((isAnchor(keys[j]) || j === 0) && keys[j].at <= p) ia = j;
  let ib = n - 1;
  for (let j = n - 1; j > ia; j--) if ((isAnchor(keys[j]) || j === n - 1) && keys[j].at > p) ib = j;
  const A = keys[ia].at, B = keys[ib].at;
  const u = clamp01((p - A) / Math.max(1e-6, B - A));
  const q = A + lerp(u, smooth(u), keys.easing ?? PATH_OPTIONS.easing) * (B - A);   // eased progress

  // the segment within the move
  let i = ia;
  while (i < ib - 1 && q > keys[i + 1].at) i++;
  const a = keys[i], b = keys[i + 1];
  const t = clamp01((q - a.at) / Math.max(1e-6, b.at - a.at));

  const grade = blendGrade(a, b, t);

  // a "cut" keyframe starts a new shot: the camera holds the previous shot's
  // pose AND look for the whole segment, and both jump at the very end. So a
  // cut can go straight from white into a scene (give the cut keyframe the
  // new scene's grade), or stay hidden under a wash on both sides.
  if (b.cut) {
    return { pos: [...a.pos], look: [...a.look], fov: a._fov, grade: { ...a._grade }, index: i, t };
  }

  // curve neighbours never reach across a cut (or, with settle, past a smooth keyframe)
  const prev = a.cut || (keys.settle && isAnchor(a)) ? undefined : keys[i - 1];
  const next = keys[i + 2] && !keys[i + 2].cut && !(keys.settle && isAnchor(b)) ? keys[i + 2] : undefined;
  const span = b.at - a.at;
  const k0 = prev ? prev.at : a.at - span, k3 = next ? next.at : b.at + span;
  const p0 = prev ? prev.pos : mirror(a.pos, b.pos);
  const p3 = next ? next.pos : mirror(b.pos, a.pos);
  const l0 = prev ? prev.look : mirror(a.look, b.look);
  const l3 = next ? next.look : mirror(b.look, a.look);

  return {
    pos: catmull(p0, a.pos, b.pos, p3, k0, a.at, b.at, k3, q),
    look: catmull(l0, a.look, b.look, l3, k0, a.at, b.at, k3, q),
    fov: lerp(a._fov, b._fov, t),
    grade,
    index: i,
    t,
  };
}

function blendGrade(a, b, t) {
  const grade = {};
  for (const key in a._grade) {
    const va = a._grade[key], vb = b._grade[key];
    if (typeof va === "number" && typeof vb === "number") grade[key] = lerp(va, vb, t);
    else if (Array.isArray(va) && Array.isArray(vb)) grade[key] = va.map((v, j) => lerp(v, vb[j], t));
    else grade[key] = t < 0.5 ? va : vb;
  }
  return grade;
}

function snapshot(keys, i, t) {
  const k = keys[i];
  return { pos: [...k.pos], look: [...k.look], fov: k._fov, grade: { ...k._grade }, index: i, t };
}

/** 0 → 1 → 0 visibility for a [from, to] range with a soft fade at each end. */
export function rangeOpacity(p, from, to, fade) {
  if (fade <= 0) return p >= from && p <= to ? 1 : 0;
  const fin = from <= 0 ? 1 : clamp01((p - from) / fade);
  const fout = to >= 1 ? 1 : clamp01((to - p) / fade);
  return smooth(Math.min(fin, fout));
}
