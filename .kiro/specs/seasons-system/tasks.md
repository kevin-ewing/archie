# Implementation Plan: Seasons System

## Overview

The design uses TypeScript, so all tasks use TypeScript. Work goes bottom-up: the pure `src/sim/` modules first (calendar, sun, climate, seasons), then the sun rewiring, then the tile look in `src/world/`, then the render and UI wiring, then overrides, fingerprint checks and docs. Every seasonal operation is the identity at `MAY_LOOK`, so each step keeps today's output until the final wiring turns seasons on. Tests sit next to the code (`*.test.ts`) and run under `npm run check` with `node --test`.

## Tasks

- [x] 1. Calendar module and test tooling
  - [x] 1.1 Add `fast-check` as a dev dependency
    - Add to `devDependencies` in `package.json` only (no runtime dependency).
    - _Requirements: 15.5, 18.1_

  - [x] 1.2 Create `src/sim/calendar.ts`
    - Export `CalDate`, `REFERENCE` (1915-05-10), `dayNumber`, `fromDayNumber`, `dateOf(clockDay, start?)`, `dayOfYear`, `parseISO`, `formatISO`, `CalendarError` (with `field`).
    - Use integer days-from-civil arithmetic; no `Date`, no wall clock. Accept negative campaign days.
    - Throw `CalendarError` naming the invalid field (including 29 February in a non-leap year).
    - _Requirements: 1.1, 1.2, 1.4, 1.6, 17.8_

  - [x] 1.3 Write property tests for the calendar
    - File `src/sim/calendar.test.ts`.
    - **Property 1: Calendar day round trip** (also compare with a `Date.UTC` reference from 10 May 1915)
    - **Validates: Requirements 1.1, 1.4, 1.5**
    - **Property 2: Day-of-year range**
    - **Validates: Requirements 1.2**
    - **Property 3: ISO date round trip**
    - **Validates: Requirements 17.8**
    - **Property 4: Invalid dates are rejected by field**
    - **Validates: Requirements 1.6**

- [x] 2. Sun times and legal time
  - [x] 2.1 Create `src/sim/sun.ts`
    - Export `LOCATION` (50.85 N, 2.88 E), `HORIZON_ALT`, `SunDay`, `sunDay(date, loc?)` (memoised on the last date), `legalOffset`, `legalHours`, `solarHours`.
    - Use the NOAA declination and equation-of-time series; sunrise and sunset at sun-centre -0.833°; clamp the `acos` argument.
    - Add the `SUMMER_TIME` table (starts 23:00 UTC 14 June 1916; 1916 end and the 1917/1918 rows marked `[VERIFY]`).
    - _Requirements: 5.1, 5.2, 5.7, 6.1, 6.2, 6.3, 6.4, 6.7_

  - [x] 2.2 Write unit tests for sun times and legal time
    - File `src/sim/sun.test.ts`.
    - Table of 12 fixed dates (both solstices, both equinoxes, 10 May 1915, 29 Feb 1916, 25 Sep 1915, 21 Jan, 21 Apr, 21 Jul, 21 Oct) with sunrise and sunset read from the NOAA calculator, tolerance 2 min.
    - Check day length on 21 Dec (7 h 56 ±10 min) and 21 Jun (16 h 31 ±10 min), noon elevation 15.7° and 62.6° ±1°, and 10 May sunset within 8 min of 19:31.
    - Check GMT at 22:59 UTC and GMT+1 at 23:00 UTC on 14 June 1916, and no offset on 10 May 1915.
    - _Requirements: 5.3, 5.4, 5.6, 6.2, 6.3, 6.7, 7.2_

  - [x] 2.3 Write property tests for sun and legal time
    - File `src/sim/sun.props.test.ts`.
    - **Property 8: Sunrise and sunset are the -0.833° crossings**
    - **Validates: Requirements 5.1, 5.2, 5.5, 5.7**
    - **Property 9: Legal time round trip**
    - **Validates: Requirements 6.1, 6.4**

