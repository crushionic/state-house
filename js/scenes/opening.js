// Opening: scroll through the splat along the Blender camera move,
// then fade into glowing white. Until the camera export exists, the
// splat is shown from a neutral auto-framed view you can drag around.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SplatMesh } from "@sparkjsdev/spark";
import { ASSETS, OPENING } from "../config.js";
import { loadCameraTrack } from "../camera-track.js";
import { el, placeholderNote, range } from "../ui.js";

export class Opening {
  constructor(app, { onProgress }) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.visible = false;
    app.scene.add(this.group);

    this.splat = new SplatMesh({ url: ASSETS.openingSplat, onProgress });
    this.group.add(this.splat);

    this.track = null;
    this.controls = null;
    this.finished = false;
    this.white = 0;
    this.onFinish = null;

    this.textLayer = el("div", { class: "opening-text", "aria-live": "polite" });
    this.cards = OPENING.text.map((t) => {
      const card = el("div", { class: "text-card" }, el("p", { text: t.body }));
      this.textLayer.append(card);
      return { at: t.at, el: card };
    });
    document.body.append(this.textLayer);

    this.ready = Promise.all([this.splat.initialized, loadCameraTrack(ASSETS.cameras.opening)]).then(
      ([, track]) => {
        this.track = track;
        this.placeSplat();
        if (!track) placeholderNote(`Opening camera move: add ${ASSETS.cameras.opening}`);
      },
    );
  }

  placeSplat() {
    const m = this.track?.splatMatrix();
    if (m) {
      m.decompose(this.splat.position, this.splat.quaternion, this.splat.scale);
    } else {
      const r = OPENING.splatRotation.map(THREE.MathUtils.degToRad);
      this.splat.rotation.set(r[0], r[1], r[2]);
    }
    this.splat.updateMatrixWorld(true);
  }

  // Neutral framing of the splat's dense middle, used only without a track.
  fallbackView() {
    const xs = [], ys = [], zs = [];
    const source = this.splat.splats ?? this.splat.packedSplats;
    const step = Math.max(1, Math.floor((this.splat.numSplats || 0) / 20000));
    const p = new THREE.Vector3();
    const mw = this.splat.matrixWorld;
    source?.forEachSplat((i, center, _s, _q, opacity) => {
      if (i % step || opacity < 0.2) return;
      p.copy(center).applyMatrix4(mw);
      xs.push(p.x); ys.push(p.y); zs.push(p.z);
    });
    const pct = (a, q) => a.sort((u, v) => u - v)[Math.floor(q * (a.length - 1))] ?? 0;
    const lo = new THREE.Vector3(pct(xs, 0.05), pct(ys, 0.05), pct(zs, 0.05));
    const hi = new THREE.Vector3(pct(xs, 0.95), pct(ys, 0.95), pct(zs, 0.95));
    const center = lo.clone().add(hi).multiplyScalar(0.5);
    const size = hi.clone().sub(lo).length() || 1;
    const cam = this.app.camera;
    cam.position.copy(center).add(new THREE.Vector3(0, size * 0.15, size * 0.9));
    cam.lookAt(center);
    if (matchMedia("(pointer: fine)").matches) {
      this.controls = new OrbitControls(cam, this.app.renderer.domElement);
      this.controls.target.copy(center);
      this.controls.enableZoom = false; // keep the mouse wheel for scrolling
      this.controls.enableDamping = true;
    }
  }

  enter() {
    this.group.visible = true;
    this.textLayer.classList.add("is-active");
    this.app.scroll.enable(OPENING.scrollScreens, 0);
    if (!this.track) this.fallbackView();
  }

  update(dt) {
    const p = this.app.scroll.update(dt);
    if (this.track) this.track.apply(p, this.app.camera);
    else this.controls?.update();

    for (const c of this.cards) {
      const d = Math.abs(p - c.at);
      c.el.style.opacity = 1 - range(d, 0.04, 0.09);
    }

    // How white the scene is from scrolling toward the end (main.js combines
    // this with its own transition fades).
    this.white = range(p, OPENING.fadeStart, 0.995);
    if (p >= 0.995 && !this.finished) {
      this.finished = true;
      this.onFinish?.();
    }
  }

  exit() {
    this.group.visible = false;
    this.textLayer.remove();
    this.controls?.dispose();
    this.app.scene.remove(this.group);
    this.splat.dispose();
  }
}
