/* =====================================================================
   FLOATING THOUGHTS — lingering thoughts, questions and annotations that
   live IN the space. Each one is a sheet of text placed in 3D: it sits at
   a real depth, is seen in perspective (skewed as you pass), goes behind
   splats that are in front of it, and goes through the same soft focus,
   glow and colour as the scene. You can walk right past it.

   Two kinds (THOUGHTS.items in config.js):
   • found in the gaps — when the cursor rests over a gap in the splats
     (where the scan thins into the void), the next thought for this part
     of the journey appears there, at the depth of the space around it,
     turned to face the way you were looking.
   • placed — an item with a  position  sits at that spot (optionally
     turned with  yaw  or toward  facing ). It surfaces when the cursor
     comes near it on screen.
   A thought stays where it appeared while its  show  range lasts (or for
   linger  seconds, if given), then fades.
===================================================================== */
import * as THREE from "three";

export function createThoughts(CFG, { scene, reduceMotion = false } = {}) {
  const C = {
    gap: 0.45, dwell: 0.6, cooldown: 3, maxVisible: 4, linger: null, fadeIn: 1.6, fadeOut: 2.0,
    distance: 0.6, minDistance: 0.25, maxDistance: 2.5, size: 0.032, rise: 0.02, turn: 18,
    color: "#f1e8d8", inLibrary: false, font: '"HAL Timezone Mono", ui-monospace, monospace',
    tracking: 0.1, charDelay: 0.04, charDuration: 0.55, bounce: 0.5, ...CFG,
  };
  const items = (C.items || []).map((it, i) => ({ ...it, i, shownAt: -1e9, count: 0 }));
  const ranges = (show) => (Array.isArray(show[0]) ? show : [show]);
  const inRange = (p, show) => !show || ranges(show).some(([a, b]) => p >= a && p <= b);
  const startOf = (show) => Math.min(...ranges(show).map((r) => r[0]));

  const group = new THREE.Group();
  group.name = "thoughts";
  scene.add(group);
  // a quiet text reader for screen readers
  const sr = document.createElement("div");
  sr.className = "sr-only"; sr.setAttribute("aria-live", "polite");
  document.body.appendChild(sr);

  const live = [];
  let time = 0, dwell = 0, lastSpawn = -1e9, lastProgress = 0, fontReady = false;
  document.fonts?.load(`64px ${C.font}`).then(() => { fontReady = true; }).catch(() => { fontReady = true; });
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), fwd = new THREE.Vector3();
  const screen = new THREE.Vector2();

  /* ---------- a sheet of text ---------- */
  function makeSheet(text, item) {
    const px = 64, lineH = px * 1.45, maxW = px * 14;
    const track = (item.tracking ?? C.tracking) * px;           // extra space between letters
    const c = document.createElement("canvas");
    const g = c.getContext("2d");
    g.font = `${px}px ${C.font}`;
    const widthOf = (str) => [...str].reduce((w, ch) => w + g.measureText(ch).width + track, 0) - (str ? track : 0);
    // wrap the words
    const words = text.replace(/<br\s*\/?>/gi, " \n ").replace(/<[^>]+>/g, "").split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      if (w === "\n") { lines.push(line); line = ""; continue; }
      const t = line ? line + " " + w : w;
      if (widthOf(t) > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    const pad = px * (0.6 + (item.bounce ?? C.bounce));               // room for the bounce
    const w = Math.ceil(Math.max(...lines.map(widthOf)) + pad * 2);
    const h = Math.ceil(lines.length * lineH + pad * 2);
    c.width = w; c.height = h;
    g.font = `${px}px ${C.font}`;            // (resizing a canvas resets its font)
    // every character's place, in reading order (spaces take room but don't animate)
    const chars = [];
    lines.forEach((l, li) => {
      let x = (w - widthOf(l)) / 2;
      for (const ch of l) {
        const cw = g.measureText(ch).width;
        if (ch !== " ") chars.push({ ch, x: x + cw / 2, y: pad + lineH * (li + 0.5) });
        x += cw + track;
      }
    });
    const delay = item.charDelay ?? C.charDelay, dur = item.charDuration ?? C.charDuration;
    const bounce = (item.bounce ?? C.bounce) * px;
    const backOut = (t) => { const k = 1.9; t -= 1; return 1 + (k + 1) * t * t * t + k * t * t; };   // overshoots, settles
    // draw the text as it is 'age' seconds after appearing; returns true once every letter has landed
    function draw(age) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.font = `${px}px ${C.font}`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.shadowColor = "rgba(0,0,0,0.75)"; g.shadowBlur = px * 0.35;
      g.fillStyle = item.color || C.color;
      let landed = true;
      chars.forEach((c0, i) => {
        const t = Math.min(1, Math.max(0, (age - i * delay) / dur));
        if (t < 1) landed = false;
        if (t <= 0) return;
        const e = backOut(t);
        g.globalAlpha = Math.min(1, t * 2.5);
        const sc = 0.6 + 0.4 * e;
        g.setTransform(sc, 0, 0, sc, c0.x, c0.y + (1 - e) * bounce);   // rises in from below, overshoots, settles
        g.fillText(c0.ch, 0, 0);
      });
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      return landed;
    }
    draw(reduceMotion ? 1e9 : 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        map: { value: tex }, opacity: { value: 0 },
        tDepth: { value: null }, useDepth: { value: 0 }, screen: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vZ;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map, tDepth; uniform float opacity, useDepth; uniform vec2 screen;
        varying vec2 vUv; varying float vZ;
        void main() {
          vec4 t = texture2D(map, vUv);
          float a = t.a * opacity;
          // hidden by splats that are in front of it (from the splat depth picture)
          if (useDepth > 0.5) {
            vec4 dz = texture2D(tDepth, gl_FragCoord.xy / screen);
            if (dz.a > 0.05) {
              float z = dz.r / dz.a;
              a *= 1.0 - smoothstep(0.0, 0.06 * vZ, vZ - z) * smoothstep(0.2, 0.7, dz.a);
            }
          }
          gl_FragColor = vec4(t.rgb, a);
        }`,
    });
    const lineWorld = item.size ?? C.size;                         // world height of one line
    const geo = new THREE.PlaneGeometry(lineWorld * w / lineH, lineWorld * h / lineH);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 30;
    mesh.frustumCulled = false;
    mesh.userData.draw = (age) => { const done = draw(age); tex.needsUpdate = true; return done; };
    mesh.userData.landed = reduceMotion;
    return mesh;
  }

  function spawn(item, camera, progress, at, yaw) {
    const mesh = makeSheet(item.text, item);
    mesh.position.copy(at);
    if (item.facing) mesh.lookAt(new THREE.Vector3(...item.facing));
    else if (item.yaw != null) mesh.rotation.set(0, THREE.MathUtils.degToRad(item.yaw), 0);
    else mesh.rotation.set(0, yaw, 0);
    // a sheet sized for its distance, so it reads at about the same size when it appears
    if (!item.position && !item.size) mesh.scale.setScalar(Math.max(0.4, camera.position.distanceTo(at) / C.distance));
    group.add(mesh);
    item.shownAt = time; item.count++;
    live.push({ item, mesh, base: at.clone(), born: time, o: 0, leaving: false });
    lastSpawn = time;
    sr.textContent = item.text.replace(/<[^>]+>/g, "");
  }

  function candidates(progress) {
    return items.filter((it) =>
      inRange(progress, it.show) &&
      (it.repeat ? time - it.shownAt > (it.repeatAfter ?? 20) : it.count === 0) &&
      !live.some((l) => l.item === it && !l.leaving));
  }

  let forced = false;
  return {
    group,
    /** console helper: the next thought for here appears at the cursor now (as if over a gap) */
    surface() { forced = true; },
    /** ctx: { progress, camera, mouse (0–1, y down), coverage, cursorDepth, depthTexture, hidden, wash } */
    update(dt, ctx) {
      time += dt;
      const { progress, camera, mouse } = ctx;
      group.visible = !ctx.hidden;
      // scrubbing back over a stretch lets its thoughts appear again
      if (progress < lastProgress - 0.02) for (const it of items) if (it.show && startOf(it.show) > progress) it.count = 0;
      lastProgress = progress;

      const active = !ctx.hidden && mouse.seen && (ctx.wash ?? 0) < 0.4 && fontReady;
      const room = live.filter((l) => !l.leaving).length < C.maxVisible && time - lastSpawn > C.cooldown;
      if (active && room) {
        const list = candidates(progress);
        // placed thoughts: surface when the cursor comes near them
        const h = innerHeight;
        for (const it of list.filter((x) => x.position)) {
          tmp.set(...it.position).project(camera);
          if (tmp.z > 1 || tmp.z < -1) continue;
          screen.set((tmp.x * 0.5 + 0.5) * innerWidth, (-tmp.y * 0.5 + 0.5) * h);
          if (screen.distanceTo({ x: mouse.x * innerWidth, y: mouse.y * h }) < (it.radius ?? 0.2) * h) {
            spawn(it, camera, progress, new THREE.Vector3(...it.position), 0);
            break;
          }
        }
        // found in the gaps: the cursor rests over a gap
        const free = list.filter((x) => !x.position);
        dwell = ctx.coverage != null && ctx.coverage < C.gap ? dwell + dt : 0;
        if (forced) { dwell = C.dwell; lastSpawn = -1e9; forced = false; }
        if (dwell >= C.dwell && free.length && time - lastSpawn > C.cooldown) {
          dwell = 0;
          const it = free[0];
          // how deep is the space here? the splats around the gap, a little beyond; else the default
          let z = ctx.cursorDepth != null ? ctx.cursorDepth * 1.1 : (it.distance ?? C.distance);
          z = Math.min(C.maxDistance, Math.max(C.minDistance, z));
          dir.set(mouse.x * 2 - 1, -(mouse.y * 2 - 1), 0.5).unproject(camera).sub(camera.position).normalize();
          camera.getWorldDirection(fwd);
          const at = camera.position.clone().addScaledVector(dir, z / Math.max(dir.dot(fwd), 0.2));
          // turned to face back along the way you were looking, plus a slight angle, so
          // it reads as a sheet in the room rather than a label on the glass
          const yaw = Math.atan2(-fwd.x, -fwd.z) + THREE.MathUtils.degToRad((Math.random() - 0.5) * 2 * C.turn);
          spawn(it, camera, progress, at, yaw);
        }
      } else dwell = 0;

      // fade in / out, drift up slowly, occlusion inputs
      const sw = ctx.renderer ? ctx.renderer.getDrawingBufferSize(screen.clone()) : screen.set(innerWidth, innerHeight);
      const oldest = live.filter((l) => !l.leaving);
      if (oldest.length > C.maxVisible) oldest[0].leaving = true;
      for (let i = live.length - 1; i >= 0; i--) {
        const t = live[i];
        const age = time - t.born;
        const linger = t.item.linger ?? C.linger;
        if (!inRange(progress, t.item.show) || (linger != null && age > C.fadeIn + linger)) t.leaving = true;
        const target = t.leaving ? 0 : 1;
        t.o += (target - t.o) * (1 - Math.exp(-dt * (t.leaving ? 3 / C.fadeOut : 3 / C.fadeIn)));
        if (t.leaving && t.o < 0.01) {
          group.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.uniforms.map.value.dispose(); t.mesh.material.dispose();
          live.splice(i, 1); continue;
        }
        if (!t.mesh.userData.landed) t.mesh.userData.landed = t.mesh.userData.draw(age);   // letters bouncing in
        t.mesh.position.copy(t.base);
        if (!reduceMotion) t.mesh.position.y += C.rise * (1 - Math.exp(-age / 12));
        const u = t.mesh.material.uniforms;
        u.opacity.value = t.o;
        u.tDepth.value = ctx.depthTexture || null;
        u.useDepth.value = ctx.depthTexture ? 1 : 0;
        u.screen.value.copy(sw);
      }
    },
    get debug() { return { dwell: +dwell.toFixed(2), live: live.map((l) => l.item.text) }; },
  };
}
