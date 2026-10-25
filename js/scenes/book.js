// Bookshelf: the book slides out spine first, opens and flips pages.
// Clicking its left side unfolds a map. Scrolling then steps through the
// map while parts of the text on the right come into focus. Past the last
// step the book closes on its back cover; scrolling back reopens it.
// All geometry and textures here are placeholders for a Blender model.
import * as THREE from "three";
import { ASSETS, BOOK } from "../config.js";
import { el, placeholderNote, range, ease, tween, screenRect, toScreen } from "../ui.js";

const W = 0.17; // width of one half (cover to spine)
const H = 0.24;
const T = 0.018; // thickness of one half
const CLOSE_SCREENS = 1.6; // scroll length of the closing phase

// ── Placeholder textures ─────────────────────────────────────────
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const PAPER = "#f5f2eb";
const pageTexture = () =>
  canvasTexture(256, 360, (g, w, h) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(90, 85, 78, 0.28)";
    for (let y = 34; y < h - 30; y += 13) {
      const len = w - 48 - ((y * 37) % 50);
      g.fillRect(24, y, len, 4);
    }
  });

const coverTexture = (title) =>
  canvasTexture(256, 360, (g, w, h) => {
    g.fillStyle = "#e4dfd5";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(90, 85, 78, 0.45)";
    g.lineWidth = 3;
    g.strokeRect(16, 16, w - 32, h - 32);
    if (title) {
      g.fillStyle = "rgba(70, 66, 60, 0.8)";
      g.font = "italic 28px Georgia, serif";
      g.textAlign = "center";
      g.fillText(title, w / 2, h * 0.42);
    } else {
      g.beginPath();
      g.arc(w / 2, h / 2, 26, 0, Math.PI * 2);
      g.stroke();
    }
  });

function drawMap(g, w, h, active) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(90, 85, 78, 0.12)";
  g.lineWidth = 2;
  for (let x = 0; x <= w; x += w / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += h / 11) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  // a placeholder river and two regions
  g.strokeStyle = "rgba(110, 120, 130, 0.5)";
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(0, h * 0.55);
  g.bezierCurveTo(w * 0.3, h * 0.35, w * 0.5, h * 0.8, w, h * 0.45);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(90, 85, 78, 0.35)";
  g.setLineDash([12, 8]);
  g.strokeRect(w * 0.12, h * 0.12, w * 0.36, h * 0.3);
  g.strokeRect(w * 0.55, h * 0.58, w * 0.32, h * 0.28);
  g.setLineDash([]);
  // markers, with the current step highlighted
  BOOK.steps.forEach((s, i) => {
    const x = s.marker[0] * w;
    const y = s.marker[1] * h;
    g.beginPath();
    g.arc(x, y, i === active ? 20 : 9, 0, Math.PI * 2);
    g.fillStyle = i === active ? "rgba(60, 56, 50, 0.85)" : "rgba(90, 85, 78, 0.35)";
    g.fill();
    if (i === active) {
      g.beginPath();
      g.arc(x, y, 38, 0, Math.PI * 2);
      g.strokeStyle = "rgba(60, 56, 50, 0.5)";
      g.lineWidth = 4;
      g.stroke();
    }
  });
  if (active >= 0) {
    g.fillStyle = "rgba(60, 56, 50, 0.85)";
    g.font = "italic 34px Georgia, serif";
    g.textAlign = "center";
    g.fillText(BOOK.steps[active].caption, w / 2, h - 40);
  }
}

export class Book {
  constructor(app, library) {
    this.app = app;
    this.library = library;
    this.state = "shelf"; // shelf | moving | open | unfolding | reading | leaving
    this.mapStep = -1;
    if (!ASSETS.bookModel) placeholderNote("Book: placeholder model (Blender model not added yet)");

    this.buildModel();
    this.buildOverlay();
    this.resetToShelf();
  }

