# Agent tools: see what your change does, fast

Everything here exists so an agent (or a person) can change code and see the effect in seconds, as data
where possible, without asking anyone. Read this once before working on the world, rendering or
performance. Commands run from the repo root.

## Pick the right tool

| You changed… | Look with | Time |
|---|---|---|
| World generation (landscape, farms, front, colours, stamps) | `npm run snap` → open the PNG | ~1 s |
| Anything that must **not** change the look (refactor, optimisation) | `npm run fingerprint -- --save` before, `npm run fingerprint` after | ~5 s |
| Where fronts go, their trenches, over lakes and woods | `npm run frontmap` | ~10–60 s |
| Rendering, lighting, clouds, grade, HUD, frame timings | the running game + the `archie` console API | live |
| Logic | `npm run check` (types + tests) | ~30 s |
| Speed of subsystems (tile generation, sim) | `npm run benchmark:check` | ~30 s |
| Before you finish | `npm run verify` (check + benchmark:check + build) | ~1 min |

`debug/` is git-ignored: every tool writes its images and saved data there.

## Node tools (no browser)

### `npm run snap`: any patch of the world as a PNG

It renders ground tiles exactly as the game generates them: the landscape, farms and the front, from
`src/world/generate.ts`. It can add the sun's shading layer. It does not draw clouds, the plane, the
evening grade or the HUD; for those, use `archie.snapshot()` in the browser.

```
npm run snap                                  one screen (512×384 world px) round the plane's start, ×2 → debug/snap.png
npm run snap -- --x=1500 --y=-800             centred on a world point
npm run snap -- --front=4000,-300             centred on the start's front: s px along it, u px across (+ = German side)
npm run snap -- --w=2000 --h=1500 --zoom=1    a wider area, 1 image px per world px
npm run snap -- --hour=18.5                   lit by the sun at that solar hour (shadows, relief)
npm run snap -- --features=structures,military,full,frontLine --style=traversed --density=2.5 --seed=42
npm run snap -- --out=debug/before.png        choose the file (compare before/after images)
```

- **Features:** `structures` (farms), `military` (the front), `full` (all the front's works, not only
  trenches), `frontLine` (the front's centre line in red).
- **Defaults:** `structures,military`, hasty trenches only, density 10, a front through the start, seed
  1915. That matches what development plays.
- It prints the file, the area and the time taken. Open the PNG to look at it (agents: read the image file).

### `npm run fingerprint`: prove the output didn't change

It hashes about 400 ground tiles (pixels and heights) in five configurations: landscape only, farms,
the front (hasty, dev), the front (traversed, everything) and the front at production density. The
tiles cover the start's front, farmland and far countryside.

```
npm run fingerprint -- --save   BEFORE the change: record (debug/fingerprint.json)
npm run fingerprint             AFTER: "identical" per configuration, or "CHANGED n/N tiles, e.g. at world (x, y)…"
```

- It exits with code 1 on any change.
- If a change was *meant* to alter the look, snap the reported positions (`--x= --y=`) to see what moved.
- Re-run `--save` whenever you accept a new look.

### `npm run frontmap`: maps of the fronts

See the header of `src/frontmap.ts` for options. It writes `debug/1.png`…`debug/5.png` (five seeds),
keeping the previous run in `debug/backup/`.

### `npm run check`, `npm run benchmark:check`, `npm run verify`

- `check`: `tsc` plus every `src/**/*.test.ts`. Non-trivial logic must ship with a check there (see CLAUDE.md).
- `benchmark:check`: subsystem timings against `benchmarks/performance.json`; it fails on a >50% regression.
- `verify`: everything, plus the production build.

## The running game

### Starting it and reaching it

- Kevin runs `npm run dev` (Vite). The address is printed as `Local: http://localhost:PORT/`. It's often
  5174 if 5173 is taken; ask for it if you can't find it.
- Claude's built-in browser: call `request_access` for that exact origin (for example
  `http://localhost:5174`), then navigate. `127.0.0.1` and `localhost` count as different sites.
- Development auto-launches: no click is needed, and the game starts once the first tiles are ready.
  Wait for `window.archie` to exist.
- A production build (`npm run build`, `npm run preview`) exposes the same API only with `?debug`.
- Timings are only meaningful with the tab **visible**. A hidden tab pauses the game, and a hidden
  browser pane runs as a background page.
- Vite hot-reloads on every save, which restarts the game. Wait for `archie` again, then
  `await archie.ready()`.

### URL scenarios: reload straight into a situation

| Parameter | Effect |
|---|---|
| `?seed=123` | Which world. Random each run otherwise. |
| `?time=18.9` | Solar hour to start at (development otherwise starts at 7:00). |
| `?speed=0` | Clock speed override (0 freezes time; 40 races it). |
| `?x=1500&y=-800` | Plane start position, in world px. |
| `?heading=90` | Plane start heading, in degrees (0 = north, 90 = east). |
| `?off=frontLines,fastPlane` / `?on=structures` | Set debug toggles (ids below). |
| `?trench=traversed` | Trench style (`hasty` or `traversed`). |
| `?debug` | Profiler overlay and the `archie` API in a production build. |

