// Ceiling: placeholder elements on the ceiling. Each has a soft outline glow
// (50% at rest, easing to 100% on hover). Clicking one zooms the camera in so
// the element sits centred with its information underneath; closing zooms
// back out, the outline glow fades and it can't be clicked again. The return
// button appears in the middle of the screen once every element is done.
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

// Zooming in: the element (about this wide, in metres) fills this fraction of
// the screen height, centred, with the information underneath.
const ELEMENT_SIZE = 0.84;
const ZOOM_FILL = 0.36;

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
    // Shown in the middle of the screen once every element has been seen.
    this.returnButton = el("button", {
      type: "button",
      class: "return-button center",
      text: "Return to library",
      onclick: () => library.returnHome(),
    });
    // Information bubble that appears under the zoomed-in element.
    this.infoTitle = el("h2");
    this.infoBody = el("p");
    this.closeButton = el("button", { type: "button", class: "info-close", "aria-label": "Close", text: "×", onclick: () => this.close() });
    this.info = el("div", { class: "ceiling-info", role: "dialog", "aria-live": "polite" },
      this.closeButton, this.infoTitle, this.infoBody);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.zoomed) this.close(); });
    document.body.append(this.layer, this.returnButton, this.info);

    this.zoomed = null; // the element currently zoomed into
    this.busy = false; // a camera move is in progress
    this.base = null; // the ceiling view to return to
  }

  get allDone() {
    return this.items.every((i) => i.done);
  }

  enter() {
    this.active = true;
    this.layer.classList.add("is-active");
    this.updateReturn();
  }

  // Camera pose that centres an element on screen, looking straight up at it,
  // keeping the same sense of "up" as the ceiling view.
  zoomPose(entry) {
    const cam = this.app.camera;
    const dist = ELEMENT_SIZE / (ZOOM_FILL * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    const target = entry.mesh.getWorldPosition(new THREE.Vector3());
    const pos = target.clone().add(new THREE.Vector3(0, -dist, 0));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.base.quat);
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, target, up));
    return { pos, quat };
  }

  moveCamera(to, seconds = 1.2) {
    const cam = this.app.camera;
    const p0 = cam.position.clone();
    const q0 = cam.quaternion.clone();
    return tween(seconds, (t) => {
      const k = ease.inOut(t);
      cam.position.lerpVectors(p0, to.pos, k);
      cam.quaternion.slerpQuaternions(q0, to.quat, k);
    });
  }

  // Click on an element: zoom in so it sits centred, with its information
  // underneath. It can't be clicked again afterwards.
  async select(entry) {
    if (entry.done || this.busy || this.zoomed) return;
    this.busy = true;
    entry.done = true;
    entry.button.disabled = true;
    entry.button.tabIndex = -1;
    this.hovered = null;
    this.lastFocus = document.activeElement;
    this.layer.classList.remove("is-active");
    this.app.renderer.domElement.style.cursor = "";

    const cam = this.app.camera;
    this.base = { pos: cam.position.clone(), quat: cam.quaternion.clone() };
    await this.moveCamera(this.zoomPose(entry));

    this.zoomed = entry;
    this.infoTitle.textContent = entry.item.title;
    this.infoBody.textContent = entry.item.body;
    this.info.classList.add("is-visible");
    this.closeButton.focus({ preventScroll: true });
    this.busy = false;
  }

  // Close the information: zoom back out and let the element's glow fade.
  async close() {
    const entry = this.zoomed;
    if (!entry || this.busy) return;
    this.busy = true;
    this.info.classList.remove("is-visible");
    const from = entry.outline.material.opacity;
    tween(1.0, (t) => (entry.outline.material.opacity = from * (1 - ease.inOut(t))))
      .then(() => (entry.outline.visible = false));
    await this.moveCamera(this.base);
    this.zoomed = null;
    this.busy = false;
    if (this.active) this.layer.classList.add("is-active");
    this.updateReturn();
    if (this.allDone && this.active) this.returnButton.focus({ preventScroll: true });
    else this.lastFocus?.focus?.({ preventScroll: true });
  }

  // The return button only appears once every element has been seen.
  updateReturn() {
    const show = this.active && this.allDone && !this.zoomed && !this.busy;
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
    if (!this.active || this.zoomed || this.busy) return null;
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
    if (this.zoomed && this.base) {
      this.app.camera.position.copy(this.base.pos);
      this.app.camera.quaternion.copy(this.base.quat);
    }
    this.info.classList.remove("is-visible");
    this.zoomed = null;
    this.active = false;
    this.hovered = null;
    this.layer.classList.remove("is-active");
    this.updateReturn();
  }
}