- [x] 3. Rewire the sun to the date
  - [x] 3.1 Update `src/sim/daylight.ts` and its callers
    - Remove `dayOfYear(c: Clock)`, the 365-day wrap, `DAYLIGHT.latitude` and `startDayOfYear`.
    - `sunAt(day: SunDay, hours)` reads declination from the `SunDay` and adds `span`; `sunsetHour(day)` returns `day.sunset`; `horizonMinutes` reads the date's `SunDay`. Leave `shadowStrength`, `clockPace`, `strength` unchanged.
    - Update callers: `src/main.ts` (`dateText` via `dateOf`, `RANDOM_HOUR` from that date's sunset), `src/game/state.ts` (`campaignDate` via `dateOf`, keep its `natural(day)` validation), `src/story/dev.ts`, `src/perf.ts`, `src/snap.ts`.
    - Keep `Clock` and the save schema in solar time.
    - _Requirements: 1.3, 1.5, 5.5, 6.6, 7.2, 7.3, 7.5_

  - [x] 3.2 Write property test for sortie start and clock window
    - File `src/sim/daylight.test.ts`.
    - **Property 10: A sortie starts in daylight and the day fits the clock**
    - **Validates: Requirements 7.5, 7.6**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Climatology and anchors
  - [x] 5.1 Create `src/sim/climate.ts`
    - Export `NORMALS` (Lille-Lesquin monthly means, range, precipitation, wet days), `ERA_OFFSET_C`, `Anchor`, `ANCHORS` (the four rows from the design, `loos-1915` with `applies: false`), `PHENOLOGY` (bud, autumn, harvest, bloom and hay windows), `checkAnchors`.
    - Header comment gives source and unit for every row and marks non-northern-France values `[VERIFY]`.
    - Add a smooth periodic daily temperature interpolation helper.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.8_

  - [x] 5.2 Write unit tests for the climatology
    - File `src/sim/climate.test.ts`.
    - Coldest and warmest months of the daily mean curve; every row has a source and unit; non-northern-France rows carry `verify: true`.
    - `checkAnchors` accepts the shipped table and rejects an anchor with no status, naming it.
    - Static check: sources of `calendar.ts`, `sun.ts`, `climate.ts`, `seasons.ts` and `world/season.ts` contain no `Math.random`, `Date.now` or `new Date(`.
    - _Requirements: 2.6, 3.2, 3.6, 3.7, 4.8_

- [x] 6. Season_State
  - [x] 6.1 Create `src/sim/seasons.ts` core
    - Export `SeasonState`, `MAY_LOOK`, `seasonAt(date, seed)` (cached, at most 64 entries), `seasonKey`.
    - Implement year-level draws, foliage and budding, crop stages, grass, bloom and hay windows, haze, `skyBias` (0 on 10 May), the 30-day weather fold with `slew` and the 1 May to 30 Sep cap, and the 7-day reference blend with `MAY_LOOK`.
    - Use only `src/core/noise.ts` for randomness; compute each date from its own 30-day history.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.6, 4.7, 8.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.8, 10.9, 10.10, 14.1, 16.1, 16.4, 16.8_

  - [x] 6.2 Add override parsing to `src/sim/seasons.ts`
    - Export `Overrides`, `parseOverrides(search)` (pure; returns `{ overrides, problems }`) and `applyOverrides(state, overrides)`.
    - Accept `date`, `season` (21 Jan, 21 Apr, 21 Jul, 21 Oct 1915) and `snow`, `frost`, `mud`, `water`, `ice`, `foliage`, `haze` in 0 to 1; drop and report malformed values.
    - _Requirements: 17.1, 17.2, 17.3, 17.6_

  - [x] 6.3 Write property tests for purity, range and continuity
    - File `src/sim/seasons.core.test.ts`.
    - **Property 5: Season_State is a pure function of date and seed**
    - **Validates: Requirements 2.1, 2.2, 2.7, 16.8**
    - **Property 6: Season_State stays in range**
    - **Validates: Requirements 2.3**
    - **Property 7: Day-to-day continuity**
    - **Validates: Requirements 2.4, 2.5**

  - [x] 6.4 Write property tests for phenology and ground-state behaviour
    - File `src/sim/seasons.ground.test.ts`. Use few seeds and fixed year spans.
    - **Property 11: Phenology falls in its windows**
    - **Validates: Requirements 3.3, 3.4, 3.5**
    - **Property 12: Cold states are zero from May to September**
    - **Validates: Requirements 10.9**
    - **Property 13: Thaw melts snow and ice**
    - **Validates: Requirements 10.10**
    - **Property 14: Ground-state budgets**
    - **Validates: Requirements 10.8**
    - Add example tests: `mud` above the no-anchor value on 15 Dec 1914 and 10 Jan 1915; `snow > 0.1` on 24 Nov 1914; `loos-1915` has no effect.
    - _Requirements: 4.2, 4.3, 4.5_

  - [x] 6.5 Write property tests for the blend, windows, key and overrides
    - File `src/sim/seasons.blend.test.ts`.
    - **Property 15: Reference date is neutral and fades smoothly**
    - **Validates: Requirements 4.6, 15.1**
    - **Property 16: Bloom and hay windows**
    - **Validates: Requirements 9.5, 9.6**
    - **Property 22: Season key is a function of the bucketed state**
    - **Validates: Requirements 16.1, 16.3, 16.4**
    - **Property 23: Override parsing**
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.6**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. World look module
  - [x] 8.1 Export colour groups from `src/world/military.ts`
    - Export the groups `season.ts` registers (`M.mud`, wire, sandbag, trench floor tones). Exports only, no behaviour change.
    - _Requirements: 13.2, 13.3, 13.4_

  - [x] 8.2 Create `src/world/season.ts`: look, tones and leaf cover
    - Export `setLook`, `look`, `withLook` (test helper), `leafCover(species, treeId)`, `crowns(species)`, `cropTones(cropIndex)`, `grassTones(a, b)`.
    - Implement the `tone(c, target, t)` helper that returns `c` itself when `t <= 0` and interns blends otherwise.
    - Species offsets (oak +6, pale poplar/birch -6, dark elm 0) plus a per-tree offset of ±3 days from `hash(seed+530, treeCell)`.
    - Neutral look (`MAY_LOOK`) returns today's tones unchanged.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.2, 9.3, 9.4, 15.2, 15.3_

  - [x] 8.3 Add the ground-state overlay to `src/world/season.ts`
    - Export `overlay(seed, x, y, c, h, kind)` and `floodShare`. Return `c` immediately when snow, frost, mud, standingWater, ice and waterLevel are all at or below 0.05.
    - Build the `Surface` map (field, dirt, water, raised, trench floor) from colour identity, with a `ponytail:` comment on the limit.
    - Implement the per-class rules: noise-edged snow patches that grow monotonically with `snow`, dark features kept dark, frost speckle, mud tones, pool water, lake ice from the shore inward, snow on roofs by roof type, flooded trench floors, rime on wire and sandbags.
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.2, 11.3, 12.1, 12.2, 12.3, 12.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 8.4 Write property test for per-tree leaf timing
    - File `src/world/season.test.ts`.
    - **Property 17: Per-tree leaf timing**
    - **Validates: Requirements 8.3, 8.4**

- [x] 9. Apply the look in tile generation
  - [x] 9.1 Edit `src/world/ground.ts`
    - Read `SPECIES` through `crowns()`; draw crowns with `leafCover` (dither to the ground below cover 0.5, scale canopy and hedge height by cover); leaf litter below `foliage 0.3`.
    - `cropPixel` uses `cropTones`; meadow, pasture and rough grass use `grassTones`; `bloom` is multiplied by `look.s.bloom[kind]`; `haycockAt` by `look.s.hay`.
    - Call `overlay` once per pixel at the end of `groundChunk` and add the ice-glint rule (a quarter of the open-water rate).
    - Reeds test uses `waterLevel`; dry straw tones below `foliage 0.3`; shore band widens with `waterLevel` without moving open water.
    - Replace the May-only `ponytail:` note with a pointer to `sim/climate.ts`. Keep `treeAt`, `landAt`, `isWater`, `cropOf` and the exported `WATER`, `SHORE`, `DIRT`, `FLOWER` unchanged.
    - _Requirements: 8.1, 8.5, 8.6, 8.7, 8.8, 9.1, 9.5, 9.6, 9.7, 9.8, 10.2, 11.1, 11.4, 11.5, 11.6_

  - [x] 9.2 Edit `src/world/structures.ts`
    - Seasonal presence and colour of `Bit` kinds: `muck` in the spring window, `cocks` follow `hay`, `rick` and thatched stacks follow the wheat stage 4, `clamp` and `faggots` in winter, `hops` bines green from June to September, orchard blossom from `bloom.hawthorn`.
    - Plan, kind and position of every structure stay unchanged.
    - _Requirements: 12.4, 12.5_

  - [x] 9.3 Edit `src/world/generate.ts`
    - Add `season?: SeasonState` to the ground `TileRequest`; call `setLook({ ...MAY_LOOK, ...req.season })` once per request; leave `tileStamp`'s `under()` unchanged and keep the stamp priority order.
    - _Requirements: 13.7, 15.1, 15.4, 16.2_

  - [x] 9.4 Write property test for placement independence
    - File `src/world/season.placement.test.ts`.
    - **Property 18: Placement ignores the season**
    - **Validates: Requirements 8.8, 9.7, 11.6, 12.5**

  - [x] 9.5 Write property tests for overlay coverage
    - File `src/world/season.overlay.test.ts`.
    - **Property 19: Snow and flood coverage grow with their parameter**
    - **Validates: Requirements 10.2, 13.1**
    - **Property 20: Dark features stay dark under snow**
    - **Validates: Requirements 10.3, 13.3**

  - [x] 9.6 Write tile validity property test and look snapshots
    - File `src/world/season.tiles.test.ts`.
    - **Property 21: Every pixel has a valid colour on every date**
    - **Validates: Requirements 13.7, 18.2**
    - Pixel-statistics checks: 21 Jan 1916 farm tile has more than 0.2 snow-toned pixels, roofs carry snow, tracks stay dark; July has golden crop pixels and no snow; 21 Oct crowns include yellow and russet tones; 25 Dec 1914 front tile trench floors include `WATER.pool` tones.
    - Cover the five dates in 18.2.
    - _Requirements: 8.2, 9.2, 10.2, 12.1, 13.1, 18.2_

- [x] 10. Render and UI wiring
  - [x] 10.1 Edit `src/render/scene.ts`
    - Add `season: { state, key }` to `Scene`; `groundVersion` becomes `base + 8·damageVersion + 2^6·season.key`; pass `season: scene.season.state` in the ground `gen` call.
    - _Requirements: 16.2, 16.3, 16.5_

  - [x] 10.2 Edit `src/render/grade.ts`
    - `skyFor(seed, day, evening, skyBias = 0)`: `OVERCAST` threshold `0.1 + 0.2·max(0, -skyBias)`, beauty scaled by `1 - 0.15·max(0, -skyBias)`; identical at `skyBias = 0`.
    - `gradeFor(sun, sky, season?)`: use `el·sun.span` for `golden` and `blaze`; add the seasonal daylight tint.
    - Add `haze` to `Grade` and the radial glow term in `gradePixels`; `active` when `haze > 0.02`; repaint key gains `q(g.haze, 0.02)`. No new pass.
    - _Requirements: 7.1, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 10.3 Edit `src/main.ts` and `src/ui/clock.ts` wiring
    - `currentSeason()` recomputes `seasonAt` when `dateOf(state.clock.day)` changes and writes `scene.season`; pass `skyBias` and `haze` to the grade.
    - Pass legal hours (`legalHours`) for the watch time and its sunset mark; keep `Clock.hours` and saves in solar time. `drawClock` and `watchPx` stay unchanged.
    - Confirm `world/lights.ts` offsets use the date's sunset (no change expected).
    - _Requirements: 6.5, 6.6, 7.1, 7.4, 16.1_

  - [x] 10.4 Write tests for the grade
    - Extend `src/render/grade.test.ts` (or create it).
    - **Property 24: Winter evenings are plainer**
    - **Validates: Requirements 14.1, 14.2**
    - With `skyBias = 0`, `haze = 0`, `span = 1`, `gradeFor` equals the current output for three stored suns; `haze = 0.5` changes only the glow pass.
    - _Requirements: 14.1, 14.3, 14.4_

- [x] 11. Debug overrides
  - [x] 11.1 Wire overrides in `src/main.ts`, `src/devtools.ts` and `src/snap.ts`
    - `main.ts` reads `parseOverrides(location.search)` only when `IS_DEV || ?debug`, applies them after `seasonAt`, and `console.warn`s the `problems`. `?date=` sets the date at which `clock.day` is 0.
    - `devtools.ts`: `archie.date(iso?)`, `archie.season(name?)`, `archie.seasonParam(name, value?)` (throw `Error` with valid names or range; each awaits `archie.ready()`), `archie.date(null)` clears all; `archie.state()` gains `date`, `season`, `overridden`.
    - `snap.ts`: accept `--date= --season= --snow= ...` and pass `season` to `generateTile`.
    - Overrides are never written to a save.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.9_

- [x] 12. Fingerprint, fuzz and docs
  - [x] 12.1 Add fingerprint and stamp fuzz checks
    - Test that fingerprint tiles generated with explicit `MAY_LOOK` and with no season hash identically.
    - Extend the `stamps.test.ts` fuzz loop to run for five dates.
    - Add a save-schema test confirming no season or override field is stored, and a `groundVersion` test that includes the season key.
    - _Requirements: 13.7, 15.1, 16.3, 17.7, 18.3_

  - [x] 12.2 Update repo docs
    - `docs/MECHANICS.md` §3.6 (remove "Seasons are not modelled yet"); `docs/TECH.md` (module list, daylight and grade rows, "Change date / latitude" note, sunset 19:37); `docs/AGENT_TOOLS.md` (URL parameters, console calls); `docs/HISTORICAL_RESEARCH.md` (Seasons section with sources, limits and every unsupported claim marked **[VERIFY]**).
    - _Requirements: 3.1, 3.7, 4.2, 18.4, 18.5_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation.
- Property tests validate universal correctness properties; unit and snapshot tests validate fixed dates and looks.
- Design departures listed under "Requirement notes" in design.md (5.4, 5.6, 7.6, 9.6, 4.7, 17.1) are assumed accepted.
- Run `npm run fingerprint` after tasks 9.1 to 9.3 to confirm output is IDENTICAL at `MAY_LOOK`. Run `npm run benchmark:check` yourself after task 9.3, since requirements 16.6 and 16.7 are measured, not coded.
- NOAA reference values for the 12 sun dates must be read from the NOAA calculator when task 2.2 is written.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "8.1"] },
    { "id": 1, "tasks": ["1.3", "2.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "5.2", "6.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "6.2", "6.3", "6.4", "8.2", "10.1", "10.2"] },
    { "id": 4, "tasks": ["6.5", "8.3", "8.4", "10.3", "10.4"] },
    { "id": 5, "tasks": ["9.1", "9.2", "11.1"] },
    { "id": 6, "tasks": ["9.3"] },
    { "id": 7, "tasks": ["9.4", "9.5", "9.6", "12.1", "12.2"] }
  ]
}
```
