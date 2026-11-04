/* =====================================================================
   STORY LAYER — the HTML that sits on top of the splats.
   • Chapters: any element with class="chapter" and data-from / data-to
   • Hotspots: markers pinned to 3D points (from HOTSPOTS in config.js)
   • Note card: opens when a hotspot is clicked
===================================================================== */
import * as THREE from "three";
import { rangeOpacity } from "./path.js";

export function createStory({ hotspots, onHover }) {
  /* ---------------- chapters ---------------- */
  const chapters = [...document.querySelectorAll(".chapter")].map((el) => ({
    el,
    from: Number(el.dataset.from ?? 0),
    to: Number(el.dataset.to ?? 1),
    fade: Number(el.dataset.fade ?? 0.03),
    call: el.dataset.call || "",
    shown: null,
  }));
  const callEl = document.getElementById("callnumber");
  let currentCall = null;

  /* ---------------- hotspots ---------------- */
  const layer = document.getElementById("hotspots");
  const spots = hotspots.map((h) => {
    const el = document.createElement("button");
    el.className = "hotspot";
    el.type = "button";
    el.setAttribute("aria-label", h.label);
    el.innerHTML = `<span class="hotspot-dot"></span><span class="hotspot-label">${h.label}</span>`;
    layer.appendChild(el);
    const spot = { ...h, el, world: new THREE.Vector3(...h.point), screen: { x: 0, y: 0 }, visible: false };
    el.addEventListener("pointerenter", () => onHover(spot));
    el.addEventListener("pointerleave", () => onHover(null));
    el.addEventListener("focus", () => onHover(spot));
    el.addEventListener("blur", () => onHover(null));
    el.addEventListener("click", (e) => { e.stopPropagation(); openNote(spot); });
    return spot;
  });

  /* ---------------- note card ---------------- */
  const note = document.getElementById("note");
  const noteBody = note.querySelector(".note-body");
  const noteTitle = note.querySelector(".note-title");
  const noteCall = note.querySelector(".note-call");
  function openNote(spot) {
    noteTitle.textContent = spot.label;
    noteCall.textContent = spot.call || "";
    noteBody.innerHTML = spot.note || "";
    note.classList.add("open");
    note.setAttribute("aria-hidden", "false");
    note.querySelector(".note-close").focus({ preventScroll: true });
  }
  function closeNote() {
    note.classList.remove("open");
    note.setAttribute("aria-hidden", "true");
  }
  note.querySelector(".note-close").addEventListener("click", closeNote);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNote(); });
  document.addEventListener("click", (e) => {
    if (note.classList.contains("open") && !note.contains(e.target)) closeNote();
  });

  /* ---------------- per-frame update ---------------- */
  const v = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  function update(p, camera) {
    // chapters fade in/out and drift slightly out of focus as they go
    let call = "";
    for (const c of chapters) {
      const o = rangeOpacity(p, c.from, c.to, c.fade);
      if (o !== c.shown) {
        c.el.style.setProperty("--o", o.toFixed(3));
        c.el.classList.toggle("active", o > 0.5);
        c.el.setAttribute("aria-hidden", o > 0.05 ? "false" : "true");
        c.shown = o;
      }
      if (o > 0.5 && c.call) call = c.call;
    }
    if (call !== currentCall && callEl) {
      callEl.textContent = call;
      callEl.classList.toggle("on", !!call);
      currentCall = call;
    }

    // hotspots: project their 3D point to the screen
    camera.getWorldDirection(camDir);
    const w = innerWidth, h = innerHeight;
    for (const s of spots) {
      const inRange = rangeOpacity(p, s.show[0], s.show[1], 0.02);
      v.copy(s.world).sub(camera.position);
      const inFront = v.dot(camDir) > 0;
      v.copy(s.world).project(camera);
      const onScreen = inFront && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      const vis = inRange > 0.01 && onScreen;
      if (vis) {
        s.screen.x = (v.x * 0.5 + 0.5) * w;
        s.screen.y = (-v.y * 0.5 + 0.5) * h;
        s.el.style.transform = `translate(${s.screen.x.toFixed(1)}px, ${s.screen.y.toFixed(1)}px)`;
        s.el.style.setProperty("--o", inRange.toFixed(3));
      }
      if (vis !== s.visible) {
        s.el.classList.toggle("visible", vis);
        s.el.tabIndex = vis ? 0 : -1;
        s.visible = vis;
        if (!vis) s.el.blur();
      }
    }
  }

  return { update, spots, closeNote };
}
