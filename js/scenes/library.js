// Library home: a placeholder room with three clickable areas (desk,
// bookshelves, ceiling). After each visit the view shifts to the adjusted
// menu for the areas still unseen; returning from the last one plays the
// ending. Each area has its own scene module. Camera moves
// come from Blender exports when present; otherwise a simple placeholder
// glide between placeholder views of the placeholder room.
import * as THREE from "three";
import { ASSETS, LIBRARY } from "../config.js";
import { loadCameraTrack } from "../camera-track.js";
import { el, placeholderNote, toScreen, tween, ease } from "../ui.js";
import { Book } from "./book.js";
import { CeilingView } from "./ceiling.js";
import { DeskView } from "./desk.js";
import { playEnding } from "../ending.js";

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

// Adjusted library views after areas have been visited (owner's direction),
// keyed by the visited areas in alphabetical order joined with "+".
// After one area: the two unvisited areas fill ~90% of the screen and the
// visited one is a ~10% sliver on its side (bookshelf left, ceiling top,
// desk right). After two: the last unvisited area fills ~90%, with both
// visited areas as slivers. Solved numerically for the placeholder room;
// Blender stills (ASSETS.cameras.libraryAfter) replace them.
const ADJUSTED_VIEWS = {
  bookshelf: { pos: v3(1.81, 1.2, -0.93), look: v3(0.88, 2.1, -3.64), fov: 60 },
  ceiling: { pos: v3(2.4, 1.22, -0.96), look: v3(-0.05, 1.17, -2.7), fov: 60 },
  desk: { pos: v3(-0.63, 1.2, 1.55), look: v3(-1.9, 1.8, -1.1), fov: 60 },
  "bookshelf+ceiling": { pos: v3(1.59, 1.02, -1.82), look: v3(0.29, 1.53, -4.48), fov: 60 },
  "bookshelf+desk": { pos: v3(0.17, 0.9, -1.97), look: v3(-0.18, 3.8, -2.69), fov: 60 },
  "ceiling+desk": { pos: v3(-3.16, 2.91, -2.72), look: v3(-1.25, 2.21, -4.93), fov: 60 },
};

