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
| Audio | **Web Audio API + Tone.js** | Native engine synthesis plus lightweight continuous music voices and effects (see `MECHANICS.md` §12.5). |
| Saves | **localStorage**, native | Small JSON, versioned. |
| Runtime dependencies | **Tone.js only** | Music synthesis; rendering and game systems stay native. |

**Why not p5.js:** p5 is a convenience layer *over* Canvas 2D. It adds about 1 MB of library, its own draw loop and per-call overhead, and helpers we won't use. Calling Canvas 2D directly is the same drawing API with nothing in between, so it's at least as fast and much smaller. (TypeScript and Vite aren't renderers. They're the language and the build tool; the speed comes from using raw Canvas.)

---

## 2. Crisp pixels (non-negotiable)

**A game pixel is the same physical size on every screen.** A bigger screen doesn't get bigger pixels; it shows **more of the world**. The canvas **always fills the whole screen**, at full **device resolution**, in landscape and portrait.

Because the camera **rotates** (heading-up, `MECHANICS.md` §3.4b), game pixels are not always aligned to the screen. Every frame is drawn straight onto the device-resolution canvas with a transform where **1 unit = 1 game pixel**, and **image smoothing off**. Each game pixel then appears as a crisp square (rotated when the world is rotated), sampled nearest-neighbour, never blurred.

