/* =====================================================================
   LIBRARY — the interactive ending.

   States:
     waiting   still walking in (scroll-driven, nothing interactive yet)
     hub       settled on the last keyframe; choose ceiling / desk / book
     moving    the camera is travelling between views
     ceiling   looking up at the whole ceiling; glowing details to click
     detail    zoomed into one ceiling detail, with its blurb open
     desk      in conversation with the State Librarian stand-in
     book      the book placeholder is open
     complete  all three done: after a moment (or a scroll on) → the ending:
               a black void, "What more waits to be seen?", then a button
               that rewinds the whole journey back to the catalog card

   Each of the three can be done ONCE. Untouched, it swirls as a cloud of
   white and gold light (a Spark splat modifier moves, swells and recolours
   its splats), already while you walk in; hovering it at the hub
   materialises it; once done it stays solid.

   Scrolling back at any point (even mid-conversation or with a card open)
   closes whatever is open and hands the camera back to the walk.

   Everything you'd want to change is in LIBRARY in config.js.
===================================================================== */
import * as THREE from "three";
import { dyno, SplatMesh } from "@sparkjsdev/spark";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const v3 = (a) => new THREE.Vector3(...a);

export function createLibrary({ scene, camera, renderer, LIBRARY, reduceMotion, onOpenBook = null, bookView = null, onRestart = null }) {
  const OBJ = LIBRARY.objects;
  const ids = Object.keys(OBJ);                     // ceiling, desk, book
  const pickOrder = ["book", "desk", "ceiling"];    // small things win over the big ceiling

  /* -------------------------------------------------------------------
     state
  ------------------------------------------------------------------- */
  let mode = "waiting";
  const done = Object.fromEntries(ids.map((id) => [id, false]));
  let hovered = null;                 // object id under the cursor (hub)
  let hoveredDetail = null;           // ceiling detail under the cursor
  const visitedDetails = new Set();
  let activeDetail = null;
  let outro = 0, outroOn = false;     // the ending (outro: a wash, only used when leaving for another page)
  let completeAt = 0, endTimer = null;
  let time = 0;
  const mouse = { x: -1, y: -1, inside: false };

  /* -------------------------------------------------------------------
     camera: a pose the library drives once it's active
  ------------------------------------------------------------------- */
  const pose = { pos: v3(LIBRARY.hub.pos), look: v3(LIBRARY.hub.look), fov: LIBRARY.hub.fov };
  let tween = null;
  function moveTo(view, then) {
    tween = {
      from: { pos: pose.pos.clone(), look: pose.look.clone(), fov: pose.fov },
      to: { pos: v3(view.pos), look: v3(view.look), fov: view.fov ?? pose.fov },
      t: 0, dur: reduceMotion ? 0.6 : LIBRARY.move, then,
    };
    setMode("moving");
  }
  function stepTween(dt) {
    if (!tween) return;
    tween.t = Math.min(1, tween.t + dt / tween.dur);
    const k = smoother(tween.t);
    pose.pos.lerpVectors(tween.from.pos, tween.to.pos, k);
    pose.look.lerpVectors(tween.from.look, tween.to.look, k);
    pose.fov = tween.from.fov + (tween.to.fov - tween.from.fov) * k;
    if (tween.t >= 1) { const then = tween.then; tween = null; then && then(); }
  }

  /* -------------------------------------------------------------------
     splat modifier: the drifting cloud of colour
  ------------------------------------------------------------------- */
  // the swirl's look (LIBRARY.swirl in config.js)
  const SW = { colorA: [1.0, 0.97, 0.9], colorB: [1.0, 0.76, 0.32], amount: 0.8, strength: 1.6,
               swell: 1.8, brightness: 0.75, speed: 1, maxBlob: 0.03, ...(LIBRARY.swirl || {}) };
  const swirlU = {
    a: dyno.dynoVec3(new THREE.Vector3(...SW.colorA)), b: dyno.dynoVec3(new THREE.Vector3(...SW.colorB)),
    amount: dyno.dynoFloat(SW.amount), swell: dyno.dynoFloat(SW.swell),
    bright: dyno.dynoFloat(SW.brightness), speed: dyno.dynoFloat(SW.speed),
    maxBlob: dyno.dynoFloat(SW.maxBlob),
  };
  const fx = {};          // id → { solid, glow, uniforms, mesh }
  for (const id of ids) {
    fx[id] = {
      solid: 1, glow: 0, mesh: null, lastSent: -1,
      u: { solid: dyno.dynoFloat(1), glow: dyno.dynoFloat(0), t: dyno.dynoFloat(0), amp: dyno.dynoFloat(OBJ[id].drift * SW.strength) },
    };
  }
  function modifierFor(id) {
    const u = fx[id].u;
    return dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
      const d = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, solid: "float", glow: "float", t: "float", amp: "float",
                   ca: "vec3", cb: "vec3", amount: "float", swell: "float", bright: "float", speed: "float",
                   maxBlob: "float" },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [dyno.unindent(/* glsl */ `
          vec3 libHash3(vec3 p) {
            p = fract(p * vec3(443.897, 441.423, 437.195));
            p += dot(p, p.yxz + 19.19);
            return fract((p.xxy + p.yxx) * p.zyx);
          }
        `)],
        statements: ({ inputs, outputs }) => dyno.unindentLines(/* glsl */ `
          ${outputs.gsplat} = ${inputs.gsplat};
          float cloud = 1.0 - ${inputs.solid};
          if (cloud > 0.001 || ${inputs.glow} > 0.001) {
            vec3 c = ${inputs.gsplat}.center;
            vec3 h = libHash3(c * 17.0);
            float t = ${inputs.t} * ${inputs.speed};
            // drift: every splat wanders on its own slow loop…
            vec3 drift = vec3(
              sin(t * 0.55 + h.x * 6.2832 + c.y * 9.0),
              sin(t * 0.47 + h.y * 6.2832 + c.z * 9.0),
              sin(t * 0.61 + h.z * 6.2832 + c.x * 9.0));
            // …and circles, so the whole thing reads as a slow swirl
            float a = t * 0.5 + h.z * 6.2832 + c.y * 4.0;
            vec3 orbit = vec3(cos(a), 0.35 * sin(a * 1.3), sin(a));
            ${outputs.gsplat}.center = c + (drift * 0.6 + orbit * 0.8) * ${inputs.amp} * cloud * (0.4 + h.x);
            // swell into ROUND soft blobs of light. Long thin splats (common on the
            // ceiling) would streak as they move, so every splat is rounded off and
            // its size capped as it turns to cloud; the longest ones fade away.
            vec3 sc = ${inputs.gsplat}.scales;
            float big = max(sc.x, max(sc.y, sc.z));
            float avg = (sc.x + sc.y + sc.z) / 3.0;
            float blob = min(avg * (1.0 + ${inputs.swell}), ${inputs.maxBlob});
            ${outputs.gsplat}.scales = mix(sc, vec3(blob), cloud);
            float streak = 1.0 - smoothstep(${inputs.maxBlob}, ${inputs.maxBlob} * 4.0, big);
            // colour: shimmering between warm white and gold
            float m = 0.5 + 0.5 * sin(t * 0.6 + h.y * 6.2832 + c.x * 6.0 + c.z * 4.0);
            vec3 hue = mix(${inputs.ca}, ${inputs.cb}, m);
            vec3 rgb = ${inputs.gsplat}.rgba.rgb;
            float lum = dot(rgb, vec3(0.333));
            vec3 light = hue * (0.55 + 0.75 * lum) * ${inputs.bright};
            rgb = mix(rgb, light, cloud * ${inputs.amount});
            // hovering: a warm lift so it reads as "you can touch this"
            rgb += ${inputs.glow} * vec3(0.10, 0.085, 0.06);
            ${outputs.gsplat}.rgba.rgb = rgb;
            ${outputs.gsplat}.rgba.a = ${inputs.gsplat}.rgba.a * mix(1.0, 0.7 * streak, cloud);
          }
        `),
      });
      return { gsplat: d.apply({ gsplat, solid: u.solid, glow: u.glow, t: u.t, amp: u.amp,
        ca: swirlU.a, cb: swirlU.b, amount: swirlU.amount, swell: swirlU.swell, bright: swirlU.bright, speed: swirlU.speed,
        maxBlob: swirlU.maxBlob }).gsplat };
    });
  }
  function attachMesh(id, mesh) { if (fx[id]) fx[id].mesh = mesh; }

  /* -------------------------------------------------------------------
     the State Librarian (her own splat, splats/library/placedkarits.spz):
     the same glow as the old stand-in figure. Her splats turn a soft warm
     white, shimmer and drift a little, and gather out of light as she
     appears. LIBRARY.desk.librarian sets how.
  ------------------------------------------------------------------- */
  const LB = { glow: 0.85, shimmer: 0.003, soften: 0.15, brightness: 1.0, maxSize: 0.02, show: "conversation", ...(LIBRARY.desk.librarian || {}) };
  const lib = {
    mesh: null, vis: LB.show === "always" ? 1 : 0,
    u: { vis: dyno.dynoFloat(0), t: dyno.dynoFloat(0), glow: dyno.dynoFloat(LB.glow),
         amp: dyno.dynoFloat(LB.shimmer), soften: dyno.dynoFloat(LB.soften),
         bright: dyno.dynoFloat(LB.brightness), maxSize: dyno.dynoFloat(LB.maxSize) },
  };
  function librarianModifier() {
    const u = lib.u;
    return dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
      const d = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, vis: "float", t: "float", glow: "float", amp: "float", soften: "float", bright: "float", maxSize: "float" },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [dyno.unindent(/* glsl */ `
          vec3 lbHash3(vec3 p) {
            p = fract(p * vec3(443.897, 441.423, 437.195));
            p += dot(p, p.yxz + 19.19);
            return fract((p.xxy + p.yxx) * p.zyx);
          }
        `)],
        statements: ({ inputs, outputs }) => dyno.unindentLines(/* glsl */ `
          ${outputs.gsplat} = ${inputs.gsplat};
          vec3 c = ${inputs.gsplat}.center;
          vec3 h = lbHash3(c * 23.0);
          float t = ${inputs.t};
          float gather = 1.0 - ${inputs.vis};            // 1 = still a haze of light, 0 = fully here
          // shimmer: every splat drifts on its own small loop (wider while she gathers)
          vec3 drift = vec3(sin(t * 0.7 + h.x * 6.2832), sin(t * 0.5 + h.y * 6.2832) * 0.6, cos(t * 0.6 + h.z * 6.2832));
          ${outputs.gsplat}.center = c + drift * ${inputs.amp} * (1.0 + gather * 6.0)
                                   + vec3(0.0, gather * gather * 0.04 * (h.y - 0.3), 0.0);
          // soft, haloed splats. Oversized stray splats from the scan would turn into
          // big white blobs once lit, so they fade out instead.
          vec3 sc = ${inputs.gsplat}.scales;
          float big = max(sc.x, max(sc.y, sc.z));
          float keep = 1.0 - smoothstep(${inputs.maxSize}, ${inputs.maxSize} * 2.0, big);
          ${outputs.gsplat}.scales = min(sc, vec3(${inputs.maxSize})) * (1.0 + ${inputs.soften} + gather * 1.5);
          // warm white light, keeping a trace of her own shading
          vec3 rgb = ${inputs.gsplat}.rgba.rgb;
          float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
          float flicker = 0.88 + 0.12 * sin(t * 2.0 + h.z * 30.0);
          vec3 light = vec3(1.0, 0.97, 0.92) * ${inputs.bright} * (0.7 + 0.3 * lum) * flicker;
          ${outputs.gsplat}.rgba.rgb = mix(rgb, light, ${inputs.glow});
          ${outputs.gsplat}.rgba.a = ${inputs.gsplat}.rgba.a * mix(0.85, 1.0, flicker) * ${inputs.vis} * keep;
        `),
      });
      return { gsplat: d.apply({ gsplat, vis: u.vis, t: u.t, glow: u.glow, amp: u.amp, soften: u.soften, bright: u.bright, maxSize: u.maxSize }).gsplat };
    });
  }
  function attachLibrarian(mesh) { lib.mesh = mesh; }
  function updateLibrarian(dt, target) {
    const want = LB.show === "always" ? 1 : target;
    lib.vis += (want - lib.vis) * (1 - Math.exp(-dt * 1.5));
    if (Math.abs(lib.vis - want) < 0.003) lib.vis = want;
    lib.u.vis.value = lib.vis;
    // the light settles as she arrives, so her own detail shows while you talk
    const k = lib.vis * lib.vis;
    lib.u.glow.value = LB.glow + ((LB.talkGlow ?? LB.glow) - LB.glow) * k;
    lib.u.bright.value = LB.brightness + ((LB.talkBrightness ?? LB.brightness) - LB.brightness) * k;
    lib.u.soften.value = LB.soften + ((LB.talkSoften ?? LB.soften) - LB.soften) * k;
    lib.u.t.value = time;
    if (lib.mesh && lib.mesh.visible) lib.mesh.updateVersion();   // she shimmers every frame
  }

  function updateFx(dt) {
    for (const id of ids) {
      const f = fx[id];
      let targetSolid, targetGlow = 0, rate;
      if (mode === "waiting") { targetSolid = 1; rate = 3; }        // walking in: solid, as scanned
      else if (done[id]) { targetSolid = 1; rate = 1.5; }
      else if (inside === id) { targetSolid = 1; rate = 2; }
      else if (hovered === id && mode === "hub") { targetSolid = 1; targetGlow = 1; rate = 4; }
      else {                                                        // at the hub: falls apart into the swirl
        targetSolid = 0;
        rate = arrivedAt && time - arrivedAt < (LIBRARY.dissolve ?? 3) ? 2.2 / (LIBRARY.dissolve ?? 3) : 2.5;
      }
      f.solid += (targetSolid - f.solid) * (1 - Math.exp(-dt * rate));
      f.glow += (targetGlow - f.glow) * (1 - Math.exp(-dt * 5));
      if (Math.abs(f.solid - targetSolid) < 0.002) f.solid = targetSolid;
      if (f.glow < 0.002 && targetGlow === 0) f.glow = 0;
      f.u.solid.value = f.solid;
      f.u.glow.value = f.glow;
      f.u.t.value = time;
      // only regenerate splats while something is actually moving or changing
      const animating = f.solid < 1 || f.glow > 0;   // swirling clouds update every frame
      if (f.mesh && f.mesh.visible && (animating || f.lastSent !== f.solid)) {
        f.mesh.updateVersion();
        f.lastSent = f.solid;
      }
    }
  }
  let inside = null;      // the object whose interaction is open
  let editing = null;     // ?dev outline editor: the detail being placed
  let arrivedAt = 0;

  /* -------------------------------------------------------------------
     the State Librarian stand-in: a soft glowing figure of light
  ------------------------------------------------------------------- */
  // desk.figure: null turns the glowing stand-in off (e.g. once the librarian is in the desk scan)
  const figure = LIBRARY.desk.figure ? makeFigure(LIBRARY.desk.figure) : { update() {} };
  if (figure.points) scene.add(figure.points);
  let figureTarget = 0;

  /* -------------------------------------------------------------------
     ceiling details: glowing outlines
  ------------------------------------------------------------------- */
  // Each outline is drawn ON TOP of the finished picture (after the soft focus
  // and grade, on OUTLINE_LAYER), so it stays crisp and bright wherever it is:
  // a sharp core line inside two soft, wider halos, pulsing gently. Hovering
  // makes it flare. Look: LIBRARY.ceiling.outline in config.js.
  const OL = { color: [1.0, 0.95, 0.84], core: 3, halo: 10, outerHalo: 26, rest: 0.8, pulse: 0.2,
               haloStrength: 0.5, hoverGrow: 1.8, visited: 0.35, ...(LIBRARY.ceiling.outline || {}) };
  const OUTLINE_LAYER = 2;
  const outlineGroup = new THREE.Group();
  outlineGroup.visible = false;
  scene.add(outlineGroup);
  const outlineColor = new THREE.Color(...OL.color);
  function makeLines(loops) {
    const lines = [];
    for (const pts of loops) {
      // three passes per loop: outer halo, halo, core
      for (const kind of ["outer", "halo", "core"]) {
        const geo = new LineGeometry();
        geo.setPositions(pts.flatMap((p) => p.toArray()));
        const mat = new LineMaterial({
          color: outlineColor, linewidth: 2, transparent: true, opacity: 0,
          depthTest: false, depthWrite: false, toneMapped: false,
          blending: kind === "core" ? THREE.NormalBlending : THREE.AdditiveBlending,
        });
        const line = new Line2(geo, mat);
        line.userData.kind = kind;
        line.renderOrder = kind === "core" ? 22 : 21;
        line.layers.set(OUTLINE_LAYER);
        outlineGroup.add(line);
        lines.push(line);
      }
    }
    return lines;
  }
  const details = LIBRARY.ceiling.details.map((d) => {
    const loops = shapeLoops(d.shape);
    return { ...d, loops, lines: makeLines(loops), glow: 0, screen: null };
  });
  /** replace a detail's shape (the ?dev outline editor uses this) */
  function setDetailShape(id, shape) {
    const d = details.find((x) => x.id === id);
    if (!d) return;
    for (const l of d.lines) { outlineGroup.remove(l); l.geometry.dispose(); l.material.dispose(); }
    d.shape = shape;
    d.loops = shapeLoops(shape);
    d.lines = makeLines(d.loops);
  }

  /* -------------------------------------------------------------------
     DOM: hover label, panel (ceiling details / book), dialogue
  ------------------------------------------------------------------- */
  const ui = document.createElement("div");
  ui.id = "library-ui";
  ui.innerHTML = `
    <div class="lib-label" aria-hidden="true"></div>
    <section class="lib-panel" role="dialog" aria-modal="false" aria-hidden="true">
      <h3 class="lib-panel-title"></h3>
      <div class="lib-panel-body"></div>
      <button type="button" class="lib-panel-close"></button>
      <button type="button" class="lib-panel-extra" hidden></button>
    </section>
    <section class="lib-dialogue" role="dialog" aria-hidden="true" aria-live="polite">
      <div class="lib-speaker"></div>
      <p class="lib-line"></p>
      <ol class="lib-choices"></ol>
    </section>
    <div class="lib-end" aria-hidden="true"><p></p><button type="button" class="lib-restart"></button></div>
    <nav class="lib-keys" aria-label="Choose what to look at"></nav>`;
  document.body.appendChild(ui);
  const $ = (s) => ui.querySelector(s);
  const label = $(".lib-label"), panel = $(".lib-panel"), dialogue = $(".lib-dialogue");
  const endEl = $(".lib-end"), keysNav = $(".lib-keys");

  // keyboard / screen-reader access to the three choices (visually hidden)
  for (const id of ids) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.id = id; b.textContent = OBJ[id].label;
    b.addEventListener("click", () => { if (mode === "hub" && !done[id]) choose(id); });
    keysNav.appendChild(b);
  }

  function setMode(m) {
    mode = m;
    document.body.dataset.library = m;
    keysNav.querySelectorAll("button").forEach((b) => { b.disabled = m !== "hub" || done[b.dataset.id]; });
  }

  function openPanel(title, body, closeText, onClose, extra = null, card = null) {
    // card: { img, alt, closeImg } — the panel is just that picture, with a picture button
    panel.classList.toggle("as-card", !!card);
    $(".lib-panel-title").textContent = card ? "" : title;
    $(".lib-panel-body").innerHTML = "";
    if (card) {
      const im = new Image(); im.src = card.img; im.alt = card.alt || title; im.draggable = false; im.className = "lib-card";
      $(".lib-panel-body").append(im);
    } else $(".lib-panel-body").innerHTML = body;
    const btn = $(".lib-panel-close");
    if (card && card.closeImg) {
      btn.innerHTML = "";
      const b = new Image(); b.src = card.closeImg; b.alt = closeText; b.draggable = false;
      btn.append(b);
    } else btn.textContent = closeText;
    btn.onclick = () => { closePanel(); onClose(); };
    const ex = $(".lib-panel-extra");
    ex.hidden = !extra;
    if (extra) { ex.textContent = extra.text; ex.onclick = () => { closePanel(); extra.onClick(); }; }
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    btn.focus({ preventScroll: true });
    panel._onClose = onClose;
  }
  function closePanel() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    panel._onClose = null;
  }

  /* -------------------------------------------------------------------
     the three interactions
  ------------------------------------------------------------------- */
  function choose(id) {
    hovered = null;
    inside = id;
    label.classList.remove("on");
    document.body.classList.remove("hovering");
    if (id === "ceiling") startCeiling();
    if (id === "desk") startDesk();
    if (id === "book") startBook();
  }

  function finish(id) {
    done[id] = true;
    inside = null;
    updateProgress();
    moveTo(LIBRARY.hub, () => {
      if (ids.every((k) => done[k])) {
        setMode("complete");
        completeAt = time;
      } else setMode("hub");
    });
  }

  // ---- ceiling ----
  function startCeiling() {
    outlineGroup.visible = true;
    moveTo(LIBRARY.ceiling.view, () => setMode("ceiling"));
  }
  function openDetail(d) {
    activeDetail = d;
    hoveredDetail = null;
    label.classList.remove("on");
    moveTo(d.view, () => {
      setMode("detail");
      const C = LIBRARY.ceiling;
      openPanel(d.title, d.body, "Return to ceiling", () => {
        visitedDetails.add(d.id);
        activeDetail = null;
        // all four seen: straight back to the desk, book and ceiling view
        if (details.every((x) => visitedDetails.has(x.id))) { outlineGroup.visible = false; finish("ceiling"); }
        else moveTo(LIBRARY.ceiling.view, () => setMode("ceiling"));
      }, null, d.card ? { img: d.card, alt: d.title, closeImg: C.returnButton } : null);
    });
  }

  // ---- desk ----
  let typing = null;
  function startDesk() {
    figureTarget = 1;
    moveTo(LIBRARY.desk.view, () => { setMode("desk"); showNode(LIBRARY.desk.start); });
  }
  // The conversation is images (LIBRARY.desk.nodes); LIBRARY.desk.layout places them.
  const seen = new Set();
  let usingKeys = false;
  addEventListener("keydown", () => { usingKeys = true; }, true);
  addEventListener("pointerdown", () => { usingKeys = false; }, true);
  function place(el, own, base) {
    const q = { ...(base || {}), ...(own || {}) };
    for (const k of ["x", "y", "width", "gap"]) {
      if (q[k] != null) el.style.setProperty(`--${k}`, q[k]); else el.style.removeProperty(`--${k}`);
    }
  }
  function pic(src, alt) {
    if (!src) {                              // no image yet: show the words instead
      const s = document.createElement("span");
      s.className = "lib-fallback"; s.textContent = alt || "";
      return s;
    }
    const im = new Image();
    im.src = src; im.alt = alt || ""; im.draggable = false;
    return im;
  }
  function showNode(key) {
    clearTimeout(typing);
    if (key === "end") {
      dialogue.classList.remove("open");
      dialogue.setAttribute("aria-hidden", "true");
      seen.clear();
      figureTarget = 0;
      finish("desk");
      return;
    }
    const D = LIBRARY.desk, L = D.layout || {};
    const node = D.nodes[key];
    if (!node) { console.warn(`library desk: no node called "${key}"`); return; }
    seen.add(key);
    $(".lib-speaker").textContent = D.speaker;
    const line = $(".lib-line"), list = $(".lib-choices");
    place(line, node.place, L.line);
    place(list, node.choicesPlace, L.choices);
    line.classList.remove("show"); list.classList.remove("show");
    line.innerHTML = ""; list.innerHTML = "";

    // the librarian's line; a node with "next" gets the Next button just to its right
    line.append(pic(node.img, node.alt));
    let nextBtn = null;
    if (node.next) {
      const N = D.nextButton || {};
      nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "lib-next";
      if (N.width) nextBtn.style.width = N.width;
      if (N.gap) nextBtn.style.setProperty("--next-gap", N.gap);
      nextBtn.append(pic(N.img, N.alt || "Next"));
      nextBtn.addEventListener("click", () => showNode(node.next));
      line.append(nextBtn);
    }
    // the questions, in the order listed in config.js
    const choices = (node.choices || []).filter((c) =>
      !(c.hideAfter && seen.has(c.hideAfter)) &&                       // already asked
      !(c.showAfter && ![].concat(c.showAfter).every((k) => seen.has(k))));  // not unlocked yet
    choices.forEach((c) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.append(pic(c.img, c.alt));
      b.addEventListener("click", () => showNode(c.next));
      li.append(b);
      list.append(li);
    });

    dialogue.classList.add("open");
    dialogue.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => line.classList.add("show"));
    const delay = reduceMotion ? 0 : (D.choiceDelay ?? 600);
    typing = setTimeout(() => {
      if (choices.length) list.classList.add("show");
      nextBtn?.classList.add("show");
      // keyboard users get the first button focused; mouse users see the glow only on hover
      if (usingKeys) (list.querySelector("button") || nextBtn)?.focus({ preventScroll: true });
    }, delay);
    dialogue._current = node;
  }

  // ---- book ----
  // With a book scene (LIBRARY.book.scene), the camera moves in on the book and
  // main.js takes over: white, then the book itself, scrolled through. Closing
  // it comes back here through closeBook(). Without one: the placeholder card.
  function startBook() {
    // with the book scene, pan straight to where reading begins on the library's book
    moveTo((bookView && bookView()) || LIBRARY.book.view, () => {
      setMode("book");
      const b = LIBRARY.book;
      if (onOpenBook) { onOpenBook(); return; }
      openPanel(b.title, b.body, b.close, () => finish("book"),
        b.page ? { text: b.openPage || "Open the book", onClick: () => leaveFor(b.page) } : null);
    });
  }
  /** back from the book scene: read = it counts as done */
  function closeBook(read, from = null) {
    if (mode !== "book") return;
    // carry on from wherever the reading left the camera
    if (from) { pose.pos.copy(from.pos); pose.look.copy(from.look); pose.fov = from.fov; }
    if (read) finish("book");
    else { inside = null; moveTo(LIBRARY.hub, () => setMode("hub")); }
  }

  function updateProgress() {}      // (no on-screen marks for what's done)
  updateProgress();

  /* -------------------------------------------------------------------
     input
  ------------------------------------------------------------------- */
  addEventListener("pointermove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    label.style.transform = `translate(${e.clientX + 18}px, ${e.clientY + 14}px)`;
  }, { passive: true });

  addEventListener("click", (e) => {
    if (editing) return;                    // the ?dev outline editor uses clicks
    if (e.target.closest && e.target.closest(".lib-panel, .lib-dialogue, .lib-keys, #dev, #outline-editor")) return;
    if (mode === "hub" && hovered && !done[hovered]) choose(hovered);
    else if (mode === "ceiling" && hoveredDetail) openDetail(hoveredDetail);
  });
  // touch: there's no hover, so a tap picks whatever is under the finger
  addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    pick();
  });

  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open") && panel._onClose) {
      const cb = panel._onClose; closePanel(); cb();
    }
    if (mode === "desk" && /^[1-9]$/.test(e.key)) {
      const b = dialogue.querySelectorAll(".lib-choices button")[Number(e.key) - 1];
      if (b) b.click();
    }
  });
  // wash to white, then open another page (?dev is carried along)
  let leaveUrl = null;
  function leaveFor(url) {
    leaveUrl = url;
    outroOn = true;
    setMode("moving");
  }

  // scrolled back out of the library: close everything and give the camera back
  function exitToWalk() {
    clearTimeout(typing); typing = null;
    dialogue.classList.remove("open"); dialogue.setAttribute("aria-hidden", "true");
    closePanel();
    tween = null; inside = null; activeDetail = null; hovered = null; hoveredDetail = null;
    figureTarget = 0;
    label.classList.remove("on");
    document.body.classList.remove("hovering");
    if (!leaveUrl) { outroOn = false; clearTimeout(endTimer); endEl.classList.remove("open", "with-button"); }
    pose.pos.set(...LIBRARY.hub.pos); pose.look.set(...LIBRARY.hub.look); pose.fov = LIBRARY.hub.fov;
    setMode("waiting");
  }

  // THE ENDING: after all three, a black void; the line fades in; then the way back
  const E = { text: "What more waits to be seen?", button: "return to start", after: 4, buttonAfter: 5, ...(LIBRARY.complete || {}) };
  const endText = endEl.querySelector("p"), restartBtn = endEl.querySelector(".lib-restart");
  endText.textContent = E.text;
  restartBtn.textContent = E.button;
  function startOutro() {
    if (mode !== "complete" || outroOn) return;
    outroOn = true;
    endEl.classList.add("open");
    endEl.setAttribute("aria-hidden", "false");
    clearTimeout(endTimer);
    endTimer = setTimeout(() => { endEl.classList.add("with-button"); restartBtn.focus({ preventScroll: true }); }, (E.buttonAfter + 2.4) * 1000);
  }
  restartBtn.addEventListener("click", () => {
    endEl.classList.remove("open", "with-button");
    endEl.setAttribute("aria-hidden", "true");
    clearTimeout(endTimer);
    onRestart && onRestart();
  });
  /** start over: everything back as it was (the rewind takes the camera back to the card) */
  function reset() {
    for (const id of ids) done[id] = false;
    visitedDetails.clear();
    outroOn = false; outro = 0; completeAt = 0;
    clearTimeout(endTimer);
    endEl.classList.remove("open", "with-button");
    exitToWalk();
  }
  const overUi = (t) => !!(t && t.closest && t.closest("#dev, .lib-panel, .lib-dialogue, [data-own-scroll]"));
  addEventListener("wheel", (e) => { if (e.deltaY > 0 && !overUi(e.target)) startOutro(); }, { passive: true });
  addEventListener("touchmove", startOutro, { passive: true });
  addEventListener("keydown", (e) => { if (["ArrowDown", "PageDown", "Space"].includes(e.code)) startOutro(); });

  /* -------------------------------------------------------------------
     picking: what is the cursor pointing at?
  ------------------------------------------------------------------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const boxes = Object.fromEntries(ids.map((id) => [id, new THREE.Box3(v3(OBJ[id].box[0]), v3(OBJ[id].box[1]))]));
  const tmp = new THREE.Vector3();

  function pick() {
    if (!mouse.inside) { hovered = null; hoveredDetail = null; return; }
    if (mode === "hub") {
      ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      hovered = pickOrder.find((id) => !done[id] && ray.ray.intersectBox(boxes[id], tmp)) || null;
    } else hovered = null;

    if (mode === "ceiling") {
      // smallest on-screen outline under the cursor wins
      let best = null, bestArea = Infinity;
      for (const d of details) {
        const r = d.screen;
        if (!r) continue;
        if (mouse.x >= r.x0 && mouse.x <= r.x1 && mouse.y >= r.y0 && mouse.y <= r.y1) {
          const area = (r.x1 - r.x0) * (r.y1 - r.y0);
          if (area < bestArea) { best = d; bestArea = area; }
        }
      }
      hoveredDetail = best;
    } else hoveredDetail = null;

    const text = hovered ? OBJ[hovered].label : hoveredDetail ? hoveredDetail.label : "";
    label.textContent = text;
    label.classList.toggle("on", !!text);
    document.body.classList.toggle("hovering", !!text);
  }

  function projectDetails() {
    const w = innerWidth, h = innerHeight, pad = 14;
    for (const d of details) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ok = false;
      for (const loop of d.loops) for (const p of loop) {
        tmp.copy(p).project(camera);
        if (tmp.z > 1) continue;
        ok = true;
        const sx = (tmp.x * 0.5 + 0.5) * w, sy = (-tmp.y * 0.5 + 0.5) * h;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      d.screen = ok ? { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad } : null;
    }
  }

  function updateOutlines(dt) {
    const showing = editing || mode === "ceiling" || (mode === "moving" && inside === "ceiling" && !activeDetail);
    const res = renderer.getDrawingBufferSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    for (const d of details) {
      const seen = visitedDetails.has(d.id);
      const hot = hoveredDetail === d || (editing && editing.id === d.id);
      // brightness: resting (pulsing, slightly out of step with each other), hovered = full flare, visited = dim
      const target = !showing ? 0 : hot ? 1 : seen ? OL.visited
        : OL.rest - OL.pulse * 0.5 + OL.pulse * 0.5 * (1 + Math.sin(time * 2.4 + d.id.length * 1.7));
      d.glow += (target - d.glow) * (1 - Math.exp(-dt * 7));
      d.hot = (d.hot ?? 0) + ((hot ? 1 : 0) - (d.hot ?? 0)) * (1 - Math.exp(-dt * 7));
      const grow = 1 + (OL.hoverGrow - 1) * d.hot;
      for (const l of d.lines) {
        const kind = l.userData.kind;
        const m = l.material;
        if (kind === "core") { m.opacity = Math.min(1, d.glow * 1.1); m.linewidth = OL.core * pr * (0.8 + 0.4 * d.glow) * (1 + 0.3 * d.hot); }
        else if (kind === "halo") { m.opacity = d.glow * OL.haloStrength * 0.6; m.linewidth = OL.halo * pr * grow; }
        else { m.opacity = d.glow * OL.haloStrength * 0.25; m.linewidth = OL.outerHalo * pr * grow; }
        m.resolution.copy(res);
      }
    }
  }

  /* -------------------------------------------------------------------
     per frame. Returns what the main loop needs.
  ------------------------------------------------------------------- */
  function update(dt, progressAtEnd) {
    time += dt;
    if (mode === "waiting" && progressAtEnd) {
      // just arrived on the last keyframe: the three come alive
      pose.pos.set(...LIBRARY.hub.pos); pose.look.set(...LIBRARY.hub.look); pose.fov = LIBRARY.hub.fov;
      arrivedAt = time;
      setMode(ids.every((k) => done[k]) ? "complete" : "hub");
      if (mode === "complete") completeAt = time;
    } else if (mode !== "waiting" && !progressAtEnd && !leaveUrl) {
      // scrolled back: leave the library, whatever was going on
      exitToWalk();
    }
    stepTween(dt);
    if (mode === "ceiling" || mode === "moving") projectDetails();
    if (mode !== "waiting") pick();
    updateFx(dt);
    updateOutlines(dt);
    figure.update(dt, time, figureTarget, camera, renderer);
    updateLibrarian(dt, figureTarget);
    if (outroOn) outro = Math.min(1, outro + dt / (leaveUrl ? 1.4 : 3));
    else if (outro > 0) outro = Math.max(0, outro - dt / 1.2);   // scrolled back during the white-out
    if (outro >= 1 && leaveUrl) {
      const url = new URL(leaveUrl, location.href);
      if (new URLSearchParams(location.search).has("dev")) url.search = location.search;
      leaveUrl = null;
      location.href = url.href;
    }
    // all three done and settled back in the room: the ending begins on its own after a moment
    if (mode === "complete" && !outroOn && completeAt && time - completeAt > E.after) startOutro();
    return {
      active: mode !== "waiting",
      pose,
      // the hub pans more with the cursor; close-ups barely move
      parallax: mode === "hub" || mode === "complete" ? LIBRARY.parallax : mode === "moving" ? [0.03, 0.02] : [0.025, 0.015],
      wash: leaveUrl ? outro : 0,
      // with a card open, slide the picture over so the subject isn't hidden behind it
      shift: panel.classList.contains("open") ? 1 : 0,
      hint: null,
      ending: outroOn,
    };
  }

  /* -------------------------------------------------------------------
     ?dev OUTLINE EDITOR — place the ceiling outlines by clicking on the scan.
     In ?dev, go to the ceiling and press O. Pick a detail and a shape, then:
       rect     click two opposite corners
       circle   click the centre, then a point on its edge
       circles  click each centre (shift-click a point on an edge to set the size)
     The outline updates live; the shape is shown and copied, ready to paste
     over that detail's  shape: …  in config.js.
  ------------------------------------------------------------------- */
  if (new URLSearchParams(location.search).has("dev")) {
    const ed = document.createElement("div");
    ed.id = "outline-editor";
    ed.hidden = true;
    ed.innerHTML = `
      <b>Outline editor</b> <span class="oe-x">O to close</span>
      <label>detail <select class="oe-detail">${details.map((d) => `<option value="${d.id}">${d.label}</option>`).join("")}</select></label>
      <label>shape <select class="oe-type"><option>rect</option><option>circle</option><option>circles</option></select></label>
      <label>lies <select class="oe-plane"><option value="y">flat on the ceiling (y)</option><option value="x">upright on a wall (x)</option></select></label>
      <p class="oe-help"></p>
      <pre class="oe-out"></pre>
      <button type="button" class="oe-copy">copy shape</button> <button type="button" class="oe-undo">start over</button>`;
    document.body.appendChild(ed);
    const q = (c) => ed.querySelector(c);
    const HELP = { rect: "click two opposite corners", circle: "click the centre, then a point on its edge",
                   circles: "click each centre · shift-click an edge to set the size" };
    let clicks = [];
    const marks = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffe9a8, size: 9, sizeAttenuation: false, depthTest: false, transparent: true }));
    marks.layers.set(OUTLINE_LAYER); marks.renderOrder = 23; marks.frustumCulled = false;
    scene.add(marks);
    const r4 = (v) => Math.round(v * 10000) / 10000;
    const v4 = (a) => `[${a.map(r4).join(", ")}]`;
    const cur = () => details.find((d) => d.id === q(".oe-detail").value);
    function sync() {
      const d = cur();
      q(".oe-type").value = d.shape.type; q(".oe-plane").value = d.shape.plane || "y";
      q(".oe-help").textContent = HELP[q(".oe-type").value];
      q(".oe-out").textContent = fmt(d.shape);
      clicks = []; showMarks();
      editing = ed.hidden ? null : d;
    }
    function fmt(sh) {
      if (sh.type === "rect") return `shape: { type: "rect", center: ${v4(sh.center)}, size: ${v4(sh.size)}, plane: "${sh.plane}" },`;
      if (sh.type === "circle") return `shape: { type: "circle", center: ${v4(sh.center)}, radius: ${r4(sh.radius)}, plane: "${sh.plane}" },`;
      return `shape: { type: "circles", centers: [${sh.centers.map(v4).join(", ")}],\n         radius: ${r4(sh.radius)}, plane: "${sh.plane}" },`;
    }
    function showMarks() {
      marks.geometry.setAttribute("position", new THREE.Float32BufferAttribute(clicks.flatMap((c) => c.toArray()), 3));
      marks.visible = clicks.length > 0;
    }
    function apply(shape) {
      const d = cur();
      setDetailShape(d.id, shape);
      editing = details.find((x) => x.id === d.id);
      const text = fmt(shape);
      q(".oe-out").textContent = text;
      try { navigator.clipboard?.writeText(text).catch(() => {}); } catch {}
    }
    // the point on the scan under the cursor (or, past its edge, on the shape's plane)
    const rc = new THREE.Raycaster(), nd = new THREE.Vector2();
    function hitAt(e) {
      nd.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      rc.setFromCamera(nd, camera);
      const meshes = [];
      scene.traverseVisible((o) => { if (o instanceof SplatMesh) meshes.push(o); });
      // only fairly solid splats count (faint strays past the skylight glass don't)
      const old = meshes.map((m) => m.minRaycastOpacity);
      meshes.forEach((m) => { m.minRaycastOpacity = 0.5; });
      const hits = rc.intersectObjects(meshes, false);
      meshes.forEach((m, i) => { m.minRaycastOpacity = old[i]; });
      // the first hit near this detail's surface (its ceiling height, or its wall)…
      const d = cur(), c = d.shape.center || d.shape.centers?.[0] || [0, 0, 0];
      const wall = q(".oe-plane").value === "x";
      const near = hits.find((h) => Math.abs(wall ? h.point.x - c[0] : h.point.y - c[1]) < 0.3);
      if (near) return near.point.clone();
      // …or else the spot on that surface's plane
      const plane = wall ? new THREE.Plane(new THREE.Vector3(1, 0, 0), -c[0]) : new THREE.Plane(new THREE.Vector3(0, 1, 0), -c[1]);
      return rc.ray.intersectPlane(plane, new THREE.Vector3());
    }
    addEventListener("pointerdown", (e) => {
      if (ed.hidden || e.button !== 0 || e.target.closest("#outline-editor, #dev")) return;
      const p = hitAt(e);
      if (!p) return;
      const type = q(".oe-type").value, plane = q(".oe-plane").value;
      const inPlane = (a, b) => plane === "x" ? Math.hypot(a.y - b.y, a.z - b.z) : Math.hypot(a.x - b.x, a.z - b.z);
      if (type === "circles" && e.shiftKey && clicks.length) {
        const sh = { ...cur().shape, type, plane, radius: inPlane(clicks[clicks.length - 1], p) };
        sh.centers = clicks.map((c) => c.toArray()); apply(sh); return;
      }
      clicks.push(p); showMarks();
      if (type === "rect" && clicks.length === 2) {
        const [a, b] = clicks, c = a.clone().add(b).multiplyScalar(0.5);
        const size = plane === "x" ? [Math.abs(a.z - b.z), Math.abs(a.y - b.y)] : [Math.abs(a.x - b.x), Math.abs(a.z - b.z)];
        apply({ type, center: c.toArray(), size, plane }); clicks = []; showMarks();
      } else if (type === "circle" && clicks.length === 2) {
        apply({ type, center: clicks[0].toArray(), radius: inPlane(clicks[0], clicks[1]), plane }); clicks = []; showMarks();
      } else if (type === "circles") {
        const r = cur().shape.radius ?? 0.02;
        apply({ type, centers: clicks.map((c) => c.toArray()), radius: r, plane });
      }
    }, true);
    q(".oe-detail").addEventListener("change", sync);
    q(".oe-type").addEventListener("change", () => { clicks = []; showMarks(); q(".oe-help").textContent = HELP[q(".oe-type").value]; });
    q(".oe-undo").addEventListener("click", () => { clicks = []; showMarks(); });
    q(".oe-copy").addEventListener("click", () => {
      navigator.clipboard?.writeText(q(".oe-out").textContent).catch(() => {
        // no clipboard access: select the text so it can be copied by hand
        const r = document.createRange(); r.selectNodeContents(q(".oe-out"));
        getSelection().removeAllRanges(); getSelection().addRange(r);
      });
    });
    ed.addEventListener("keydown", (e) => e.stopPropagation());
    addEventListener("keydown", (e) => {
      if (e.code !== "KeyO" || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      ed.hidden = !ed.hidden;
      outlineGroup.visible = !ed.hidden || mode === "ceiling" || mode === "moving" || mode === "detail";
      if (!ed.hidden) outlineGroup.visible = true;
      sync();
    });
  }

  return {
    modifierFor, attachMesh, librarianModifier, attachLibrarian, update, done, closeBook, reset,
    outlines: outlineGroup, outlineLayer: OUTLINE_LAYER, setDetailShape,
    /** console helpers: site.library.openDetail("oak") (from the ceiling view), site.library.choose("desk") (from the hub) */
    openDetail(id) { const d = details.find((x) => x.id === id); if (d && mode === "ceiling") openDetail(d); },
    choose(id) { if (mode === "hub" && !done[id]) choose(id); },
    get details() { return details; },
    /** ?dev outline editor: which detail is being edited (null = off) */
    setEditing(d) { editing = d; },
    get librarianOpacity() { return lib.vis; },
    librarianFx: lib.u,      // for tuning live from the console: site.library.librarianFx.glow.value = 0.5
    get mode() { return mode; },
    // for the browser console / tests
    get debug() { return { mode, inside, tween: tween ? +tween.t.toFixed(3) : null, activeDetail: activeDetail?.id ?? null, visited: [...visitedDetails] }; },
  };
}

