# To hold forth a lively experiment: scroll-driven splat site

A scroll-driven memory walk through the Rhode Island State House. Scrolling moves the camera along a path set with coordinates, forward or back, so the visitor can scrub through it freely. The image is sharp near the cursor and soft away from it. Wherever the cursor passes, colour floods in and then slowly fades back to a muted rest. Thoughts surface in the gaps of the scan, and an ambient soundscape echoes and stacks until the library. All text is set in HAL Timezone Mono (`fonts/`).

No build step. Upload the folder to any static host (GitHub Pages works).

## The sequence

"Progress" runs from 0 (the start) to 1 (the end). The ● marks the "smooth" keyframes, where the camera eases a little.

| Progress | What happens | Stop |
| --- | --- | --- |
| 0 – 0.08 | Black void. The title card floats in it. The camera dives through its punched hole, and everything washes to glowing white. | |
| 0.088 | Hard cut under the white to the State House steps | |
| 0.128 | The white clears. You stand on the steps. | ● |
| 0.128 – 0.22 | Climb the steps to the hole where the door should be | ● |
| 0.244 – 0.272 | Through the hole, then a glance right at the security area | ● |
| 0.30 | Face the metal detector | ● |
| 0.30 – 0.408 | Through the detector, up the steps into the rotunda | ● |
| 0.48 | Look up at the dome (held at least 2.5 s) | ● |
| 0.544 | Turn left toward the stairs | ● |
| 0.544 – 0.832 | Up the stairs, down the portrait hallway and into the white light at its end | |
| 0.84 | Hard cut out of the white straight into the State Library entrance. The State House sound cuts dead and echoes out. | |
| 0.84 | Everything holds still for 3 seconds (`SCROLL.freeze`), as if a new page had opened. | |
| 0.84 – 0.93 | Walking in. The ceiling, desk and book are solid, as scanned. | |
| 0.93 | Glance up at the ceiling | ● |
| 1.0 | Settle with the desk, the book and the ceiling in view. They fall apart into swirls of white and gold light. **The interactive part begins.** | ● end |

## The library (the interactive ending)

When the camera settles on the last keyframe, the State Library comes alive. Everything is set in `LIBRARY` in `config.js`, and the code is in `js/library.js`.

**The three choices.** The ceiling, the State Librarian's desk and the open book. Each can be chosen **once**.

- Untouched, each one **swirls as a cloud of white and gold light**: its splats circle and wander, puff up into round soft blobs and shimmer between warm white and gold. Walking in they're solid, as scanned; they fall apart into the swirl as you arrive at the hub (over `LIBRARY.dissolve` seconds), and become solid again if you scroll back out. The look is set in `LIBRARY.swirl` (the two colours, how much they take over, how far the splats move, how much they swell, brightness, speed, and `maxBlob`, the largest a blob gets). Long thin splats (the ceiling has many) are rounded off as they turn to cloud and the longest fade out, so they don't streak. How far each one moves is also scaled by its `drift`.
- **Hovering** one at the hub materialises it and adds a warm lift (no names or labels: it just answers to the cursor). Move away before clicking and it swirls apart again.
- **After its interaction** it is fully solid for good.
- The view **pans further with the cursor** here (`LIBRARY.parallax`), so you can look toward each thing.
- **Scrolling back** leaves the library at any time, even mid-conversation, zoomed into a ceiling detail or with the book card open. Whatever is open closes, and the camera glides from wherever it is back onto the path. Anything you finished stays finished. Scroll forward to the end again and you're back at the hub.

**The ceiling.** The camera looks up at the whole ceiling, framed like your reference image. Four details glow in outline: the oak leaves, the skylight glass, the W.C. printer's mark (top-left, at x 0.52, z 1.0) and a run of light bulbs along the cornice. Hovering one brightens it. Clicking zooms into it and shows its card, a picture from `images/ceiling/` (`card` on each detail), with the **Return to ceiling** button picture below it (`LIBRARY.ceiling.returnButton`), which returns to the overview. Visited outlines dim. After the fourth, the camera goes straight back to the desk, book and ceiling view.

