# Requirements Document

## Introduction

Archie has a calendar, a real sun and a Seasons System (`src/sim/seasons.ts`), but no live weather. `docs/MECHANICS.md` §3.6 and `.kiro/specs/seasons-system` (requirements 14.5 and 14.6) say so outright: no falling rain or snow, and the cloud decks never change with the date. The cloud density is one constant, `COVER = 0.7`, inside `cloudLevel` in `src/world/clouds.ts`. Seasons already runs a hidden daily weather model (`weatherDay` in `src/sim/seasons.ts`: temperature, minimum temperature and a rain amount, built from Lille normals and the 1914–16 anchors). That model only feeds the ground states (snow, mud, standing water) and is never shown.

This feature adds a **Weather System**: a pure, deterministic function from a weather seed, a calendar date and a time of day to a Weather_State. The Weather_State does two things, and only two:

1. It sets the **amount of cloud** by changing the density of the cloud layers that already exist (the low deck, the fly-through wisps, the high deck and the cloud shadows). No cloud layer is added.
2. It drives **screen effects** for rain and snow, drawn on a canvas stacked above the HUD. The light of the hour always acts on those screen effects: at sunrise, at sunset and in the twilight either side, rain and snow take the warm gold, pink and red near the sun and the cool blue of dusk and pre-dawn from the Grade, and the sun-side glow lights the particles on that side of the screen.

Weather never changes terrain, ground tiles, the Season_State, the flight model, the clock or the sun's times.

Out of scope: wind that moves the plane, turbulence, fog, lightning and thunder, weather audio, forecasts in the story, and any change to the ground states beyond what Seasons already does.

### Assumptions

These were chosen without further questions. Each can be revised before design.

- **A1. One source of wetness.** Precipitation falls on exactly the days the Seasons daily model calls wet (`weatherDay(n, seed).rain > 0`), as rain when that day's temperature is at least 1.5 °C and as snow below it (the threshold `stepGround` already uses). The ground's mud and snow and the sky then agree: it snows on a day the snow lies. The Weather_System reads this model; Seasons does not read the Weather_System.
- **A2. Frequencies come from climate, not from the examples in the request.** "More snow in winter, more rain in spring" is read as "the odds follow the season". Frequency comes from the Lille-Lesquin normals already in `src/sim/climate.ts` (about 9 to 13 wet days a month, the most in November to January). Spring gets its own character instead: showers that are shorter, lighter and more broken by clear spells than the long steady rain of autumn and winter. Snow needs cold, so it is common only from December to February. All frequencies are tuning values, **[VERIFY]** against northern-France sources.
- **A3. Time of day.** A Weather_Period is 3 solar hours (tuning value, fixed in design). Weather moves between periods by easing, never by cutting.
- **A4. Cloud cover is a dial on existing clouds.** The Neutral_Cover reproduces today's `COVER = 0.7` look exactly. Clear skies are sparser than today and overcast skies are denser. A clear sky is not forced to zero clouds.
- **A5. Default on.** Generated weather is on in every build. Only the overrides are limited to development and `?debug`, as the seasons overrides are.
- **A6. Landing page.** The landing page's terrain window shows the day's cloud cover (so its cloud tiles are the ones the flight uses) and no precipitation.
- **A7. Historical claims** stay marked **[VERIFY]** until a source is checked, as `CLAUDE.md` requires.

## Glossary

- **Weather_System**: the new pure module `src/sim/weather.ts` (no DOM, no rendering state) that turns a Weather_Seed, a Calendar_Date and a Solar_Time into a Weather_State.
- **Weather_State**: the record the Weather_System returns: `kind`, `precipitation` (`none`, `rain` or `snow`), `intensity` (0 to 1), `cloudCover` (0 to 1) and `coverKey` (an integer bucket of `cloudCover`).
- **Weather_Kind**: one of `clear`, `cloudy`, `overcast`, `rain`, `snow`. `rain` and `snow` imply `precipitation` of the same name.
- **Weather_Period**: one fixed span of game time (A3) for which the Weather_System draws one target Weather_State; neighbouring periods are blended.
- **Weather_Seed**: the integer that makes weather repeatable. It defaults to the world seed and can be set apart from it.
- **Calendar_Date**, **Campaign_Day**, **Solar_Time**: as defined by the Seasons System (`src/sim/calendar.ts`, `Clock.hours` in `src/sim/daylight.ts`).
- **Seasons_System**: the existing module `src/sim/seasons.ts`, including `weatherDay`, `seasonAt` and `SeasonState`.
- **Daily_Model**: `weatherDay` in `src/sim/seasons.ts`: the hidden per-day temperature and rain amount.
- **Cloud_Field**: the existing cloud layers: low clouds, fly-through wisps, high deck and cloud shadows, all built from `cloudLevel` in `src/world/clouds.ts`.
- **Cloud_Cover**: the 0 to 1 control the Weather_System sets for the Cloud_Field.
- **Neutral_Cover**: the Cloud_Cover at which the Cloud_Field is exactly today's (`COVER = 0.7`).
- **Precipitation_Layer**: the new transparent canvas stacked above the HUD and glow canvases (`src/render/display.ts`) on which rain and snow effects are drawn.
- **Grade**: the light of the hour (`gradeFor`, `drawGrade`, `drawCloudTint` in `src/render/grade.ts`), including the sunrise and sunset colours, the glow and light shafts, and twilight dimming.
- **Sun_Window**: the span from 45 game minutes before to 45 game minutes after sunrise, and the same span around sunset, on a given day. Twilight is the Solar_Time between the start of civil dawn and sunrise, and between sunset and the end of civil dusk, as the Grade already defines them.
- **Hour_Tint**: the colour the Grade gives to the light at a given Solar_Time (warm gold, pink or red near the sun, cool blue at dusk and pre-dawn, dim at night), as applied to particles by the Precipitation_Layer.
- **Sun_Side**: the half of the screen nearer to the on-screen sun direction that the Grade uses for its glow and light shafts.
- **Sun_Glow**: the bounded brightening or warm rim that the sunrise or sunset glow adds to particles on the Sun_Side.
- **Weather_Override**: a development control that replaces generated weather (URL parameters and the `archie` console API); available only in development and `?debug`.
- **Weather_Setting**: a weather instruction stored in the game state (`src/game/state.ts`), honoured in every build.
- **Tile_Layer**: `createTileLayer` in `src/render/tiles.ts`, with its per-tile `version` and cross-fade (`fadeMs`).
- **Fingerprint**: the output of `npm run fingerprint`.
- **Benchmark_Suite**: `src/perf.ts`, run by `npm run benchmark:check` against `benchmarks/performance.json`.
- **Flying_Mode**: the in-flight scene drawn by `src/render/scene.ts`.