Example: `http://localhost:5174/?seed=1915&time=18.9&speed=0&x=1500&y=-800&heading=90&off=frontLines`

### `archie`: the console API (development, or `?debug`)

From the browser console, or an agent's JavaScript-in-page tool. `archie.help()` prints this list.

| Call | Returns / does |
|---|---|
| `archie.state()` | `{ seed, phase, day, hours, speed, plane: { x, y, headingDeg, speed, bank }, sun: { elevationDeg, azimuthDeg, strength }, features, toggles: { id: on }, view: { w, h, scale, devW, devH } }` |
| `await archie.stats(ms = 1000)` | Timings over the next `ms`: `{ frames, fps, work: { mean, p95, max }, stages: { ground, sunlight, plane, clouds, grade, hud }, drops }`, in ms per frame. `work` is the game's own JavaScript time per frame. |
| `archie.time(hours)` | Set the solar time (0–24). |
| `archie.speed(k)` | Clock speed override: `0` freezes, `null` returns to the toggles (FAST TIME = 3×). |
| `archie.goto(x, y, deg?)` | Move the plane and camera to a world point, optionally with a heading. |
| `archie.toggle(id, on?)` | Flip (or set) a debug toggle. Returns its new state. |
| `await archie.ready(timeoutMs = 10000)` | Resolves `true` once every visible tile has been generated for 10 frames in a row (`false` on timeout). Call it after `goto`, `time`, toggles or a reload, before you look or measure. |
| `archie.snapshot()` | The current frame (game + HUD) as a PNG data URL, at device resolution. |

**Toggle ids:**

| Id | Button | Default |
|---|---|---|
| `fastPlane` | FAST PLANE | on in dev |
| `fastTime` | FAST TIME | on in dev |
| `structures` | BUILDINGS | |
| `military` | FRONT | |
| `frontLines` | FRONT LINES | |

**Profiler stages,** in draw order: `ground` (the composed ground tiles), `sunlight` (shadows, sparkle,
the plane's shadow, cloud shadows), `plane`, `clouds` (all cloud layers and their tint), `grade` (the
light of the hour), `hud` (everything after the world: lamps, dials, toggles, watch).

### Recipes

Measure a moment (for example dusk at a spot), with nothing else changing:

```js
archie.speed(0); archie.time(18.9); archie.goto(1500, -800, 90);
await archie.ready();
await archie.stats(2000)   // → { fps, work: { mean, p95, max }, stages: {...}, drops }
```

Compare a setting on and off:

```js
const on = await archie.stats(1500);
archie.toggle('structures', false); await archie.ready();
const off = await archie.stats(1500);
```

Look at the result: `archie.snapshot()` returns a data URL, or take a browser screenshot after
`await archie.ready()`.

Find where frame time goes inside a stage: add `f.prof.mark('name')` calls temporarily, between the
existing marks in `src/render/scene.ts` (or in `src/main.ts` for the HUD). The new stage appears in
`archie.stats().stages` and in the overlay. Remove them when you're done.

## Gotchas

- **Shared settings.** `DEV` (`src/world/settings.ts`) holds per-request world settings. It's set for
  every tile request in `generateTile` / `tileStamp`. A Node script that calls world functions directly
  (`frontsNear`, `structuresNear`, `landAt`…) must set `DEV.density`, `DEV.fronts` and `DEV.atStart`
  first, or it sees a different world from the game. `snap` and `fingerprint` already do this.
- **Development density.** Dev packs farms and fronts 10× closer (`createScene(SEED, 10)`); production
  uses 2.5. A front always runs through the start in development (`DEV.atStart`).
- **Layer order.** The front plan comes first, then the landscape, then farms, then stamps. A layer
  reads only earlier layers (CLAUDE.md). The tools show the real layered result.
- **Seeing a change.** Tiles are generated in Web Workers and cached. After changing world code, reload
  the page (Vite does it on save), then `await archie.ready()`.
- **Performance numbers.** Compare with the same scenario (seed, place, hour, toggles, clock speed) and
  the tab visible. Run-to-run noise is around ±0.1–0.2 ms per frame, so take `stats()` over 1–2 s.


### Session state debugging

`archie.state()` includes level, mission, sortie start/current calendar time and active elapsed seconds alongside existing aircraft/render diagnostics. `archie.pause()` and `archie.resume()` control the user pause reason; hiding/showing the tab is independent. `archie.session()` returns a detached versioned session checkpoint for inspection. It is metadata, not a full aircraft/world save, and does not write browser storage. `archie.time(hours)` now updates time through the session owner without changing the sortie start time. See `game/state.ts` and the session-state section of `TECH.md` for mission and next-sortie APIs.


Mode/world configuration: `archie.session()` now exposes `mode: 'free-play'`, `world` (fronts/farms/front markers, density, placement and trench style), and `levelProgress` (stable level ID and objective completion). Existing `archie.toggle('military', false)` / `toggle('structures', false)` update the game controller and renderer together. For a pinned startup use `?seed=1915&off=military,structures`; flags are respected in production as well. Controller APIs accept per-sortie seed/world overrides for future level definitions; switching geometry/seed requires rebuilding the scene as described in `TECH.md`.
