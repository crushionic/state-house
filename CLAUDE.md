# CLAUDE.md

Guidance for Claude when working in this repository.

## Project

A scroll-driven website. It walks the visitor through a Gaussian-splat capture of a state house, then into an interactive library. The site is static: plain HTML, CSS and ES modules, with no build step. GitHub Pages serves it from `main` at the custom domain in `CNAME` (`toholdforthalivelyexperimentofamostflourishingcivil.site`). Pushing to `main` deploys it within about a minute.

Rendering uses **three.js 0.180** and **Spark 2.4** (`@sparkjsdev/spark`), loaded through the import map in `index.html` from jsdelivr and sparkjs.dev.

## Owner's rules (do not break these)

- **No camera shots from Claude.** The owner directs every camera position, direction and speed in Blender and supplies them as `.glb` exports. Never invent shots, keyframes or camera paths. Placeholder viewpoints exist only so the placeholder library room is visible, and Blender exports replace them.
- **No original text.** All copy is lorem ipsum until the owner supplies it. The only exceptions are functional button labels (Enter, Return to library, Close) and the area names the owner gave (Desk, Bookshelves, Ceiling).
- **Basic placeholder visuals are fine** for clarity: simple geometry, canvas textures and SVG shapes.
- **The look is hazy and slightly glowing white**, not cyberpunk. The owner's original mockup had a cyberpunk "braindance" look; that is not wanted.
- The owner does not need Claude to create visual assets. Final models, splats and camera moves come from them.

## Experience flow