Rules (implemented in `src/render/display.ts`):
1. **Fixed pixel size:** **1.75 CSS px** (target) per game pixel on regular screens, **1.2 CSS px** on compact screens (short side < 600 CSS px, i.e. phones), so phones remain readable while still seeing more. Both are constants (`PIXEL_SIZE`, `COMPACT_BREAKPOINT`).
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
| iPhone portrait (390×844 @3×) | 293×633 | 1.33 CSS px |
| Android portrait (412×915 @2.625×) | ~361×801 | 1.14 CSS px |

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
  perf.ts              `npm run benchmark`: repeatable subsystem benchmarks (Node)
  frontmap.ts          `npm run frontmap`: internal tool, maps of the front at the start (or a wide area) and its trenches over the land (Node)
  core/
    loop.ts            fixed-timestep loop + `blend` (render interpolation)
    noise.ts           seeded hash + value noise + fBm (all randomness goes through this)
    profile.ts         `?debug` frame profiler (fps + per-stage ms), free when off
    pixels.ts          tiny raster toolkit (pixels, discs, lines) + 5-px pixel font, no DOM
  world/
    settings.ts        per-request world settings (density, fronts on/off, trench style), read by every layer
    fronts.ts          layer 1, the front plan: territories, each front's curve, front coordinates, clearance (pure)
    palette.ts         shared colours (`WATER`, `SHORE`, `DIRT`) and `rgb`: a leaf module with no imports, so `ground.ts`, `military.ts` and `season.ts` can import each other without a cycle breaking their top-level constants
    season.ts          what a season looks like on the ground: the per-request look (`setLook`), tone families, per-tree leaf cover, and the ground-state overlay (snow, frost, mud, water, ice); the only `world/` module that knows seasons (pure)
    ground.ts          layer 2, the landscape: ground colour per world pixel, from noise, kept clear of fronts' cores (pure; no DOM)
    clouds.ts          cloud pixels from noise (pure; no DOM)
    generate.ts        one entry point for generating any tile; runs the layers in order, then stamps (damage → structures → front → tracks)
    shading.ts         sunlight per tile from heights: cast shadows + relief lighting (pure)
    structures.ts      layer 3: farms, post mills, chapels, ruins: placement + per-pixel stamps (pure)
    military.ts        the front's works, drawn from the plan: trenches, wire, craters, batteries (pure)
    lights.ts          lamplight around sunset: where the lamps are, on/off times, flicker (pure)
    damage.ts          live damage marks (store, per-tile versions) + crater/scorch stamps
    worker.ts          Web Worker entry: generates tiles off the main thread
  game/
    state.ts           session owner: lifecycle, pause reasons, level, missions, sortie/calendar/time, checkpoint validation
  sim/
    flight.ts          bank, turn, speed, engine full power / heat / fuel
    aids.ts            flight aids: Hold (hands off) state machine + heading hold
    calendar.ts        `Clock.day` ↔ calendar date (integer days-from-civil, no `Date`), ISO parsing; `setCampaignStart` moves the date of campaign day 0 for the debug `?date=` overrides (default 10 May 1915)
    sun.ts             `LOCATION`, sunrise / sunset per date (NOAA series, sun centre −0.833°), solar ↔ legal time (`SUMMER_TIME` table)
    climate.ts         data only: Lille-Lesquin normals, anchors (1914–15 winter, 22 Nov 1914, Dec 1915, Loos), phenology and bloom windows
    seasons.ts         `SeasonState` per date and seed (30-day ground-state fold, cached), `MAY_LOOK`, `seasonKey`, URL override parsing
    daylight.ts        clock advancement maths + sun position for a date's `SunDay` (solar time)
  input/
    controls.ts        mouse, touch, keyboard → raw pilot input + one-off actions (toggle Hold, take control)
  render/
    display.ts         full-screen device-res canvas, fixed pixel size; plus a transparent HUD canvas stacked on top
    tiles.ts           cached tiles (async) composed into one layer image; ground heights
    tilegen.ts         Web Worker pool for tile generation, with a main-thread fallback
    camera.ts          heading-up camera with lag; position follows the plane (critically damped)
    plane.ts           procedural pixel sprite: bank frames + silhouettes + prop strips
    shadow.ts          plane shadow: projected position per fuselage band, eased ground height, soft silhouettes (pure)
    smoke.ts           exhaust smoke puffs from a struggling engine
    grade.ts           light of the hour: palettes, per-day skies, banded tint + glow overlays
    sparkle.ts         sunlight twinkling on water (glint points from the ground tiles)
    lamps.ts           lamplight around sunset: one flickering glow bitmap per lit window, added over the grade
    scene.ts           draws the world: ground → sunlight (+ plane shadow, cloud shadows) → smoke → plane → low clouds → wisps → high clouds → grade
  ui/                  the instrument board, kept apart from the world renderer
    instruments.ts     what each dial reads (pure) + needle lag, tremble, compass swing
    gauges.ts          pixel-art dials, the liquid compass and the pocket watch (each paints its own small canvas)
    hud.ts             instrument board layout and breakpoints only
    clock.ts           the pocket watch, digital readout and date (top-left)