**The outlines** are drawn crisp on top of the finished picture (not blurred or graded): a bright core line inside two soft halos, pulsing, flaring on hover. Their look is `LIBRARY.ceiling.outline` (colour, core and halo widths, halo strength, resting brightness, pulse, hover flare, visited brightness).

**Placing the outlines: the outline editor.** Open the site with `?dev`, run `site.jumpTo(1)` in the console, click the ceiling, then press **O**. Pick the detail and the shape, and click on the scan:

- **rect:** click two opposite corners.
- **circle:** click the centre, then a point on its edge.
- **circles** (the bulbs): click each centre; shift-click a point on an edge to set the size.
- **lies:** "flat on the ceiling" for shapes on the ceiling, "upright on a wall" for ones on a wall (like the bulbs).

The outline moves as you click, and the finished `shape: …` line is shown and copied. Paste it over that detail's `shape` in `config.js`. **start over** clears your clicks; **O** closes the editor. Clicks only count splats near the detail's current surface (so faint strays past the skylight glass are ignored); if you're placing something far from where it is now, place it roughly once, paste, reload, then place it precisely.

**The desk.** The State Librarian (`splats/library/placedkarits.spz`) gathers out of light behind the desk, glowing soft white; once she's there the light settles (`talkGlow`, `talkBrightness`, `talkSoften` in `LIBRARY.desk.librarian`) so her own detail shows while you talk. A conversation opens: a speaker name, a line that types itself out (click it to skip), and numbered choices (keys 1–9 work too). The dialogue is a small tree in `LIBRARY.desk.nodes`: each node has `text` and `choices`, and each choice has `text` and `next` (the id of another node, or `"end"`). At the end she fades and the camera returns.

**The book.** Clicking the book pans the camera to the library's own book, on its slanted stand, and you read it right there: the camera path, the page images (the maps on the left, the texts on the right, changing together as you scroll) and the light and grain on the paper all come from `js/config-book.js`, laid onto the library's book, in the library's own light and grade (`js/bookscene.js`). You leave it, back to the room, by:

- scrolling on to the end of the book,
- scrolling back past its beginning, or
- the **close the book** button (top right).

Reading past the middle (`LIBRARY.book.readAfter`) counts the book as done.

