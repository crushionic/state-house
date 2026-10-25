# state-house

A scroll-driven walk through a Gaussian-splat capture, rendered with [Spark](https://sparkjs.dev) and three.js. No build step: GitHub Pages serves these files as-is.

## Files

| Path | What it is |
|---|---|
| `index.html` | Page structure: one `<section class="shot">` per camera shot |
| `js/scene-config.js` | **The file to edit**: splat path, camera shots, hotspots |
| `js/main.js` | Rendering, scroll → camera mapping, hotspots, camera tool |
| `css/style.css` | Styles |
| `assets/splat.spz` | The splat (SPZ v4) |

## Setting up camera shots

Open the site with `?camera` on the end of the URL (for example `https://…/?camera`, or `?camera=3` to start at shot 3).

- Drag to orbit, scroll to zoom, right-drag to pan
- W A S D to move, Q / E down and up, Shift to go faster
- Number keys jump to existing shots
- **Copy shot** copies the current view as a line you paste into `SHOTS` in `js/scene-config.js`

If you add or remove a shot, add or remove a matching `<section class="shot">` in `index.html` so the counts stay equal.

## Swapping in the final splat

Replace `assets/splat.spz` with the new file (same name), or point `SPLAT_URL` in `js/scene-config.js` at the new location, such as an R2 URL. If the new export has a different scale or origin, re-check the shots with `?camera`.

## Running locally

Module scripts don't load from `file://`, so serve the folder:

```
python3 -m http.server 8000
```

then open http://localhost:8000.