## Requirements

### Requirement 1: A pure, repeatable Weather_State

**User Story:** As a developer, I want the weather to be a pure function of seed, date and hour, so that any weather can be reproduced exactly.

#### Acceptance Criteria

1. THE Weather_System SHALL compute a Weather_State from the Weather_Seed, the Calendar_Date and the Solar_Time, and from nothing else.
2. WHEN the same Weather_Seed, Calendar_Date and Solar_Time are supplied in two calls, THE Weather_System SHALL return two Weather_State records for which a deep-equality comparison of every field reports equal, including when the calls are separated by calls with other inputs.
3. THE Weather_System SHALL return the same Weather_State for a given Weather_Seed, Campaign_Day and Solar_Time under every frame rate, pause history, clock speed and wall-clock time.
4. THE Weather_System SHALL obtain every random value from `src/core/noise.ts`, and SHALL contain no call to `Math.random` and no read of wall-clock time.
5. THE Weather_System SHALL keep `intensity`, `cloudCover` and every other numeric Weather_State field finite (not NaN, not infinite) and within its documented minimum and maximum, inclusive, for every Calendar_Date from 1 January 1900 to 31 December 2100 inclusive and every Solar_Time from 0 inclusive to 24 exclusive.
6. WHEN two different Weather_Seeds are each sampled over the same 365 consecutive Calendar_Dates at the same Solar_Time, THE Weather_System SHALL return Weather_State sequences that differ on at least 1 of the 365 days.
7. THE Weather_System SHALL import no rendering module, no DOM API and no module under `world/`, and THE renderer SHALL read the Weather_State only and SHALL NOT call any other Weather_System function.
8. IF the Calendar_Date is outside 1 January 1900 to 31 December 2100, or the Solar_Time is less than 0, 24 or greater, or not a finite number, THEN THE Weather_System SHALL reject the input with an error that names the invalid argument, and SHALL return no Weather_State.

### Requirement 2: Seasonal odds of rain, snow and cloud

**User Story:** As a player, I want snow to be likely in winter and rain in the wetter months, so that the sky fits the time of year.

#### Acceptance Criteria

1. THE Weather_System SHALL take each day's temperature and rain amount from the Daily_Model, so that precipitation falls on a day if and only if the Daily_Model reports rain above 0 mm for that day.
2. WHEN the Daily_Model reports a wet day with a temperature below 1.5 °C, THE Weather_System SHALL schedule that day's precipitation as snow; WHEN the Daily_Model reports a wet day with a temperature at or above 1.5 °C, THE Weather_System SHALL schedule it as rain.
3. THE Weather_System SHALL give, for each calendar month, a share of days with precipitation that lies within 0.08 (absolute) of that month's `wetDays` normal divided by the number of days in that month, measured over at least 20 simulated years (tuning values, fixed in design).
4. THE Weather_System SHALL schedule no snow on any day from 1 May to 30 September in any simulated year.
5. THE Weather_System SHALL give snow a larger share of precipitating days, averaged over at least 20 simulated years, in each of December, January and February than in each of October, November, March and April.
6. WHILE the month is March, April or May, THE Weather_System SHALL schedule precipitation as showers: each spell lasts no more than 2 solar hours, and consecutive spells are separated by a gap of at least 1 solar hour with clear or cloudy sky and no precipitation (tuning values, fixed in design).
7. WHILE the month is October, November, December, January or February, THE Weather_System SHALL schedule precipitation on a wet day as at least one continuous spell of at least 3 solar hours (tuning value, fixed in design).
8. WHERE an Anchor in `src/sim/climate.ts` forces a day's rain and temperature (for example the snow of 22 November 1914), THE Weather_System SHALL use the Anchor's rain and temperature for that day in place of the Daily_Model's values, so that criteria 1 and 2 apply to the forced values.
9. THE Weather_System SHALL draw each period's non-precipitating Cloud_Cover from a seasonal distribution whose mean over at least 20 simulated years is higher for November to February than for June to August **[VERIFY: northern-France sunshine normals]**.
10. THE Weather_System SHALL give each precipitating day an `intensity` that is non-decreasing with the Daily_Model's rain amount for that day, so that a day with greater rain amount never has a lower `intensity` than a day with lesser rain amount.
11. IF the Daily_Model reports a rain amount of 0 mm or no value for a day, THEN THE Weather_System SHALL schedule no precipitation on that day and SHALL give it no `intensity`.

### Requirement 3: Weather at every time of year and every time of day

