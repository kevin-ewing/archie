# Requirements Document

## Introduction

Archie's world is stuck in May. The ground generator draws the crops, flowers and foliage of a Flanders May (`docs/MECHANICS.md` §3.6: "Seasons are not modelled yet (it's always May)"; the `ponytail:` note in `src/world/ground.ts`). The sun already moves with the day of year (`src/sim/daylight.ts`), but it uses a cosine approximation of the sun's declination, ignores longitude and the equation of time, and wraps the year at 365 days.

This feature adds a **Seasons System**: a pure, deterministic function from a calendar date to a complete description of what the land looks like and when the sun rises and sets. It drives:

1. Sunrise and sunset, computed for the aerodrome's latitude and longitude, in the clock convention France and Belgium used in 1915.
2. Every flying-mode world visual: trees and hedges, fields and crops, flowers, grass and dirt, tracks, lakes and rivers, farm buildings and their yards, trenches, wire and craters, the light's tint and the evening sky.

Only **accumulated ground state** is modelled: snow cover, frost, mud, standing water and ice, each derived from the date. **Weather is out of scope**: no falling rain or snow, no wind effects, no changes to the live cloud decks.

### Assumptions

These were chosen without further questions to the user. Each can be revised before design.

- **A1. Location.** `docs/AERODROME.md` is about the pilot's desk and gives no coordinates. Rook Field is fictional, and Chapter 1 is a fictional Flanders sector. The only coordinates in the code are `DAYLIGHT.latitude = 50.85` (Ypres). The Seasons System keeps that latitude and adds a longitude of **2.88° E** (Ypres). A single `LOCATION` constant holds both. Ypres is in Belgium, so the "northern France" brief is met by French Flanders, which lies within about 0.2° of latitude and about 0.4° of longitude of that point. The Somme chapter (about 50.0° N, 2.65° E) changes sunrise and sunset by under 10 minutes, so it is deferred and added as a second `LOCATION` entry when that chapter is built.
- **A2. Time convention, corrected from the brief.** The brief said France used Paris Mean Time in 1915. Sources show that France's legal time was Paris Mean Time from 1891, but from **10–11 March 1911 it was set back 9 min 21 s to Greenwich Mean Time**. In 1915 both France and Belgium therefore ran on **GMT** (UTC+0), with no daylight saving. France introduced summer time (GMT+1) in the night of **14–15 June 1916**. The requirements below use this corrected convention. The brief's intent (no daylight saving in 1915, then the 1916 change) is kept. The end date of the 1916 summer time is **[VERIFY]**.
- **A3. Simulation clock.** `Clock.hours` stays **local solar time** in the simulation (the existing sun, shadow and grade code depends on it). Legal time is derived from solar time for the watch and for any text that names a clock time.
- **A4. Reference date.** 10 May 1915 (`DAYLIGHT.startDayOfYear = 130`, campaign day 0) is the date for which the world must look exactly as it looks today, so the existing aesthetic is the May anchor of the new curve.
- **A5. Placement is untouched.** The seed alone decides where fronts, farms, lakes, woods, tracks and trees are. Seasons change only how things are coloured, how tall their canopy reads, and which ground states lie on them. This keeps the layer order in `CLAUDE.md` intact.
- **A6. Season boundaries are not used.** "Season" is a label for debug and docs only. All visuals are driven by continuous parameters of the day of year.
- **A7. Historical claims** stay marked **[VERIFY]** until a source is checked, as `CLAUDE.md` requires.

## Glossary

