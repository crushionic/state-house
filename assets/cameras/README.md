# Camera moves from Blender

Each camera move is its own `.glb` file in this folder. The site loads whichever files are here; anything missing uses a placeholder.

| File | What it is | How it plays |
|---|---|---|
| `opening.glb` | Walk-through: inside the doors, up the stairs, down the hallway | Scrubbed by scroll: the top of the page is the first frame, the bottom is the last |
| `library.glb` | Library home view | First frame is used as a still |
| `library-to-bookshelf.glb` | Home → bookshelf | Played forward going in, backward coming out |
| `library-to-ceiling.glb` | Home → ceiling | Same |
| `library-to-desk.glb` | Home → desk | Same |

The first frame of each `library-to-…` move should match the library home view.

## Speed and timing

- **Scroll moves** (`opening.glb`): the whole timeline is spread across the scroll. Keyframe spacing and the curves in Blender's Graph Editor set how fast the camera moves per scroll. Flat sections of the curve become pauses.
- **Transitions** (`library-to-…`): played in real time at your scene's frame rate, so a 48-frame move at 24 fps takes 2 seconds.

## Exporting from Blender

1. Select the camera. For `opening.glb`, also select the `splat_anchor` Empty (below).
2. **File → Export → glTF 2.0**, format **glTF Binary (.glb)**.
3. **Include:** Limit to *Selected Objects*. Under Data, make sure *Cameras* is on.
4. **Transform:** keep *+Y Up* on.
5. **Animation:** on, with *Sampling* on. If the file has several actions, all of them play together.
6. Save with the file name from the table above, into this folder.

## Lining the camera up with the splat

Blender doesn't export splats, so the site needs to know where the splat sat in your Blender scene. In the opening scene file:

1. Add an Empty and name it exactly `splat_anchor`.
2. Parent the imported splat to it, then move, rotate and scale the Empty rather than the splat.
3. Export the Empty along with the camera.

The first export will likely need a one-time calibration (`BLENDER.importCorrection` in `js/config.js`), because Blender's splat importer may store the file's axes differently from the original file. After that, every export lines up on its own.

Animated focal length isn't read yet; the camera's focal length at the start of the file is used.
