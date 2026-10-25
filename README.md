# state-house

A scroll-driven walk through a Gaussian-splat capture into a library you can explore, rendered with [Spark](https://sparkjs.dev) and three.js. No build step: GitHub Pages serves these files as-is.

## Flow

1. **Intro:** an Enter button.
2. **Opening:** scroll moves the camera through the splat along a Blender camera move, then fades into glowing white.
3. **Library home:** three areas to click: desk, bookshelves, ceiling.
   - **Bookshelves:** a book slides out spine first, opens and flips pages. Click its left side to unfold a map. Scrolling steps through the map while parts of the text on the right come into focus; at the end the book closes on its back cover. Scroll back to reopen it, or use the button to its right to return.
   - **Ceiling:** click elements for an enlarged view with information. Return button top right.
   - **Desk:** a branching dialog with the figure behind the desk. Return button top right once the dialog is done.

Everything not yet supplied is a placeholder: camera moves, the library, the book, the figure and all text (lorem ipsum). A "Placeholders" note in the corner lists what's still missing.

## Files

| Path | What it is |
|---|---|
| `js/config.js` | **The file to edit**: asset paths, look settings, placeholder text, map steps, dialog |
| `assets/cameras/` | Blender camera exports go here; see the README in that folder |
| `assets/splat.spz` | Opening splat |
| `js/main.js` | Start-up and the overall flow |
| `js/look.js` | Hazy white post-processing |
| `js/camera-track.js` | Reads Blender camera animations |
| `js/scenes/` | One file per scene: opening, library, book, ceiling, desk |

## URL options

- `?look` — live panel for the haze, glow and color; **Copy settings** gives you a block to paste into `js/config.js`
- `?start=library` — skip straight to the library
- `?nofx` — turn post-processing off, if a device shows a black screen

## Running locally

Module scripts don't load from `file://`, so serve the folder:

```
python3 -m http.server 8000
```

then open http://localhost:8000.