- **Seasons_System**: the new module (`src/sim/seasons.ts`, pure, no DOM) that turns a Calendar_Date into a Season_State and a Sun_Times record.
- **Calendar_Date**: a proleptic Gregorian date (year, month, day) with no time of day.
- **Campaign_Day**: the existing integer `Clock.day`, where 0 is 10 May 1915.
- **Season_State**: the record of continuous parameters returned for a date: `daylength`, `foliage`, `autumnColour`, `budding`, `cropStages`, `bloom` windows, `grassGreen`, `snow`, `frost`, `mud`, `standingWater`, `waterLevel`, `ice`, `haze`, and `skyBias`. Every number is in a documented range.
- **Ground_State**: the accumulated condition of the ground (snow, frost, mud, standing water, ice), not a live effect.
- **Sun_Times**: sunrise and sunset for a Calendar_Date at the LOCATION, as solar hours and as legal hours.
- **LOCATION**: the constant holding the aerodrome's latitude and longitude (assumption A1).
- **Legal_Time**: the clock time civilians and the army used on the date: GMT in 1915, GMT+1 during the 1916 summer-time period.
- **Solar_Time**: local apparent solar time, the time base of `Clock.hours`.
- **Climatology**: the typical annual cycle of temperature, wetness and phenology for northern France and French Flanders, from published normals.
- **Anchor**: a documented historical period or date with a stated condition (for example the wet winter of 1914–15), used to bias the Climatology.
- **Anomaly**: the deterministic per-year and per-week variation, seeded from the date by `src/core/noise.ts`, that makes one year differ from another.
- **Season_Overrides**: the development controls that replace the date, a season label or individual Season_State parameters.
- **World_Generator**: the tile pipeline (`world/ground.ts`, `structures.ts`, `military.ts`, `generate.ts`, `worker.ts`) that produces ground tiles.
- **Tile_Layer**: `createTileLayer` in `src/render/tiles.ts`, which caches tiles with a per-tile `version` and cross-fades replacements.
- **Grade**: the light overlay in `src/render/grade.ts` (palettes, tint, glow, per-day sky).
- **Reference_Date**: 10 May 1915.
- **Fingerprint**: the output of `npm run fingerprint`, the tool that reports whether rendered output has changed.
- **Flying_Mode**: the in-flight scene drawn by `src/render/scene.ts`.

## Requirements

### Requirement 1: Calendar dates drive everything

**User Story:** As a developer, I want one date to be the only time input to the seasons, so that the whole world can be derived from it.

#### Acceptance Criteria

1. THE Seasons_System SHALL convert a Campaign_Day to a Calendar_Date counting from 10 May 1915, including 29 February 1916.
2. THE Seasons_System SHALL return a day-of-year in the range 1 to 366 for any Calendar_Date from 1 January 1900 to 31 December 2100.
3. THE Seasons_System SHALL replace the 365-day wrap in `dayOfYear` in `src/sim/daylight.ts`, so that one date source feeds the sun, the grade, the lamps, the watch and the Season_State.
4. WHEN the Campaign_Day is negative, THE Seasons_System SHALL return the matching earlier date (for example day −166 returns 25 November 1914).
5. THE Seasons_System SHALL give the same Calendar_Date as the existing `dateText` in `src/main.ts` for every Campaign_Day from −200 to 800.
6. IF a Calendar_Date is not a valid Gregorian date, THEN THE Seasons_System SHALL return an error that names the invalid field.

### Requirement 2: A pure, continuous Season_State

**User Story:** As a designer, I want the same date to always give the same season, and neighbouring dates to give neighbouring looks, so that the world changes smoothly and reproducibly.

#### Acceptance Criteria

1. THE Seasons_System SHALL compute a Season_State from the Calendar_Date, the world seed and nothing else.
2. WHEN the same Calendar_Date and seed are supplied twice, THE Seasons_System SHALL return deeply equal Season_State records.
3. THE Seasons_System SHALL hold every Season_State parameter inside its documented range for every date from 1 January 1900 to 31 December 2100.
4. WHEN two consecutive Calendar_Dates are supplied, THE Seasons_System SHALL return `foliage`, `autumnColour`, `budding`, `grassGreen`, `waterLevel` and `daylength` values that differ by no more than 0.1 (tuning value, fixed in design).
5. WHEN two consecutive Calendar_Dates are supplied, THE Seasons_System SHALL return `snow`, `ice`, `mud`, `frost` and `standingWater` values that differ by no more than 0.35 (tuning value, fixed in design), so that a snowfall or a thaw can arrive within a day without a jump of the whole range.
6. THE Seasons_System SHALL use `src/core/noise.ts` for every random value, and SHALL use no `Math.random` and no wall-clock time.
7. WHEN a Season_State is requested for a date earlier than 1 January 1915, THE Seasons_System SHALL derive any accumulated Ground_State from the 30 days before that date, with no reference to earlier results.

### Requirement 3: Northern France climatology

**User Story:** As a player, I want the typical cycle of a northern French year, so that winter, spring, summer and autumn look right for the place.

#### Acceptance Criteria

