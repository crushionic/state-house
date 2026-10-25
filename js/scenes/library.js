// Library home: a placeholder room with three clickable areas (desk,
// bookshelves, ceiling). Each area has its own scene module. Camera moves
// come from Blender exports when present; otherwise a simple placeholder
// glide between placeholder views of the placeholder room.
import * as THREE from "three";
import { ASSETS, LIBRARY } from "../config.js";
import { loadCameraTrack } from "../camera-track.js";
import { el, placeholderNote, toScreen, tween, ease } from "../ui.js";
import { Book } from "./book.js";
import { CeilingView } from "./ceiling.js";
import { DeskView } from "./desk.js";

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Placeholder views of the placeholder room. Replaced by Blender exports.
const PLACEHOLDER_VIEWS = {
  // Owner's direction: the upper back corner where the bookshelf wall meets
  // the ceiling sits in the horizontal middle, 40% down from the top.
  home: { pos: v3(0, 1.6, 2.6), frame: { point: v3(-4, 4.2, -5), y: 0.4 }, fov: 60 },
  bookshelf: { pos: v3(-2.1, 1.4, -1.5), look: v3(-3.7, 1.35, -1.5), fov: 50 },
  ceiling: { pos: v3(0, 1.4, -0.9), look: v3(0, 4.2, -1.7), fov: 72 },
  desk: { pos: v3(1.2, 1.3, -0.7), look: v3(1.2, 1.15, -3.0), fov: 50 },
};