**User Story:** As a player, I want weather to work at dawn, noon, dusk and night in every month, so that no hour or date is without it.

#### Acceptance Criteria

1. THE Weather_System SHALL return a valid Weather_State for every Solar_Time from 0 (inclusive) to 24 (exclusive) on every Calendar_Date, including 29 February 1916 and the first and last day of each year.
2. WHEN the Solar_Time passes midnight and the Campaign_Day increases by 1, THE Weather_System SHALL return a Weather_State whose `intensity` differs from the Weather_State at the previous game minute by no more than 0.03 and whose `cloudCover` differs by no more than 0.02.
3. THE Weather_System SHALL change `intensity` by no more than 0.03 per game minute and `cloudCover` by no more than 0.02 per game minute at every instant (tuning values, fixed in design).
4. WHEN the Weather_Kind changes between two Weather_Periods, THE Weather_System SHALL ease the change over a duration of at least 30 game minutes.
5. THE Weather_System SHALL return an identical Weather_State for a given Campaign_Day and Solar_Time, whether the clock reached that time by running, by `archie.time()`, by a `?time=` URL or by a restored game state.
6. WHEN the clock runs at 3× or 40× speed, THE Weather_System SHALL return, for each game minute, the same Weather_State as at 1× speed for that game minute.
7. IF the Weather_System receives a Solar_Time outside 0 (inclusive) to 24 (exclusive) or a Calendar_Date that does not exist in the calendar, THEN THE Weather_System SHALL reject the request with an error indicating the invalid input and SHALL leave the current Weather_State unchanged.

### Requirement 4: Weather never changes the terrain

**User Story:** As the art director, I want weather to be purely a screen effect, so that the world's ground, structures and seasons stay exactly as they are.

#### Acceptance Criteria

1. FOR ALL Weather_States, THE Weather_System SHALL leave the Season_State returned by `seasonAt` and `seasonKey` identical to the value returned when no Weather_State is active, for every date and position.
2. THE Tile_Layer SHALL compute the `version` of a ground tile without reading the Weather_State, so that a change of Weather_State regenerates 0 ground tiles.
3. FOR ALL Weather_States, a ground tile generated for a given seed, tile coordinates, features and Season_State SHALL produce a Fingerprint identical to the Fingerprint produced with no Weather_State active.
4. FOR ALL Weather_States, THE Weather_System SHALL leave the results of `isWater` and `landAt`, and the placement of trees, farms, front and track, identical to the results with no Weather_State active, for the same seed and coordinates.
5. WHILE any Weather_State is active, THE Weather_System SHALL draw snow cover, wet ground, puddles and ice on 0 ground, sunlight or shade tiles.
6. THE Seasons_System SHALL keep every export it has today, and each export SHALL return the same values for the same inputs as before the Weather_System was added.
7. THE Weather_System SHALL import `weatherDay` and the climate data from the Seasons_System as read-only inputs, and SHALL NOT modify their exports or the values they return.
8. IF a Weather_State change occurs while ground tiles are cached, THEN THE Tile_Layer SHALL keep every cached ground tile and SHALL NOT mark any of them stale.

### Requirement 5: Weather sets the amount of cloud, on the clouds that exist

**User Story:** As a player, I want rainy and overcast days to be cloudier and clear days to be clearer, so that the sky matches the weather without a new layer of clouds.

#### Acceptance Criteria

1. THE Cloud_Field SHALL take one Cloud_Cover value in the range 0.0 to 1.0 inclusive, and `cloudLevel` SHALL use it in place of the constant `COVER`, with no other change to the cloud shapes, noise, warp or dither.
2. WHEN Cloud_Cover equals the Neutral_Cover, THE Cloud_Field SHALL produce cloud tiles and cloud-shadow tiles that are byte-identical to those of the current game for the same tile coordinates and seed.
3. WHEN Cloud_Cover rises, THE Cloud_Field SHALL give a non-decreasing share of cloudy pixels over a fixed sample of at least 65,536 cloud-space pixels.
4. WHEN the Weather_Kind is `clear`, THE Cloud_Field SHALL show no more than 25% of the cloudy pixels it shows at the Neutral_Cover, measured over the same fixed sample as criterion 3.
5. WHEN the Weather_Kind is `overcast`, `rain` or `snow`, THE Cloud_Field SHALL cover at least 85% of the fixed sample of cloud-space pixels used in criterion 3.
6. THE low clouds, the fly-through wisps, the high deck, the cloud shadows and the plane's "in cloud" measure (`cloudLevel` in `drawScene`) SHALL all use the same Cloud_Cover value in the same frame, so that the plane is in cloud exactly where cloud is drawn and shadows match clouds.
7. THE Weather_System SHALL add no cloud layer, no cloud tile kind and no new full-screen draw.
8. WHILE precipitation is falling, THE Weather_System SHALL hold `cloudCover` at or above 0.8 (tuning value, fixed in design), so that rain and snow never fall from a clear sky.
9. WHEN a cloud tile is requested, THE Tile_Layer SHALL include the `coverKey` in the tile request and in the cloud-tile `version`, so that cloud tiles regenerate only when the `coverKey` bucket changes and not on any other change in `cloudCover`.
10. WHEN the `coverKey` changes, THE Tile_Layer SHALL cross-fade the new cloud tiles over the old ones for `fadeMs` milliseconds, with every pixel showing a blend of old and new tiles and no frame in which a cloud pixel is missing or fully replaced out of sequence.
11. THE Weather_System SHALL use no more than 8 `coverKey` buckets (tuning value, fixed in design).
12. WHILE `cloudCover` changes at a rate that moves it across a bucket edge, THE Weather_System SHALL ease `cloudCover` so that the `coverKey` changes no more than once in any 10 game minutes.
13. THE Cloud_Field SHALL keep one pixel size of 1 game pixel per texel, with parallax moving layers and never scaling them.

