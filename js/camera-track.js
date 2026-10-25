// Loads a camera animation exported from Blender as .glb and lets the
// site place the camera at any point along it (0 = first frame, 1 = last).
// Scroll scenes scrub it with scroll; transitions play it over time.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BLENDER } from "./config.js";

const loader = new GLTFLoader();
const _scale = new THREE.Vector3();

export class CameraTrack {
  constructor(gltf, url) {
    this.url = url;
    this.root = gltf.scene;
    this.camera = null;
    this.root.traverse((o) => {
      if (!this.camera && o.isCamera) this.camera = o;
    });
    if (!this.camera) throw new Error(`${url} has no camera in it`);

    this.anchor = this.root.getObjectByName(BLENDER.anchorName) || null;

    // Every clip in the file plays together (camera move, focal length, …).
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = gltf.animations.map((clip) => {
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      action.paused = true; // we set time by hand
      return action;
    });
    this.duration = Math.max(0, ...gltf.animations.map((c) => c.duration));
    this.sampleTime(0);
  }

  // Seconds of animation in the file (0 for a single still frame).
  get seconds() {
    return this.duration;
  }

  sampleTime(seconds) {
    const t = THREE.MathUtils.clamp(seconds, 0, this.duration);
    for (const a of this.actions) a.time = Math.min(t, a.getClip().duration);
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
  }

  // Put `out` (a PerspectiveCamera) where the track's camera is at t (0–1).
  apply(t, out) {
    this.sampleTime(t * this.duration);
    this.camera.matrixWorld.decompose(out.position, out.quaternion, _scale);
    if (this.camera.isPerspectiveCamera && Math.abs(out.fov - this.camera.fov) > 1e-4) {
      out.fov = this.camera.fov;
      out.updateProjectionMatrix();
    }
  }

  // World matrix for the splat, if the export includes the anchor Empty.
  splatMatrix() {
    if (!this.anchor) return null;
    this.sampleTime(0);
    const r = BLENDER.importCorrection.map(THREE.MathUtils.degToRad);
    const correction = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ"));
    return this.anchor.matrixWorld.clone().multiply(correction);
  }
}

// Resolves to a CameraTrack, or null if the file isn't there yet.
export async function loadCameraTrack(url) {
  if (!url) return null;
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (!head.ok) return null;
    const gltf = await loader.loadAsync(url);
    return new CameraTrack(gltf, url);
  } catch (err) {
    console.warn(`Camera track ${url} could not be used:`, err);
    return null;
  }
}

// Same as loadCameraTrack, but from an already-parsed glTF (used by tests).
export function trackFromGltf(gltf, url = "inline") {
  return new CameraTrack(gltf, url);
}
