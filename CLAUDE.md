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

1. **Intro:** a text-only Enter button (no frame) on a glowing white screen (`#intro`). **No loading text.** Clicking Enter fades the word away; the screen stays white until the splat has loaded, then fades into the scene.
2. **Opening:** scroll scrubs `assets/cameras/opening.glb` through the splat (`assets/splat.spz`). The path is: inside the doors, up the stairs, down a hallway with large paintings on both sides. Near the end it fades to glowing white, then into the library. **No text in the opening** (owner's request): `OPENING.text` is empty; the card mechanism remains for later.
3. **Library home:** three clickable areas (desk, bookshelves, ceiling). The triggers are glowing dots with **no text labels** (the names are `aria-label`s only), each placed at the **centre of its area's on-screen extent**: `Library.areaCenter()` projects the area's bounding box, clips it to the viewport and takes the middle. Visitors can also click the 3D objects. **Framing (owner's direction):** the upper back corner where the bookshelf wall meets the ceiling sits horizontally centred, 40% down the viewport. The placeholder home view does this with `frame: { point, y }` in `PLACEHOLDER_VIEWS`, solved from vertical FOV so it holds at any aspect. On narrow screens the desk trigger can fall off the right edge.
   - **Bookshelves:**
     - The book slides out spine first, comes to the viewer, opens, flips pages and stays open.
     - Clicking its left side unfolds a map.
     - Scrolling steps through the map (its highlighted info changes) while blurred text on the right page comes into focus area by area.
     - After the last step the book closes on its **back cover**.
     - Scrolling up reopens the book. A button to the right of the book returns to the library.
   - **Ceiling:** the camera shifts up.
     - Elements are matte (not glowing), with an outline glow at 50% opacity that eases to 100% on hover or keyboard focus.
     - Clicking one **zooms the camera in** so the element sits centred on screen (looking straight up, keeping the ceiling view's sense of up; it fills `ZOOM_FILL` = 36% of the screen height). Its information appears in a bubble **underneath**, with a × exit button (Escape also works). This is an owner-directed move, computed from the element, not a Claude-invented shot.
     - Closing zooms back out to the ceiling view; the element's outline glow fades away; it stays visible but can't be clicked again. (No white void, no popup: the owner removed both.)
     - **Return to library** appears in the **centre of the screen** only after every element has been seen and the camera is back at the ceiling view.
     - Each element has an invisible disc hit area (so a ring's hole still counts) and an invisible, keyboard-focusable button over it.
   - **Desk:** the camera faces the desk. A distorted but not creepy figure talks through a branching dialog.
     - The figure's lines appear in a **speech bubble to the left of its head**, with a tail pointing at it. **The line changes with each reply** (each dialog node has its own lorem passage in `DIALOG`).
     - The reply options are separate, **centred under the bubble horizontally** and at the height of the desk's front edge.
     - When the dialog ends, **Return to library takes the replies' place** (no Close button, no corner button).
   - **Adjusted menus (owner's direction).** Returning to the library shows a view that depends on which areas have been visited (`Library.visitedKey()`, e.g. `"bookshelf+desk"`). Rules from the owner:
     - **Never show the open fourth wall** (the side behind the viewer at the start, z = 3; the placeholder room has no wall there).
     - **Zoom in** so the remaining areas fill the screen instead of unused walls.
     - **After one area**, the two remaining areas fill the frame and the visited one is a ~10% sliver:
       - after the bookshelves → shelves as a left sliver (solved live onto the 10% line)
       - after the ceiling → ceiling as a top sliver (solved live)
       - after the desk → shifted left to the shelves and ceiling, with the desk's near end at the lower right. This is a fixed view: with the long desk, an exact right-edge line would expose the open front wall.
     - **After two areas**, the last area dominates and both visited areas stay visible as small clickable patches:
       - **Desk last:** faces the desk.
       - **Ceiling last:** from near the floor, looking up, for a direct view of the ceiling.
       - **Bookshelves last:** the whole shelf side plus the desk's near end.
     - **Mechanics:**
       - Views with `slivers` use `Library.resolveView()` to solve yaw/pitch live (Newton's method on projected area extents, counting only the on-screen part).
       - Views marked `keepWidth` keep their 4:3 width on portrait screens.
     - **How the poses were chosen:** by optimising true on-screen coverage (ray-cast grid, with "void" = the open side) at 16:9, 4:3 and 21:9, then checked at 9:16. No view shows the open side at any of those shapes.
       - **Known gap:** on tall phone screens the desk-last view can't keep the bookshelf patch while facing the desk.
       - **"90%" is approximate:** in this sparse placeholder room, plain wall still takes a share. The real library and Blender stills (`ASSETS.cameras.libraryAfter`, `assets/cameras/library-after-<areas>.glb`) define the true framing.
     - **Placeholder room changes made for these views:** the desk runs from the right wall to just short of the bookshelves (x −2.75…3.97, like the real one). The ceiling area is the whole ceiling.
     - Every area stays clickable through its patch; revisiting an area doesn't change the visited state.
     - Area-to-area Blender moves start from the first library view, so the adjusted views are linked to them with a short glide.
     - Testing aid: `?start=library&visited=bookshelf,ceiling` opens straight into an adjusted view.
   - **Ending.** Returning from the **last** unvisited area plays `js/ending.js`:
     1. Fade to white (1.5 s), hold **1.25 s**.
     2. The white **flows like liquid into the words "What are we forgetting?"** on black. This is a metaball field: about 1,200 soft blobs start packed edge to edge, flow (edges first) to points sampled inside the text's letter shapes and shrink. Each frame the summed field is thresholded on a ~420 px wide canvas, scaled up with a glow.
     3. The crisp Scotch Text Condensed text cross-fades in.
     4. A **"Back to beginning"** text button fades in at the bottom centre and reloads the site from the start (URL options dropped).

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
| `js/ending.js` | The ending: white → 1.25 s hold → liquid metaball morph into the question → crisp text → Back to beginning |
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

- **Scale and layout:** meters. Room x ∈ [−4, 4], z ∈ [−5, 3], height 4.2, with no wall at z = 3 (the open side, never shown). Shelves on the left wall; the book slot is on the middle shelf at z = −1.5. A long desk along z = −2.6 from x −2.75 to 3.97 (top at y 0.76), with the figure behind it at x 1.2. The ceiling area is the whole ceiling, with four elements at y ≈ 4.15.
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
- Blender stills for the six adjusted library views (optional; placeholders work without them).
- Optional: animated focal length from Blender, which needs `KHR_animation_pointer` support.
