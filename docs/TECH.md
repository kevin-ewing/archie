# Archie — Technical Design

> Status: **Draft v0.1** · Last updated: 2026-11-13
> Code rules: [`AGENTS.md`](../AGENTS.md) (Ponytail) + [`CLAUDE.md`](../CLAUDE.md).

---

## 1. Stack

| Piece | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Types catch mistakes across modules. Compiles away to plain JS, with zero runtime cost. |
| Build / dev server | **Vite** (dev dependency only) | Instant reload, a tiny production bundle, deploys as static files anywhere. |
| Rendering | **Canvas 2D**, native | Plenty for a full-screen pixel buffer at ~2 CSS px per pixel. No library needed. |
| Audio | **Web Audio API**, native | All-synth soundtrack and effects (see `MECHANICS.md` §12.5). |
| Saves | **localStorage**, native | Small JSON, versioned. |
| Runtime dependencies | **None** | Smallest download, nothing to break. |

**Why not p5.js:** p5 is a convenience layer *over* Canvas 2D. It adds about 1 MB of library, its own draw loop and per-call overhead, and helpers we won't use. Calling Canvas 2D directly is the same drawing API with nothing in between, so it's at least as fast and much smaller. (TypeScript and Vite aren't renderers. They're the language and the build tool; the speed comes from using raw Canvas.)

---

## 2. Crisp pixels (non-negotiable)

**A game pixel is the same physical size on every screen.** A bigger screen doesn't get bigger pixels; it shows **more of the world**. The canvas **always fills the whole screen**, at full **device resolution**, in landscape and portrait.

Because the camera **rotates** (heading-up, `MECHANICS.md` §3.4b), game pixels are not always aligned to the screen. Every frame is drawn straight onto the device-resolution canvas with a transform where **1 unit = 1 game pixel**, and **image smoothing off**. Each game pixel then appears as a crisp square (rotated when the world is rotated), sampled nearest-neighbour, never blurred.

Rules (implemented in `src/render/display.ts`):
1. **Fixed pixel size:** **1.75 CSS px** (target) per game pixel on regular screens, **0.9 CSS px** on compact screens (short side < 600 CSS px, i.e. phones), so phones see more. Both are constants (`PIXEL_SIZE`, `COMPACT_BREAKPOINT`).
2. **Whole device pixels:** `scale = round(pixelSize × dpr)`, minimum 1. When the world isn't rotated, every game pixel is exactly N×N physical pixels. Pixel size can be off by up to half a device pixel from the target so the target is only hit approximately: on 1× and 2× screens it lands on 2 CSS px, at 125% on 1.6. **Pixel size moves in steps** (e.g. 1.5 → 2 CSS px on Retina); in-between sizes would make pixels uneven widths.
3. **The canvas backing store is the exact device-pixel size of the window.** Its CSS size is `devicePx / dpr`, so the browser never resamples the canvas.
4. **World graphics are bitmaps.** Ground, clouds, the plane and its shadow are pixel-art canvases drawn with `drawImage` (nearest-neighbour). **Never fill vector shapes under rotation**: Canvas antialiases shape edges, which blurs them.
5. **One rotated image per layer.** Tiles are composed axis-aligned into one layer canvas, then that canvas is drawn rotated once. Drawing many adjacent tiles rotated would leave hairline seams, because Canvas antialiases each image's edges under rotation.
6. **Axis-aligned UI (HUD)** is drawn at integer game coordinates, so it's pixel-exact.

| Screen | Game pixels visible | Pixel size |
|---|---|---|
| 1080p monitor (1920×1080 @1×) | 960×540 | 2 CSS px |
| Retina MacBook (1440×900 @2×) | 720×450 | 2 CSS px |
| Windows 125% (1536×864) | 960×540 | 1.6 CSS px |
| iPhone portrait (390×844 @3×) | 390×844 | 1 CSS px |
| Android portrait (412×915 @2.625×) | 541×1201 | 0.76 CSS px |

**Design consequences:**
- **Visible area varies a lot by screen.** Sprites are the same size everywhere, so **gameplay must work in the smallest view** (~390 game px across on a portrait phone). Ranges (spotting distance, Archie range) are defined in world units, never screen units.
- **UI uses breakpoints, not scaling.** Menus, dialogue, letters and the logbook are a **DOM overlay** laid out with CSS media queries (native, no library). Layouts reflow by screen size while the pixel font stays at the same pixel size. The in-flight HUD anchors to screen edges and can read `compact` from `fitView` for its own breakpoint.