  // ── Model ───────────────────────────────────────────────────────
  buildModel() {
    const paper = new THREE.MeshStandardMaterial({ color: 0xf5f2eb, roughness: 0.95 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xece7de, roughness: 0.95 });
    const page = new THREE.MeshStandardMaterial({ map: pageTexture(), roughness: 0.95 });
    const front = new THREE.MeshStandardMaterial({ map: coverTexture(BOOK.coverTitle), roughness: 0.8 });
    const back = new THREE.MeshStandardMaterial({ map: coverTexture(null), roughness: 0.8 });
    const coverEdge = new THREE.MeshStandardMaterial({ color: 0xe4dfd5, roughness: 0.8 });

    this.root = new THREE.Group();
    this.library.group.add(this.root);

    // Box face order: +x, -x, +y, -y, +z (inside page), -z (outside cover)
    const half = (outside, inside) => new THREE.Mesh(new THREE.BoxGeometry(W, H, T), [edge, coverEdge, edge, edge, inside, outside]);

    this.leftPivot = new THREE.Group();
    this.leftBlock = half(front, page);
    this.leftBlock.position.set(-W / 2, 0, -T / 2);
    this.leftPivot.add(this.leftBlock);

    this.rightPivot = new THREE.Group();
    this.rightBlock = half(back, paper); // plain: the text overlay sits here
    this.rightBlock.position.set(W / 2, 0, -T / 2);
    this.rightPivot.add(this.rightBlock);

    this.spine = new THREE.Mesh(new THREE.BoxGeometry(0.006, H, 1), coverEdge);
    this.root.add(this.leftPivot, this.rightPivot, this.spine);

    // Pages that flip from right to left
    const pageGeo = new THREE.PlaneGeometry(W * 0.97, H * 0.97);
    const pageMat = page.clone();
    pageMat.side = THREE.DoubleSide;
    this.pages = [];
    for (let i = 0; i < BOOK.pagesToFlip; i++) {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(pageGeo, pageMat);
      m.position.set((W * 0.97) / 2, 0, 0.0006 * (i + 1));
      pivot.add(m);
      this.root.add(pivot);
      this.pages.push({ pivot, rest: -Math.PI + 0.012 + 0.004 * i });
    }

    // Map foldout, hinged at the left page's outer edge. Front = map.
    this.mapCanvas = document.createElement("canvas");
    this.mapCanvas.width = 768;
    this.mapCanvas.height = Math.round((768 * H) / W);
    this.mapTexture = new THREE.CanvasTexture(this.mapCanvas);
    this.mapTexture.colorSpace = THREE.SRGBColorSpace;
    this.drawMap(-1);
    this.mapPivot = new THREE.Group();
    this.mapPivot.position.set(-W, 0, 0.008);
    const mapGeo = new THREE.PlaneGeometry(W * 0.98, H * 0.98);
    this.mapFront = new THREE.Mesh(mapGeo, new THREE.MeshStandardMaterial({ map: this.mapTexture, roughness: 0.95 }));
    this.mapFront.position.x = (-W * 0.98) / 2;
    this.mapBack = new THREE.Mesh(mapGeo, paper);
    this.mapBack.position.x = (-W * 0.98) / 2;
    this.mapBack.rotation.y = Math.PI;
    this.mapPivot.add(this.mapFront, this.mapBack);
    this.leftPivot.add(this.mapPivot);

    this.clickTargets = [this.leftBlock, this.mapBack, this.mapFront];
  }

  drawMap(step) {
    if (step === this.mapStep) return;
    this.mapStep = step;
    drawMap(this.mapCanvas.getContext("2d"), this.mapCanvas.width, this.mapCanvas.height, step);
    this.mapTexture.needsUpdate = true;
  }

  // Openness of each part: angles in radians about the spine.
  pose({ left = 0, right = 0, map = Math.PI, pageT = 1, flatten = 0, shift = 0 }) {
    this.leftPivot.rotation.y = left;
    this.rightPivot.rotation.y = right;
    this.mapPivot.rotation.y = map;
    this.pages.forEach((p, i) => {
      const k = Array.isArray(pageT) ? pageT[i] : pageT;
      const open = THREE.MathUtils.lerp(0, p.rest, k);
      p.pivot.rotation.y = THREE.MathUtils.lerp(open, -Math.PI, flatten);
    });
    // Spine fills the closed edge but sinks behind the gutter when open.
    const closed = Math.max(left / Math.PI, -right / Math.PI);
    const depth = T * (1 + closed);
    this.spine.scale.z = depth;
    this.spine.position.set(-0.003, 0, -T + depth / 2);
    this.shift = shift;
    this.root.children.forEach((c) => (c.position.x = c === this.spine ? -0.003 + shift : shift));
  }

