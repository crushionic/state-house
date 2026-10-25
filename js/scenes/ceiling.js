// Ceiling: placeholder elements on the ceiling that can be clicked to
// see an enlarged version with information. A return button sits in the
// upper right corner.
import * as THREE from "three";
import { CEILING } from "../config.js";
import { el, toScreen } from "../ui.js";

const SHAPES = {
  ring: () => new THREE.RingGeometry(0.22, 0.34, 48),
  square: () => new THREE.PlaneGeometry(0.5, 0.5),
  triangle: () => new THREE.CircleGeometry(0.36, 3),
  diamond: () => new THREE.CircleGeometry(0.36, 4),
};

// Larger versions shown in the detail panel (simple SVG placeholders).
const SVG = {
  ring: '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="10"/>',
  square: '<rect x="18" y="18" width="64" height="64" fill="currentColor"/>',
  triangle: '<polygon points="50,12 88,80 12,80" fill="currentColor"/>',
  diamond: '<polygon points="50,10 90,50 50,90 10,50" fill="currentColor"/>',
};

export class CeilingView {
  constructor(app, library) {
    this.app = app;
    this.library = library;
    this.active = false;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf4efe6,
      emissiveIntensity: 0.6,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    this.items = CEILING.elements.map((item, i) => {
      const mesh = new THREE.Mesh(SHAPES[item.shape]?.() ?? SHAPES.square(), mat);
      mesh.position.copy(library.ceilingSpots[i % library.ceilingSpots.length]);
      mesh.rotation.x = Math.PI / 2; // face down into the room
      mesh.userData.item = item;
      library.ceilingGroup.add(mesh);
      const button = el(
        "button",
        { type: "button", class: "hotspot", "aria-label": item.title, onclick: () => this.open(item) },
        el("span", { class: "hotspot-dot" }),
      );
      return { item, mesh, button };
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

  enter() {
    this.active = true;
    this.layer.classList.add("is-active");
    this.returnButton.classList.add("is-visible");
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
    this.detail.classList.remove("is-open");
    this.detail.hidden = true;
    this.lastFocus?.focus?.();
  }

  onClick(e) {
    const hit = this.hit(e);
    if (hit) this.open(hit);
  }

  cursorAt(e) {
    return !!this.hit(e);
  }

  hit(e) {
    if (!this.active) return null;
    const rect = this.app.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.app.camera);
    const hits = ray.intersectObjects(this.items.map((i) => i.mesh), false);
    return hits[0]?.object.userData.item ?? null;
  }

  update() {
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
    this.layer.classList.remove("is-active");
    this.returnButton.classList.remove("is-visible");
  }
}