## 3. Game loop

- **Fixed-timestep simulation at 60 Hz** with an accumulator: deterministic, and gameplay doesn't depend on frame rate.
- **Render interpolation:** each frame renders a `blend` of the last two sim ticks (angles the short way round), so 90/120/144 Hz screens (e.g. ProMotion MacBooks) get smooth in-between motion instead of judder.
- Frame delta is **clamped** (250 ms), so returning to a backgrounded tab doesn't cause a catch-up spiral.
- The next frame is scheduled **before** any work, so one bad frame (an exception) can't freeze the game for good.
- Browsers pause `requestAnimationFrame` in hidden tabs, so the game is effectively paused there. An explicit pause menu comes with the UI.
- Simulation and rendering are separate: rendering can drop to 30 fps on weak phones without changing gameplay.

---

## 4. Module layout

Modules are created **when the first feature needs them**. **Built so far** (rough flight draft):

```
src/
  main.ts              wiring only: create everything, run the loop
  core/
    loop.ts            fixed-timestep loop + `blend` (render interpolation)
    noise.ts           seeded hash + value noise + fBm (all randomness goes through this)
    profile.ts         `?debug` frame profiler (fps + per-stage ms), free when off
    pixels.ts          tiny raster toolkit (pixels, discs, lines) + 5-px pixel font, no DOM
  world/
    ground.ts          ground colour per world pixel, from noise (pure; no DOM)
    clouds.ts          cloud pixels from noise (pure; no DOM)
    generate.ts        one entry point for generating any tile (used by worker and fallback)
    shading.ts         sunlight per tile from heights: cast shadows + relief lighting (pure)
    worker.ts          Web Worker entry: generates tiles off the main thread
  sim/
    flight.ts          bank, turn, speed, engine full power / heat / fuel
    aids.ts            flight aids: Hold (hands off) state machine + heading hold
    daylight.ts        campaign clock + real sun position (Ypres, by date and solar time)
  input/
    controls.ts        mouse, touch, keyboard → raw pilot input + one-off actions (toggle Hold, take control)
  render/
    display.ts         full-screen device-res canvas, fixed pixel size
    tiles.ts           cached tiles (async) composed into one layer image; ground heights
    tilegen.ts         Web Worker pool for tile generation, with a main-thread fallback
    camera.ts          heading-up camera with lag; position follows the plane (critically damped)
    plane.ts           procedural pixel sprite: bank frames + silhouettes + prop strips
    shadow.ts          plane shadow: projected position per fuselage band, eased ground height, soft silhouettes (pure)
    smoke.ts           exhaust smoke puffs from a struggling engine
    grade.ts           light of the hour: palettes, per-day skies, banded tint + glow overlays
    sparkle.ts         sunlight twinkling on water (glint points from the ground tiles)
    scene.ts           draws the world: ground → sunlight (+ plane shadow, cloud shadows) → smoke → plane → low clouds → wisps → high clouds → grade
  ui/                  the instrument board, kept apart from the world renderer
    instruments.ts     what each dial reads (pure) + needle lag, tremble, compass swing
    gauges.ts          pixel-art dials, the liquid compass and the pocket watch (each paints its own small canvas)
    hud.ts             instrument board layout and breakpoints only
    clock.ts           the pocket watch, digital readout and date (top-left)
```

**Still to come** (created when needed): `world/state.ts` (evolving sector), `world/gen/*` (front, sites, scars), `sim/artillery.ts`, `sim/wireless.ts`, `sim/panels.ts`, `sim/hazards.ts`, `sim/daylight.ts`, `story/*`, `content/*`, `audio/synth.ts`, `save/save.ts`, `render/palette.ts`.

**Data flow:** `input → controls → sim (pure state updates) → camera → render (reads state)`. Nothing in `sim/` or `world/` imports from `render/`. Story reads sim events and writes story state. Audio reads both.

### 4b. Systems & contracts

Each system owns its state, exposes a small surface, and guarantees a few things. The guarantees marked ✔ are enforced by `npm run check`.