  // ── Placement ───────────────────────────────────────────────────
  shelfPose() {
    const slot = this.library.bookSlot;
    slot.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    slot.matrixWorld.decompose(pos, quat, new THREE.Vector3());
    return { pos, quat };
  }

  readingPose() {
    const cam = this.app.camera;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const needW = 3 * W * 1.6; // map + open book + room for the button
    const needH = H * 1.6;
    const dist = Math.max(needW / (2 * tanHalf * cam.aspect), needH / (2 * tanHalf), 0.05) || BOOK.readingDistance;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    return { pos: cam.position.clone().addScaledVector(forward, dist), quat: cam.quaternion.clone() };
  }

  resetToShelf() {
    const { pos, quat } = this.shelfPose();
    this.root.position.copy(pos);
    this.root.quaternion.copy(quat);
    this.pose({ left: Math.PI, right: 0, map: Math.PI, pageT: 0 });
    this.drawMap(-1);
  }

  // ── Overlay (text on the right page, hint, return button) ──────
  buildOverlay() {
    this.overlay = el("div", { class: "book-overlay" });
    this.textBox = el("div", { class: "book-text" });
    this.paragraphs = BOOK.steps.map((s) => {
      const p = el("p", { text: s.focus });
      this.textBox.append(p);
      return p;
    });
    this.hint = el("div", { class: "book-hint", "aria-hidden": "true" }, el("span", { class: "hotspot-dot" }));
    this.leftButton = el("button", {
      type: "button",
      class: "visually-hidden",
      text: "Open the map",
      onclick: () => this.unfold(),
    });
    this.returnButton = el("button", {
      type: "button",
      class: "return-button book-return",
      text: "Return to library",
      onclick: () => this.library.returnHome(),
    });
    this.overlay.append(this.textBox, this.hint, this.leftButton, this.returnButton);
    document.body.append(this.overlay);
  }

  // ── Flow ────────────────────────────────────────────────────────
  async enter() {
    this.state = "moving";
    this.overlay.classList.add("is-active");
    const shelf = this.shelfPose();
    const out = new THREE.Vector3(-1, 0, 0).applyQuaternion(shelf.quat); // spine direction
    const pulled = shelf.pos.clone().addScaledVector(out, W + 0.05);

    // 1. slide out, spine first
    await tween(0.9, (t) => this.root.position.lerpVectors(shelf.pos, pulled, ease.inOut(t)));

    // 2. bring it in front of the viewer, front cover facing them
    const read = this.readingPose();
    const q0 = this.root.quaternion.clone();
    await tween(1.3, (t) => {
      const k = ease.inOut(t);
      this.root.position.lerpVectors(pulled, read.pos, k);
      this.root.quaternion.slerpQuaternions(q0, read.quat, k);
    });

    // 3. open the cover
    await tween(1.1, (t) => this.pose({ left: Math.PI * (1 - ease.inOut(t)), pageT: 0 }));

    // 4. flip through the pages, then settle open
    const n = this.pages.length;
    const per = 0.55;
    const stagger = 0.22;
    const total = per + stagger * (n - 1);
    await tween(total, (t) => {
      const now = t * total;
      const ks = this.pages.map((_, i) => ease.inOut(range(now, i * stagger, i * stagger + per)));
      this.pose({ left: 0, pageT: ks });
    });

    this.state = "open";
    this.hint.classList.add("is-visible");
    this.leftButton.tabIndex = 0;
  }

  async unfold() {
    if (this.state !== "open") return;
    this.state = "unfolding";
    this.hint.classList.remove("is-visible");
    this.leftButton.tabIndex = -1;
    this.drawMap(0);
    await tween(1.0, (t) => {
      const k = ease.inOut(t);
      this.pose({ left: 0, map: Math.PI * (1 - k), shift: (W / 2) * k });
    });
    this.totalScreens = BOOK.steps.length * BOOK.scrollScreensPerStep + CLOSE_SCREENS;
    this.readEnd = (BOOK.steps.length * BOOK.scrollScreensPerStep) / this.totalScreens;
    this.app.scroll.enable(this.totalScreens, 0);
    this.textBox.classList.add("is-visible");
    this.state = "reading";
  }