// Camera orientation for a view: either looking at `look`, or aimed so the
// `frame.point` lands centred horizontally at `frame.y` (0 top – 1 bottom).
// Uses vertical FOV only, so it holds for any screen shape.
function viewQuat(view) {
  if (view.frame) {
    const d = view.frame.point.clone().sub(view.pos);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitchTo = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const ndcY = 1 - 2 * view.frame.y;
    const pitch = pitchTo - Math.atan(ndcY * Math.tan(THREE.MathUtils.degToRad(view.fov / 2)));
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  }
  const m = new THREE.Matrix4().lookAt(view.pos, view.look, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

const TRACK_FOR = { bookshelf: "toBookshelf", ceiling: "toCeiling", desk: "toDesk" };

export class Library {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.visible = false;
    app.scene.add(this.group);

    this.state = "idle"; // idle | moving | area
    this.area = null;
    this.visited = new Set();
    this.tracks = {};

    this.buildPlaceholderRoom();
    this.buildHotspots();

    this.scenes = {
      bookshelf: new Book(app, this),
      ceiling: new CeilingView(app, this),
      desk: new DeskView(app, this),
    };

    const c = ASSETS.cameras;
    this.ready = Promise.all(
      ["library", "toBookshelf", "toCeiling", "toDesk"].map(async (key) => {
        this.tracks[key] = await loadCameraTrack(c[key]);
        if (!this.tracks[key]) placeholderNote(`Library camera (${key}): add ${c[key]}`);
      }),
    );
    if (!ASSETS.libraryModel) placeholderNote("Library: placeholder room (model not added yet)");

    // Click an area in the room itself, as well as its label.
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    const canvas = app.renderer.domElement;
    canvas.addEventListener("click", (e) => this.onCanvasClick(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
  }

  // ── Placeholder geometry ─────────────────────────────────────────
  buildPlaceholderRoom() {
    const g = this.group;
    const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, ...extra });
    const box = (w, h, d, m, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };

    g.add(new THREE.HemisphereLight(0xffffff, 0xdedad4, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(2, 6, 3);
    g.add(sun);

    const wall = mat(0xe9e6e1);
    box(8, 0.05, 8, mat(0xdcd8d2), 0, -0.025, -1); // floor
    box(8, 0.05, 8, wall, 0, 4.225, -1); // ceiling
    box(8, 4.2, 0.05, wall, 0, 2.1, -5); // back wall
    box(0.05, 4.2, 8, wall, -4, 2.1, -1); // left wall
    box(0.05, 4.2, 8, wall, 4, 2.1, -1); // right wall

    // Bookshelves on the left wall
    const shelfMat = mat(0xcfc9c0);
    const shelves = new THREE.Group();
    shelves.userData.area = "bookshelf";
    g.add(shelves);
    const addTo = (parent, mesh) => (parent.add(mesh), mesh);
    const shelfX = -3.75;
    addTo(shelves, new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.0, 4.2), shelfMat)).position.set(shelfX - 0.05, 1.5, -2);
    const bookMats = [0xd8d2c8, 0xc9c2b6, 0xe2ddd5, 0xbfb8ad, 0xd0cabe].map((c) => mat(c));
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let row = 0; row < 5; row++) {
      const y = 0.25 + row * 0.58;
      addTo(shelves, new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 4.2), shelfMat)).position.set(shelfX + 0.16, y - 0.015, -2);
      for (let z = -3.95; z < -0.1; ) {
        const w = 0.035 + rand() * 0.04;
        const h = 0.3 + rand() * 0.16;
        const isTheBook = row === 2 && Math.abs(z - -1.5) < 0.05;
        if (isTheBook) {
          // Slot for the book that slides out. Spine faces into the room (+x).
          this.bookSlot = new THREE.Object3D();
          this.bookSlot.position.set(shelfX + 0.34, y + 0.125, -1.5);
          this.bookSlot.rotation.y = Math.PI; // book local -x (spine) faces +x
          g.add(this.bookSlot);
          z += 0.06;
          continue;
        }
        const b = addTo(shelves, new THREE.Mesh(new THREE.BoxGeometry(0.26, h, w), bookMats[Math.floor(rand() * 5)]));
        b.position.set(shelfX + 0.22, y + h / 2, z + w / 2);
        z += w + 0.004;
      }
    }

    // Desk with a lamp
    const desk = new THREE.Group();
    desk.userData.area = "desk";
    g.add(desk);
    const deskMat = mat(0xd3cdc4);
    addTo(desk, new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.9), deskMat)).position.set(1.2, 0.76, -2.6);
    for (const [dx, dz] of [[-0.82, -0.38], [0.82, -0.38], [-0.82, 0.38], [0.82, 0.38]]) {
      addTo(desk, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), deskMat)).position.set(1.2 + dx, 0.37, -2.6 + dz);
    }
    const lamp = addTo(desk, new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8ee, emissiveIntensity: 0.7 }),
    ));
    lamp.position.set(1.85, 1.05, -2.8);
    const lampLight = new THREE.PointLight(0xfff4e6, 1.2, 4);
    lampLight.position.copy(lamp.position);
    g.add(lampLight);
    this.figureSpot = v3(1.2, 0, -3.35);

    // Ceiling: a surface plus placeholder elements to click on
    const ceiling = new THREE.Group();
    ceiling.userData.area = "ceiling";
    g.add(ceiling);
    addTo(ceiling, new THREE.Mesh(new THREE.BoxGeometry(6, 0.04, 6), mat(0xf1eee9))).position.set(0, 4.18, -1.5);
    this.ceilingSpots = [v3(-1.4, 4.15, -2.8), v3(1.4, 4.15, -2.8), v3(-1.4, 4.15, -0.4), v3(1.4, 4.15, -0.4)];
    this.ceilingGroup = ceiling;

    this.anchors = {
      desk: v3(1.2, 1.0, -2.6),
      bookshelf: v3(-3.5, 1.7, -2.2),
      ceiling: v3(0, 4.0, -1.6),
    };
    this.areaRoots = { desk, bookshelf: shelves, ceiling };
  }

  // ── Area labels ─────────────────────────────────────────────────
  buildHotspots() {
    this.hotspotLayer = el("div", { class: "hotspots library-hotspots" });
    this.hotspots = LIBRARY.areas.map((a) => {
      const button = el(
        "button",
        { type: "button", class: "hotspot", "data-area": a.id, onclick: () => this.goTo(a.id) },
        el("span", { class: "hotspot-dot" }),
      );
      button.setAttribute("aria-label", a.label);
      this.hotspotLayer.append(button);
      return { id: a.id, button };
    });
    document.body.append(this.hotspotLayer);
  }

  showHotspots(on) {
    this.hotspotLayer.classList.toggle("is-active", on);
    for (const h of this.hotspots) h.button.tabIndex = on ? 0 : -1;
  }

  // ── Camera ──────────────────────────────────────────────────────
  setView(view) {
    const cam = this.app.camera;
    cam.position.copy(view.pos);
    cam.quaternion.copy(viewQuat(view));
    if (view.fov && cam.fov !== view.fov) {
      cam.fov = view.fov;
      cam.updateProjectionMatrix();
    }
  }

  setHomeCamera() {
    const t = this.tracks.library;
    if (t) t.apply(0, this.app.camera);
    else this.setView(PLACEHOLDER_VIEWS.home);
  }

  // Move between home and an area. forward = into the area.
  async moveCamera(area, forward) {
    const track = this.tracks[TRACK_FOR[area]];
    const cam = this.app.camera;
    if (track) {
      const seconds = track.seconds || LIBRARY.transitionSeconds;
      await tween(seconds, (t) => track.apply(forward ? t : 1 - t, cam));
      return;
    }
    // Placeholder glide between placeholder views.
    const from = new THREE.Object3D();
    from.position.copy(cam.position);
    from.quaternion.copy(cam.quaternion);
    const target = forward ? PLACEHOLDER_VIEWS[area] : this.homeView();
    const to = { position: target.pos, quaternion: viewQuat(target) };
    const fov0 = cam.fov;
    const fov1 = target.fov ?? fov0;
    await tween(LIBRARY.transitionSeconds, (t) => {
      const k = ease.inOut(t);
      cam.position.lerpVectors(from.position, to.position, k);
      cam.quaternion.slerpQuaternions(from.quaternion, to.quaternion, k);
      cam.fov = fov0 + (fov1 - fov0) * k;
      cam.updateProjectionMatrix();
    });
  }

  homeView() {
    if (this.tracks.library) {
      const tmp = new THREE.PerspectiveCamera();
      this.tracks.library.apply(0, tmp);
      const look = new THREE.Vector3(0, 0, -1).applyQuaternion(tmp.quaternion).add(tmp.position);
      return { pos: tmp.position.clone(), look, fov: tmp.fov };
    }
    return PLACEHOLDER_VIEWS.home;
  }

  // ── Flow ────────────────────────────────────────────────────────
  enter() {
    this.group.visible = true;
    this.app.scroll.disable();
    this.setHomeCamera();
    this.state = "idle";
    this.showHotspots(true);
  }

  async goTo(area) {
    if (this.state !== "idle") return;
    this.state = "moving";
    this.area = area;
    this.showHotspots(false);
    this.app.renderer.domElement.style.cursor = "";
    await this.moveCamera(area, true);
    this.state = "area";
    this.scenes[area].enter();
  }

  // Called by an area scene when the visitor asks to go back.
  async returnHome() {
    if (this.state !== "area") return;
    const area = this.area;
    this.state = "moving";
    await this.scenes[area].exit();
    await this.moveCamera(area, false);
    this.visited.add(area);
    this.applyAdjustedHome();
    this.area = null;
    this.state = "idle";
    this.showHotspots(true);
  }

  // The "adjusted version" of the home page will be described later.
  // For now this only records which areas have been visited.
  applyAdjustedHome() {
    document.body.dataset.visited = [...this.visited].join(" ");
    document.body.classList.add("library-returned");
  }

  // ── Pointer ─────────────────────────────────────────────────────
  pick(e) {
    const rect = this.app.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.app.camera);
    const hits = this.raycaster.intersectObjects(Object.values(this.areaRoots), true);
    for (const hit of hits) {
      for (let o = hit.object; o; o = o.parent) if (o.userData.area) return o.userData.area;
    }
    return null;
  }

  onCanvasClick(e) {
    if (!this.group.visible) return;
    if (this.state === "area") {
      this.scenes[this.area].onClick?.(e);
      return;
    }
    if (this.state !== "idle") return;
    const area = this.pick(e);
    if (area) this.goTo(area);
  }

  onPointerMove(e) {
    if (!this.group.visible) return;
    const canvas = this.app.renderer.domElement;
    if (this.state === "area") {
      canvas.style.cursor = this.scenes[this.area].cursorAt?.(e) ? "pointer" : "";
      return;
    }
    canvas.style.cursor = this.state === "idle" && this.pick(e) ? "pointer" : "";
  }

  update(dt) {
    if (!this.group.visible) return;
    if (this.state === "idle") {
      for (const h of this.hotspots) {
        const s = toScreen(this.anchors[h.id], this.app.camera);
        h.button.style.visibility = s && s.inView ? "" : "hidden";
        if (s) h.button.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
    }
    for (const s of Object.values(this.scenes)) s.update?.(dt);
  }
}
