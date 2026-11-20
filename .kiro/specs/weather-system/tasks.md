# Implementation Plan: Weather System

## Overview

Implementation is TypeScript, matching the existing code base and the design. Property tests use `fast-check` with `node:test`, as in `seasons.core.test.ts`. Order: pure simulation first, then golden hashes of today's cloud tiles, then cloud plumbing, Grade changes, the particle model and layer, game state, wiring, benchmarks, docs, and a final verify. Ground tiles, `tiles.ts`, `save.ts`, `seasons.ts` and `flight.ts` are never edited.

## Tasks

- [x] 1. Pure weather simulation
  - [x] 1.1 Create `src/sim/weather.ts`
    - Types `WeatherKind`, `Precipitation`, `WeatherState`; constants `COVER_KEYS`, `NEUTRAL_KEY`, `NEUTRAL_COVER`; `coverOfKey`, `keyOfCover`
    - `weatherAt`, `weatherAtDay`, `clearWeatherCache` with day-schedule cache (16) and period-target cache (32)
    - Day spells (showery March to September, steady October to February), intensity envelope, cover base plus 0.8125 rain floor, 10-minute cell `coverKey`, kind derivation
    - `RangeError` naming `date` or `hours` on bad input; read `weatherDay` read-only; use `core/noise` only
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7, 1.8, 2.1, 2.2, 2.4, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 3.1, 3.2, 3.3, 3.4, 3.7, 5.8, 5.11, 5.12, 11.1, 11.2, 14.5, 14.6_

  - [x] 1.2 Write property tests for purity, ranges, validation and seeds in `src/sim/weather.test.ts`
    - **Property 1: Weather_State is a pure function of seed, date and time**
    - **Property 2: Every state field is finite and in range**
    - **Property 3: Invalid input is rejected by name**
    - **Property 4: Different seeds give different weather**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 3.1, 3.5, 3.6, 3.7, 5.11, 13.9**

  - [x] 1.3 Write property tests for the daily model, showers and intensity in `src/sim/weather.test.ts`
    - **Property 5: Precipitation follows the Daily_Model**
    - **Property 6: No snow from 1 May to 30 September**
    - **Property 7: Seasonal frequencies follow the climate** (fixed seed sample, at least 20 years)
    - **Property 8: Showers are short and separated**
    - **Property 9: Steady months have a long spell**
    - **Property 10: Intensity does not decrease with rain amount**
    - Example test: 22 November 1914 snows at peak 1
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11**

  - [x] 1.4 Write property tests for continuity, rain cover floor, key grid and seasons isolation in `src/sim/weather.test.ts`
    - **Property 11: Weather changes smoothly, including across midnight**
    - **Property 12: Rain never falls from a clear sky**
    - **Property 13: The cover key changes only on 10-minute grid lines**
    - **Property 16: Weather never changes the seasons**
    - **Validates: Requirements 3.2, 3.3, 3.4, 4.1, 4.6, 4.7, 5.8, 5.12**

  - [x] 1.5 Create `src/sim/weatherset.ts`
    - `WeatherSetting`, `WeatherOverride`, `WeatherSource`, `DEFAULTS` (rain 0.6, snow 0.5)
    - `readWeatherSetting`, `readWeatherSeed` (errors name the field), `parseWeatherOverrides` (mirror `parseOverrides` in `seasons.ts`), `formatWeatherSetting`, `applyWeather`, `resolveWeather` (override, then setting, then generated)
    - _Requirements: 12.1, 12.4, 12.5, 12.6, 12.7, 12.8, 12.10, 13.3, 13.4, 13.5, 15.3_

  - [x] 1.6 Write property tests in `src/sim/weatherset.test.ts`
    - **Property 17: Weather settings survive formatting and parsing** (1,000 or more, fixed seed, every kind)
    - **Property 18: Bad override values are dropped and reported once each**
    - **Property 19: Overrides win, then game settings, then generated weather**
    - Example test: default intensities 0.6 and 0.5
    - **Validates: Requirements 12.1, 12.4, 12.5, 12.6, 12.7, 12.8, 12.10, 13.3, 13.4, 15.3**