### Requirement 6: Rain screen effects

**User Story:** As a player, I want to see rain as I fly through it, so that the weather is felt on the screen.

#### Acceptance Criteria

1. WHILE `precipitation` is `rain` and `intensity` is above 0.02, THE Precipitation_Layer SHALL draw rain as bitmap streaks, each 1 game pixel wide and between 2 and 12 game pixels long.
2. WHILE `precipitation` is `rain` and `intensity` is above 0.02, THE Precipitation_Layer SHALL orient each streak along the on-screen direction opposite to the plane's velocity relative to the camera, so that streaks sweep back along the flight path.
3. WHILE the plane is banked, THE Precipitation_Layer SHALL lean the streak direction toward the bank side, and the lean angle SHALL be 0 degrees at zero bank and SHALL increase monotonically with bank angle.
4. WHEN the plane's heading changes, THE Precipitation_Layer SHALL rotate the streak direction to the new heading over at least 0.25 seconds of effect time, with no single-frame change in direction greater than 15 degrees.
5. THE Precipitation_Layer SHALL scale the streak count, streak length and streak speed monotonically with `intensity`, from 20 streaks or fewer at an `intensity` of 0.02 (drizzle) up to the maximum streak count, length and speed at an `intensity` of 1 (downpour). The maximum streak count and the speed range are tuning values fixed in design.
6. WHILE `precipitation` is `rain` and `intensity` is above 0.4, THE Precipitation_Layer SHALL also draw lens droplets, each translucent, 1 to 3 game pixels in size, with no more than 12 droplets visible at once. Each droplet SHALL run down the screen and fade to fully transparent within 3 seconds of effect time (tuning value, fixed in design).
7. WHILE `precipitation` is `rain` and `intensity` is 0.4 or below, THE Precipitation_Layer SHALL draw no lens droplets, and WHEN `intensity` drops to 0.4 or below, THE Precipitation_Layer SHALL let existing droplets finish their fade without drawing new ones.
8. THE Precipitation_Layer SHALL compute the position of every particle only from the Weather_Seed, the effect time and the particle index, using the seeded function in `src/core/noise.ts`, so that the same Weather_Seed and effect time produce an identical frame.
9. THE Precipitation_Layer SHALL take its effect time from the simulation's elapsed seconds, so that the effect does not advance while the game is paused, and so that the effect advances by the same amount per simulated second at any clock speed.
10. IF `intensity` falls to 0 or the Weather_Kind changes to something other than `rain`, THEN THE Precipitation_Layer SHALL fade all streaks and droplets from their current opacity to fully transparent over at least 2 seconds of effect time, with no single frame reducing opacity by more than 25% of its starting value, and SHALL then stop drawing them.
11. IF `intensity` is outside 0 to 1 or is not a finite number, THEN THE Precipitation_Layer SHALL clamp it to the range 0 to 1, treating a non-finite value as 0, and SHALL keep drawing without raising an error.

### Requirement 7: Snow screen effects

**User Story:** As a player, I want to see snow drift past as I fly, so that a winter sortie looks and feels different from a rainy one.

#### Acceptance Criteria

1. WHILE `precipitation` is `snow` and `intensity` is above 0.02, THE Precipitation_Layer SHALL draw snow as bitmap flakes, each 1, 2, or 3 game pixels wide and tall.
2. WHILE `precipitation` is `snow` and `intensity` is above 0.02, THE Precipitation_Layer SHALL move each flake at a fall speed between 10% and 50% of the rain fall speed at the same `intensity`, with a side-to-side drift derived from seeded noise, and SHALL apply the same relative-motion rule as rain (criterion 6.2).
3. WHILE `precipitation` is `snow` and `intensity` is above 0.02, THE Precipitation_Layer SHALL scale the number of visible flakes linearly with `intensity`, from 0 flakes at `intensity` 0.02 up to a maximum of 400 flakes at `intensity` 1.0.
4. WHILE `precipitation` is `snow` and `intensity` is above 0.5, THE Precipitation_Layer SHALL add 3 to 10 larger, softer flakes that pass close to the camera, using parallax motion and without scaling the pixel size of any flake.
5. THE Precipitation_Layer SHALL position every flake as a deterministic function of the seed, the effect time, and the flake index, so that the same inputs always produce the same flake positions.
6. WHILE the game is paused, THE Precipitation_Layer SHALL hold the effect time constant, so that every flake stays at its current position.
7. WHEN `precipitation` changes from `snow` to `rain` or from `rain` to `snow`, THE Precipitation_Layer SHALL fade the old effect out and the new effect in over the same 1.0 second period, so that the combined opacity of the two effects does not jump between consecutive frames.
8. IF `precipitation` is `snow` and `intensity` is 0.02 or below, THEN THE Precipitation_Layer SHALL draw no snow flakes.

### Requirement 8: On top of the HUD, without restricting visibility

**User Story:** As a player, I want the weather to sit over the instruments for effect but never hide them or the world, so that I can always read the board and see where I am going.

#### Acceptance Criteria