| System | Owns / does | Guarantees | How to extend |
|---|---|---|---|
| **Noise** `core/noise.ts` | Seeded hash, value noise, fBm, cellular, Bayer dither | Same seed → same numbers, everywhere ✔ | Add a noise function here; never use `Math.random` for world content |
| **Ground** `world/ground.ts` | Colour + height of any world pixel; tiles with heights | Deterministic per seed ✔; landscape mix in sane bands ✔; **trees are always whole** ✔; pure, no DOM | New biome: decide it in `groundAt` (order = priority: trees, water, wood floor, copse, farmland); new crop: add to `CROPS` + `cropPixel` |
| **Clouds** `world/clouds.ts` | Cloud alpha levels per pixel; driven by scene into a low (shadow-casting) and a high (shadow-less) deck | Coverage in band ✔; same pixel size as ground | Weather = vary `COVER` / levels by day |
| **Tile pipeline** `render/tilegen.ts`, `render/tiles.ts` | Generate off-thread, cache, compose one image per layer | Never blocks the main thread on workers; **falls back to main-thread generation** if workers fail; failed tiles retried after 1 s; cache capped at ~2× the view (memory-safe on phones); prefetch ring | New layer = `createTileLayer(request, CHUNK)` + a `generateTile` case |
| **Flight** `sim/flight.ts` | Bank, heading, speed, engine heat, fuel | Bank/turn/level-off ✔; full power heats, locks out, recovers ✔; burns more fuel ✔ | Tune `FLIGHT`; new systems (altitude, damage) add fields + an update step |
| **Camera** `render/camera.ts` | Heading-up rotation with lag; position follows the plane | **Ground scroll never slows when accelerating** ✔; plane swings out in turns, settles home ✔; offset capped | Tune `CAMERA` |
| **Shadow** `render/shadow.ts` | Sun-ray cast shadow onto ground heights, in `SHADOW_SLICES` bands along the fuselage | Falls down-sun at altitude, closer on high ground ✔; only the band actually over a tree lifts, not the whole shadow ✔ | Altitude bands: pass `altitude`; sun movement: vary `SUN`; more/fewer bands: `SHADOW_SLICES` |
| **Controls** `input/controls.ts` | Mouse / touch / keyboard → raw `PilotInput` (stick, power, one-off actions) | Mouse & touch mapping, wide centre dead band, double-tap-hold ✔; one-off actions reported exactly once ✔; resets on blur | New action: add to `PilotInput` + a key + a touch gesture or HUD button |
| **Flight aids** `sim/aids.ts` | What the plane does when not hand-flown: Hold | Starts in Hold ✔; engaged mid-turn at full power: rolls out, cruise, holds the roll-out heading ✔; holds across ±180° ✔; a click / tap that takes the stick opens the throttle while held, a steer key doesn't ✔ | New aid = a new `AidMode` and its branch in `applyAids` |
| **Smoke** `render/smoke.ts` | Exhaust puffs by engine warning | None when fine, light when hot, dark when overheated; all fade ✔; capped | Battle damage smoke can reuse it |
| **Display** `render/display.ts` | Full-screen device-res canvas, fixed pixel size | Whole device pixels per game pixel, ~same physical size everywhere ✔; never 0-size ✔; re-fits on resize, rotation, zoom and DPR change | Tune `PIXEL_SIZE`, `COMPACT_BREAKPOINT` |
| **Instruments** `ui/` | Readings → needles → dials → board layout, in separate files | Cruise revs; warm engine reads mid-scale; revs rise at full power and sag when hot; warning stage before lockout; temperature reaches the red; compass lags, swings past, settles ✔ | New instrument: a reading in `instruments.ts`, a dial in `gauges.ts`, a slot in `hud.ts` |
| **Daylight** `sim/daylight.ts` | Clock; sun azimuth / elevation; shadow vector; sun strength; sunset hour | Morning shadows west, noon north, evening east; no sun at night; May sunset ~19:30 solar; midnight rollover ✔ | Change date / latitude in `DAYLIGHT`; the story calendar drives `day` |
| **Sunlight** `world/shading.ts` + scene | Cast shadows and relief per tile, re-baked every ~3° of sun (stale tiles shown until fresh ones arrive) | Tree shadows fall down-sun and flip morning → evening; crowns lit on the sun side; lower sun → longer shadows ✔ | Tune `SHADE`; new tall things just need heights |
| **Cloud shadows** | Ground-space tiles of the *low* deck's density only, placed by sun direction + wind (never re-baked); `CLOUD_HEIGHT` kept modest so the shadow stays near its cloud rather than drifting off-screen | Same pixel grid as the ground | Weather can scale `CLOUD_SHADOW_ALPHA`; the high deck never gets a shadow tile |
| **Grade** `render/grade.ts` | Palettes, per-day sky (palette + beauty), multiply tint + screen glow with bands, dither, shafts, vignette | Nothing drawn in plain daylight; sunset glows; night darkest; skies deterministic per day, some dull, some blazing ✔ | Add a palette to `PALETTES`; tune phase weights in `gradeFor` |
| **Loop** `core/loop.ts` | Fixed 60 Hz sim + interpolated rendering | `blend` handles angles and flags ✔; survives exceptions; clamps long pauses | — |