- [~] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Cloud cover plumbing
  - [x] 3.1 Record golden hashes of today's cloud tiles in `src/world/clouds.test.ts`
    - Do this before any change to `clouds.ts`: SHA-256 of `cloudChunk` and `cloudShadowChunk` for 12 fixed `(seed, cx, cy)` triples from the unmodified code
    - _Requirements: 5.2, 15.4_

  - [x] 3.2 Change `src/world/clouds.ts` to take a cover
    - Add `THRESHOLDS` table and `coverThreshold(cover)` (linear between bucket centres, exact at centres)
    - `cloudLevel(seed, x, y, cover = NEUTRAL_COVER)`, `cloudChunk` and `cloudShadowChunk` take a cover; threshold computed once per tile
    - No other change to shapes, noise, warp or dither
    - _Requirements: 5.1, 5.2, 5.7, 5.13, 13.11_

  - [x] 3.3 Write tests in `src/world/clouds.test.ts`
    - **Property 14: The neutral bucket reproduces today's clouds**
    - **Property 15: Cloud share rises with cover, and the extremes hold** (16 fixed seeds, 256 by 256 lattice at stride 16)
    - Unit test: every threshold is below 1; absent `coverKey` means Neutral
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 15.4**

  - [x] 3.4 Add `coverKey` to the clouds `TileRequest` in `src/world/generate.ts`
    - Optional `coverKey`; `generateTile` calls `cloudChunk` and `cloudShadowChunk` with `coverOfKey(req.coverKey ?? NEUTRAL_KEY)`
    - Ground request variants unchanged
    - _Requirements: 5.9, 11.8, 4.2_

- [x] 4. Grade changes
  - [x] 4.1 Update `src/render/grade.ts`
    - Add `GradeWeather`, optional fourth argument to `gradeFor`, `sunSide()`, `RAIN_COLOUR`, `SNOW_COLOUR`
    - Scale `glowAlpha` and `rays` by `1 - 0.75·clamp01(exc + intensity)`; raise `haze` by `0.35·intensity` within 0 to 0.6; leave `near`, `far`, `tintAlpha`, `night`, `cloud` untouched
    - Omitted argument returns today's Grade
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.8, 9.17, 14.3_

  - [x] 4.2 Write tests in `src/render/grade.weather.test.ts`
    - **Property 26: The Grade reduces glow in proportion to weather and nothing else**
    - **Property 30: The sun-side helper is the Grade's own mapping**
    - Existing `grade.test.ts` and `grade.haze.test.ts` must pass unchanged
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.8, 9.15, 9.18**

- [x] 5. Scene wiring
  - [x] 5.1 Update `src/render/scene.ts`
    - Add `scene.weather` (default Neutral state) and `scene.sunScreen`
    - The four cloud layers pass `coverKey` in requests and `version`/`fadeMs` (`COVER_FADE_MS = 3000`); `inCloud` uses `coverOfKey(scene.weather.coverKey)`
    - Pass `{cover, intensity}` to `gradeFor`; ground, sunlight layers do not read weather
    - _Requirements: 4.2, 4.8, 5.6, 5.9, 5.10, 9.2, 9.9, 11.12, 11.13_

- [~] 6. Checkpoint - Ensure all tests pass
  - Run `npm run check` and `npm run fingerprint`; ground output must be unchanged. Ask the user if questions arise.