1. THE Precipitation_Layer SHALL be a canvas with the same pixel width and height as the game canvas and the HUD canvas, stacked above the HUD canvas and the radium glow canvas, with pointer events passing through to the elements beneath it.
2. THE Precipitation_Layer SHALL draw no full-screen fill, tint, veil or blur in any frame.
3. THE Precipitation_Layer SHALL cover no more than 12% of the screen's pixels in any frame at the highest intensity (tuning value, fixed in design).
4. THE Precipitation_Layer SHALL draw every particle with an alpha of at most 0.6 (tuning value, fixed in design).
5. THE Precipitation_Layer SHALL leave the instrument face and needle pixels, the watch, and the debug and pause controls readable at the highest intensity, so that each pixel under a particle keeps at least 40% of its original contrast against its neighbouring pixels (the 8 adjacent pixels).
6. WHILE the game is not in the `playing`, `handoff` or `paused` phase, or while the landing page, desk or loading screen is shown, THE Precipitation_Layer SHALL be hidden and SHALL draw zero particles.
7. THE Precipitation_Layer SHALL draw only bitmaps (pre-rendered sprites or single-pixel fills) at whole device-pixel coordinates with image smoothing off, and SHALL fill no vector shape under rotation.
8. THE Precipitation_Layer SHALL draw rain in a pale grey-blue and snow in a near-white warm grey, each taken from the cloud and haze colours in `src/render/grade.ts`, and SHALL use no colour outside those colour families.
9. THE Precipitation_Layer SHALL carry `aria-hidden="true"` and SHALL be excluded from keyboard focus order (no tab stop).
10. WHERE the browser reports `prefers-reduced-motion: reduce`, THE Precipitation_Layer SHALL draw 50% of the particle count and move particles at 50% of the speed used without that setting.
11. THE Precipitation_Layer SHALL change the brightness of no pixel by more than the alpha limit in criterion 4 between consecutive frames at any intensity setting, so that no full-screen flash or flicker occurs.
12. IF the Precipitation_Layer canvas cannot be created or its 2D context is unavailable, THEN THE Precipitation_Layer SHALL draw nothing and the game and HUD SHALL continue to run unchanged.

### Requirement 9: Weather and the light of the hour, including sunrises and sunsets

**User Story:** As a player, I want the sunrise and sunset light to colour the rain and snow as well as the sky, so that a rainy dusk, a snowy dawn and a clear sunset each look right.

#### Acceptance Criteria

1. THE Weather_System SHALL change no sunrise time, sunset time, clock speed or sun elevation, and the Grade's sky choice (`skyFor`) SHALL stay a function of the seed, the day and the half of the day only.
2. THE Grade SHALL colour the clouds with the light of the hour as it does today, so that denser cloud at sunrise or sunset takes the pink, gold and red of that hour and the blue of dusk and pre-dawn through the existing `drawCloudTint`.
3. WHEN the Weather_Kind is `clear` or `cloudy` at sunrise or sunset, THE Grade SHALL produce the same glow and light shafts as it does today with no weather.
4. WHILE `cloudCover` is above the Neutral_Cover or precipitation is falling, THE Grade SHALL reduce its glow and light-shaft strength in proportion to the excess cover and to `intensity`, down to no less than 25% of its strength with no weather (tuning value, fixed in design).
5. WHILE precipitation is falling, THE Grade SHALL raise the `haze` input of `gradeFor` in proportion to `intensity`, within the existing 0 to 0.6 range, using the existing veil pass and adding no full-screen pass.
6. THE Precipitation_Layer SHALL take the Hour_Tint from the Grade the scene already computes for the frame (the same values that feed `gradeMatrix`), so that particles are warm at sunrise and sunset, blue-grey at dusk and pre-dawn, and dim at night.
7. WHILE the sun is below the horizon, THE Precipitation_Layer SHALL keep particles visible: each particle's colour shall differ in luminance from the dark world beneath by at least 25% of the full range (tuning value, fixed in design).
8. WHILE the sun is below the horizon, THE Grade SHALL keep the night grade identical to its night grade with no weather, except for the `haze` input of criterion 5.
9. WHILE the Weather_Kind is `overcast`, `rain` or `snow`, THE Flying_Mode SHALL show tree shadows, glints and the plane's shadow only where the existing cloud-shadow rule leaves direct sunlight, so that a covered sky shows no crisp midday shadows.
10. WHEN the Weather_State changes within a Sun_Window (around sunrise or around sunset), THE Grade, the clouds and the Precipitation_Layer SHALL change without a visible step, meaning no per-frame change in any Grade output colour channel, cloud tint channel or particle colour channel greater than 5% of the full range (tuning value, fixed in design).
11. IF the Grade values for the frame are unavailable to the Precipitation_Layer, THEN THE Precipitation_Layer SHALL use the Grade values from the last frame in which they were available and SHALL continue to render particles without error.
12. WHILE `precipitation` is `rain` or `snow` and `intensity` is above 0.02, THE Precipitation_Layer SHALL apply the Hour_Tint to every particle at every Solar_Time, including in the Sun_Window and in twilight, so that no rain or snow particle is drawn in a colour that ignores the Grade.
13. WHILE `precipitation` is `rain` or `snow` and `intensity` is above 0.02, THE Precipitation_Layer SHALL give particles drawn within a Sun_Window a mean hue that differs from the mean hue of the same particle kind at 12:00 solar time on the same day, with the same Weather_Seed and `intensity`, by at least 15 degrees of hue angle, and warmer (hue nearer gold, pink or red) than the midday hue. The Hour_Tint is a function of the Grade only, so the same hue-shift limit applies at sunrise and at sunset, and the two hue shifts, measured at equal minutes from the sun, SHALL differ by no more than 10% of the larger shift (tuning values, fixed in design).
14. WHILE `precipitation` is `rain` or `snow` and the Solar_Time is in twilight before sunrise or after sunset, THE Precipitation_Layer SHALL give particles a mean hue at least 15 degrees of hue angle cooler (nearer blue) than the particle mean hue at 12:00 solar time on the same day (tuning value, fixed in design).
15. WHILE `precipitation` is `rain` or `snow`, `intensity` is above 0.02 and the Solar_Time is in a Sun_Window, THE Precipitation_Layer SHALL apply the Sun_Glow to particles on the Sun_Side, so that the mean luminance of Sun_Side particles is higher than that of particles on the opposite half of the screen by between 5% and 25% of the full luminance range, scaled by the Grade's current glow strength.
16. THE Sun_Glow SHALL keep every particle's alpha at or below the 0.6 limit of Requirement 8.4, and SHALL change the brightness of no pixel between consecutive frames by more than the limit of Requirement 8.11, so that the Sun_Glow causes no flash and no flicker.
17. WHILE the Grade reduces glow and light-shaft strength under criterion 4, THE Precipitation_Layer SHALL still apply the full Hour_Tint of criteria 12 to 14 to every particle, so that the hue shifts of criteria 13 and 14 at `cloudCover` 1.0 are equal to those at the Neutral_Cover for the same particle kind and `intensity`, and SHALL scale only the Sun_Glow of criterion 15 with the reduced glow strength, down to no less than the 25% floor of criterion 4.
18. THE Precipitation_Layer SHALL scale the Sun_Glow with the Grade's glow strength as a continuous function of Solar_Time, equal to 0 outside the Sun_Window and twilight and rising to its maximum at sunrise or sunset, so that the Sun_Glow starts and ends without a step.
19. WHEN the Solar_Time moves through a Sun_Window or through twilight in rain or snow, THE Precipitation_Layer SHALL change each particle colour channel, including the Sun_Glow contribution, by no more than 5% of the full range between consecutive frames, so that the colour change from the Hour_Tint is continuous across the whole 45-minute span before and after sunrise and sunset, in line with criterion 10.
20. WHEN rain or snow begins, ends or changes kind inside a Sun_Window or twilight, THE Precipitation_Layer SHALL keep the Hour_Tint and Sun_Glow of the incoming particles equal to those of the outgoing particles at that Solar_Time, so that the fade of Requirement 6.10 and 7.7 shows no colour jump.
21. THE Precipitation_Layer SHALL apply criteria 12 to 20 whatever the source of the weather (generated, game state setting or Weather_Override), and for every date and `?time=` value, so that forced weather is lit by the sunrise and sunset in the same way as generated weather.
22. IF the sunrise or sunset times are unavailable for a day, THEN THE Precipitation_Layer SHALL use the Hour_Tint of the last frame in which they were available and SHALL draw no Sun_Glow until the times are available again.

