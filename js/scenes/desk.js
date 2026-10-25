// Desk: a softly distorted glowing figure behind the desk talks with the
// visitor through a short branching dialog. When the dialog is done, a
// return button appears in the upper right corner.
import * as THREE from "three";
import { ASSETS, DIALOG } from "../config.js";
import { el, placeholderNote } from "../ui.js";

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
    this.choices = el("div", { class: "dialog-choices" });
    this.box = el("div", { class: "dialog", "aria-live": "polite" }, this.text, this.choices);
    this.returnButton = el("button", {
      type: "button",
      class: "return-button corner",
      text: "Return to library",
      onclick: () => library.returnHome(),
    });
    document.body.append(this.box, this.returnButton);
  }

  enter() {
    this.active = true;
    this.box.classList.add("is-visible");
    this.show(DIALOG.start);
  }

  show(id) {
    const node = DIALOG.nodes[id];
    this.speak = 1;
    this.text.textContent = node.text;
    this.choices.replaceChildren();
    const options = node.end
      ? [{ label: "Close", done: true }]
      : node.choices;
    for (const c of options) {
      this.choices.append(
        el("button", {
          type: "button",
          class: "dialog-choice",
          text: c.label,
          onclick: () => (c.done ? this.finish() : this.show(c.next)),
        }),
      );
    }
    this.choices.querySelector("button")?.focus({ preventScroll: true });
  }

  finish() {
    this.box.classList.remove("is-visible");
    this.returnButton.classList.add("is-visible");
    this.returnButton.focus({ preventScroll: true });
  }

  update(dt) {
    const u = this.material.uniforms;
    u.time.value += dt;
    this.speak = Math.max(0, this.speak - dt * 0.8);
    u.speak.value = this.speak;
  }

  async exit() {
    this.active = false;
    this.box.classList.remove("is-visible");
    this.returnButton.classList.remove("is-visible");
  }
}