const TRACK_FOR = { bookshelf: "toBookshelf", ceiling: "toCeiling", desk: "toDesk" };
const AREAS = ["bookshelf", "ceiling", "desk"];

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
    this.stateTracks = {};
    this.ready = Promise.all([
      ...["library", "toBookshelf", "toCeiling", "toDesk"].map(async (key) => {
        this.tracks[key] = await loadCameraTrack(c[key]);
        if (!this.tracks[key]) placeholderNote(`Library camera (${key}): add ${c[key]}`);
      }),
      ...Object.entries(c.libraryAfter ?? {}).map(async ([key, url]) => {
        this.stateTracks[key] = await loadCameraTrack(url);
        if (!this.stateTracks[key]) placeholderNote("Adjusted library views: add assets/cameras/library-after-*.glb");
      }),
    ]);
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

  // Which adjusted view applies: visited areas, sorted, joined with "+".
  visitedKey() {
    return AREAS.filter((a) => this.visited.has(a)).join("+");
  }

  setHomeCamera() {
    this.setView(this.homeView());
  }

  // Glide the camera to a view (placeholder moves, and linking Blender moves
  // to the adjusted views).
  async glideTo(view, seconds = LIBRARY.transitionSeconds) {
    const cam = this.app.camera;
    const p0 = cam.position.clone();
    const q0 = cam.quaternion.clone();
    const q1 = viewQuat(view);
    const fov0 = cam.fov;
    const fov1 = view.fov ?? fov0;
    await tween(seconds, (t) => {
      const k = ease.inOut(t);
      cam.position.lerpVectors(p0, view.pos, k);
      cam.quaternion.slerpQuaternions(q0, q1, k);
      cam.fov = fov0 + (fov1 - fov0) * k;
      cam.updateProjectionMatrix();
    });
  }

  // Move between the library view and an area. forward = into the area.
  async moveCamera(area, forward) {
    const track = this.tracks[TRACK_FOR[area]];
    if (track) {
      const cam = this.app.camera;
      const seconds = track.seconds || LIBRARY.transitionSeconds;
      const start = this.trackView(track, 0);
      const home = this.homeView();
      const differs = start.pos.distanceTo(home.pos) > 1e-3;
      // The Blender move starts at the first library view; link the
      // adjusted views to it with a glide.
      if (forward && differs) await this.glideTo(start, 1.0);
      await tween(seconds, (t) => track.apply(forward ? t : 1 - t, cam));
      if (!forward && differs) await this.glideTo(home, 1.0);
      return;
    }
    await this.glideTo(forward ? PLACEHOLDER_VIEWS[area] : this.homeView());
  }

  trackView(track, t) {
    const tmp = new THREE.PerspectiveCamera();
    track.apply(t, tmp);
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(tmp.quaternion).add(tmp.position);
    return { pos: tmp.position.clone(), look, fov: tmp.fov };
  }

  // The library view for the current visited state.
  homeView() {
    const key = this.visitedKey();
    if (!key) return this.tracks.library ? this.trackView(this.tracks.library, 0) : PLACEHOLDER_VIEWS.home;
    const still = this.stateTracks[key];
    return still ? this.trackView(still, 0) : ADJUSTED_VIEWS[key];
  }

  // ── Flow ────────────────────────────────────────────────────────
  enter() {
    this.group.visible = true;
    this.app.scroll.disable();
    // Testing aid: ?visited=bookshelf,ceiling starts in that adjusted view.
    const pre = new URLSearchParams(location.search).get("visited");
    if (pre) for (const a of pre.split(",")) if (AREAS.includes(a)) this.visited.add(a);
    if (this.visited.size >= AREAS.length) this.visited.clear();
    this.applyAdjustedHome();
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

  // Called by an area scene when the visitor asks to go back. Returning from
  // the last unvisited area ends the experience instead.
  async returnHome() {
    if (this.state !== "area") return;
    const area = this.area;
    this.state = "moving";
    await this.scenes[area].exit();
    this.visited.add(area);
    if (this.visited.size === AREAS.length) {
      this.state = "ended";
      await playEnding();
      return;
    }
    this.applyAdjustedHome();
    await this.moveCamera(area, false);
    this.area = null;
    this.state = "idle";
    this.showHotspots(true);
  }

  applyAdjustedHome() {
    document.body.dataset.visited = this.visitedKey();
    document.body.classList.toggle("library-returned", this.visited.size > 0);
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

  // Centre of the part of an area that's on screen, in CSS pixels, so each
  // trigger sits in the middle of its area whatever the camera shows.
  areaCenter(id) {
    if (!this.areaBoxes) {
      this.areaBoxes = {};
      for (const [key, root] of Object.entries(this.areaRoots)) {
        root.updateWorldMatrix(true, true);
        this.areaBoxes[key] = new THREE.Box3().setFromObject(root);
      }
    }
    const box = this.areaBoxes[id];
    const cam = this.app.camera;
    cam.updateMatrixWorld();
    const v = new THREE.Vector3();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      v.set(x, y, z).project(cam);
      if (v.z < -1 || v.z > 1) continue; // behind the camera
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    x0 = Math.max(x0, -1); x1 = Math.min(x1, 1);
    y0 = Math.max(y0, -1); y1 = Math.min(y1, 1);
    if (!(x0 < x1 && y0 < y1)) return null;
    return {
      x: ((x0 + x1) / 2 * 0.5 + 0.5) * window.innerWidth,
      y: (-(y0 + y1) / 2 * 0.5 + 0.5) * window.innerHeight,
    };
  }

  update(dt) {
    if (!this.group.visible) return;
    if (this.state === "idle") {
      for (const h of this.hotspots) {
        const s = this.areaCenter(h.id);
        h.button.style.visibility = s ? "" : "hidden";
        if (s) h.button.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
    }
    for (const s of Object.values(this.scenes)) s.update?.(dt);
  }
}