### Requirement 10: No effect on the flying experience

**User Story:** As a player, I want the weather to look different without changing how the plane flies, so that I am never fighting a screen effect.

#### Acceptance Criteria

1. THE Weather_System SHALL NOT read or write flight state, and for each Weather_State `updatePlane`, `FLIGHT`, the camera, the controls, the instruments and the audio SHALL produce output identical to the output for every other Weather_State, given the same recorded input sequence and the same initial state, compared over a run of at least 600 frames.
2. THE Precipitation_Layer and the Cloud_Field SHALL read the plane's speed, heading and bank as read-only values and SHALL NOT write to any flight state.
3. THE Weather_System SHALL add 0 units of wind drift, turbulence, drag, engine effect, steering lag and input delay to the plane, so that the plane's position, velocity and attitude after each frame are identical for every Weather_State.
4. WHEN a weather change begins, THE Weather_System SHALL leave the controls and the camera responsive in the same frame, so that an input received in that frame is applied to the plane and to the camera in that frame, with 0 frames of added delay.
5. THE Weather_System SHALL leave the player's progress, the mission state and the save data unchanged by any Weather_State, so that the saved data is byte-identical before and after a change of Weather_State.
6. WHEN the Weather_State changes, THE game SHALL drop 0 more frames than it drops over an equal-length run with a constant Weather_State, measured with `archie.stats()` over the 10 seconds that follow the change and over a run of the same length with no change.
7. IF the Precipitation_Layer or the Cloud_Field fails to draw in a frame, THEN THE Weather_System SHALL skip the failed weather drawing for that frame, SHALL continue the flight simulation, the controls and the audio without interruption, and SHALL leave flight state, mission state and save data unchanged.

### Requirement 11: Performance

**User Story:** As a player on a phone, I want the weather to cost almost nothing, so that flight stays smooth and the benchmarks hold.

#### Acceptance Criteria

