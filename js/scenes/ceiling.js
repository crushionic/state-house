// Ceiling: placeholder elements on the ceiling. Each has a soft outline glow
// (50% at rest, easing to 100% on hover). Clicking one shows an enlarged
// version with information; its outline glow then fades away and it can't be
// clicked again. The return button appears once every element has been
// clicked.
import * as THREE from "three";
import { CEILING } from "../config.js";
import { el, toScreen, tween, ease } from "../ui.js";

const SHAPES = {
  ring: () => new THREE.RingGeometry(0.22, 0.34, 48),
  square: () => new THREE.PlaneGeometry(0.5, 0.5),
  triangle: () => new THREE.CircleGeometry(0.36, 3),
  diamond: () => new THREE.CircleGeometry(0.36, 4),
};

// Slightly larger copies behind each element; only their rim shows, as the glow.
const OUTLINES = {
  ring: () => new THREE.RingGeometry(0.195, 0.365, 48),
  square: () => new THREE.PlaneGeometry(0.55, 0.55),
  triangle: () => new THREE.CircleGeometry(0.41, 3),
  diamond: () => new THREE.CircleGeometry(0.4, 4),
};

// Larger versions shown in the detail panel (simple SVG placeholders).
const SVG = {
  ring: '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="10"/>',
  square: '<rect x="18" y="18" width="64" height="64" fill="currentColor"/>',
  triangle: '<polygon points="50,12 88,80 12,80" fill="currentColor"/>',
  diamond: '<polygon points="50,10 90,50 50,90 10,50" fill="currentColor"/>',
};

const REST_GLOW = 0.5;
const HOVER_GLOW = 1;

export class CeilingView {
  constructor(app, library) {
    this.app = app;
    this.library = library;
    this.active = false;
    this.hovered = null;

    this.items = CEILING.elements.map((item, i) => {
      const spot = library.ceilingSpots[i % library.ceilingSpots.length];
      const faceDown = (m, dy) => {
        m.position.copy(spot);
        m.position.y += dy;
        m.rotation.x = Math.PI / 2;
        library.ceilingGroup.add(m);
        return m;
      };

      // the element itself: matte, not glowing
      const mesh = faceDown(new THREE.Mesh(
        SHAPES[item.shape]?.() ?? SHAPES.square(),
        new THREE.MeshStandardMaterial({ color: 0xe6e2db, roughness: 0.9, side: THREE.DoubleSide }),
      ), 0);
      mesh.userData.item = item;

      // outline glow just behind it (nearer the ceiling)
      const outline = faceDown(new THREE.Mesh(
        OUTLINES[item.shape]?.() ?? OUTLINES.square(),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(1, 1, 1).multiplyScalar(1.6), // bright enough to bloom
          transparent: true,
          opacity: REST_GLOW,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      ), 0.005);

      // invisible disc so clicks anywhere on the element count (incl. the ring's hole)
      const hitArea = faceDown(new THREE.Mesh(
        new THREE.CircleGeometry(0.42, 32),
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
      ), -0.001);

      const entry = { item, mesh, outline, hitArea, glow: REST_GLOW, done: false };
      // Invisible, keyboard-focusable trigger over each element.
      entry.button = el("button", {
        type: "button",
        class: "hotspot hotspot--ghost",
        "aria-label": item.title,
        onclick: () => this.select(entry),
        onfocus: () => (this.hovered = entry),
        onblur: () => { if (this.hovered === entry) this.hovered = null; },
      });
      return entry;
    });

    this.layer = el("div", { class: "hotspots ceiling-hotspots" }, ...this.items.map((i) => i.button));
    this.returnButton = el("button", {
      type: "button",
      class: "return-button corner",
      text: "Return to library",
      onclick: () => library.returnHome(),
    });
    this.detailArt = el("div", { class: "detail-art", "aria-hidden": "true" });
    this.detailTitle = el("h2");
    this.detailBody = el("p");
    this.closeButton = el("button", { type: "button", class: "detail-close", "aria-label": "Close", text: "×", onclick: () => this.close() });
    this.detail = el("div", { class: "detail", role: "dialog", "aria-modal": "true", hidden: "" },
      el("div", { class: "detail-card" }, this.closeButton, this.detailArt, el("div", { class: "detail-text" }, this.detailTitle, this.detailBody)));
    this.detail.addEventListener("click", (e) => { if (e.target === this.detail) this.close(); });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.detail.hidden) this.close(); });
    document.body.append(this.layer, this.returnButton, this.detail);
  }

  get allDone() {
    return this.items.every((i) => i.done);
  }

  enter() {
    this.active = true;
    this.layer.classList.add("is-active");
    this.updateReturn();
  }

  // Click on an element: show it enlarged, then fade its outline glow out.
  // The element stays, but can't be clicked again.
  select(entry) {
    if (entry.done) return;
    entry.done = true;
    entry.button.disabled = true;
    entry.button.tabIndex = -1;
    if (this.hovered === entry) this.hovered = null;
    this.open(entry.item);

    const from = entry.outline.material.opacity;
    tween(1.0, (t) => {
      entry.outline.material.opacity = from * (1 - ease.inOut(t));
    }).then(() => (entry.outline.visible = false));
  }

  open(item) {
    this.lastFocus = document.activeElement;
    this.detailArt.innerHTML = `<svg viewBox="0 0 100 100">${SVG[item.shape] ?? SVG.square}</svg>`;
    this.detailTitle.textContent = item.title;
    this.detailBody.textContent = item.body;
    this.detail.hidden = false;
    requestAnimationFrame(() => this.detail.classList.add("is-open"));
    this.closeButton.focus();
  }

  close() {
    if (this.detail.hidden) return;
    this.detail.classList.remove("is-open");
    this.detail.hidden = true;
    this.updateReturn();
    if (this.allDone && this.active) this.returnButton.focus({ preventScroll: true });
    else this.lastFocus?.focus?.();
  }

  // The return button only appears once every element has been clicked.
  updateReturn() {
    const show = this.active && this.allDone && this.detail.hidden;
    this.returnButton.classList.toggle("is-visible", show);
    this.returnButton.tabIndex = show ? 0 : -1;
  }

  onClick(e) {
    const hit = this.hit(e);
    if (hit) this.select(hit);
  }

  cursorAt(e) {
    this.hovered = this.hit(e);
    return !!this.hovered;
  }

  hit(e) {
    if (!this.active || !this.detail.hidden) return null;
    const rect = this.app.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.app.camera);
    const live = this.items.filter((i) => !i.done);
    const hits = ray.intersectObjects(live.map((i) => i.hitArea), false);
    return hits.length ? live.find((i) => i.hitArea === hits[0].object) : null;
  }

  update(dt = 0.016) {
    const k = 1 - Math.exp(-dt * 8);
    for (const entry of this.items) {
      if (entry.done) continue;
      const target = this.active && this.hovered === entry ? HOVER_GLOW : REST_GLOW;
      entry.glow += (target - entry.glow) * k;
      entry.outline.material.opacity = entry.glow;
    }
    if (!this.active) return;
    for (const { mesh, button } of this.items) {
      const s = toScreen(mesh.position, this.app.camera);
      button.style.visibility = s && s.inView ? "" : "hidden";
      if (s) button.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
  }

  async exit() {
    this.close();
    this.active = false;
    this.hovered = null;
    this.layer.classList.remove("is-active");
    this.updateReturn();
  }
}