**Hard edges handled:**
- Window collapsed to 0 px, or a resize mid-frame.
- Moving between monitors with a different pixel density.
- Backgrounded tab returning after a long gap.
- Workers failing to start, or crashing mid-flight (main-thread fallback).
- A tile failing to generate (retried after a pause).
- Running out of tile memory on phones (cache capped to the view).
- Losing focus mid-input (keys and power released).
- iOS long-press callouts and text selection.
- A bad `?seed=` in the URL (ignored; the default world loads).

---

## 5. Procedural world & saves

- The world is a **pure function of a seed** (§3.6 of `MECHANICS.md`): `generate(seed, profile) → sector`.
- The evolving sector is saved as **seed + a list of changes** (craters, ruins, front shifts), not as full map data. Saves stay a few KB.
- Terrain is generated into **chunk images** (128×128 game px, ~15 ms each on a laptop) **in Web Workers** (`world/worker.ts`, a pool of up to 3 in `render/tilegen.ts`), so the main thread never stalls. Tiles are cached (LRU), with a prefetch ring, and the canvas fades in once the first view is complete. Ground tiles also carry a **height map**, which the cast shadow reads (O(1) per pixel). Each frame composes the visible chunks into one layer image, which is drawn rotated (§2). New craters are stamped into the affected chunk.

---

## 6. Performance budget

| Target | Budget |
|---|---|
| Frame rate | 60 fps on a mid-range phone and a modest laptop; 30 fps fallback |
| First load | < 20 MB total, ideally < 2 MB (no audio files, small sprites) |
| Particles | Pooled, hard cap (start at 512) |
| Draw calls | Visible terrain chunks + sprites only; no per-pixel effects in JS |
| Memory | Chunk cache evicts off-screen chunks |
| Battery | Pause when hidden; no work when nothing changes on menu screens |

---

## 6b. Measured performance

Measured live with `?debug` (Chrome, MacBook, 1024×768 window @2×), on the main thread, per frame:

| Scene | fps | Frame CPU |
|---|---|---|
| Midday, flying straight | 120 | ~0.9 ms |
| Full-power turn | 120 | ~0.7 ms |
| Sunset, flying straight | 120 | ~1.15 ms |
| Sunset turn (light overlay redrawing) | 120 | ~1.0 ms |

What keeps it cheap:
- **Tile composites are cached.** They're tile-aligned and only redrawn when the tiles under them change (a new tile arrives, a fade is running, or the view crosses a tile edge).
- **The plane shadow is a sprite**, not a per-pixel cast (it used to be ~250k ray tests a frame, and it shimmered).
- **The light overlay** is painted once, sun-aligned, and just **rotated** each frame (so turning is smooth, with no repaint steps). It's only repainted when the light itself changes.
- **Tile generation and sunlight baking** run in workers.

Biggest remaining cost: the sunlight layer's cross-fades (~0.4–0.8 ms), since a fade keeps that composite redrawing.

## 7. Checks & testing

- **`npm run check`**: TypeScript type-check plus small runnable checks (`*.test.ts`) using Node's built-in test runner. No test framework.
- Following Ponytail, each piece of non-trivial logic (scaling maths, RNG, clock-code snapping, world generation guarantees) gets **one** small check that fails if the logic breaks.
- World generation checks run many seeds and assert the guarantees in `MECHANICS.md` §3.6 (target reachable, landmark nearby, etc.).

---

## 8. Open technical questions

1. Pixel font: license an existing one, or draw our own?
2. Hosting: GitHub Pages, Netlify, itch.io?
3. Does the dusk lighting need WebGL, or is palette swapping plus canvas compositing enough? (Start with Canvas 2D; measure first.)