- [x] 7. Particle model and light of the hour
  - [x] 7.1 Create `src/render/precipmodel.ts`
    - Counts, lengths, speeds, direction easing, shared offset, effect time `dt`, fades with seeded thinning, lens droplets, area budget, 600 cap, reduced-motion factor, intensity clamp
    - Preallocated typed arrays for pixel lists; four sprite alpha levels with Bayer taper
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.3, 8.4, 8.10, 11.4, 11.5, 14.1, 14.2_

  - [x] 7.2 Write property tests in `src/render/precipmodel.test.ts`
    - **Property 21: Particle counts, sizes and speeds follow intensity and stay in budget**
    - **Property 22: Streak direction follows the flight path and eases**
    - **Property 23: The same inputs give the same frame, and pause freezes it**
    - **Property 24: Fades are gradual and complementary**
    - **Property 25: Lens droplets obey the intensity gate and the 3-second life**
    - Example test: reduced motion halves count and speed
    - **Validates: Requirements 6.1 to 6.11, 7.1 to 7.8, 8.3, 8.10, 11.5**

  - [x] 7.3 Create `src/render/preciptint.ts` (Hour_Tint and Sun_Glow)
    - `particleColour(grade, kind, f)`: tint from `near`/`far`/`tintAlpha`/`night`, glow from `glow`/`glowAlpha`, `f^1.6` weighting, five sun-side bands; colour only, never alpha
    - Colour constants come from `grade.ts`; no colour literals here
    - _Requirements: 9.6, 9.7, 9.10, 9.12, 9.13, 9.14, 9.15, 9.16, 9.17, 9.18, 9.19, 9.20, 9.21, 14.3_

  - [x] 7.4 Write property tests in `src/render/preciptint.test.ts`
    - **Property 27: Particles are lit by the hour, at every hour, whatever the cover**
    - **Property 28: Sun_Glow lights the sun side, starts and ends smoothly, never touches alpha**
    - **Property 29: Particle colours change continuously through sunrise, sunset and twilight**
    - Cover every palette in `PALETTES`, both kinds, both Sun_Windows, twilight, night, covers 9/16 and 1
    - **Validates: Requirements 9.7, 9.10, 9.12 to 9.21**

- [x] 8. Precipitation canvas layer
  - [x] 8.1 Add the `#weather` canvas in `src/render/display.ts` and `index.html`
    - Create after `#hud-glow` inside `try`/`catch`; `display.precip` is null on failure; size in `resize()`; smoothing off
    - Add `#weather` to the `pointer-events: none` CSS rule; `aria-hidden="true"`, no tab stop
    - _Requirements: 8.1, 8.9, 8.12_

  - [x] 8.2 Create `src/render/precip.ts`
    - `createPrecipLayer(reducedMotion)` with `draw(frame)` and `hide()`
    - Bucket pixels by band and alpha level, one `fillStyle` per bucket, `fillRect` at whole game pixels, style cache keyed by quantised tint
    - Alpha halved over `boardRects`; return before touching the context when idle; keep last Grade and `sunScreen`; null context is a no-op
    - _Requirements: 8.2, 8.4, 8.5, 8.6, 8.7, 8.8, 8.11, 8.12, 9.11, 9.22, 10.2, 10.7, 11.3, 11.4, 14.1, 14.7_

  - [x] 8.3 Write example tests in `src/render/precip.test.ts` with a recording 2D context
    - Hidden phases draw 0 calls; null context; no full-screen call; integer coordinates; smoothing off; only `fillRect`; four alpha levels; board alpha cap; no allocation across frames; weather and plane objects not mutated
    - _Requirements: 8.2, 8.4, 8.5, 8.6, 8.7, 8.12, 10.2, 11.3, 11.4, 14.1, 14.2, 14.7_

- [x] 9. Game state
  - [x] 9.1 Update `src/game/state.ts`
    - Add `weatherSeed` and `weather` to `Data`; accept in `createGame` and `SortieSetup` (`undefined` keeps, `null` clears); validate before any mutation
    - `restoreGame` accepts snapshots without the fields; export `weatherSeedOf`; version stays 2; `save.ts` untouched
    - _Requirements: 13.1, 13.2, 13.3, 13.5, 13.6, 13.7, 13.8, 13.10_

  - [x] 9.2 Write property test in `src/game/state.test.ts`
    - **Property 20: Game state accepts good weather fields, rejects bad ones, restores exactly**
    - Example test: a snapshot without weather fields restores with no setting
    - **Validates: Requirements 13.1, 13.2, 13.5, 13.6, 13.7**

