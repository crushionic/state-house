/* =====================================================================
   AMBIENT SOUND — a framework for the soundscape. Drop audio files into
   the audio/ folder and list them in SOUND (config.js). Missing files are
   skipped quietly (a note in the console), so this can be filled in bit
   by bit.

   Kinds of sound
   • one-shot   plays once when the journey passes  at  (a door creak, an
                elevator ding). Re-plays if you scrub back and pass it again.
   • loop       plays while progress is inside  range  , fading at the
                edges (chatter, an exit sign's buzz, the library's room tone).
   • scattered  a one-shot that repeats at random intervals inside  range
                (footsteps echoing down a hallway, pages turning).
   • on cue     plays when something happens: the library opening, going
                to the desk, opening the book… ( on: "library:desk" ).

   Echo: every sound goes into a bus ("house" or "library"). Each bus has
   its own reverb (a generated echo), so sounds ring out and stack on one
   another. At SOUND.cut the State House bus is cut: its sounds stop
   dead, and only the echo already in the air rings out. Scrolling back
   past the cut brings it back.

   Browsers only allow sound after a click, tap or key press (scrolling
   doesn't count), so a small "sound" toggle sits in the corner, and the
   first click / tap / key anywhere also turns sound on.
===================================================================== */

export function createSound(CFG, { dev = false } = {}) {
  const C = { volume: 0.8, folder: "", fadeTime: 1.2, ...CFG };
  const BUSES = { house: { reverb: 0.45, echo: 3.5, volume: 1 }, library: { reverb: 0.3, echo: 2.2, volume: 1 }, ...(C.buses || {}) };
  const log = (...a) => { if (dev) console.info("[sound]", ...a); };

  let ctx = null, master = null, enabled = false, wanted = true;
  const autoStart = C.startOn !== false;
  const buses = {};
  const buffers = new Map();          // url → AudioBuffer | null (missing) | Promise
  const sounds = (C.sounds || []).map((s, i) => ({
    id: s.id || `sound-${i}`, bus: "house", volume: 1, fade: 0.02, ...s,
    kind: s.on ? "cue" : s.loop ? "loop" : s.every ? "scattered" : "oneshot",
    node: null, gain: null, nextAt: 0, lastFired: -1e9,
  }));

  /* ---------- the toggle ---------- */
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "sound-toggle";
  btn.setAttribute("aria-pressed", "false");
  const label = () => { btn.textContent = enabled ? (C.labels?.on ?? "sound on") : (C.labels?.off ?? "sound off"); btn.setAttribute("aria-pressed", String(enabled)); };
  label();
  if (C.toggle !== false) document.body.appendChild(btn);   // SOUND.toggle: false = no on/off button
  btn.addEventListener("click", (e) => { e.stopPropagation(); wanted = !enabled; setEnabled(wanted); });
  // the first gesture anywhere turns sound on (unless it was switched off)
  const firstGesture = (e) => { if (e.target === btn || !autoStart) return; if (wanted && !enabled) setEnabled(true); };
  for (const ev of ["pointerdown", "keydown", "touchend"]) addEventListener(ev, firstGesture, { passive: true });

  /* ---------- audio graph ---------- */
  function impulse(seconds, decay = 2.5) {
    // a simple generated echo: decaying noise, a little different in each ear
    const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    for (const [name, b] of Object.entries(BUSES)) {
      // input → (cut) → dry + reverb send → bus volume → master
      const input = ctx.createGain(), cut = ctx.createGain(), dry = ctx.createGain(), send = ctx.createGain(), out = ctx.createGain();
      const verb = ctx.createConvolver();
      verb.buffer = impulse(b.echo ?? 3);
      dry.gain.value = 1 - (b.reverb ?? 0.4) * 0.5;
      send.gain.value = b.reverb ?? 0.4;
      out.gain.value = b.volume ?? 1;
      input.connect(cut); cut.connect(dry); cut.connect(send); send.connect(verb);
      dry.connect(out); verb.connect(out); out.connect(master);
      buses[name] = { input, cut, out, isCut: false };
    }
    for (const s of sounds) load(s.url);
  }
  function url(u) { return (C.folder || "") + u; }
  function load(u) {
    if (!u || buffers.has(u)) return buffers.get(u);
    const p = fetch(url(u))
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => { buffers.set(u, buf); return buf; })
      .catch(() => { console.info(`[sound] "${url(u)}" not found yet — skipped`); buffers.set(u, null); return null; });
    buffers.set(u, p);
    return p;
  }
  const ready = (u) => { const b = buffers.get(u); return b instanceof AudioBuffer ? b : null; };

  function setEnabled(on) {
    if (on && !ctx) build();
    enabled = on;
    label();
    if (!ctx) return;
    if (on && ctx.state === "suspended") ctx.resume();
    master.gain.setTargetAtTime(on ? C.volume : 0, ctx.currentTime, 0.4);
  }

  /* ---------- playing ---------- */
  function playOnce(s, gainMul = 1) {
    const buf = ready(s.url);
    if (!buf || !enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (s.rate) src.playbackRate.value = Array.isArray(s.rate) ? s.rate[0] + Math.random() * (s.rate[1] - s.rate[0]) : s.rate;
    const g = ctx.createGain();
    const vol = (Array.isArray(s.volume) ? s.volume[0] + Math.random() * (s.volume[1] - s.volume[0]) : s.volume) * gainMul;
    g.gain.value = vol;
    src.connect(g);
    let last = g;
    if (s.pan != null) { const p = ctx.createStereoPanner(); p.pan.value = s.pan === "random" ? Math.random() * 1.6 - 0.8 : s.pan; g.connect(p); last = p; }
    last.connect((buses[s.bus] || buses.house).input);
    src.start();
    log("play", s.id);
  }
  function startLoop(s) {
    const buf = ready(s.url);
    if (!buf || s.node) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g); g.connect((buses[s.bus] || buses.house).input);
    // start somewhere in the loop so stacked loops don't line up
    src.start(0, s.randomStart === false ? 0 : Math.random() * buf.duration);
    s.node = src; s.gain = g;
    log("loop start", s.id);
  }
  function stopLoop(s) {
    if (!s.node) return;
    try { s.node.stop(); } catch {}
    s.node.disconnect(); s.node = null; s.gain = null;
    log("loop stop", s.id);
  }

  // edge fade for loops: 0 outside the range, 1 inside, ramped over `fade`
  const rangeLevel = (p, [a, b], f) => Math.max(0, Math.min(1, f > 0 ? Math.min((p - a) / f + 1, (b - p) / f + 1) : (p >= a && p <= b ? 1 : 0)));
  const inRange = (p, r) => r && p >= r[0] && p <= r[1];

  let last = null, time = 0, cutState = null;
  /** ctx: { progress, libraryMode } */
  function update(dt, { progress, libraryMode }) {
    time += dt;
    const prev = last ?? progress;
    last = progress;
    if (!ctx || !enabled) return;

    // the cut into the library: the State House stops dead and only its echo
    // rings out; the library starts at once. Going back the other way, the
    // library stops dead (its echo rings out) and the State House fades back in.
    const cutAt = C.cut?.at;
    if (cutAt != null) {
      const inside = progress >= cutAt;
      const house = buses[C.cut.bus || "house"], lib = buses[C.cut.into || "library"];
      if (inside !== cutState) {
        const t0 = ctx.currentTime;
        const ramp = (b, to, secs) => {
          if (!b) return;
          b.cut.gain.cancelScheduledValues(t0);
          b.cut.gain.setValueAtTime(b.cut.gain.value, t0);
          b.cut.gain.linearRampToValueAtTime(to, t0 + Math.max(0.01, secs));
        };
        const first = cutState === null;
        ramp(house, inside ? 0 : 1, inside || first ? 0.015 : (C.cut.fadeBackIn ?? 2.5));
        ramp(lib, inside ? 1 : 0, 0.015);
        cutState = inside;
        log(inside ? "cut into the library" : "back into the State House");
      }
    }
    for (const s of sounds) {
      if (s.kind === "oneshot") {
        // passing the point (forward; or both ways with direction: "both")
        const fwd = prev < s.at && progress >= s.at;
        const back = prev > s.at && progress <= s.at;
        if ((fwd || (back && s.direction === "both")) && time - s.lastFired > (s.cooldown ?? 0.5)) { s.lastFired = time; playOnce(s); }
      } else if (s.kind === "scattered") {
        if (inRange(progress, s.range)) {
          if (time >= s.nextAt) {
            if (s.nextAt > 0) playOnce(s);
            const [lo, hi] = Array.isArray(s.every) ? s.every : [s.every, s.every];
            s.nextAt = time + lo + Math.random() * (hi - lo);
          }
        } else s.nextAt = 0;
      } else if (s.kind === "loop") {
        const level = rangeLevel(progress, s.range || [0, 1], s.fade);
        if (level > 0 && !s.node) startLoop(s);
        if (s.node) {
          s.gain.gain.setTargetAtTime(level * s.volume, ctx.currentTime, 0.15);
          if (level === 0 && !s.stopping) { s.stopping = setTimeout(() => { s.stopping = null; if (rangeLevel(last, s.range || [0, 1], s.fade) === 0) stopLoop(s); }, 1500); }
        }
      }
    }

    // cues from the library
    if (libraryMode !== update.lastMode) {
      cue(`library:${libraryMode}`);
      update.lastMode = libraryMode;
    }
  }

  // something happened (library:desk, book:open, book:close…): play its cues
  function cue(ev) {
    if (!ctx || !enabled) return;
    for (const s of sounds) if (s.kind === "cue" && [].concat(s.on).includes(ev)) playOnce(s);
  }

  return {
    update,
    cue,
    /** play a sound by id from anywhere (e.g. site.sound.play("pages")) */
    play(id) { const s = sounds.find((x) => x.id === id); if (s && ctx) playOnce(s); },
    get enabled() { return enabled; },
    setEnabled,
  };
}