1. WHEN a Weather_State is requested, THE Weather_System SHALL compute it in O(1) time and SHALL read the cached target of the current Weather_Period, so that the frame loop does at most one cached lookup and one blend per frame.
2. WHEN a Weather_Period is entered for the first time, THE Weather_System SHALL compute and cache that Weather_Period's target once, and SHALL NOT recompute it on later frames while the Weather_Period is unchanged.
3. WHILE `precipitation` is `none`, THE Precipitation_Layer SHALL be hidden, SHALL perform 0 draw calls per frame and SHALL allocate 0 objects per frame.
4. WHILE precipitation is falling, THE Precipitation_Layer SHALL allocate 0 objects per frame, SHALL use a particle pool whose size is fixed at start-up, and SHALL draw only from sprites rendered once at start-up.
5. THE Precipitation_Layer SHALL draw at most 600 particles in any frame (tuning value, fixed in design).
6. WHILE Flying_Mode is active at the highest rain or snow intensity on the reference machine, THE Weather_System and Precipitation_Layer SHALL add at most 1.5 ms to the mean frame work time, measured with `archie.stats()` (tuning value, fixed in design).
7. WHILE Flying_Mode is active with `precipitation` of `none` on the reference machine, THE Weather_System and Precipitation_Layer SHALL add at most 0.05 ms to the mean frame work time, measured with `archie.stats()` (tuning value, fixed in design).
8. THE Weather_System SHALL add 0 workers, 0 worker message types other than the Cloud_Cover field on cloud tile requests, and 0 full-screen canvases other than the Precipitation_Layer.
9. THE cloud tile generation time per tile SHALL stay within 110% of the pre-change time at every Cloud_Cover value, measured with `npm run benchmark:check`.
10. THE Benchmark_Suite SHALL contain new entries for the Weather_State (365 consecutive daily calls), the particle update and draw model, and a cloud tile at one dense and one sparse Cloud_Cover, and `npm run benchmark:check` SHALL pass once the baseline has been updated for those new entries only.
11. THE existing Benchmark_Suite entries SHALL NOT regress by more than 50% against the baseline, which is the threshold the suite already applies.
12. WHEN a cloud tile is needed at a new `coverKey`, THE Tile_Layer SHALL keep drawing the old tile until the new tile arrives, so that no frame shows a gap where cloud tiles should be.
13. IF a cloud tile for a new `coverKey` has not arrived, THEN THE Tile_Layer SHALL continue drawing the old tile and SHALL NOT clear or blank the tile area.

### Requirement 12: Debug overrides

**User Story:** As a developer, I want to force rain, snow, clear sky or any cloud cover from the URL or the console, so that I can see and check each weather at once.

#### Acceptance Criteria

1. WHERE the build is a development build or the URL has `?debug`, THE game SHALL accept the URL parameters `?weather=` (one of `clear`, `cloudy`, `overcast`, `rain`, `snow`), `?precip=` (decimal number from 0 to 1 inclusive, intensity), `?cloud=` (decimal number from 0 to 1 inclusive, Cloud_Cover) and `?weatherSeed=` (integer from 0 to 2^31 − 1 inclusive).
2. WHERE the build is a development build or the URL has `?debug`, THE `archie` console API SHALL provide `archie.weather(kind?, intensity?)` to force a Weather_Kind (and an intensity from 0 to 1 inclusive for `rain` and `snow`), `archie.weather(null)` to clear every weather override, `archie.cloud(value?)` to force Cloud_Cover to a value from 0 to 1 inclusive, and `archie.weatherSeed(n?)` to read the Weather_Seed when called with no argument or set it to an integer from 0 to 2^31 − 1 inclusive.
3. WHEN `archie.weather()` is called with no argument, THE console API SHALL return the current Weather_State and the overrides in force, without changing either.
4. THE `parseWeatherOverrides` function SHALL be pure, SHALL drop each malformed or out-of-range value, and SHALL return a list of problems with one entry per dropped value, naming the parameter and the value.
5. IF a URL parameter or an API argument is malformed or out of range, THEN THE game SHALL ignore that value, keep every other valid value, leave any earlier valid override for that parameter unchanged, and log one warning per ignored value that names the parameter and value.
6. WHEN `?weather=rain` or `?weather=snow` is given with no `?precip=`, THE Weather_System SHALL use a default intensity of 0.6 for `rain` and 0.5 for `snow` (tuning values, fixed in design).
7. WHEN `?weather=` forces `rain` or `snow` and `?cloud=` is not given, THE Weather_System SHALL hold `cloudCover` at or above 0.8.
8. WHEN `?weather=` forces `rain` or `snow` and `?cloud=` is also given, THE Weather_System SHALL use the `?cloud=` value as `cloudCover`.
9. WHEN a Weather_Override is set or cleared, THE game SHALL apply the new weather without a page reload: the Precipitation_Layer fades to it, and the cloud tiles regenerate and cross-fade, as in Requirement 5.
10. THE Weather_Override SHALL apply at every time of day and every date, including with `?time=`, `?date=`, `?season=` and `archie.time()`, `archie.date()` and `archie.season()`.
11. THE Weather_Override SHALL never be saved, and SHALL never be read outside a development build or a URL with `?debug`.
12. THE `archie.state()` result SHALL include the Weather_State, the Weather_Seed and a boolean stating whether the weather is overridden, and the debug panel SHALL show one `weather` line with the kind, intensity, Cloud_Cover and the source of the weather (one of generated, game state or override).
13. THE `archie.snapshot()` and `archie.photo()` calls SHALL include the Precipitation_Layer in the frame they capture, and `archie.help()` and the `URL:` line in `src/devtools.ts` SHALL list each new call and URL parameter named in criteria 1 and 2.

### Requirement 13: Seed and game-state control, repeatably

**User Story:** As a designer, I want the weather to be fixed by the seed and by the game state, so that a story day or a replay always has the weather I chose.

#### Acceptance Criteria