- [ ] 10. Wiring and developer controls
  - [-] 10.1 Wire `src/main.ts`
    - Parse overrides only in dev or `?debug` and warn per problem; call `resolveWeather` each frame before `drawScene`; on throw keep the previous state and warn once
    - Call `precip.draw` in `try`/`catch` with a `weather` profiler stage; `precip.hide()` on landing, desk and loading; landing page uses the day's cover with no precipitation
    - _Requirements: 3.7, 9.21, 10.4, 10.5, 10.7, 12.1, 12.5, 12.11, 13.4, 8.6_

  - [~] 10.2 Update `src/devtools.ts`
    - `archie.weather`, `archie.cloud`, `archie.weatherSeed`; `DevHooks.weather` and `setWeatherOverride`; `state()` fields; debug panel `weather` line; include `#weather` in `snapshot`, `photo` and `hideForPhoto`; update `HELP` and the `URL:` line
    - Bad arguments are ignored with one warning each and earlier valid overrides kept
    - _Requirements: 12.2, 12.3, 12.5, 12.9, 12.10, 12.11, 12.12, 12.13_

  - [~] 10.3 Extend `src/devtools.test.ts`
    - `archie.weather`, `cloud`, `weatherSeed`, `state()` fields, help text and URL line
    - _Requirements: 12.2, 12.3, 12.5, 12.12, 12.13_

  - [~] 10.4 Write `src/weather.isolation.test.ts`
    - Source checks: weather modules import no `render/`, `world/` or DOM and no `Math.random` or `Date`; `seasons.ts`, `tiles.ts`, `save.ts`, `flight.ts` and ground modules import no weather module; new render modules have no colour literals; runtime dependencies unchanged; ground `TileRequest` has no weather field
    - Add a ground-tile check that output is identical for every Weather_Kind
    - _Requirements: 1.4, 1.7, 4.2, 4.3, 4.5, 10.1, 10.3, 13.8, 14.3, 14.4, 15.1, 15.5_

- [~] 11. Checkpoint - Ensure all tests pass
  - Run `npm run check` and `npm run fingerprint`. Ask the user if questions arise.

- [ ] 12. Benchmarks
  - [x] 12.1 Add entries to `src/perf.ts`
    - `weather` (365 cold daily calls), `precip` (600 model frames, rain then snow), `cloudDense` (key 7), `cloudSparse` (key 0)
    - Extend `--check` so `cloudDense` and `cloudSparse` medians are at most 110% of `clouds` in the same run (15 interleaved runs)
    - _Requirements: 11.8, 11.9, 11.10, 11.11_

  - [~] 12.2 Hand-merge the four new entries into `benchmarks/performance.json`
    - Run `npm run benchmark -- --json`, copy only the four new entries; do not run `benchmark:update`
    - _Requirements: 11.10, 11.11_

- [ ] 13. Documentation
  - [~] 13.1 Update docs
    - `docs/MECHANICS.md` §3.6 and §8.3, the Limits line of `docs/HISTORICAL_RESEARCH.md`, and the Seasons row plus a new Weather row in `docs/TECH.md` describe the weather now drawn
    - `docs/AGENT_TOOLS.md` lists each new console call, URL parameter and debug-panel line; keep unverified climate claims marked **[VERIFY]**
    - _Requirements: 15.7, 15.8_

  - [~] 13.2 Add a superseded-by note to `.kiro/specs/seasons-system` requirements
    - Note only that requirements 14.5 and 14.6 are superseded by this feature for clouds and live weather; no other change
    - _Requirements: 15.9_

- [~] 14. Final checkpoint - Run `npm run verify`
  - `npm run verify` (check, benchmark:check, build) must exit 0 and `npm run fingerprint` must match. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Task 3.1 must run before any edit to `clouds.ts`
- The `LEAN` sign in the streak direction (design decision 8) is settled by a screenshot during task 8.2
- Property tests validate universal correctness properties; unit and example tests cover wiring and structure

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "4.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "1.5", "3.2", "4.2", "7.2", "7.3", "8.1"] },
    { "id": 2, "tasks": ["1.3", "1.6", "3.3", "3.4", "7.4", "8.2", "9.1"] },
    { "id": 3, "tasks": ["1.4", "5.1", "8.3", "9.2", "12.1"] },
    { "id": 4, "tasks": ["10.1"] },
    { "id": 5, "tasks": ["10.2", "10.4"] },
    { "id": 6, "tasks": ["10.3", "12.2", "13.1", "13.2"] }
  ]
}
```