1. THE Seasons_System SHALL derive a daily mean temperature, a wetness level and a day length from a Climatology table for northern France, sourced and cited in `docs/HISTORICAL_RESEARCH.md`.
2. THE Seasons_System SHALL place the coldest part of the year in January and February and the warmest in July and August.
3. THE Seasons_System SHALL place first leaf and bud burst of oak and beech in the second half of April, with variation of at least 7 days between years (typical bud burst is early to mid April, and mid April to mid May for late species; beech leaf unfolding is mid April to mid May **[VERIFY: local northern-France dates]**).
4. THE Seasons_System SHALL place autumn leaf colouring from late September, with most leaf fall between mid October and mid November **[VERIFY: local dates]**.
5. THE Seasons_System SHALL place winter cereal harvest in late July to mid August and stubble from then until ploughing **[VERIFY: northern France 1915 dates]**.
6. THE Seasons_System SHALL record the source and the unit of every Climatology value in the module's header comment.
7. WHERE a Climatology value comes from a source outside northern France, THE Seasons_System SHALL mark that value `[VERIFY]` in the header comment and in `docs/HISTORICAL_RESEARCH.md`.

### Requirement 4: Documented 1915 anchors and year-to-year variation

**User Story:** As a historian-minded player, I want the known weather of the period to shape the ground, and I want each year to differ, so that the world feels like 1914–16 and not a loop.

#### Acceptance Criteria