  update(dt) {
    if (this.state === "open") {
      // keep the hint on the left page
      const s = toScreen(this.root.localToWorld(new THREE.Vector3(-W / 2 + this.shift, 0, 0.01)), this.app.camera);
      if (s) this.hint.style.transform = `translate(${s.x}px, ${s.y}px)`;
      return;
    }
    if (this.state !== "reading") return;

    const p = this.app.scroll.update(dt);
    const steps = BOOK.steps.length;
    const stepF = (Math.min(p, this.readEnd) / this.readEnd) * steps;
    this.drawMap(Math.min(steps - 1, Math.floor(stepF)));

    // focus: the paragraph for the current step sharpens, others blur
    this.paragraphs.forEach((el, i) => {
      const f = 1 - range(Math.abs(stepF - (i + 0.5)), 0.35, 0.95);
      el.style.filter = `blur(${((1 - f) * 7).toFixed(2)}px)`;
      el.style.opacity = (0.35 + 0.65 * f).toFixed(3);
    });

    // closing: fold the map, close on the back cover, re-centre
    const c = range(p, this.readEnd, 1);
    const fold = ease.inOut(range(c, 0, 0.35));
    const close = ease.inOut(range(c, 0.3, 0.85));
    this.pose({
      left: 0,
      map: Math.PI * fold,
      right: -Math.PI * close,
      flatten: range(c, 0.2, 0.32),
      shift: (W / 2) * (1 - fold) + (W / 2) * close,
    });
    this.textBox.style.opacity = 1 - range(c, 0, 0.15);
    this.placeText();

    const done = c > 0.92;
    this.returnButton.classList.toggle("is-visible", done);
    this.returnButton.tabIndex = done ? 0 : -1;
    if (done) {
      const edge = this.root.localToWorld(new THREE.Vector3(this.shift + 0.03, 0, 0));
      const s = toScreen(edge, this.app.camera);
      if (s) this.returnButton.style.transform = `translate(${s.x}px, ${s.y}px) translateY(-50%)`;
    }
  }

  // Keep the text box over the right-hand page.
  placeText() {
    const x0 = this.shift + W * 0.08;
    const x1 = this.shift + W * 0.92;
    const corners = [
      new THREE.Vector3(x0, H * 0.44, 0.002), new THREE.Vector3(x1, H * 0.44, 0.002),
      new THREE.Vector3(x0, -H * 0.44, 0.002), new THREE.Vector3(x1, -H * 0.44, 0.002),
    ].map((v) => this.root.localToWorld(v));
    const r = screenRect(corners, this.app.camera);
    Object.assign(this.textBox.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      fontSize: `${Math.max(9, r.height / 26)}px`,
    });
  }

  onClick(e) {
    if (this.state === "open" && this.hitLeft(e)) this.unfold();
  }

  cursorAt(e) {
    return this.state === "open" && this.hitLeft(e);
  }

  hitLeft(e) {
    const rect = this.app.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.app.camera);
    return ray.intersectObjects(this.clickTargets, false).length > 0;
  }

  // Back to the shelf: the closed book turns over and slides back in.
  async exit() {
    this.state = "leaving";
    this.returnButton.classList.remove("is-visible");
    this.textBox.classList.remove("is-visible");
    this.app.scroll.disable();

    const shelf = this.shelfPose();
    const out = new THREE.Vector3(-1, 0, 0).applyQuaternion(shelf.quat);
    const pulled = shelf.pos.clone().addScaledVector(out, W + 0.05);
    const p0 = this.root.position.clone();
    const q0 = this.root.quaternion.clone();
    const shift0 = this.shift;
    await tween(1.3, (t) => {
      const k = ease.inOut(t);
      this.root.position.lerpVectors(p0, pulled, k);
      this.root.quaternion.slerpQuaternions(q0, shelf.quat, k);
      // turn the closed book over as one piece so the front cover leads
      this.pose({ left: Math.PI * k, right: -Math.PI * (1 - k), map: Math.PI, pageT: 0, flatten: 1 - k, shift: shift0 * (1 - k) });
    });
    await tween(0.8, (t) => this.root.position.lerpVectors(pulled, shelf.pos, ease.inOut(t)));
    this.resetToShelf();
    this.overlay.classList.remove("is-active");
    this.textBox.style.opacity = "";
    this.state = "shelf";
  }
}
