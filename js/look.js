// Post-processing: the hazy, slightly glowing white look, plus the
// fade-to-white used between scenes. Adapted from the mockup's look
// shader with the cyberpunk effects removed and the haze turned white.
// Add ?look to the URL for a live tuning panel; add ?nofx to turn
// post-processing off entirely (useful if a device shows a black screen).
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { LOOK } from "./config.js";

const HazeShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    soft: { value: 0 },
    saturation: { value: 1 },
    warmth: { value: 0 },
    haze: { value: 0 },
    hazeColor: { value: new THREE.Vector3(1, 1, 1) },
    edgeGlow: { value: 0 },
    grain: { value: 0 },
    white: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time, soft, saturation, warmth, haze, edgeGlow, grain, white;
    uniform vec3 hazeColor;
    varying vec2 vUv;
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      float aspect = resolution.x / resolution.y;
      vec2 c = (vUv - 0.5) * vec2(aspect, 1.0);
      float d = length(c) / (0.5 * length(vec2(aspect, 1.0)));
      float edge = smoothstep(0.2, 1.0, d);

      // soft focus: small blur that grows toward the edges
      vec2 px = soft * (0.3 + 2.0 * edge) / resolution;
      vec3 col = texture2D(tDiffuse, vUv).rgb * 0.25;
      col += texture2D(tDiffuse, vUv + vec2( px.x, 0.0)).rgb * 0.125;
      col += texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)).rgb * 0.125;
      col += texture2D(tDiffuse, vUv + vec2(0.0,  px.y)).rgb * 0.125;
      col += texture2D(tDiffuse, vUv + vec2(0.0, -px.y)).rgb * 0.125;
      col += texture2D(tDiffuse, vUv + px).rgb * 0.0625;
      col += texture2D(tDiffuse, vUv - px).rgb * 0.0625;
      col += texture2D(tDiffuse, vUv + vec2( px.x, -px.y)).rgb * 0.0625;
      col += texture2D(tDiffuse, vUv + vec2(-px.x,  px.y)).rgb * 0.0625;

      // grade: mute color, optional warm/cool, lift toward the haze color
      float l = dot(col, LUMA);
      col = mix(vec3(l), col, saturation);
      col *= vec3(1.0 + warmth, 1.0, 1.0 - warmth);
      col = mix(col, hazeColor, haze);

      // edges glow out into white instead of darkening
      col = mix(col, hazeColor, edgeGlow * smoothstep(0.35, 1.05, d));

      // film grain
      col += (hash(vUv * resolution + fract(time) * 100.0) - 0.5) * grain;

      // fade to glowing white (scene transitions)
      col = mix(col, hazeColor * 1.04, white);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Look {
  constructor(renderer, scene, camera, spark) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.spark = spark;
    this.settings = { ...LOOK, hazeColor: [...LOOK.hazeColor] };
    this.white = 0;
    this.enabled = !new URLSearchParams(location.search).has("nofx");

    if (this.enabled) {
      const size = renderer.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(renderer);
      this.composer.addPass(new RenderPass(scene, camera));
      this.bloom = new UnrealBloomPass(size, 0.5, 0.8, 0.7);
      this.composer.addPass(this.bloom);
      this.haze = new ShaderPass(HazeShader);
      this.composer.addPass(this.haze);
      this.composer.addPass(new OutputPass());
    }
    this.apply();
    if (new URLSearchParams(location.search).has("look")) this.buildPanel();
  }

  apply() {
    const s = this.settings;
    this.renderer.setClearColor(new THREE.Color(s.background));
    document.documentElement.style.setProperty("--bg", s.background);
    if (this.spark) this.spark.preBlurAmount = s.splatSoftness;
    if (!this.enabled) return;
    this.bloom.strength = s.bloom;
    this.bloom.radius = s.bloomRadius;
    this.bloom.threshold = s.bloomThreshold;
    const u = this.haze.uniforms;
    for (const k of ["soft", "saturation", "warmth", "haze", "edgeGlow", "grain"]) u[k].value = s[k];
    u.hazeColor.value.set(...s.hazeColor);
  }

  setSize(w, h) {
    if (this.enabled) this.composer.setSize(w, h);
  }

  render(dt) {
    if (!this.enabled) {
      // Without post-processing, the white fade is done by a page overlay.
      document.getElementById("whiteout").style.opacity = this.white;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const u = this.haze.uniforms;
    this.renderer.getDrawingBufferSize(u.resolution.value);
    u.time.value += dt;
    u.white.value = this.white;
    this.composer.render(dt);
  }

  // ── ?look tuning panel ──────────────────────────────────────────
  buildPanel() {
    const sliders = [
      ["splatSoftness", "Splat softness", 0, 3, 0.05],
      ["soft", "Soft edges", 0, 6, 0.05],
      ["bloom", "Glow", 0, 2, 0.05],
      ["bloomRadius", "Glow radius", 0, 1.5, 0.05],
      ["bloomThreshold", "Glow threshold", 0, 1, 0.01],
      ["saturation", "Saturation", 0, 1.5, 0.01],
      ["warmth", "Warmth", -0.2, 0.2, 0.01],
      ["haze", "Haze", 0, 0.8, 0.01],
      ["edgeGlow", "Edge glow", 0, 1, 0.01],
      ["grain", "Grain", 0, 0.15, 0.005],
    ];
    const panel = document.createElement("div");
    panel.className = "look-panel";
    const title = document.createElement("p");
    title.className = "look-panel-title";
    title.textContent = "Look";
    panel.append(title);

    for (const [key, label, min, max, step] of sliders) {
      const row = document.createElement("label");
      row.className = "look-row";
      const name = document.createElement("span");
      name.textContent = label;
      const input = document.createElement("input");
      Object.assign(input, { type: "range", min, max, step, value: this.settings[key] });
      const out = document.createElement("output");
      out.textContent = this.settings[key];
      input.addEventListener("input", () => {
        this.settings[key] = Number(input.value);
        out.textContent = input.value;
        this.apply();
      });
      row.append(name, input, out);
      panel.append(row);
    }

    const bgRow = document.createElement("label");
    bgRow.className = "look-row";
    const bgName = document.createElement("span");
    bgName.textContent = "Background";
    const bg = document.createElement("input");
    Object.assign(bg, { type: "color", value: this.settings.background });
    bg.addEventListener("input", () => {
      this.settings.background = bg.value;
      this.apply();
    });
    bgRow.append(bgName, bg, document.createElement("span"));
    panel.append(bgRow);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy settings";
    copy.addEventListener("click", async () => {
      const text = `export const LOOK = ${JSON.stringify(this.settings, null, 2)};`;
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "Copied";
      } catch {
        window.prompt("Copy these settings into js/config.js:", text);
      }
      setTimeout(() => (copy.textContent = "Copy settings"), 1200);
    });
    panel.append(copy);
    document.body.append(panel);
  }
}