1. THE Seasons_System SHALL apply an Anchor table whose entries each carry a date range, the biased Ground_State parameters, the source, and a verification status.
2. THE Seasons_System SHALL include an Anchor for the very wet winter of 1914–15, which raises `mud`, `standingWater` and `waterLevel` from late October 1914 through at least March 1915, citing the Guardian Weatherwatch pieces ([Trench misery](https://www.theguardian.com/news/2014/dec/21/weatherwatch-trenches-first-world-war), [The big guns fire and the rains fall](https://www.theguardian.com/news/2015/mar/22/weatherwatch-first-world-war-guns-rain)).
3. THE Seasons_System SHALL include an Anchor for 22 November 1914, when torrential rain turned to snow around Ypres, which raises `snow` for the following days (Guardian Weatherwatch, December 2014).
4. THE Seasons_System SHALL include an Anchor for December 1915, which raises `mud`, `standingWater` and `waterLevel` after rains through the month ([The Times, Weather Eye](https://www.thetimes.com/article/weather-eye-misery-on-the-western-front-z8sc7c65p7g) **[VERIFY]**).
5. THE Seasons_System SHALL include an Anchor for the autumn 1915 Loos period (25 September to mid October 1915) whose bias is marked `[VERIFY]` until a source for that period's weather is found, and SHALL apply no bias from it while it is unverified.
6. THE Seasons_System SHALL include the Reference_Date as an Anchor whose Season_State equals the "May look" of the existing world, with the Anomaly set to zero on that date and fading in over the following 7 days.
7. THE Seasons_System SHALL derive the Anomaly from the year and the week of the year through `src/core/noise.ts`, so that the same week in two different years differs in temperature, wetness and leaf timing.
8. IF an Anchor has no verification status, THEN THE Seasons_System SHALL fail its self-check with a message naming that Anchor.

### Requirement 5: Sunrise and sunset from latitude, longitude and date

**User Story:** As a player, I want the length of the day to be right for the place and time, so that winter sorties are short and midsummer evenings long.

#### Acceptance Criteria

1. THE Seasons_System SHALL compute Sun_Times for a Calendar_Date from the LOCATION latitude and longitude, using the sun's declination and the equation of time for that date.
2. THE Seasons_System SHALL define sunrise and sunset as the moments the sun's upper limb meets the horizon with standard atmospheric refraction (sun centre at −0.833°).
3. THE Seasons_System SHALL return Sun_Times within 2 minutes of the NOAA solar calculator for the LOCATION on at least 12 fixed test dates, including both solstices, both equinoxes, 10 May 1915, 29 February 1916 and 25 September 1915.
4. THE Seasons_System SHALL give a day length of about 7 h 45 min (within 10 minutes) on 21 December and about 16 h 35 min (within 10 minutes) on 21 June at latitude 50.85° **[VERIFY against NOAA during design]**.
5. THE Seasons_System SHALL be the only source of sunrise and sunset, and `sunAt`, `sunsetHour` and `horizonMinutes` in `src/sim/daylight.ts` SHALL use it, so that the moment the sun's elevation crosses −0.833° equals the sunrise or sunset time to within 1 minute.
6. WHEN the date is 10 May 1915, THE Seasons_System SHALL return a sunset within 3 minutes of what `sunsetHour` returns today at that date, so that the documented "May sunset ~19:30 solar" check in `docs/TECH.md` continues to hold.
7. THE Seasons_System SHALL give polar-day-free results at the LOCATION, with sunrise before sunset and no `NaN`, for every date from 1 January 1900 to 31 December 2100.

### Requirement 6: The 1915 time convention

**User Story:** As a player reading the watch and the orders, I want the clock to show the time of the period, so that times in the story are right.

#### Acceptance Criteria

1. THE Seasons_System SHALL convert Solar_Time to Legal_Time using the LOCATION longitude and the equation of time for the date.
2. WHEN the date is before 15 June 1916, THE Seasons_System SHALL use GMT (UTC+0) as Legal_Time and SHALL apply no daylight saving.
3. WHEN the date is from 15 June 1916 until the documented end of French summer time in 1916, THE Seasons_System SHALL use GMT+1 as Legal_Time (end date **[VERIFY]**).
4. THE Seasons_System SHALL convert Legal_Time back to Solar_Time such that converting a time to Legal_Time and back returns the original within 1 second (round trip).
5. THE watch in `src/ui/clock.ts` SHALL show Legal_Time, and the watch's sunset mark SHALL be placed at the Legal_Time of sunset.
6. THE Seasons_System SHALL leave `Clock.hours` and all saved game data in Solar_Time, so that existing saves load unchanged.
7. WHEN the date moves across a summer-time boundary, THE watch SHALL show a continuous Solar_Time and a one-hour step in Legal_Time at 23:00 GMT on 14 June 1916.

### Requirement 7: Sun-driven systems follow the date

**User Story:** As a player, I want the shadows, the evening light and the lamps to follow the real day length, so that a December evening looks like December.

#### Acceptance Criteria

1. WHEN the date changes, THE Grade SHALL compute its phase weights from the Sun_Times of that date, not from fixed hours.
2. THE Seasons_System SHALL give a noon sun elevation at the LOCATION of about 15.7° on 21 December and about 62.6° on 21 June (within 1°), which the cast-shadow length in `world/shading.ts` SHALL follow.
3. WHEN the sun's elevation is below 20°, THE Seasons_System SHALL report `shadowStrength` through the existing function in `daylight.ts`, unchanged, so that low winter noon shadows keep the existing fade rules.
4. THE lamplight in `world/lights.ts` SHALL switch on and off relative to the Sun_Times of the date through the existing `LIGHTS` offsets, so that windows light earlier in winter and later in summer.
5. WHEN a sortie starts, THE game SHALL choose a start hour that lies between sunrise and sunset of that date, and the existing "1 h 45 min to 2 h 15 min before sunset" rule in `src/main.ts` SHALL use that date's sunset.
6. THE clock's day window (`DAYLIGHT.rate`, 05:00 to 22:00 in about 12 real minutes) SHALL cover sunrise to sunset on every date of the year.

### Requirement 8: Trees, hedges and woodland through the year

**User Story:** As a player, I want leaves to bud, fill, turn and fall, so that I can read the month from the woods.

#### Acceptance Criteria

1. THE World_Generator SHALL colour tree crowns, hedges, scrub and forest floor from `foliage`, `budding` and `autumnColour`.
2. THE World_Generator SHALL show, in order through the year, bare branches and trunks in winter, a pale green budding crown in April, the existing full-leaf tones in May to August, yellow, ochre and russet crowns from late September, and bare crowns by late November.
3. THE World_Generator SHALL vary budding and leaf-fall timing between oak, the pale poplar or birch species and the dark elm species, so that species change on different days.
4. THE World_Generator SHALL vary leaf timing between individual trees by `src/core/noise.ts`, with a spread of at least 5 days between early and late trees of one species in one wood.
5. WHILE the crown's leaf cover is below 0.5, THE World_Generator SHALL draw the crown with visible ground between the branches, using the existing banded and dithered pixel style.
6. WHILE `foliage` is below 0.3, THE World_Generator SHALL reduce the height map's canopy contribution so that cast shadows of trees are thinner than in full leaf.
7. WHILE `foliage` is below 0.3, THE World_Generator SHALL lay leaf litter tones on the forest floor and the ground beneath the crowns.
8. THE World_Generator SHALL keep every tree at the position and radius `treeAt` gives for the seed, whatever the date.

### Requirement 9: Fields, crops, grass and flowers

**User Story:** As a player, I want the fields to be ploughed, sown, green, ripe, harvested and ploughed again at the right times, so that the farmland keeps a calendar.

#### Acceptance Criteria

1. THE World_Generator SHALL give each crop kind in `CROPS` (young wheat, ploughed earth, rough grass, meadow, pasture, flax, red clover, colza) its own `cropStages` value that depends on the date.
2. THE World_Generator SHALL show winter wheat as short green blades in winter, tall green by May, golden from July and stubble after the harvest.
3. THE World_Generator SHALL show spring-sown crops as bare ploughed earth until about April, then green, then ripe, then stubble.
4. THE World_Generator SHALL show meadow and pasture grass in dull olive and brown tones in winter and the existing green tones in May.
5. THE World_Generator SHALL bloom each flower kind in `FLOWER` only in its own date window (for example bluebells and hawthorn in the spring, poppies and cornflowers from late May to July, colza yellow in April and May, ox-eye daisies and buttercups from May to August), with window edges that vary by year through the Anomaly **[VERIFY: window dates]**.
6. THE World_Generator SHALL show hay cocks only in the haymaking window, which opens in late May or June **[VERIFY]** and ends before the harvest of cereals.
7. THE World_Generator SHALL preserve the per-field choice of crop, which comes from the seed, so that a field is the same field in every month.
8. THE World_Generator SHALL replace the May-only `ponytail:` note in `src/world/ground.ts` with the seasonal behaviour.

### Requirement 10: Ground states: snow, frost, mud, standing water and ice

**User Story:** As a player, I want to see snow, frost, mud and flooded ground in winter, so that the ground tells me about the season without any live weather.

#### Acceptance Criteria

1. THE Seasons_System SHALL derive `snow`, `frost`, `mud`, `standingWater` and `ice` from the Climatology, the Anchors and the Anomaly, with no live precipitation.
2. WHEN `snow` is above 0.05, THE World_Generator SHALL cover a share of the ground tiles in white and pale blue-grey tones with that share rising with `snow`, using irregular, noise-edged patches that thin over south-facing and open ground first and persist longest under woods, in hedge shade and in the lee of buildings and parapets.
3. WHEN `snow` is above 0.05, THE World_Generator SHALL keep dark tones for tracks, trench lines, wheel ruts and wet earth through the snow, so that the works stay readable.
4. WHEN `frost` is above 0.05 and `snow` is below 0.3, THE World_Generator SHALL lay a pale, speckled rime on grass, crops and bare earth, strongest in the shaded side of hedges and woods.
5. WHEN `mud` is above 0.05, THE World_Generator SHALL darken and soften tracks, field margins, gateways and yards with wet-earth tones and ruts, using the `DIRT` family of colours.
6. WHEN `standingWater` is above 0.05, THE World_Generator SHALL fill low fields, ditches, shell holes and trench floors with the existing `WATER.pool` tones, using the same pool logic the shell holes already use.
7. WHEN `ice` is above 0.05 and the ground has standing water, THE World_Generator SHALL draw that water with an ice surface in pale grey-white and blue-grey tones, with cracks and snow dusting that rise with `ice`.
8. THE Seasons_System SHALL give `snow` above 0.05 on fewer than 15% of days in a typical year at the LOCATION, and `frost` above 0.05 on at most 70 days per year **[VERIFY: northern France normals]**.
9. THE Seasons_System SHALL give `snow`, `ice` and `frost` of exactly 0 from 1 May to 30 September in every year.
10. THE Seasons_System SHALL melt `snow` and `ice` in the days after the temperature rises above freezing, with the rate set by the Climatology temperature.

### Requirement 11: Lakes, rivers and shores

**User Story:** As a player, I want water to change colour, level and surface with the season, so that lakes and rivers look right for the month.

#### Acceptance Criteria

1. THE World_Generator SHALL widen the mud and reed shore of lakes and rivers as `waterLevel` rises, within the existing shore band, so that the open-water outline does not change.
2. THE World_Generator SHALL tint water toward a turbid brown from `WATER` and `SHORE` colours after wet spells, using `mud` and `waterLevel`.
3. WHILE `ice` is above 0.3, THE World_Generator SHALL draw a frozen skin from the shore inward, with the middle of a lake freezing last and moving water at the deepest part freezing last or not at all.
4. WHILE a lake or river is frozen, THE sparkle layer in `src/render/sparkle.ts` SHALL draw sunlight glints on that water at a lower rate than on open water, and the ground tile's `glints` SHALL follow the same rule.
5. WHILE `foliage` is below 0.3, THE World_Generator SHALL draw shore reeds in dry straw and brown tones.
6. THE World_Generator SHALL keep `isWater` and `landAt` independent of the date, because later layers read them.

### Requirement 12: Farms, villages and their yards

**User Story:** As a player, I want roofs, yards and farm clutter to show the time of year, so that settlements are part of the season.

#### Acceptance Criteria

1. WHEN `snow` is above 0.05, THE World_Generator SHALL lay snow on roofs, walls' shadows' edges, yards and the tops of haystacks, with each roof's share of snow depending on its pitch and its colouring (tile, thatch, slate), and with the south-facing slope melting first.
2. WHEN `frost` is above 0.05, THE World_Generator SHALL lay rime on roofs and yards.
3. WHEN `mud` is above 0.05, THE World_Generator SHALL render the paved apron, trodden yard and dung heap with wet tones and ruts.
4. THE World_Generator SHALL show seasonal farm features by date: muck heaps in spring, hay cocks at haymaking, long ricks and thatched stacks after the harvest, beet clamps and faggot stacks in winter, hop poles bare in winter and hung with green bines from June to September, and the orchard's blossom in April and May.
5. THE World_Generator SHALL keep the position, plan and kind of every structure the same for the seed, whatever the date.
6. WHERE a building is ruined, THE World_Generator SHALL apply the same snow, frost and mud rules to its roofless walls and rubble.

### Requirement 13: The front's works

**User Story:** As a player, I want trenches, wire and craters to be wet and muddy in winter and dry and dusty in summer, so that the front keeps its history of the 1914–15 mud.

#### Acceptance Criteria

1. WHEN `standingWater` is above 0.05, THE World_Generator SHALL partly flood fire trenches, communication trenches and the floors of craters, with a share of flooded length that rises with `standingWater` and that depends on the ground's wetness at that point.
2. WHEN `mud` is above 0.05, THE World_Generator SHALL render trench floors, parapet spoil, duckboard tracks and the apron behind the lines with wet-earth tones.
3. WHEN `snow` is above 0.05, THE World_Generator SHALL lay snow on the parapet and parados tops and on the sandbag rows, and SHALL keep trench floors and the dugout mouths dark.
4. WHEN `frost` is above 0.05, THE World_Generator SHALL rime barbed wire and sandbags in pale tones.
5. WHEN `ice` is above 0.05, THE World_Generator SHALL freeze the standing water in the flooded trenches and craters.
6. WHILE `mud` is below 0.1 and `foliage` is above 0.7, THE World_Generator SHALL render the front's spoil and tracks in the existing dry tones, so that a summer front looks as it does today.
7. THE World_Generator SHALL keep the stamp priority order (damage, structures, front's works, tracks, landscape) and SHALL return a valid colour at every pixel for every date (the existing stamp fuzz check SHALL run for several dates).

### Requirement 14: Light and sky by season

**User Story:** As a player, I want the light to match the season, so that winter looks low and cold and summer looks long and warm.

#### Acceptance Criteria

1. THE Grade SHALL tint the daylight of winter dates toward cooler, lower-contrast tones, and of summer dates toward warmer tones, with `skyBias` as the control and with the tint equal to the existing look on the Reference_Date.
2. THE Grade SHALL weight the choice of evening palette in `skyFor` by `skyBias`, so that winter evenings choose the plainer palettes, including `OVERCAST`, more often than summer evenings, while every day's sky stays deterministic for the seed and the date.
3. THE Grade SHALL scale its low-sun hours by the date's Sun_Times, so that the golden hour is the same share of the day on a December date and a June date.
4. WHEN `haze` rises, THE Grade SHALL add a pale, banded, dithered veil to the far edge of the view, using the existing overlay passes, with no new full-screen pass.
5. THE Seasons_System SHALL leave the cloud decks (`world/clouds.ts`), cloud shadows and wisps unchanged by the date.
6. THE Seasons_System SHALL add no rain, snowfall, fog, wind or other live weather effect, and SHALL add no live particle layer.

### Requirement 15: Existing look, rules and layer order

**User Story:** As the art director, I want every seasonal change to look like the same game, so that nothing reads as a new style.

#### Acceptance Criteria

1. WHEN the date is the Reference_Date, THE World_Generator SHALL produce ground tiles whose Fingerprint equals the Fingerprint before this feature, except that poppies, cornflowers, red clover and hay cocks are absent (they belong to June, not 10 May). The Fingerprint baseline is re-saved once for this change.
2. THE World_Generator SHALL draw every seasonal visual as a bitmap through the existing tile pipeline at 1 game pixel per texel, with no vector fills under rotation and no scaling with smoothing.
3. THE World_Generator SHALL choose seasonal colours from tonal families next to the existing `rgb(...)` constants in `ground.ts`, `structures.ts` and `military.ts`, built with the same banding and Bayer dithering as the existing code.
4. THE World_Generator SHALL read the Season_State only as an input to colouring and ground state, so that the layer order (front plan, landscape, farms, stamps) and the rule "a layer reads only earlier layers" hold.
5. THE Seasons_System SHALL add no runtime dependency.
6. THE Seasons_System SHALL live in modules of one responsibility each (the date and sun, the Season_State, the tile colouring), with no manager classes and no placeholder files.
7. WHILE the simulation runs, THE Seasons_System SHALL read no rendering state, and the renderer SHALL read the Season_State only.

### Requirement 16: Speed and tile caching

**User Story:** As a player on a phone, I want seasons to cost nothing per frame, so that flight stays smooth.

#### Acceptance Criteria

1. THE Seasons_System SHALL compute the Season_State once per Calendar_Date, and the frame loop SHALL read the stored record only.
2. THE TileRequest for a ground tile SHALL carry the Season_State (or a compact key for it), so that the worker needs no state of its own.
3. THE Tile_Layer's `version` for a ground tile SHALL include a season key, so that tiles generated for one date are regenerated when the visible state changes.
4. WHEN the Season_State changes by less than the smallest visible step (a tuning value fixed in design), THE Seasons_System SHALL return the same season key, so that tiles are not regenerated for invisible changes.
5. WHEN a season key changes, THE Tile_Layer SHALL cross-fade the new tiles over the old ones using the existing `fadeMs`, with no gap.
6. THE World_Generator SHALL take no more than 10% longer to generate a ground tile with seasons than without, measured with `npm run benchmark:check`.
7. THE frame's mean work time SHALL stay within 5% of the figures in `benchmarks/performance.json` at the Reference_Date, and SHALL stay within the existing frame budget on a snow-covered winter date.
8. THE Seasons_System SHALL compute accumulated Ground_State from at most 30 dates of history, using a cached record per date.

### Requirement 17: Debug overrides

**User Story:** As a developer, I want to force a date, a season or a single parameter, so that I can test any look without waiting for the calendar.

#### Acceptance Criteria

1. WHEN the URL contains `?date=YYYY-MM-DD`, THE game SHALL use that Calendar_Date in place of the Campaign_Day for the Season_State and the Sun_Times.
2. WHEN the URL contains `?season=winter|spring|summer|autumn`, THE game SHALL use the middle date of that season for the Reference year 1915 (21 January, 21 April, 21 July, 21 October).
3. WHEN the URL contains one or more of `?snow=`, `?frost=`, `?mud=`, `?water=`, `?ice=`, `?foliage=`, `?haze=`, THE game SHALL set those Season_State parameters to the given values in 0 to 1 after the date has been applied.
4. THE `archie` console API SHALL provide `archie.date(iso?)`, `archie.season(name?)` and `archie.seasonParam(name, value?)`, each returning the current value, and each followed by `await archie.ready()` showing the regenerated tiles.
5. THE `archie.state()` record SHALL list the active date, the active Season_State and which values are overridden.
6. IF a Season_Overrides value is malformed or outside its range, THEN THE game SHALL ignore it, keep the previous value and report the reason in the console.
7. THE Season_Overrides SHALL be available only in development builds, SHALL never be written to a save, and SHALL be cleared by `archie.date(null)`.
8. THE date parser SHALL read an ISO date and THE date formatter SHALL write one, such that parsing a formatted date returns the same Calendar_Date for every date from 1900 to 2100 (round trip).
9. THE `npm run snap` tool SHALL accept the same `date`, `season` and parameter overrides, so that world images can be made for any date.

### Requirement 18: Verification and documentation

**User Story:** As a maintainer, I want runnable checks and updated docs, so that the seasons stay correct and explainable.

#### Acceptance Criteria

1. THE project SHALL ship `npm run check` tests for the date conversion, the Sun_Times table (Requirement 5.3), the Legal_Time round trip, the Season_State ranges and continuity, determinism, the Anchor table, and the ISO date round trip.
2. THE project SHALL ship a test that renders sample ground tiles for the dates 10 May 1915, 21 July 1915, 21 October 1915, 25 December 1914 and 21 January 1916, and that checks each returns valid colours at every pixel.
3. THE project SHALL ship a test that the Reference_Date's Fingerprint is unchanged (Requirement 15.1).
4. THE project SHALL update `docs/MECHANICS.md` §3.6 (remove "Seasons are not modelled yet"), `docs/TECH.md` (module list, daylight and grade rows, the "Change date / latitude" note), `docs/AGENT_TOOLS.md` (the new URL parameters and console calls), and `docs/HISTORICAL_RESEARCH.md` (a Seasons section with every source below and its limits).
5. THE `docs/HISTORICAL_RESEARCH.md` Seasons section SHALL mark each claim that no source supports as **[VERIFY]**.
6. THE project SHALL include `npm run snap` images of the same view for each of the four season dates, so that the visuals can be reviewed side by side.

## Sources

Content was rephrased for compliance with licensing restrictions. Links are the evidence base to be checked and extended in design.

- Legal time in France: [Nature, "Standard Time in France" (1911)](https://www.nature.com/articles/086092b0) reports clocks set back 9 min 21 s at midnight of 10 March 1911 to match Greenwich time. [Pour la Science](https://www.pourlascience.fr/sd/histoire-techniques/comment-la-france-adopta-l-heure-de-greenwich-6322.php) and [asiaflash, Les heures légales en France](https://www.asiaflash.com/astrorama/les-heures-legales-en-france.html) give the Paris-time offset and the 1911 change. [timeanddate, Paris time zone history](https://www.timeanddate.com/time/zone/france/paris?syear=1900) lists the −0:09:21 change.
- Summer time 1916: [Archives de Saône-et-Loire](https://www.archives71.fr/decouvrir/apprendre-et-se-divertir/zooms/zooms-archives/a-la-bonne-heure-) shows the poster for the first change in the night of 14–15 June 1916, and [Langlois, Histoire &c.](https://langloishg.fr/2016/03/26/lheure-dete-pendant-la-premiere-guerre-mondiale-14-juin-1916/) gives the law's passage on 8–9 June 1916. The end date is not yet sourced.
- Weather anchors: [Guardian Weatherwatch, December 2014](https://www.theguardian.com/news/2014/dec/21/weatherwatch-trenches-first-world-war) (rain for weeks, rain then snow on 22 November 1914). [Guardian Weatherwatch, March 2015](https://www.theguardian.com/news/2015/mar/22/weatherwatch-first-world-war-guns-rain) (one of the wettest winters known, rains into 1915). [The Times, Weather Eye](https://www.thetimes.com/article/weather-eye-misery-on-the-western-front-z8sc7c65p7g) (Flanders a quagmire, rains through December 1915; the page text was only partly retrievable, so **[VERIFY]**). [Paul Reed, Winter in Flanders](https://podcastrex.com/shows/the-old-front-line/winter-in-flanders) (the winters of 1914, 1915, 1916, from war diaries; to listen to for snow and frost details).
- Phenology baselines (not northern-France specific, so **[VERIFY]**): [BSBI bud burst](https://bsbi.org/learn/resources/identification-guides/bud-burst-phenology-and-identification), [beech leaf unfolding and colouring, Tree Structure and Function](https://link.springer.com/article/10.1007/s00468-012-0686-7), [Flora Incognita, Full Autumn](https://floraincognita.com/blog/2023/09/20/phenology-full-autumn/).
- Not found in the searches made: a source for the weather of the Loos period (autumn 1915), and northern-France monthly normals (Lille or Ypres). Both are open items for the design phase, and the Loos Anchor stays unapplied until sourced (Requirement 4.5).
