/* =====================================================================
   THE BOOK IN THE LIBRARY
   Clicking the open book in the library pans the camera to that very book
   (the one in the library scan, on its slanted stand), and you read it
   there: the camera path, page images (the maps and texts changing as you
   scroll) and the light/grain on the paper, all from js/config-book.js,
   laid onto the library's book. Same splats, same light, same grade as the
   rest of the library.

   How it lines up: js/config-book.js describes the book in its own little
   space (centred, flat, 0.5 across), made from the close-up scan book.spz.
   LIBRARY.book.placement says where that space sits on the library's book
   (found by matching the two scans: position, rotation and scale).

   Leaving it, back to the room:
   • scroll on to the end of the book, or
   • scroll back past its beginning, or
   • the "close the book" button.
   Reading past the middle (or to the end) counts the book as done.

   book.html still works on its own (with the close-up scan); use it with
   ?dev to edit the camera path and page images, and they're used here too.
===================================================================== */
import * as THREE from "three";
import { createBookPage } from "./props.js";
import { preparePath, samplePath, rangeOpacity } from "./path.js";
import { createScroller } from "./scroll.js";

export async function createBookScene({ cfg, scene, renderer, onEnter, onLeave }) {
  const B = await import(new URL(cfg.scene, document.baseURI).href);
  const P = cfg.placement || { position: [0, 20, 0], rotation: [0, 0, 0], scale: 1 };
  const deg = THREE.MathUtils.degToRad;
  // the book's own space, placed on the library's book
  const group = new THREE.Group();
  group.name = "book-pages";
  group.position.set(...P.position);
  group.rotation.set(deg(P.rotation[0]), deg(P.rotation[1]), deg(P.rotation[2]));
  group.scale.setScalar(P.scale ?? 1);
  group.visible = false;
  scene.add(group);
  group.updateMatrixWorld(true);
  const toWorld = group.matrixWorld;

  const path = preparePath(B.CAMERA_PATH, B.LOOK, B.CAMERA.fov, { ...(B.PATH || {}), easing: B.SCROLL.easing });
  const scroller = createScroller({ SCROLL: B.SCROLL, stops: [], enabled: false });

  const pages = (B.PAGES || []).map((def) => {
    const page = createBookPage(def, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
    group.add(page.group);
    page.update(0, 0);
    return page;
  });

  /* ---------- the way back ---------- */
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "book-close";
  btn.textContent = (cfg.close || "close the book").toLowerCase();
  document.body.appendChild(btn);
  btn.addEventListener("click", (e) => { e.stopPropagation(); close(progress > (cfg.readAfter ?? 0.5)); });

  /* ---------- where the camera is on the book's path, in the library ---------- */
  const pos = new THREE.Vector3(), lookAt = new THREE.Vector3();
  function poseAt(p) {
    const s = samplePath(path, p);
    return {
      pos: new THREE.Vector3(...s.pos).applyMatrix4(toWorld),
      look: new THREE.Vector3(...s.look).applyMatrix4(toWorld),
      fov: s.fov,
    };
  }
  /** the view the camera pans to before reading starts (the book path's first pose) */
  function startView() {
    const v = poseAt(0);
    return { pos: v.pos.toArray(), look: v.look.toArray(), fov: v.fov };
  }

  /* ---------- state ---------- */
  let phase = "off", progress = 0, read = false;
  function open() {
    if (phase !== "off") return;
    phase = "reading";
    group.visible = true;
    scroller.jumpTo(0);
    scroller.setEnabled(true);
    progress = 0;
    btn.classList.add("on");
    onEnter && onEnter();
  }
  function close(wasRead) {
    if (phase !== "reading") return;
    read = wasRead;
    phase = "off";
    scroller.setEnabled(false);
    btn.classList.remove("on");
    const v = poseAt(progress);
    // the page images fade as the camera pans away
    fadeOut = 1;
    onLeave && onLeave(read, v);
  }

  let fadeOut = 0;
  function update(dt) {
    if (phase === "reading") {
      progress = scroller.update(dt);
      if (progress >= 1 - 1e-4) close(true);                                         // read to the end
      else if (scroller.state.underflow > (cfg.backOut ?? 0.4)) close(progress > (cfg.readAfter ?? 0.5));   // scrolled back out
    } else if (fadeOut > 0) {
      fadeOut = Math.max(0, fadeOut - dt / 0.8);
      if (fadeOut <= 0) group.visible = false;
    }
    const active = phase === "reading";
    const show = active ? 1 : fadeOut;
    for (const page of pages) {
      const d = page.current;
      const o = d.show ? Math.max(...(Array.isArray(d.show[0]) ? d.show : [d.show]).map(([a, b]) => rangeOpacity(progress, a, b, d.fade ?? 0))) : 1;
      page.update(progress, o * show);
    }
    if (!active) return { active: false };
    const s = samplePath(path, progress);
    pos.set(...s.pos).applyMatrix4(toWorld);
    lookAt.set(...s.look).applyMatrix4(toWorld);
    return { active: true, progress, pos, look: lookAt, fov: s.fov };
  }

  return {
    B, group, pages, scroller, open, close, update, startView,
    /** how much smaller the book is here than in its own space (for the camera's near plane) */
    scale: P.scale ?? 1,
    get phase() { return phase; },
    get progress() { return progress; },
    get active() { return phase === "reading"; },
  };
}