1. THE game state SHALL carry an optional `weatherSeed` (integer 0 to 2^31 − 1 inclusive) that defaults to the world seed when absent, and SHALL pass it to the Weather_System.
2. THE game state SHALL carry an optional `weather` Weather_Setting with a Weather_Kind, an optional `intensity` (number 0 to 1 inclusive) and an optional `cloudCover` (number 0 to 1 inclusive), accepted by `createGame` and by the sortie setup (`beginSortie`), and held unchanged until a later `beginSortie` call sets a different Weather_Setting or clears it.
3. WHEN a sortie begins with a Weather_Setting, THE game SHALL show that weather from frame 0 of the sortie, at every Solar_Time, until the setting is cleared.
4. THE game SHALL choose the weather in this order of precedence: a Weather_Override (Requirement 12) first, then the Weather_Setting in the game state, then weather generated from the Weather_Seed.
5. IF `weatherSeed` or a Weather_Setting fails validation at the game-state boundary, THEN THE game SHALL reject it with an error message in the same style as the other fields (`readWorld`, `readClock`) that names the field, and SHALL leave the previous game state unchanged. Validation SHALL reject an unknown Weather_Kind, a non-integer or out-of-range `weatherSeed`, and an `intensity` or `cloudCover` that is outside 0 to 1, NaN or infinite.
6. IF a game-state snapshot has no `weatherSeed` or `weather` field, THEN THE game SHALL restore it with `weatherSeed` equal to the world seed and no Weather_Setting (generated weather), so that existing snapshots load with no error.
7. WHEN `snapshot()` is called, THE game state SHALL include `weatherSeed` and `weather` in the result. WHEN `restoreGame` restores that snapshot, THE game SHALL give a Weather_State identical to the one the snapshot had at the same Campaign_Day and Solar_Time.
8. THE player's browser save (`src/game/save.ts`) SHALL gain no weather field, and loading a save SHALL give the same Weather_State for the stored seed, day and hour as before the save was written.
9. FOR ALL Weather_Seeds, Campaign_Days and Solar_Times, WHEN `weatherSeed` is set to the value already in force, THE Weather_System SHALL leave the Weather_State unchanged.
10. WHEN `weatherSeed` differs from the world seed, THE Weather_System SHALL change the weather and SHALL leave the terrain, the cloud shapes and the front identical to those of the world seed.
11. THE cloud shapes SHALL be a function of the world seed alone, and a change of Weather_Seed SHALL change only the Cloud_Cover and the precipitation.

### Requirement 14: The game's own style

**User Story:** As the art director, I want the weather to look like the same game, so that nothing reads as a new style.

#### Acceptance Criteria

1. THE Precipitation_Layer SHALL draw every weather sprite at an integer scale of 1, so that one sprite texel covers exactly one game pixel, with image smoothing disabled on every canvas context that draws or scales weather sprites.
2. THE Precipitation_Layer SHALL build its sprites with the same banding and Bayer dithering (`bayer` in `src/core/noise.ts`) that the cloud and ground bitmaps use, with no more than 4 distinct non-zero alpha levels across all weather sprites, each between 0.05 and 0.50 inclusive.
3. THE Weather_System SHALL define every colour its art uses as a named constant placed next to the existing colour constants in `src/render/grade.ts` or `src/world/clouds.ts`, and SHALL contain no other colour literals in its own modules.
4. THE Weather_System SHALL add 0 entries to the runtime dependencies of the project's package manifest.
5. THE Weather_System SHALL place the pure state in modules under `src/sim/` and the particle drawing in modules under `src/render/`, with one responsibility per module, no class whose name ends in "Manager", and no file that exports nothing or contains only placeholder code.
6. THE Weather_System SHALL read no rendering state (canvas, context, camera or screen dimensions) during simulation, so that the same seed and inputs produce an identical Weather_State with the renderer absent.
7. THE Precipitation_Layer SHALL read the Weather_State only and SHALL NOT write to it.

### Requirement 15: Checks, documentation and compatibility

**User Story:** As a maintainer, I want the weather to ship with runnable checks and updated docs, so that nothing silently breaks and the docs tell the truth.

#### Acceptance Criteria

1. WHEN `npm run check` is run, THE Weather_System SHALL execute one named check for each of the following: purity, ranges, continuity (Requirement 3), seasonal odds (Requirement 2), the no-snow-in-summer rule, clear-versus-overcast coverage (Requirement 5), parse and format round trip of the override strings, and game-state validation and restore (Requirement 13).
2. IF any check listed in criterion 1 fails, THEN THE `npm run check` command SHALL exit with a non-zero status and print the name of each failing check.
3. THE Weather_System SHALL satisfy the round-trip property that, for every valid Weather_Setting in the checked set, formatting it into its URL form and parsing the result back gives a Weather_Setting equal to the original in every field. The checked set SHALL include every Weather_Kind and at least 1,000 generated Weather_Settings, using a fixed seed so that results repeat.
4. THE Weather_System SHALL ship with a check that fails if cloud tiles at the Neutral_Cover differ from today's cloud tiles in any tile.
5. THE Weather_System SHALL ship with a check that fails if any ground tile differs between the no-weather render and the render for any Weather_Kind.
6. WHEN no weather is requested by an override or a game-state setting and the Cloud_Cover is the Neutral_Cover, THE game SHALL pass `npm run fingerprint` with ground-tile output identical to the stored fingerprint.
7. THE documentation SHALL replace every statement that no rain, snow or cloud change is drawn with a description of the weather now drawn. This covers `docs/MECHANICS.md` §3.6 and §8.3, the "Limits" line of `docs/HISTORICAL_RESEARCH.md`, and the Seasons row of the module table in `docs/TECH.md`. No statement to that effect SHALL remain in those locations.
8. THE documentation SHALL add the Weather_System to the module table in `docs/TECH.md`. It SHALL add every new console call, every new URL parameter and every weather line of the debug panel to `docs/AGENT_TOOLS.md`.
9. THE `.kiro/specs/seasons-system` documents SHALL carry a note stating that requirements 14.5 and 14.6 are superseded by this feature for clouds and for live weather. Apart from that note, they SHALL have no changes.
10. WHEN `npm run verify` is run, THE game SHALL complete check, benchmark:check and build in that order, each with exit status 0, and `npm run verify` SHALL exit with status 0.