1. **Intro:** a text-only Enter button (no frame) on a glowing white screen (`#intro`).
2. **Opening:** scroll scrubs `assets/cameras/opening.glb` through the splat (`assets/splat.spz`). The path is: inside the doors, up the stairs, down a hallway with large paintings on both sides. Near the end it fades to glowing white, then into the library.
3. **Library home:** three clickable areas (desk, bookshelves, ceiling). The triggers are glowing dots with **no text labels** (the names are `aria-label`s only); visitors can also click the 3D objects. **Framing (owner's direction):** the upper back corner where the bookshelf wall meets the ceiling sits horizontally centred, 40% down the viewport. The placeholder home view does this with `frame: { point, y }` in `PLACEHOLDER_VIEWS`, solved from vertical FOV so it holds at any aspect. On narrow screens the desk trigger can fall off the right edge.
   - **Bookshelves:**
     - The book slides out spine first, comes to the viewer, opens, flips pages and stays open.
     - Clicking its left side unfolds a map.
     - Scrolling steps through the map (its highlighted info changes) while blurred text on the right page comes into focus area by area.
     - After the last step the book closes on its **back cover**.
     - Scrolling up reopens the book. A button to the right of the book returns to the library.
   - **Ceiling:** the camera shifts up.
     - Elements are matte (not glowing), with an outline glow at 50% opacity that eases to 100% on hover or keyboard focus.
     - Clicking one opens the enlarged view, then the element dissolves into a soft white void and can't be clicked again.
     - **Return to library** (top right) appears only after every element has been clicked and its detail closed.
     - Each element has an invisible disc hit area (so a ring's hole still counts) and an invisible, keyboard-focusable button over it.
   - **Desk:** the camera faces the desk. A distorted but not creepy figure talks through a branching dialog.
     - The figure's lines appear in a **speech bubble to the left of its head**, with a tail pointing at it.
     - The reply options are separate, sitting **on the desk below** (projected from the desk's front edge).
     - A return button appears top right after the dialog ends.
   - **Returning** goes to an "adjusted version" of the library home. The owner will describe it later. For now `Library.applyAdjustedHome()` only records visited areas (`body[data-visited]`, `body.library-returned`).

## File map

| Path | Role |
|---|---|
| `index.html` | Import map, canvas, intro, white-fade overlay, scroll spacer |
| `css/style.css` | All styles. Tokens on `:root`; `[hidden]` is forced to `display: none`. Body text uses `--body` = **Scotch Text Condensed** (`scotch-text-condensed`, Adobe Fonts kit `uuy6ocy`, linked in `index.html`) at 1em; dev aids stay in system sans |
| `js/config.js` | **The single place for tunables**: asset paths, Blender alignment, look, placeholder text, map steps, ceiling items, dialog tree |
| `js/main.js` | Renderer, SparkRenderer, flow (intro → opening → library), render loop, white-fade compositing. `?start=library` skips to the library |
| `js/look.js` | Post-processing: bloom + haze shader (soft edges, desaturation, lift to white, white edge glow, grain, fade-to-white). `?look` opens a tuning panel; `?nofx` disables post-processing |
| `js/camera-track.js` | Loads a Blender `.glb` camera animation; `apply(t, camera)` places the camera at t ∈ [0,1]. Optional `splat_anchor` Empty sets the splat transform |
| `js/scroll.js` | `ScrollDriver`: page scroll → smoothed 0–1 progress for the active scroll scene; locks scrolling otherwise |
| `js/ui.js` | DOM helper `el()`, placeholder notes, world→screen projection, `tween`, easing |
| `js/scenes/opening.js` | Splat + scroll-scrubbed camera + text cards + fade to white. Without a track: neutral auto-framed view with drag-to-orbit (no zoom, so the wheel still scrolls) |
| `js/scenes/library.js` | Placeholder room, area hotspots, raycast picking, camera moves between home and areas (Blender track forward/backward, or placeholder glide) |
| `js/scenes/book.js` | Placeholder book model and the full book sequence |
| `js/scenes/ceiling.js` | Ceiling elements and the detail modal |
| `js/scenes/desk.js` | Wobbling glow-shader figure and the dialog |
| `assets/cameras/README.md` | Owner-facing Blender export instructions and the expected file names |
| `assets/splat.spz` | Opening splat (state house facade), about 23.6 MB |
| `favicon.ico`, `assets/icons/` | Favicon (yellow anchor, supplied by the owner) in .ico, 32 px, 180 px (Apple touch) and 512 px |

## Camera tracks (Blender → site)

The expected files are listed in `ASSETS.cameras` in `config.js`. Any missing file falls back to a placeholder and adds an entry to the on-screen "Placeholders" list.

| File | How it plays |
|---|---|
| `opening.glb` | Scrubbed by scroll: the whole timeline is spread across `OPENING.scrollScreens` |
| `library.glb` | First frame is the home view |
| `library-to-bookshelf.glb`, `library-to-ceiling.glb`, `library-to-desk.glb` | Played forward in real time going in, backward coming out. The first frame should match the home view |

How tracks are read and aligned:

- **Sampling:** `CameraTrack` sets each action's `time` with the actions paused and `LoopOnce`, then calls `mixer.update(0)`. This scrubs reliably in both directions; don't switch to `mixer.setTime`. The FOV is the glTF camera's static `yfov`; animated focal length isn't read.
- **Alignment:** if the export contains an Empty named `splat_anchor` with the splat parented to it, the splat gets `anchor.matrixWorld × importCorrection`. `BLENDER.importCorrection` defaults to `[-90, 0, 0]`, the Blender Z-up → glTF Y-up conversion assuming the importer stores raw file axes. It is **unverified**: calibrate it with the owner's first real export. Without an anchor, the splat uses `OPENING.splatRotation` (`[180, 0, 0]`, which makes the y-down capture upright).

## Book sequence details (`book.js`)

- **Geometry (book-local, spine on the y axis at x = 0):**
  - Each half is a box `W × H × T` (0.17 × 0.24 × 0.018) on its own pivot. The inside page faces +z (toward the camera); the outside cover is the −z face.
  - **Closed, front cover showing:** `left = π`. **Open:** `left = 0, right = 0`. **Closed on back cover:** `right = −π`.
- **Moving parts:**
  - Flipping pages are pivots rotated from 0 to a `rest` angle just short of −π.
  - The map foldout is hinged at the left page's outer edge, as a child of the left pivot. `map = π` is folded; `0` is unfolded to the left.
- **Centering:** `shift` slides everything in x to keep the spread centered: `W/2` when the map is open, `W/2` again when closed on the back cover, 0 on the shelf.
- **Return to shelf:** the closed book rotates rigidly (`left` 0→π together with `right` −π→0, and pages −π→0), then slides back in.
- **Scroll mapping:**
  - The reading phase is `[0, readEnd]`, with steps = `BOOK.steps`. The closing phase is `[readEnd, 1]`.
  - Every visual is a pure function of scroll progress, which is why reverse scrolling reopens the book.
- **Text:** the right-page text is a DOM overlay (`.book-text`) positioned over the projected page rect. Blur and focus are set per paragraph. The right block's inside face is plain paper on purpose, so no fake lines show under the text.

## Placeholder library room (`library.js`)

- **Scale and layout:** meters. Room x ∈ [−4, 4], z ∈ [−5, 3], height 4.2. Shelves on the left wall; the book slot is on the middle shelf at z = −1.5. Desk at (1.2, 0.76, −2.6), with the figure behind it. Four ceiling elements at y ≈ 4.15.
- **Placeholder views:** `PLACEHOLDER_VIEWS` holds the home, bookshelf, ceiling and desk views. They exist only for the placeholder room.

## Assets and hosting constraints

- **File size:** GitHub rejects files over 100 MB and warns over 50 MB. **GitHub Pages does not serve Git LFS files.** Large splats need compression (SPZ or SOG; SOG via `npx @playcanvas/splat-transform`) or outside hosting such as Cloudflare R2 with a CORS rule.
- **Current splat:** `splat.spz` is **SPZ version 4** (ZSTD streams, 32-byte `NGSP` header), with 1,854,501 splats and SH degree 3. Its SH is almost all zero, so view-dependent color is negligible.
  - Raw coordinates are y-down. The dense core spans roughly x −0.45…1.35, height about 0.33, depth −0.4…0.25.
  - The facade faces +x in raw space. A long path runs along x toward it.
- **Other PLYs:** the owner also uploaded `scene.ply` and `splat.ply` (an interior room with a palm tree and paintings, z-up; `scene.ply` is a softened copy). They are not in the repo. It's unconfirmed whether that room is meant to be the library; ask before using it.
- **Owner's mockup:** a viewer plus `soften_splat.py`, which bakes haze into PLYs. Its default haze color is warm; for this look use `--haze-color 0.97 0.96 0.95`.

## Gotchas learned so far

- An element with a CSS `display` rule ignores the `hidden` attribute. The global `[hidden] { display: none !important; }` fixes this; keep it.
- Call `camera.updateMatrixWorld()` before projecting to the screen (`toScreen` does). Otherwise overlays lag or land in the wrong place.
- `SplatMesh` has no `forEachSplat`; use `splat.splats ?? splat.packedSplats`.
- `Object3D.lookAt` points +z at the target, while cameras look down −z. The placeholder glide rotates the temp object by π to compensate.
- `SparkRenderer.preBlurAmount` is driven by `LOOK.splatSoftness`.
- Spark renders correctly through `EffectComposer` (verified live).
- In Node tests, call `scene.updateMatrixWorld(true)` before raycasting; matrices only update on render in the browser.
- When browser-testing after a deploy, refresh cached modules with `fetch(path, {cache: 'reload'})` before reloading, or you'll test the old code.
- The 404s in the browser console come from `HEAD` checks for camera files that don't exist yet. They are expected.

## Working in this environment

- **Package registries:** npm and pip registries are unreachable from the cloud workspace; GitHub is reachable. For local testing, clone three.js r180 sparsely and symlink it into a `node_modules`.
- **Node test harness:** scene logic was tested in Node with a minimal DOM stub (fake canvas context, instant tweens) and a synthetic glTF camera animation. These tests lived in the scratchpad, not the repo. The checks covered:
  - shelf placement
  - the open, back-cover and map poses
  - the spread fitting on screen
  - map step and paragraph focus following scroll
  - reverse reopening
  - return to shelf
  - all four ceiling elements being on screen
  - the desk dialog completing
- **Browser testing:** use the built-in browser pane on the owner's computer against the live site, after the Pages deploy finishes. Poll `/css/style.css` or `/index.html` with `cache: 'no-store'` until the change appears. `?start=library` speeds up library testing.
- **Commits:** end each message with the Co-Authored-By and Claude-Session lines required by the session.

## Open items

- Blender camera exports (five files), plus the one-time `importCorrection` calibration.
- Library model (`ASSETS.libraryModel`; possibly a splat), book model, figure model.
- Real text for the opening cards, map captions, right-page text, ceiling items and dialog.
- The spec for the adjusted library home after returning from an area.
- Optional: animated focal length from Blender, which needs `KHR_animation_pointer` support.
