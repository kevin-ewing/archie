---
inclusion: fileMatch
fileMatchPattern: 'src/story/**'
---

# Drawing things for the Story desk

Every thing on the desk (`src/story/desk-items.ts`, `src/story/clutter.ts`) is drawn the same way. A new item, or a
change to one, copies an existing item that's made of the same material. It never brings in a shading method of its own.

## The look

- **Seen from straight above**, at the desk's real scale: about 8 px per cm (the mug's rim is 37 px in radius, the
  watch's 27). The size is decided at the real object's size and then checked against the mug and the watch.
- **Lit from the top-left, no outlines.** Edges are told apart by light alone: the side facing top-left one or two
  steps lighter, the bottom-right side one or two darker. Holes and wells are the other way round: lit on their far
  (bottom-right) wall.
- **Tone steps, not smooth shading.** Colour and tone are built per pixel, then snapped by `toned()` in clutter.ts
  (or the same loop in desk-items.ts): 6 = one step = 6 % brightness.
  - Broad areas (a face, a sheet, leather) are **dithered** between steps with `bayer`.
  - Thin parts (edges, rims, lettering, rivets, 1–3 px features) are **whole tones** (`whole = true`), so they
    stay clean.
- **A few deliberate features**, each in a handful of pixels: a crease, a rivet, a stamp, a chip, old oil. Texture
  is one faint `fbm` or `valueNoise` term (a few tone units), not a stack of effects.
- **No** height maps or normals from them, specular or mirror terms, brushed streaks, sheen bands, random pits,
  blur or anti-aliasing. These make an item read as a different game.

## Materials: copy these

- **Metal** (nickel and steel): the shared palette `METAL [0x9c,0x98,0x82]`, `DARKM [0x56,0x54,0x49]`,
  `LITM [0xe2,0xe0,0xd6]`, `GLINT [0xf2,0xee,0xe2]`. Reference: the goggles' lens rims and buckles and the orders'
  spring clip (desk-items.ts), and `spanner` (clutter.ts).
  - Outermost edge pixel: LITM where it faces the light, DARKM where it faces away, METAL otherwise.
  - Next 1–2 px in: METAL at about +14 lit and −16 shaded, whole tones.
  - The flat face: METAL, dithered, with only a gentle tilt and maybe old oil (−8).
  - GLINT is for single pixels: a rivet's lit corner, the top line of the clip.
- **Brass:** `BRASS` in clutter.ts, shaded the same way as metal (the .303 rounds, the ashtray).
- **Paper and card:** a flat base, a faint `fbm`, edges a step darker, folds as one dark line (postcard,
  message pad, orders).
- **Leather:** the goggles' mask and strap.

## Shadows and placement (barn-art.ts)

- Every shadow is the item's **hard, flat silhouette** (`silhouette`), offset down-right by `depth`, at the desk's
  alpha. Never blurred, feathered or stepped.
- `depth` follows the item's height: 2 for sheets, 3 for most things, 4 for the watch and goggles, 5–6 for a
  heavy thing that stands up (the mug, the spanner). It's given at full size, and barnScene scales it by the
  item's `k`, so a shrunken item's shadow drops less and the item doesn't look like it's floating.
- **What may lie on top:** every item says whether it `bears` weight: `BEARS` in barn-art.ts for the things you
  use, `bears` on each `CLUTTER` entry. Flat or soft things (papers, books, cards, the postcard, the
  matchbox) bear weight. Anything round, tall or that would tip (the coffee, the watch, the goggles, the
  spanner, bottles, pens, pins) doesn't, and neither do the orders. Placement never puts anything higher on what
  doesn't bear, and `barn.test.ts` checks this at every screen size. A new item must set `bears`.
- Clutter entries in `CLUTTER` (clutter.ts) can set `z` (how high it lies; ≥ 1 lies over the things you use; the
  orders at 9 are always on top), `depth` and `spin`. `spin` tries every angle to find a gap, and redraws the item
  through `art(turn)` so its light stays top-left on screen.
- **The light never turns with the item.** Anything that lies far off square (the spanner, the sixpence)
  is drawn for its `turn`, like `spanner(turn)` and `coinArt(turn)`. The direction to the screen's top-left is
  worked out in the drawing's own frame, so highlights, shaded edges and shaded sides land top-left and
  bottom-right on screen. Items laid nearly square (the papers, the books, the watch) keep their baked light.
- **One box per item, used everywhere.** An item's own box is the rectangle round its drawn pixels, in its own
  frame, turned as it lies (`ownBox` / `quadOf` in barn-art.ts). Placement, stacking, kept parts, the plates'
  clear space, the click button (turned to match) and the `?boxes` overlay all use that same box. Overlaps are
  the area two boxes share (`meet`). So an item's drawing shouldn't carry empty margin, which would only make
  its box bigger than the item.
- **The big papers anchor the scene.** The papers are `PAPERS` in barn-art.ts: the orders, calendar,
  clock-code card, letters, log book and message pad. They're placed first, right after the chart.
  - Each keeps its distance from the others, measured centre to centre (`apart`, a third of the screen's
    diagonal).
  - Each leans in toward the middle (`CENTRE`), except the calendar, which runs off an edge instead. So they make
    a balanced group in the centre.
  - Everything else is placed after them and scatters round them. Only the papers lean in.
- Loose clutter is drawn only when its name is in `CLUTTER_SHOWN` (barn-art.ts). It's what gives way on a small
  desk: a piece that can't find a good spot is left off. The things you use never shrink to make room for it.

## Check before saying it's done

1. `npx tsc --noEmit`, then `node --test src/story/*.test.ts`.
2. `node .kiro/steering/preview-desk.ts [W H] [boxes]` (default 720 × 420; try a small one too, such as 400 300;
   `boxes` draws the layout's boxes, as `story.html?boxes` does in the browser), or
   `node .kiro/steering/preview-art.ts src/story/clutter.ts <fn> [turn]` for one drawing alone. Both write over the
   same file, `debug/preview.png`. Never make a new image per try. Look at the new item **beside its neighbours of the same
   material**. Check that its edges and contrast match theirs, that its shadow looks like theirs, that it's the
   right size against the mug and the watch, and that it isn't covering the orders, the watch's face or the coffee.