/* ---------------------------------------------------------------------
   helpers
--------------------------------------------------------------------- */
function shapeLoops(shape) {
  const loop = (center, r, plane, n = 48) => {
    const c = v3(center), pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(plane === "x"
        ? new THREE.Vector3(c.x, c.y + Math.sin(a) * r, c.z + Math.cos(a) * r)
        : new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r));
    }
    return pts;
  };
  if (shape.type === "circle") return [loop(shape.center, shape.radius, shape.plane)];
  if (shape.type === "circles") return shape.centers.map((c) => loop(c, shape.radius, shape.plane, 24));
  // rect
  const c = v3(shape.center), [w, d] = shape.size;
  const corners = shape.plane === "x"
    ? [[0, -d / 2, -w / 2], [0, -d / 2, w / 2], [0, d / 2, w / 2], [0, d / 2, -w / 2]]
    : [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]];
  const pts = corners.map(([x, y, z]) => new THREE.Vector3(c.x + x, c.y + y, c.z + z));
  pts.push(pts[0].clone());
  return [pts];
}

// A figure made of soft drifting points of light (stand-in for the State Librarian)
function makeFigure({ position, height }) {
  const N = 2600, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  const H = height;
  for (let i = 0; i < N; i++) {
    let x, y, z;
    const r = Math.random();
    if (r < 0.18) {                                   // head
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, rr = H * 0.075 * Math.cbrt(Math.random());
      x = Math.sqrt(1 - u * u) * Math.cos(a) * rr; z = Math.sqrt(1 - u * u) * Math.sin(a) * rr; y = H * 0.87 + u * rr;
    } else {                                          // shoulders to hem: a soft tapering column
      const t = Math.random();                        // 0 = hem, 1 = shoulders
      const width = H * (0.11 + 0.06 * Math.sin(t * Math.PI * 0.9));
      const a = Math.random() * Math.PI * 2, rr = width * Math.sqrt(Math.random());
      x = Math.cos(a) * rr; z = Math.sin(a) * rr * 0.6; y = t * H * 0.76;
    }
    pos.set([x, y, z], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uSize: { value: H * 0.06 }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime, uSize, uScale;
      varying float vSeed;
      void main() {
        vec3 p = position;
        float s = seed * 6.2832;
        p += vec3(sin(uTime * 0.7 + s), sin(uTime * 0.5 + s * 1.3) * 0.6, cos(uTime * 0.6 + s)) * uSize * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale / -mv.z * (0.6 + seed);
        vSeed = seed;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity, uTime;
      varying float vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        float flicker = 0.75 + 0.25 * sin(uTime * 2.0 + vSeed * 30.0);
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a * 0.22 * flicker * uOpacity, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.position.set(...position);
  points.renderOrder = 15;
  points.frustumCulled = false;
  points.visible = false;
  let o = 0;
  return {
    points,
    update(dt, time, target, camera, renderer) {
      o += (target - o) * (1 - Math.exp(-dt * 1.5));
      mat.uniforms.uOpacity.value = o;
      mat.uniforms.uTime.value = time;
      // world size → pixels at this field of view and resolution
      mat.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      points.visible = o > 0.01;
    },
  };
}