```

**Still to come** (created when needed): `world/state.ts` (evolving sector), `sim/artillery.ts`, `sim/wireless.ts`, `sim/panels.ts`, `sim/hazards.ts`, `sim/daylight.ts`, `story/*`, `content/*`, `save/save.ts`, `render/palette.ts`.

**Data flow:** `input → controls → sim (pure state updates) → camera → render (reads state)`. Nothing in `sim/` or `world/` imports from `render/`. Story reads sim events and writes story state. Audio reads sim state.

### 4b. Systems & contracts

Each system owns its state, exposes a small surface, and guarantees a few things. The guarantees marked ✔ are enforced by `npm run check`.

| System | Owns / does | Guarantees | How to extend |
|---|---|---|---|
| **Noise** `core/noise.ts` | Seeded hash, value noise, fBm, cellular, Bayer dither | Same seed → same numbers, everywhere ✔ | Add a noise function here; never use `Math.random` for world content |
| **Ground** `world/ground.ts` | Colour + height of any world pixel; tiles with heights | Deterministic per seed ✔; landscape mix in sane bands ✔; **trees are always whole** ✔; pure, no DOM | New biome: decide it in `groundAt` (order = priority: trees, water, wood floor, copse, farmland); new crop: add to `CROPS` + `cropPixel` |
| **Clouds** `world/clouds.ts` | Cloud alpha levels per pixel; driven by scene into a low (shadow-casting) and a high (shadow-less) deck | Coverage in band ✔; same pixel size as ground | Weather = vary `COVER` / levels by day |
| **Tile pipeline** `render/tilegen.ts`, `render/tiles.ts` | Generate off-thread, cache, compose one image per layer | Never blocks the main thread on workers; **falls back to main-thread generation** if workers fail; interrupted cross-fades continue from the visible blend; failed tiles retried after 1 s; cache capped at ~2× the view (memory-safe on phones); prefetch ring | New layer = `createTileLayer(request, CHUNK)` + a `generateTile` case |
| **Flight** `sim/flight.ts` | Bank, heading, speed, engine heat, fuel | Bank/turn/level-off ✔; full power heats, locks out, recovers ✔; burns more fuel ✔ | Tune `FLIGHT`; new systems (altitude, damage) add fields + an update step |
| **Camera** `render/camera.ts` | Heading-up rotation with lag; position follows the plane | **Ground scroll never slows when accelerating** ✔; plane swings out in turns, settles home ✔; offset capped | Tune `CAMERA` |
| **Shadow** `render/shadow.ts` | Sun-ray cast shadow onto ground heights, in `SHADOW_SLICES` bands along the fuselage | Falls down-sun at altitude, closer on high ground ✔; only the band actually over a tree lifts, not the whole shadow ✔ | Altitude bands: pass `altitude`; sun movement: vary `SUN`; more/fewer bands: `SHADOW_SLICES` |
| **Controls** `input/controls.ts` | Mouse / touch / keyboard → raw `PilotInput` (stick, power, one-off actions) | Mouse & touch mapping, wide centre dead band, double-tap-hold ✔; one-off actions reported exactly once ✔; inactive phases ignore and clear input; resets on blur | New action: add to `PilotInput` + a key + a touch gesture or HUD button |
| **Flight aids** `sim/aids.ts` | What the plane does when not hand-flown: Hold | Starts in Hold ✔; engaged mid-turn at full power: rolls out, cruise, holds the roll-out heading ✔; holds across ±180° ✔; a click / tap that takes the stick opens the throttle while held, a steer key doesn't ✔ | New aid = a new `AidMode` and its branch in `applyAids` |
| **Audio** `audio/audio.ts`, `audio/engine-processor.js` | Lazy Web Audio graph; master/effect buses; AudioWorklet renders each RAF 1a V8 cylinder event with its own timing/gain through an exhaust resonance | Starts only after a user gesture; oscillator fallback; restrained RPM response, irregular firing texture, bank/load feedback, and heat-driven missed firings/backfires; volume and pause use smooth ramps ✔ | Add a bus/source behind `GameAudio`; keep sim state out of the audio graph |
| **Smoke** `render/smoke.ts` | Exhaust puffs by engine warning | None when fine, light when hot, dark when overheated; all fade ✔; capped | Battle damage smoke can reuse it |
| **Display** `render/display.ts` | Full-screen device-res canvas, fixed pixel size; the HUD on its own canvas over it, so the world canvas ends each frame on the grade (drawing after the grade forced an early render: ~0.5 ms at dusk) | Whole device pixels per game pixel, ~same physical size everywhere ✔; never 0-size ✔; re-fits on resize, rotation, zoom and DPR change | Tune `PIXEL_SIZE`, `COMPACT_BREAKPOINT` |
| **Instruments** `ui/` | Readings → needles → dials → board layout, in separate files | Cruise revs; warm engine reads mid-scale; revs rise at full power and sag when hot; warning stage before lockout; temperature reaches the red; compass lags, swings past, settles ✔ | New instrument: a reading in `instruments.ts`, a dial in `gauges.ts`, a slot in `hud.ts` |
| **Daylight** `sim/daylight.ts` | Clock; sun azimuth / elevation; shadow vector; sun strength; sunset hour | Morning shadows west, noon north, evening east; no sun at night; May sunset ~19:37 solar (sun centre −0.833°); midnight rollover ✔ | Change the place in `LOCATION` (`sim/sun.ts`) and the start date via `REFERENCE` (`sim/calendar.ts`); the story calendar drives `day` |
| **Seasons** `sim/calendar.ts` → `sun.ts` → `climate.ts` → `seasons.ts`; `world/season.ts` | One date feeds the sun, grade, lamps, watch and `SeasonState`. A pure function of `(date, seed)`: the same date gives the same state, each date folds its own 30 days of hidden weather (no result depends on the day before). `MAY_LOOK` is the default look for tiles requested without a season; no date is pulled toward it, so every value eases through the year (`cropRange` samples each crop's stage ±16 days so each field runs early or late; `seasonKey` includes the whole day counts). Snow placement comes from `snowLie` (`world/ground.ts`): hedge lee drifts, field exposure, furrows, hollows. Placement (`treeAt`, `landAt`, `isWater`, `cropOf`, structures, tracks, fronts) never reads the season. The ground tile `version` carries `seasonKey`, a hash of bucketed values, so invisible changes regenerate nothing and visible ones cross-fade through `fadeMs`. `sim/` imports nothing from `world/` or `render/`; `world/` imports only the `SeasonState` type, `MAY_LOOK`, `CROP_NAMES` and `CROP_SPREAD` from `sim/seasons.ts`. Override state is never saved | Range, continuity, purity, windows, budgets, overlay and tile-validity properties ✔ | A new look: a field in `SeasonState` and its tone in `world/season.ts`; new anchor: a row in `ANCHORS`; a new colour that needs a surface class: register it in `world/season.ts` (unregistered colours count as field or raised) |
| **Sunlight** `world/shading.ts` + scene | Cast shadows and relief per tile, re-baked every ~3° of sun (stale tiles shown until fresh ones arrive) | Tree shadows fall down-sun and flip morning → evening; crowns lit on the sun side; lower sun → longer shadows ✔ | Tune `SHADE`; new tall things just need heights |
| **Cloud shadows** | Ground-space tiles of the *low* deck's density only, placed by sun direction + wind (never re-baked); `CLOUD_HEIGHT` kept modest so the shadow stays near its cloud rather than drifting off-screen | Same pixel grid as the ground | Weather can scale `CLOUD_SHADOW_ALPHA`; the high deck never gets a shadow tile |
| **Grade** `render/grade.ts` | Palettes, per-day sky (palette + beauty), multiply tint + screen glow with bands, dither, shafts, vignette | Nothing drawn in plain daylight; sunset glows; night darkest; skies deterministic per day, some dull, some blazing; winter evenings pick plainer skies (`skyBias`); `haze` adds a veil to the glow pass, no new pass ✔ | Add a palette to `PALETTES`; tune phase weights in `gradeFor` |
| **World layers** `world/fronts.ts` → `ground.ts` → `structures.ts` → stamps | Generated in order; each layer reads only the ones before it (never a later one): the front plan from the seed alone; the landscape lowers lakes, woods, copses and tree clumps by the plan's **clearance** (1 over no-man's land and the trench lines, easing to 0 behind them, on a cached 32-px world grid); farms keep out of a front's core; the stamps draw the works and farms over the landscape | No lake or wood in a front's core, landscape back behind it, no farm in the core (layers check) ✔; clearance lookup ≈ free (last grid cell kept: pixels come in rows) ✔ | A new layer goes where its inputs are already made, and only reads earlier ones |
| **World additions** `world/structures.ts`, `military.ts`, `damage.ts` | Stamped into ground tiles in the worker, in priority order damage → structures → front → tracks → landscape | Deterministic per seed (same when you return) ✔; scattered fronts at many angles ✔; the front masked off water (texture-sampled per tile) ✔; fronts never overlap (one per territory) ✔; a front never crosses or comes back near itself ✔; maze of trenches around each line, batteries behind ✔; many building kinds and farm plans, only on open land, never in trenches or gun lines, ruined near fronts ✔; sloped roofs, paving apron then shared `dirtAt` dirt round buildings, linked tracks ✔; whole craters stacked by z (no clipping) ✔; **every stamp returns a valid colour anywhere** (fuzz check) ✔; damage persists, bumps only the touched tiles ✔. Per tile: front cells precomputed (`cellularField`), front coordinates found on an 8-px grid and interpolated (`frontField`), each front's curve built once | New structure: a builder in `structures.ts`; new military feature: a branch in `militaryAt`; new damage kind: a case in `damageAt` |
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

### Session state (implemented)

`src/game/state.ts` is the session/campaign owner, above the individual simulation systems. `createGame({ mode, seed, startHour, day, level, world, levelId, objectives })` starts in `loading`, in `free-play` mode (the only implemented mode), at level 1 / campaign day 0 by default, with no assigned mission (free flight). The readonly `game.state` view contains the world seed/configuration, mode, phase, calendar clock, current level ID/objectives and mission, sortie number and start time, active sortie seconds and total active seconds. `sim/daylight.ts` still owns solar/time-advance calculations; the game module owns the clock instance. Calendar dates use UTC arithmetic anchored to 10 May 1915, not the device timezone.

- Start-up: the static landing page (`index.html`, wired by `ui/landing.ts`) shows first. While it's up, `main.ts` draws only its terrain window (`drawTerrain` in `render/scene.ts`: the bare landscape, with no farms or front, its shadows, cloud shadows, clouds and the light of the hour, north up, drifting) and not the game. It's buffered for its one-way creep: each layer composes exactly the window's rectangle, not the rotating view's diagonal square, and preloads only the rows ahead (`compose(x, y, w, h, around)` in `render/tiles.ts`). Until all of it is ready, the white page shows only a loading message (one of the list in `index.html`, drawn by a tiny inline script in the game's font) and a three-pixel mark; then the menu and terrain appear together. A sliver of silver, its ends rounded off, divides the page from the map. Settings opened there takes the menu's own place. Choosing a mode cuts, with no fade, to the take-off screen. The pause menu's MAIN MENU saves the story's place and reloads the page. Choosing STORY or FREE FLY is the one press: the take-off screen waits for the world, the plane settles, and the flight begins.
- `transition('handoff' | 'playing')` follows the launch/reveal lifecycle. Only these two phases run physics and advance active time. Loading, pause and debrief freeze time.
- `pause(reason)` / `resume(reason)` track `user` and `visibility` independently. Showing a tab never undoes a user pause. A reveal callback arriving while paused updates the eventual resume phase without resuming early.
- `startMission(id)` and `finishMission('completed' | 'failed')` own mission lifecycle/timestamps. Completed and failed results are archived with their level/sortie before the next assignment can replace them. Mission IDs reference future content; objectives and rewards are not invented here. `endSortie()` requires any active assignment to be resolved first.
- `beginSortie({ day, startHour, level, seed?, world?, levelId?, objectives? })` requires debrief and resets sortie-local metadata, preserving total active seconds and prior mission results. Seed/world settings carry over unless explicitly overridden for the next level. Registered objectives persist across sorties at the same level; `completeObjective(id)` marks them done. Switching levels is blocked until all current objectives are completed. Content decides when an objective is satisfied and which definition comes next. Campaign scheduling chooses the next day/level explicitly; midnight only changes the calendar. A future sortie coordinator must also reset aircraft/world/UI as appropriate; this metadata operation does not recreate those systems.
- `advance(dt, speed)` accepts simulation steps up to one second and clock multipliers 0–1000. Active time stays in simulation seconds even when the solar clock is accelerated or frozen. `setTime(hours, day?)` supports developer inspection without rewriting start timestamps.
- `snapshot()` returns detached version-2 session metadata, including mode, world configuration and level objectives. Version-1 snapshots migrate to free play with the default world settings, since the old format did not record them. `restoreGame(parsedUnknown)` validates it, rejects unknown versions and invalid lifecycle data, drops the previous tab's visibility reason, and pauses a restored active flight until explicitly resumed. This is the session portion of a future full save: aircraft, world changes, presentation state and storage persistence are **not** included or automatically loaded.

`world` owns `fronts`, `farms`, `frontLines`, `frontAtStart`, `onlyTrenches`, `density` and `trenchStyle`. `worldFeatures()` translates those names into the existing renderer/worker contract. `setWorldFeatures({ fronts?, farms?, frontLines? })` supports the three existing live toggles; generation geometry and seed changes are applied at sortie setup, when a future coordinator can rebuild the scene. `main.ts` uses the same flags in development and production. Debug toggles are mirrors/controllers of this configuration, not an independent owner. A supplied seed (including zero) is used exactly; `createGame()` generates one when omitted.

```ts
const game = createGame({ mode: 'free-play', seed: 1915, world: { fronts: false, farms: true } });
game.transition('handoff');
game.transition('playing');
game.endSortie(); // future gameplay decides when the current sortie is over
// Next authored level, after the previous sortie/required objectives have finished:
game.beginSortie({ day: 1, startHour: 9, level: 2, levelId: 'first-photo', objectives: ['photograph-target'], seed: 2718, world: { fronts: true, farms: false } });
// Its gameplay system calls game.completeObjective('photograph-target') when the actual objective is met.
```

There is no campaign mode, level catalogue, authored objective content or story scripting yet; these APIs provide the state/progression contract for them.

`main.ts` creates one session, reads its state for flight gating, lighting, the watch and diagnostics, and applies transitions to audio, input and DOM controls through `syncSession`. The browser visibility event adds/removes only the visibility pause reason. New UI/mission systems should call the session API and apply the relevant presentation effects, rather than create parallel phase/day/mission variables.

### Procedural sector

- The world is a **pure function of a seed** (§3.6 of `MECHANICS.md`): `generate(seed, profile) → sector`.
- The evolving sector is saved as **seed + a list of changes** (craters, ruins, front shifts), not as full map data. Saves stay a few KB.
- Terrain is generated into **chunk images** (128×128 game px, ~15 ms each on a laptop) **in Web Workers** (`world/worker.ts`, a pool of up to 3 in `render/tilegen.ts`), so the main thread never stalls. Tiles are cached (LRU), with a prefetch ring, and the canvas fades in once the first view is complete. Ground tiles also carry a **height map**, which the cast shadow reads (O(1) per pixel). Each frame composes the visible chunks into one layer image, which is drawn rotated (§2). New craters are stamped into the affected chunk.
- While that first view is being generated, the existing straight-flight plane sprite waits at the centre of a white screen. Ground, clouds, direct sunlight, terrain shadows, cloud shadows, their surrounding prefetch rings, the HUD, and reusable sprites/buffers are prepared behind it; fly-through wisps are also prepared when the plane starts inside cloud. Once the visible layers are complete, the simulation starts immediately while controls stay locked; the loading plane eases down to the live plane and the white fades away.

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

**With the seasons** (November 2026): every date of the campaign year, measured at midday frozen, midday with the clock running (development speed, 3×), and half an hour before sunset. The frame's own JavaScript stays at 0.84–1.08 ms by day, 1.06–1.42 ms with the clock running, and 0.86–1.0 ms at dusk. What keeps it there:
- **The light overlay is repainted off the main thread** (`render/gradeworker.ts`, started with `startGradeWorker()`). The frame keeps the painting it has until the new one lands, a frame or two later; the first painting, behind the loading screen, is made at once. Around sunset it used to repaint inside the frame several times a second.
- **The haze veil's banding is worked out once per overlay size** (`hazeBands`), not per pixel on every repaint: a hazy repaint dropped from ~8.5 ms to ~1.9 ms. A check (`grade.haze.test.ts`) holds it pixel for pixel to the original.
- **The instruments and the watch repaint only when their picture changes.** An instrument compares this frame's paint with the last; the watch keys on its hands' whole-pixel positions. Most frames a needle hasn't moved a pixel. That's worth most at night, when the radium glow doubles the work.
- **The debug panel** shows each tile's main-thread cost as it arrives (`tiles in`), and a `tiles` line: the workers' time per tile and the tiles made per second, for each kind (ground, which includes the season's effects; shade; clouds).

At development speed the sun's shading tiles are re-baked at about 80–170 a second (1–4 ms each, in the workers), which is the sunlight layer's remaining cost. That's unchanged from before the seasons.

**Year sweep** (20 November 2026): the 13 sample days, each at midday frozen, midday with the clock running (3×), dusk and night, plus the Node benchmarks and a seasonal fingerprint (`npm run fingerprint` now covers all 13 days). The look stays pixel for pixel the same throughout. Found and fixed:
- **Snow at a front cost 69 ms a ground tile** (13 ms in summer): `snowLie` asks for each pixel's exact place across the front, and that searched every segment of the front's curve. `onCurve` (`world/fronts.ts`) now starts from the last pixel's segment and skips whole runs of segments by their bounding boxes, in two levels. Same answer, ties included (`fronts.nearest.test.ts` holds it to a full search): **29 ms**. The region cache's string keys became numbers.
- **Shade-tile requests joined nine tiles' heights on the main thread** (84 µs each, ~5 a frame with the clock running). The nine arrays now go to the worker as they are and are joined there (`joinHeights`): 29 µs.
- **Every arriving tile made a new canvas.** Tile layers now reuse the canvases they stop drawing (`tiles.ts`), halving a tile's arrival cost (`tiles.test.ts` checks that no reused canvas ever shows the wrong tile).
- **The compass and clinometer repainted their bezel and card every frame**: they now copy a cached face, as the dials do (164 → 27 µs and 55 → 7 µs a frame; `drawHud` 0.36 → 0.18 ms).

What's left, by stage (main thread, per frame): sunlight 0.3–0.5 ms and `tiles in` 0.15–0.3 ms while the clock runs (the sun's re-bakes, every 0.5° with a 1.5 s cross-fade: kept as they are, for the look), HUD ~0.2–0.3 ms, clouds 0.1–0.2 ms. Winter tiles still cost about twice summer's in the workers (snow lies by the pixel); that's behind the loading screen and off the main thread.

## 7. Checks & testing

- **`npm run check`**: TypeScript type-check plus small runnable checks (`*.test.ts`) using Node's built-in test runner. No test framework.
- Following Ponytail, each piece of non-trivial logic (scaling maths, RNG, clock-code snapping, world generation guarantees) gets **one** small check that fails if the logic breaks.
- World generation checks run many seeds and assert the guarantees in `MECHANICS.md` §3.6 (target reachable, landmark nearby, etc.).

### 7b. Front map (internal auditing tool)

`npm run frontmap` renders five colour maps of the fronts and their trenches over the lakes and woods, for auditing, planning and tweaking. They're always at **production front frequency** (density 2.5, as `createScene` uses outside development). It calls the game's own code (`tileStamp` in `world/generate.ts`, so the water mask and tree cover apply; `frontsNear`, `frontField` and `territoryAt` in `world/fronts.ts`; `landAt` in `world/ground.ts`), with the same per-tile features the game requests, so it shows exactly what the game generates.

- **What it maps:** by default, a **cross-section of the front at the plane's start**: a strip straight across it, centred on the start, past the furthest wall each side, 500 world px along it (`--along=N` changes that). Across runs left to right (British side left), along top to bottom, 2 image px per world px, each pixel the game's own colour (the tile's stamp, else the land; unlit), with the front's line in red. With `--whole`, **just the front at the plane's start** (`DEV.atStart`, on for development tools, puts one there), framed tightly round the part of it inside its territory, at the finest scale (8–128 world px per image px) that fits a 2,500 px image. About 2–6 s a map. With `--size`, a wide square round the start instead (many fronts; also the fallback when there's no front at the start); that takes minutes.
- **Output:** `debug/1.png` … `debug/5.png`, five random seeds (git-ignored). Each run first moves the previous run's maps to `debug/backup/`, replacing the run before that, so one regeneration can be undone and a second throws them away. It prints each map's seed, size and scale, and the start front's length.
- **Key** (`--whole`, `--size`): black = open land; dark blue = water (lakes and shores); dark green = woods and copses; grey = a front's zone (within `FRONTS.reach` of its line, the only place works appear), tinted blue or green where it lies over water or woods; light grey = no-man's land; white = anything the front stamps; a small red cross = the world origin (the plane's start).
- **Options** (after `--`):
  - `--seeds=1,2,3,4,5`: pin the seeds (up to five).
  - `--full`: the whole front (wire, craters, batteries, camps…). The default is trenches only, as the game currently draws.
  - `--style=traversed`: another trench style (default `hasty`).
  - `--size=320000`: map a wide square of this many world px round the start (scale 128, 2,500 px), instead of just the start's front. `--scale` (world px per output px; must divide 128) and `--step` (sample spacing inside an output px) override the automatic choice.
- **Sampling:** land is sampled once, at each output px's centre (so very small copses and ponds can be missed); an output px is white if any front sample in it is stamped, so thin trenches still show; a feature thinner than `--step` can slip between samples (lower `--step` to check). Tiles far from the start front's line show only the land, for speed.

---

## 8. Open technical questions

1. Pixel font: license an existing one, or draw our own?
2. Hosting: GitHub Pages, Netlify, itch.io?
3. Does the dusk lighting need WebGL, or is palette swapping plus canvas compositing enough? (Start with Canvas 2D; measure first.)

## Fast iteration (for agents and people)

See **[AGENT_TOOLS.md](AGENT_TOOLS.md)**: `npm run snap` (any patch of the world to a PNG from Node), `npm run fingerprint` (prove output unchanged), URL scenarios (`?seed= ?time= ?x= ?y= ?heading= ?speed= ?off= ?on=`), and the `archie` console API in the running game (`src/devtools.ts`).

### Offscreen voices and tooltips (implemented)

- **Voices** (`game/voices.ts`, pure; `ui/voice.ts`, the pop-up). Someone you can't see speaks: the observer in flight, and the squadron at base (the Major, the Recording Officer, the Flight Sergeant, an air mechanic, a pilot). They're roles until the cast is settled. Each speaker belongs to scenes, and a line waits for its own scene. So something said for you at base is held through a flight and spoken in the barn.
  - Higher priority goes first, `interrupt` cuts in at once, and `delay` waits.
  - Each line is typed out at its speaker's pace and held long enough to read.
  - It shows as text only, for now: a riveted name plate over a slip, dark above the instruments in flight, paper at the foot of the screen at base.
  - `voices.say({ speaker, text })` speaks. `voices.setScene('flight' | 'base')` is called on take-off and when the barn opens. In development, `archie.say(who, text, scene?)` tries a line out. The text uses the game's lettering, so no commas or apostrophes.
- **Tooltips** (`ui/tooltip.ts`): a nickel-edged plate with a name and a line or two, shown on hover, on keyboard focus, or on a long press on touch. A moving finger cancels the long press, so steering isn't affected.
  - `tips.attach(element, tip)` works for controls: the compass, the Hold switch and the things on the desk.
  - `tips.area(element, hit)` works for areas of a canvas: the instruments, hit-tested against the board's last layout.
  - Photo mode hides both.