How it lines up: `config-book.js` describes the book in its own space (centred, flat, 0.5 across), made from the close-up scan `book.spz`. `LIBRARY.book.placement` (position, rotation, scale) is where that space sits on the library's book; it was found by matching the two scans' points (they agree to within about half a millimetre at the library's scale). `book.html` still uses the close-up scan, and it's still where you edit the book's camera path and page images (`book.html?dev`); the library's book follows.

**After all three.** Once all three are done and you're back in the room, after a moment (`LIBRARY.complete.after`, 4 s, or straight away if you scroll on) everything fades into a black void and "What more waits to be seen?" fades in. `buttonAfter` (5 s) later a **return to start** button appears. Clicking it rewinds the whole journey, camera and sound and all, back to the catalog card over `rewind` seconds (24), and resets the library so it can be explored again.

**Editing.**

- Every camera position is a `view: { pos, look, fov }`.
- Each detail's outline is a `shape`: a `rect`, `circle` or row of `circles`, either flat on the ceiling (`plane: "y"`) or on a wall (`plane: "x"`).
- What the cursor can point at is set by each object's `box`.
- All text is lorem ipsum placeholder until the copy is written.
- To test the library quickly, open `?dev`, then run `site.jumpTo(1)` in the browser console.

**The library scan.** `libraryinterior.spz` is split by `tools/split-splat.mjs` with `tools/zones-library.json` into `book`, `desk`, `ceiling` and `rest`, so only the three interactive parts carry the swirl:

```
node tools/split-splat.mjs libraryinterior.spz tools/zones-library.json splats/library --min-alpha 0.02 --max-sh 1
```

Library coordinates use the same 180° turn as the State House. The floor is at about −1.88, eye height about −1.55, and the skylight about +0.15. The entrance is on the +x wall and the windows are on the −x wall.

## How scrolling works

The page never really scrolls. `js/scroll.js` reads the mouse wheel, trackpad, finger drags and the arrow, Page Up/Down and Space keys.

- **Both ways.** Scrolling down moves forward, scrolling up scrubs back, anywhere in the journey, including out of the library. (`backwards: false` makes it forward-only again.)
- **Responsive.** The camera follows your scrolling closely. It starts moving the moment you scroll and stops as soon as you stop. A very short catch-up (`response`) smooths out the steps of a mouse wheel and nothing more.
- **No runaway flicks.** A single big flick moves you at most `maxLead` screens.
- **One freeze.** `freeze: { at: 0.84, seconds: 1 }`: right after the cut into the library everything holds still for a second, as if a new page had opened. A flick stops exactly there, and scrolling during the freeze is ignored. It's the only place the scroll isn't responsive. `backwards: true` also freezes there when scrolling back out.
- **Gentle keyframes.** At "smooth" keyframes the camera eases a little (`easing`), so turns and glances don't snap, but it never stops dead while you're scrolling.
- **No pauses** by default. `pauseAtStops: true` brings back pauses on stop keyframes.
- **Loading.** The visitor can't move into a stretch whose splats haven't arrived yet. A quiet "recalling…" shows until they do. The whole State House has to arrive before you can leave the card (see Performance).

You can tune all of this in `SCROLL` in `config.js`:

| Setting | What it does |
| --- | --- |
| `length` | The length of the whole journey. Bigger means more scrolling per scene. |
| `response` | How tightly the camera follows the scroll. 14 is snappy, 20+ is almost 1:1, 5 is floaty. |
| `easing` | How much the camera slows into smooth keyframes. 0 = constant speed, 1 = slows fully to rest on each. |
| `maxLead` | The furthest one flick can carry you, in screens. |
| `maxSpeed` | Safety cap on camera speed, in screens per second. |
| `wheelSpeed` / `touchSpeed` | Multipliers for wheel/trackpad and finger drags. |
| `backwards` | Scrolling up scrubs back (on by default). |
| `hintAfter`, `startHint` | When the hint returns; whether it shows at the very start. |
| `freeze` | `{ at, seconds, backwards }`: the one hold, at the cut into the library. |
| `pauseAtStops`, `hold` | Optional pauses on stop keyframes (off by default). |

## Files

| File | What it is | Edit it? |
| --- | --- | --- |
| `js/config.js` | **All the numbers** for the State House walk and the library: splats, camera keyframes, scroll feel, look, focus, rendering, LIBRARY, THOUGHTS, SOUND, NEXT | Yes |
| `js/library.js` | The library's interactive ending (choices, ceiling details, conversation, book placeholder) | Rarely |
| `js/config-book.js` | The book page's numbers. Anything it doesn't set comes from `config.js`. | Yes |
| `index.html` | The State House page. Text goes here later. | Later |
| `book.html` | The book page. Same engine, picks `js/config-book.js`. | Later |
| `css/style.css` | Styling | When styling |
| `js/main.js` | Wires everything together: loading, frame loop, adaptive resolution | Rarely |
| `js/scroll.js` | Scroll input, both ways | Rarely |
| `js/thoughts.js` | The floating thoughts, as 3D sheets of text | Rarely |
| `js/bookscene.js` | The book, opened from the library (uses `js/config-book.js`) | Rarely |
| `js/sound.js` | The ambient soundscape | Rarely |
| `js/props.js` | The title card, the stand-in catalog card and the images laid onto the book's pages | Rarely |
| `js/path.js` | Camera path math | No |
| `js/look.js` | The memory shader: bloom, cursor-focus blur, colour trail (with the splat depth picture), grade, vignette, grain, wash | Rarely |
| `js/story.js` | Text fading, hotspots, note card (all unused for now) | No |
| `js/dev.js` | Authoring tools and the keyframe editor, loaded only with `?dev` | No |
| `tools/split-splat.mjs` | Cuts a big .spz into lighter zone files | When the scan changes |
| `tools/zones.json` | The zone boxes used by that tool | When the scan changes |
| `tools/page-surface.mjs` | Measures the book's paper into `book-surface.json` | When the book scan changes |
| `tools/page-effects.mjs` | Makes the scan's light and grain maps for the page images (`images/book-light.png`, `book-grain.png`) | When the book scan changes |
| `splats/zones/` | The five State House zone files | |
| `splats/book.spz` | The open book (SPZ v4, 200k splats, 4.8 MB) | |
| `splats/book-surface.json` | Height map of the book's paper, so page images lie on it | Remake with `tools/page-surface.mjs` |
| `images/book-left.png` | The map on the book's left page | |
| `images/title-card.png` | The title card at the opening | |
| `fonts/` | HAL Timezone Mono (used for all text), plus Regular and Italic | |
| `audio/` | The sound files listed in `SOUND` | Add files here |

## Run it locally

```
cd this-folder
python -m http.server 8000
```

Open `http://localhost:8000/` (the State House) or `http://localhost:8000/book.html` (the book). Opening the files by double-clicking will not work.

## Performance: zones, level of detail, adaptive resolution

The original `statehousepart1.spz` holds 3.9M splats in 58 MB, and drawing all of them on every frame is what made it lag. The site now uses three things together:

1. **Zones.** The scan is cut into five files: `exterior`, `high` (everything above head height, including the dome), `lobby`, `rotunda` and `hall`. Each is drawn only during its `show` range in `SPLATS`, so splats behind you aren't sorted or drawn. **All five load during the card intro** and appear together under the white flash, and while the card is up each one that has arrived is quietly prepared at zero opacity (`RENDER.warmUntil`), so its level of detail is built before it's seen. That way nothing renders in as you walk through the door. The catch: a visitor on a slow connection waits on the card (with "recalling…") until the whole building (about 37 MB) has arrived. The library loads while they walk through the building.
2. **Lighter data.** While splitting, splats under 2% opacity (37% of the file, practically invisible in the haze) were dropped, and the view-dependent colour was trimmed from level 3 to level 1. That leaves 2.5M splats in 36 MB in total.
3. **Level of detail and adaptive resolution.** `RENDER.lod` makes Spark merge distant and off-centre splats, so at most about 1.25M are drawn at once (`lodScale` 0.5 of Spark's desktop budget). Right after a zone loads it starts coarse and sharpens within a second or two, which is why the zones are warmed up on the card. `RENDER.targetFps` lowers the internal resolution when the frame rate stays low, down to `minPixelRatio`, and raises it again when there's headroom. Changes are rare and made in one step, because each change causes a one-frame hitch. The look is soft anyway, so the lower resolution is hard to see.

If it still struggles, lower `RENDER.lodScale` (try 0.3) or `RENDER.maxPixelRatio` (try 1).

### Re-splitting a new or changed scan

You need Node 22.15 or newer and nothing else:

```
node tools/split-splat.mjs path/to/statehousepart1.spz tools/zones.json splats/zones --min-alpha 0.02 --max-sh 1
```

- `--min-alpha`: drop splats fainter than this. Higher means smaller and lighter files, but a thinner haze.
- `--max-sh`: view-dependent colour level, 0 to 3. 0 is smallest.
- `zones.json`: boxes in the site's world coordinates. The first box that matches a splat gets it, and the last zone takes everything left over. If you change the zones, update the `SPLATS` entries and their `show` ranges in `config.js` to match.

The original `statehousepart1.spz` is no longer loaded by the site. Keep it as your master copy.

## Spark version

The site loads Spark 2.4.0, which reads every SPZ version, including v4 originals like `statehousepart1.spz`. The zone files are SPZ v3.

## Coordinates

The State House splat is rotated `[180, 0, 0]` so that up is up. In the site's world:

- **+y is up.** The camera sits about 0.1 above the floor. Floors: outside steps from −0.22 (bottom) to 0.15 (door), lobby 0.18, rotunda 0.45, portrait hallway 0.60.
- **−x is into the building.** The steps run from x ≈ 3 down to the door at x ≈ 1. The lobby is x 0.9 to 0, and the rotunda is centred at x −0.95, z 0.52.
- **+z is to your left** as you walk in. The security area is to the right (−z). The stairs to the portrait hallway and the hallway itself run along +z, from z 0.7 to the doorway at the end, about z 3.0.

The whole building is only about 4 units across, so small numbers matter: 0.05 is roughly a step.

## Editing the camera path

Each keyframe in `CAMERA_PATH`:

```js
{ at: 0.34, pos: [0.64, 0.28, 0.42], look: [0.2, 0.25, -0.2], fov: 58, hold: 1, grade: { wash: 0.2 } },
```

- `at`: progress, 0 to 1.
- `pos` / `look`: where the camera is and what it looks at.
- `fov` (optional, stays in effect until changed): field of view.
- `ease` (optional): `"smooth"` (the default) settles on this keyframe and is a stop. `"linear"` keeps walking through it: the camera passes through its position as part of one smooth move between stops (so it reaches it at roughly, not exactly, its `at`).
- `stop` / `hold` (optional): turn a stop off, or make the camera rest on it longer.
- `cut: true` (optional): jump to this keyframe instead of travelling. Hide the jump under `wash: 1`.
- `grade` (optional, stays in effect until changed): changes to the look, such as `wash` (fade to white), `bloom`, `saturation` or `saturationRest`.

### Dev mode

Open `http://localhost:8000/?dev` or `http://localhost:8000/book.html?dev`. In dev mode the wheel scrubs freely in both directions, with no stops, so you can author. Use `?dev&locks` to keep the visitor rules on while testing. The panel's title says which config file you're editing.

| Key | Does |
| --- | --- |
| **F** | Free camera on or off. Drag to look, **W A S D** to move, **Q / E** to go down and up, **Shift** for faster, **Alt** for slower. The speed suits the scene (slower on the book). |
| **L** | Draws the camera path (orange), keyframes (red dots, the selected one white) and where the camera looks (blue) |
| **[ / ]** | Jumps to and selects the previous or next keyframe |
| **U** | Sets the selected keyframe from the camera (position, look, fov) |
| **I** | Inserts a new keyframe at the current progress, from the camera. Between two keyframes it's `linear` (flows through); change it in the list. |
| **Delete** | Deletes the selected keyframe |
| **Z** | Undoes the last keyframe edit |
| **C** | Copies the whole `CAMERA_PATH`, ready to paste over the one in the config file |
| **K** | Copies one keyframe line for the current view at the current progress |
| **P** | Copies a point just in front of the camera |
| **G** | Look, focus and colour-trail sliders. **Look → selected key** stores the sliders you've moved as a `grade` on the selected keyframe. |
| **N** | Goes on to the next page (only where the config has `NEXT`) |
| **H** | Hides the panel |

#### Editing keyframes live

The **Keyframes** list in the panel shows every keyframe with its `at`, whether it's a stop, and any `hold`, `fov` or `grade`. The one you're sitting on is shown in blue.

1. Click a keyframe in the list (or press **[ / ]**). The camera jumps there.
2. Press **F** and fly to a better view.
3. Press **U**. The path updates straight away. Press **F** again and scrub to see the move.
4. Change `at`, `fov`, `ease` (smooth = stop, linear = flow through) or `hold` in the fields under the list.
5. When you're happy, press **C** and paste over the `CAMERA_PATH` in the config file (`config.js` or `config-book.js`).

Edits don't change the config file until you paste. They are kept as a draft in your browser, so a reload doesn't lose them: the panel offers **Load draft** next time. **Revert to file** goes back to what the file says. The copied path has plain numbers, so named constants like `LOBBY` or `RIGHT` are replaced by their values.

In the browser console, `site.jumpTo(0.6)` jumps anywhere, and `site.pixelRatio` shows the current adaptive resolution.

## The look

`LOOK` holds your settings from the earlier project.

- **Blur follows the cursor** like a spotlight. It's sharp where you look and softens up to `soft` away from it, with the size set in `FOCUS`.
- **Colour is a trail.** The image rests at a muted `saturationRest`. Wherever the cursor passes, colour floods up to the full `saturation`, then fades back, like colouring a memory in. Tune it in `TRAIL`: `radius`, `softness`, `colorIn`, `linger` and `fadeAfter`. On touch screens, colour is painted where the finger touches. In `?dev`, press **G** for live sliders.
- **The colour lives in the world.** As the cursor moves, soft dabs of colour are left at the 3D spots under it. Each dab has its own timer: it colours in, lingers `linger` seconds, then fades over `fadeAfter`, on screen or off. So colour stays on the wall you touched as the camera walks and turns, and it's still there if you scroll ahead and come back (for as long as it would have lasted anyway). To find those spots, the splats are also drawn small into a depth picture (how far away each spot is). Where there are no splats it falls back to `TRAIL.depth`. `TRAIL.depthEvery` sets how often that picture is redrawn (2 = every other frame). Up to 512 dabs exist at once; the oldest go first.
- **The brush only paints while the cursor moves** (and `TRAIL.paintAfterStop` seconds after). So if the cursor sits still in the middle of the screen while the camera turns from the dome to the hallway, it doesn't sweep colour across everything passing under it.

`wash` fades the frame to `washColor`, the glowing white used for the light transition and the ending.

`CAMERA.parallax` and `CAMERA.parallaxY` set how far the view turns toward the cursor during the walk, sideways and up/down.

## The book page (book.html)

`book.html` runs the same engine as `index.html` (scroll feel, memory look, cursor focus, colour trail, `?dev`) with its own settings in `js/config-book.js`. Each page picks its config with a `<meta name="site-config">` tag in its `<head>`.

**Getting there.** The book is opened from the library's book, inside the State House page (see "The library"). `book.html` still works on its own, and it's the place to edit the book: its camera path, page images and timings (`book.html?dev`). Both use `js/config-book.js`, so whatever you change there is what the library's book shows. The book's path uses `PATH.settle` (the camera comes fully to rest on smooth keyframes) and `SCROLL.easing: 1`, as it was made.

**Placement.** The scan was taken with the book lying on a desk at an angle. In `SPLATS` it is turned (`rotation [-103.74, 1.78, 29.14]`) and moved (`position [0.0641, -0.1778, 0.0736]`) so the open book sits square at the origin:

- **+y is up.** The pages are at y ≈ 0 (the gutter dips to about -0.04).
- **−x is the left page, +x the right page**, each about 0.25 wide.
- **−z is the top edge** of the pages and **+z the bottom edge** (about −0.16 to +0.16). The reader stands on the +z side.

The whole book is about 0.5 across, so 0.01 is a small nudge.

**The sequence** (14 screens of scrolling):

| Progress | What happens | Stop |
| --- | --- | --- |
| 0 – 0.09 | Out of the white, the open book from a step back | ● |
| 0.09 – 0.26 | A slow half-circle in to where a reader would stand | ● |
| 0.36 | The left page (where the map will unfold), held 1.5 s | ● |
| 0.47 | Across the gutter to the top of the right page | ● |
| 0.57 | The middle of the right page | ● |
| 0.67 | The bottom of the right page | ● |
| 0.67 – 1.0 | Lift away over the book to a top-down view, softly washed | ● end |

**Images on the pages.** `PAGES` in `config-book.js` lays PNGs onto the pages, as if the book were printed with them. Each is a thin sheet that follows the curve of the scanned paper (down into the spine) and covers it, with a soft edge and a light shadow toward the spine. The left page shows the map (`images/book-left.png`).

- The printable paper on each page is about 0.20 wide × 0.32 tall, so **2:3** (2000 × 3000 px) fits a page exactly. The strip outside it on the left is the side of the page stack, not paper.
- **It follows the paper exactly.** `splats/book-surface.json` is a height map of the scanned paper, measured from the splat. Each sheet is draped over it, so it curls down into the spine like the scan, and stays on the paper wherever you move it in `?dev`. Where the scan is thin, the map is filled in along the spine from the well-scanned parts. If the scan or its placement in `SPLATS` changes, remake it (Node 22.15 or newer):
  ```
  node tools/page-surface.mjs splats/book.spz splats/book-surface.json --position 0.0641,-0.1778,0.0736 --rotation -103.74,1.78,29.14 --x -0.28,0.30 --z -0.21,0.20
  ```
  using the book's `position` and `rotation` from `SPLATS`.
- Other shapes work: `fit: "contain"` shows the whole image and fills the rest of the page with `fill` (`"auto"` takes the image's top-left pixel, so a flat background just carries on). The 2000 × 2500 map is fitted by width this way. `"cover"` fills the page and crops instead.
- To add the right page, copy the left entry, set `id: "right"`, `side: "right"`, `center: [0.148, 0.005]`, `size: [0.207, 0.32]` and a flatter `curve` (the right page is nearly flat at y ≈ 0), then fine-tune it in `?dev`.
- In `book.html?dev`, the **Pages** section of the panel has sliders to move, size, turn, lift, zoom, nudge, brighten, shade and soften each image live. **Copy page** gives the entry to paste into `PAGES`.

**Images.** The left page shows the maps (pages 66, 68, 70, 72: precolonial, home lots of Providence Plantations, where kidnapped Africans disembarked, Snowtown) and the right page the texts (67, 69, 71, 73), changing together as you scroll (`images/book-left-*.png`, `images/book-right-*.png`, 2000 × 3000).

**Focus.** The soft focus is much lighter here than in the State House (`FOCUS` in `config-book.js`: sharp over most of the screen, and the blur that's left is about 40% as strong), so the whole open spread reads at once.

**Look.** It starts from the State House look. The glow threshold is a little higher (0.74) so the white paper doesn't blow out, and the colour trail's `depth` is 0.35 because the paper is much closer than the State House walls. Tune with **G** in `book.html?dev`.

## Cursor and on-screen hints

The normal pointer is used (a hand over things you can click in the library); the old soft ring cursor, the "scroll" reminder and the hover labels are switched off at the bottom of `css/style.css`.

## The title card (part 1)

`images/title-card.png` is the first entry in `SPLATS` (`image`, `width`, `brightness`). Its transparent edges and punched hole show the void behind. The camera dives through the hole (the first keyframes). To swap in a scanned card later, replace `image`/`width` with `url: "splats/….spz"`.

## Floating thoughts

Lingering thoughts, questions and annotations that live **in the space**. Each is a sheet of text placed in 3D (`js/thoughts.js`): it sits at a real depth, is seen in perspective and skews as you pass it, is hidden by splats in front of it, and is soft-focused, glowing and coloured like everything else. As you scroll you move past it. Set them in `THOUGHTS` in `config.js`.

- **Found in the gaps.** When the cursor rests `dwell` seconds over a gap in the splats (through a doorway, past the edge of a wall, up into the dark), the next thought for that stretch appears there. It's placed at the depth of the space around the gap, turned to face back the way you were looking (± `turn` degrees), so it reads as a sheet hanging in the room.
- **Placed.** An item with a `position` sits at that exact spot (copy points in `?dev` with **P**), turned by `yaw` or toward `facing`. It surfaces when the cursor comes near it on screen.
- A thought stays while its `show` range lasts (so you can walk past it), or for `linger` seconds if given. At most `maxVisible` at once.
- `gap` is how empty a spot must be (0–1 coverage); `site.look.coverage` in the browser console shows the value under the cursor. `site.thoughts.surface()` makes the next one appear at the cursor straight away, handy for trying out text and sizes.
- `size` is the height of a line of text (scene units) when it appears `distance` away; found thoughts are scaled with their depth so they read at about the same size when they appear.
- **The type.** Letters arrive one after another (`charDelay` seconds apart), each rising in from below, overshooting a little and settling (`charDuration`, `bounce`). `tracking` is the letter spacing: raise it (0.2, 0.3…) to track the text out. Any of these can also be set on a single thought.

All the texts are lorem ipsum placeholders.

## Sound

`SOUND` in `config.js` and `js/sound.js` are the framework for the soundscape. Put files in `audio/` with the names listed in `SOUND.sounds`, and adjust the timings. Missing files are skipped (they show as 404s in the browser console until they exist).

- **Kinds.** A one-shot plays when the journey passes `at` (door creak, elevator ding). A loop plays inside its `range`, fading in and out at the edges (chatter, the exit sign's buzz, the library's room tone). A scattered sound repeats at random intervals (`every: [min, max]` seconds) inside its `range` (footsteps, pages turning). A cue plays when something happens: the library changes state (`on: "library:desk"`, …) or the book opens or closes (`"book:open"`, `"book:close"`).
- **Echo and stacking.** Every sound goes into a bus, `"house"` or `"library"`, and each bus has its own echo (`buses`: `reverb` amount and `echo` length in seconds). Sounds ring out and layer on top of each other as you go deeper.
- **The cut.** At `cut.at` (0.84, the same moment as the picture's cut into the library) the house bus is cut dead and only its echo rings out, and the library bus starts at once (room tone, low chatter, pages). Scrolling back past it, the library is cut and echoes out, and the State House **fades back in** over `cut.fadeBackIn` seconds (2.5).
- **File sizes.** The audio is uncompressed WAV (about 210 MB, the main hall ambience alone is 124 MB). Every visitor downloads these, so before going live, convert them to mp3 or m4a (a 128–192 kbps mp3 is around a tenth of the size) and update the names in `SOUND.sounds`.
- **Variety.** `volume` and `rate` can be `[min, max]` for a random value each time, and `pan` can be `"random"`.
- **Turning it on.** Browsers only allow sound after a click, tap or key press (scrolling doesn't count). The site opens on the catalog card with a "click to enable sound" cover (`SPLATS[0].cover`, `images/start-cover.png`): scrolling is off until the visitor clicks (or presses Enter / Space), which turns the sound on, fades the cover away and lets them scroll. There's no on/off button (`SOUND.toggle: true` brings back a small one in the corner).
- From the console, `site.sound.play("door-creak")` plays a sound by its id.

## Text and hotspots

Not in use yet. The systems are still there and are empty:

- **Text:** add `<section class="chapter" data-from="0.2" data-to="0.3" data-pos="left">…</section>` inside `<main id="story">` in `index.html`. It fades in and out of focus over that range. `data-pos` can be `left`, `right`, `center`, `bottom` or `top-left`.
- **Hotspots:** add entries to `HOTSPOTS` in `config.js`. The format is in the comment there.

To remove the "scroll" hint, delete the `#scrollhint` line in `index.html`.
