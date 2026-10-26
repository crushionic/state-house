// Desk: a softly distorted glowing figure behind the desk talks with the
// visitor through a short branching dialog, in a speech bubble beside its
// head; the line changes with each reply. Replies sit on the desk, centred
// under the bubble, and the return button takes their place at the end.
import * as THREE from "three";
import { ASSETS, DIALOG } from "../config.js";
import { el, placeholderNote, toScreen } from "../ui.js";

// Screen anchors: the bubble sits left of the head; choices sit on the desk.
const HEAD_LEFT = new THREE.Vector3(-0.28, 1.62, 0); // relative to the figure
const DESK_FRONT = new THREE.Vector3(1.2, 0.79, -2.2); // front edge of the desk top

// A gentle, slow wobble with a soft white rim glow — distorted, not creepy.
const FigureShader = {
  uniforms: { time: { value: 0 }, speak: { value: 0 } },
  vertexShader: /* glsl */ `
    uniform float time, speak;
    varying vec3 vNormalV;
    varying vec3 vViewDir;
    void main() {
      vec3 p = position;
      float w = sin(p.y * 6.0 + time * 0.9) * 0.025 + sin(p.x * 9.0 + p.y * 3.0 + time * 1.3) * 0.015;
      w *= 1.0 + speak * 1.5;
      p += normal * w;
      p.x += sin(p.y * 2.5 + time * 0.6) * 0.03;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vNormalV = normalize(normalMatrix * normal);
      vViewDir = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float speak;
    varying vec3 vNormalV;
    varying vec3 vViewDir;
    void main() {
      float rim = 1.0 - max(dot(normalize(vNormalV), normalize(vViewDir)), 0.0);
      float glow = 0.35 + pow(rim, 1.6) * 0.9 + speak * 0.15;
      gl_FragColor = vec4(vec3(1.0, 0.99, 0.97) * (0.9 + 0.3 * glow), clamp(0.25 + glow * 0.6, 0.0, 0.92));
    }`,
};

export class DeskView {
  constructor(app, library) {
    this.app = app;
    this.library = library;
    this.active = false;
    this.speak = 0;
    if (!ASSETS.figureModel) placeholderNote("Desk figure: placeholder shape (model not added yet)");

    this.material = new THREE.ShaderMaterial({ ...FigureShader, transparent: true, depthWrite: false });
    this.material.uniforms = THREE.UniformsUtils.clone(FigureShader.uniforms);
    const figure = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 8, 24), this.material);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 32, 24), this.material);
    head.position.y = 1.62;
    head.scale.set(1, 1.12, 1);
    figure.add(body, head);
    figure.position.copy(library.figureSpot);
    library.group.add(figure);
    this.figure = figure;

    this.text = el("p", { class: "dialog-text" });
    this.bubble = el("div", { class: "speech-bubble", "aria-live": "polite" }, this.text);
    this.choices = el("div", { class: "dialog-choices", role: "group", "aria-label": "Replies" });
    document.body.append(this.bubble, this.choices);
  }

  enter() {
    this.active = true;
    this.place();
    this.bubble.classList.add("is-visible");
    this.choices.classList.add("is-visible");
    this.show(DIALOG.start);
  }

  show(id) {
    const node = DIALOG.nodes[id];
    this.speak = 1;
    this.text.textContent = node.text;
    this.choices.replaceChildren();
    // When the conversation is over, the return button takes the replies' place.
    const options = node.end
      ? [{ label: "Return to library", back: true }]
      : node.choices;
    for (const c of options) {
      this.choices.append(
        el("button", {
          type: "button",
          class: c.back ? "dialog-choice dialog-return" : "dialog-choice",
          text: c.label,
          onclick: () => (c.back ? this.library.returnHome() : this.show(c.next)),
        }),
      );
    }
    this.choices.querySelector("button")?.focus({ preventScroll: true });
  }

  update(dt) {
    const u = this.material.uniforms;
    u.time.value += dt;
    this.speak = Math.max(0, this.speak - dt * 0.8);
    u.speak.value = this.speak;
    if (this.active) this.place();
  }

  // Keep the bubble beside the figure's head and the choices on the desk.
  place() {
    const cam = this.app.camera;
    const head = toScreen(this.figure.localToWorld(HEAD_LEFT.clone()), cam);
    if (head) {
      const room = head.x - 28; // space to the left of the head
      const width = Math.max(160, Math.min(352, room));
      const x = Math.max(12 + width, head.x - 16);
      Object.assign(this.bubble.style, { width: `${width}px`, transform: `translate(${x}px, ${head.y}px) translate(-100%, -50%)` });
      this.bubbleCenterX = x - width / 2;
    }
    // Replies: centred under the bubble, at the height of the desk's front edge.
    const desk = toScreen(DESK_FRONT, cam);
    if (desk) {
      const cx = this.bubbleCenterX ?? desk.x;
      this.choices.style.maxWidth = `${Math.max(160, 2 * Math.min(cx, window.innerWidth - cx) - 24)}px`;
      this.choices.style.transform = `translate(${cx}px, ${desk.y}px) translate(-50%, 0)`;
    }
  }

  async exit() {
    this.active = false;
    this.bubble.classList.remove("is-visible");
    this.choices.classList.remove("is-visible");
  }
}
