# Archie — Mechanics Design Document

> Status: **Draft v0.2** · Last updated: 2026-11-13
> v0.9: rotating heading-up camera, rotated crisp pixels, spring-centred plane, parallax clouds, mouse/finger steering, engine full power with heat.
> v0.8: tone is sombre and grounded (*Masters of the Air*).
> v0.7: two operators. The old hand teaches (Ch. 1, tutorial); the new lad is taught (Ch. 2).
> v0.6: 4–6 hour campaign. Procedural synth soundtrack (detail to come).
> v0.5: assisted Morse only (no manual keying). The pilot's "fist" becomes a story element.
> v0.4: two-chapter campaign (Flanders, then the Somme). Being shot down is absorbed into the story.
> v0.3: not an idle game, and not an action game. A story game. Evolving sector locked, 10–15 min days, desktop and mobile equally.
> v0.2: no levels. Procedurally generated world, time-driven story, sunset as the end of every sortie, written messages from the ground.
> Companion docs: [`STORY.md`](STORY.md) (narrative bible). A technical design doc will follow.
> Items marked **[VERIFY]** are historical details to confirm before they ship. Items marked **[DECIDE]** are open design questions.

---

## 1. Design pillars

1. **You are not a fighter pilot.** You are the eyes of the guns. Success is about patience, observation and clear communication, not kills.
2. **The relationship is the story.** You only ever "talk" to the man on the ground in Morse. In the air he can only answer with cloth on the grass. Off duty, he answers in writing. Every mechanic should feed that bond.
3. **Sombre and grounded.** The tone of *Masters of the Air*: attrition, routine, quiet grief, humour only as coping. Visuals and audio serve that mood.
4. **A story game, not an action game.** Calm, deliberate flying broken by moments of tension. Danger is about judgement (when to stay, when to run), never reflexes. Nothing should require twitch skill to progress the story.
5. **Authentic but readable.** Grounded in 1915–16 Royal Flying Corps practice, simplified wherever realism would hurt play. Every simplification gets noted in §15.
6. **Pure top-down pixel art.** One camera, one perspective, a strict palette. Runs smoothly on a modest laptop browser.
7. **Time, not levels.** The world is generated, the war moves on by the calendar, and the story unfolds day by day. Every sortie ends the same way: the sun goes down and you turn for home.

---

## 2. Setting assumptions

**Campaign length:** 4–6 hours, roughly **20–25 flying days** across two chapters, plus squadron, hospital and letter scenes.


| Item | Default | Notes |
|---|---|---|
| Period | **1915 – late 1916** | Single-seat spotting was common in this period, so the player legitimately flies, spots and keys the wireless alone. |
| Front | **Two chapters, two generated sectors:** a fictional sector in **Flanders** (1915 into 1916), then the squadron transfers to the **Somme** (summer 1916) | Flanders: flat, wet, canals, coast exits. Somme: chalk downland, rolling fields, builds toward the 1 July 1916 offensive. |
| Aircraft | BE.2c (with period upgrades) | Known for being very stable. That's historically why it was good for observation and bad in a fight, and it justifies the "hold circuit" flying aid. |
| Ending | **Not** the Armistice | See `STORY.md`. |

---

## 3. Camera & presentation

### 3.1 View
- **Strict orthographic top-down.** No perspective tilt, no isometric.
- **Heading-up, rotating camera.** The world turns around the plane, so the plane mostly points up the screen. Ground and cloud pixels are therefore **rotated squares**, no longer aligned to the screen. They stay crisp (nearest-neighbour, never blurred; see `TECH.md` §2).
- **Full-screen, fixed-size crisp pixels.** The game always fills the whole screen (landscape and portrait). A game pixel is the same physical size on every screen (slightly smaller on phones), so bigger screens see more of the world. Menus and dialogue reflow at breakpoints (see `TECH.md` §2).
- The plane's home spot is **72% of the way down the screen** (a percentage, so it scales with any screen), leaving most of the view for the ground ahead.
- **Limited palette** (~32 colours). Time of day, weather and season are done with **palette swaps**, not new art.

### 3.2 Draw layers (bottom → top)
1. Terrain tiles (fields, woods, villages, roads, rivers, coast)
2. Ground scarring: trenches, wire, craters (craters accumulate dynamically as shells land)
3. Ground objects: batteries, the wireless dugout, **signal panels**, enemy guns, troops
4. Shell bursts & smoke (drift with wind)
5. **Aircraft shadow**
6. Low cloud layer
7. Aircraft sprite
8. Archie bursts and high cloud layer
9. HUD / overlays

### 3.3 Showing altitude without perspective
Altitude is shown by:
- **Shadow offset and size.** Low altitude: the shadow is close and sharp. High altitude: it's far and faint.
- **Cloud layers.** Low cloud passes *over* the ground and *under* the plane. High cloud passes over the plane.
- **Ground haze.** At higher bands a palette-shifted haze softens ground detail.

### 3.4 Aircraft sprite
- **Pixel-art sprite drawn rotated** (crisp rotated pixels, like the ground). No pre-drawn heading set is needed.
- **Nine bank frames**, from hard left through level to hard right, so the roll-in looks smooth. Wings foreshorten as the plane tips, the raised wing catches the light, and the lowered wing darkens.
- A **cast shadow** falls away from the plane (down-sun, scaled by altitude), drawn as a soft silhouette at its exact position, so it glides with no shimmer. It's drawn **on the ground's own pixel grid**, in a few bands along the fuselage: each band eases toward the ground height under *it*, so only the part of the shadow actually over a tree or hedge lifts closer to the plane, not the whole silhouette. (Flanders is flat; hills and relief come with the Somme.)

### 3.4b How a turn looks (camera choreography)
1. **Input:** the player moves the mouse or finger sideways.
2. **Tip in:** the plane rolls; the sprite switches to a bank frame.
3. **Pivot:** the plane's heading starts to change. Because the camera lags behind, the plane visibly **swings on screen** by a few degrees.
4. **The world turns:** the camera catches up. Ground and clouds rotate until the plane points up the screen again.
5. **Level off:** the player centres the input, the wings level, and the camera settles. The plane now flies **diagonally across the ground's pixel grid**, and the ground stays rotated.

### 3.4c Plane position on screen
- The plane is **held near its home position** by a soft, damped spring.
- **The camera follows the plane with a smooth lag** (critically damped). Open the throttle and the plane **pulls ahead up the screen** while the ground keeps scrolling at least as fast as before (it never appears to slow); then the camera catches up and the plane eases home. A sharp turn swings it out toward the turn.
- The offset is clamped, so the plane never leaves the central area.

### 3.4d Clouds
- **Semi-transparent, wispy pixel-art clouds** above the plane, rotated with the ground (same camera). Six faint alpha levels, dithered, so edges fray into scattered pixels; shapes are warped and streaked along the wind.
- **Two decks.** A **low deck** (layer 6) hangs just above the plane and casts a shadow. A **high deck** (layer 8, with the Archie bursts) sits above everything, drawn thinner and fainter, drifts slower still, and casts no shadow (too high and thin to block the sun usefully).
- **Clouds hang in place over the landscape:** they move with the ground (no parallax), only creeping with a faint wind, and the plane flies through them. Their pixels stay the same size as everything else. The low deck sits low enough that its shadow falls near its own cloud rather than off-screen.
- **Flying through cloud** is where the motion is: when the plane is inside the low deck, a second field of wisps streaks past close to the camera (3× ground speed), fading in with the cloud's density.
- Clouds also drift slowly with the wind, so they rush past you while flying through them.

### 3.5 The wing problem (signature mechanic)
The BE.2c's lower wing blocked the view directly below. In game:
- A soft **occlusion mask** covers the ground directly under the aircraft's wings.
- **Banking reveals the ground** on the inside of the turn.
- To watch a shell land, you have to *position and bank*, not just hover over the target. This is the core skill of observation.

### 3.6 Procedural world generation
There are **no hand-built levels**. The sector is generated from a seed.

**Two terrain profiles** share the same generator with different parameters:

| | Flanders | Somme |
|---|---|---|
| Ground | Flat, waterlogged, drainage ditches, canals | Rolling chalk downland, valleys, chalk-white trench spoil |
| Landmarks | Canals, windmills, ruined cloth-hall towns, the coast | Ridges, sunken lanes, woods, hilltop villages |
| Exits | Coast, cloud, friendly lines | Cloud, friendly lines |
| Palette | Grey-green, brown water | Green-gold fields turning chalk-white with shelling |

**Generation layers (in order):**
1. **Base terrain (built in the draft), in two levels of noise:**
   - **Biomes** from very large-scale noise, as seen from **low altitude**: a single field (~400 px) fills much of the screen, and woods and lakes run for thousands of px. Flying is exploration.
   - **Detail within each biome:**
     - **Farmland** is irregular fields (warped cellular noise) with **ragged, interlocking edges**, separated by **mostly narrow, patchy dirt margins**: they swell, thin and vanish along a border, with frayed edges, crop tufts growing through, and worn patches spilling into the field. Only some borders have a **hedge**. Where two fields meet with no dirt between them, their crops **intermingle** across a frayed, dithered band. Each field has its own crop: ploughed furrows, green crop stripes, hay rows, speckled meadow (with **patches of poppies**) or pasture.
     - **Woods** are **whole, overlapping tree crowns** of three species (oak, a paler poplar/birch, a dark elm), lit from the north-west. A tree's existence is decided at its centre, so a crown is **never cut** by a biome edge, glade or shore. Woods thin gradually at their edges, and dark forest floor gives way to **scrub that dithers out into the fields**. Glades have frayed, scrubby edges. Trees only ever come in **groups**: clumps reaching out from a wood's edge, and rare **copses** (tight clumps over scrub) out in the fields. No lone, scattered trees.
     - **Lakes** have deep middles, shallow edges, sparse glints, and a shore of mud and reeds.
   - **Blending:** biome borders are frayed by fine noise and dithered, like the clouds' edges, so lake, wood and field bleed into each other.
   - **Crops and wildflowers of a Flanders May** (from period accounts of Flemish farming: colza, flax, clover, grain, dairy meadows):
     - Fields of young wheat, ploughed earth, rough grass, meadow, pasture, flax, red clover and colza (yellow in flower).
     - Wildflowers: poppies and cornflowers in the crop margins; buttercups, ox-eye daisies and poppy patches in meadows; clover in pasture; white hawthorn ("may") blossom on hedges; cow parsley along margins; bluebell carpets in some woods.
     - **Flowers are rare finds.** Each kind blooms only in its own scattered regions, roughly 3 km across and kilometres apart, so a whole day's flying turns up a handful of poppy fields, bluebell woods or yellow colza. Hawthorn and cow parsley are rarer and sparser still.
     - Seasons are not modelled yet (it's always May).
   - **Within-biome mix:** a soft, dithered light/dark patchiness (damp and dry patches) runs across everything, so no field or wood is one flat tone.
   - Still to come: marsh, gentle relief, a river or canal system.
2. **Settlements & roads:** villages placed by spacing rules, connected by roads and a railway line. Churches, farms and crossroads become **navigation landmarks**.
3. **The front:** a front line generated as a wandering band across the map. Friendly lines are always west, enemy east. It has fire trenches, support trenches, communication trenches, wire and a no-man's-land strip.
4. **Military sites:** friendly batteries and the **wireless dugout** behind our lines; enemy guns, dumps, HQs and rail sidings behind theirs. Each is placed with sensible spacing and cover.
5. **Scarring:** craters, shattered woods and ruined villages, with density rising toward the front.

**Persistence (locked):** a **persistent, evolving sector**: generated once per chapter (Flanders, then the Somme), then scarred over time as the war grinds on (craters accumulate, woods thin, villages fall, the front line shifts after offensives). Targets, weather and enemy activity vary each sortie.

**Guarantees** (so generation never breaks play): the target is always reachable and readable, there's always at least one recognisable landmark within a short distance of each target, the front is never closer than a minimum distance to the friendly batteries, and the generation seed is saved for bug reports.

### 3.7 Visual appeal: what makes the top-down view sing
Cheap effects with high impact, all within the palette and performance budget:
- **Cloud shadows** sliding across the ground, separate from the cloud sprites
- **Living light:** the palette slowly shifts through the day (cool morning, flat noon, gold late afternoon, red dusk, blue night)
- **Gun flashes** that grow more dramatic as light fades; at dusk the whole front flickers
- **Very lights and flares** arcing over the trenches at dusk
- **Smoke columns** from burning villages and dumps, leaning with the wind
- **Shell bursts** with distinct silhouettes by calibre: shrapnel puffs in the air, earth fountains on the ground
- **Persistent scars:** craters stay where they fell, so a day's shoot is visible on the land next morning
- **Water** with a simple glint animation; rivers catch the sunset
- **Seasons** as palette sets: green summer, brown autumn mud, white winter frost

### 3.7b Sun, shadows and the light of the hour (built)
- **A real sun.** Its position is computed for Ypres (50.85°N) and the campaign date (from 10 May 1915) in local solar time. Morning shadows fall west, noon shadows north, evening shadows east. They're long when the sun is low and fade out as it sets.
- **Everything casts, softly:** shadows have soft, dithered edges that widen as they lengthen, and they change gradually, re-baked every degree of sun movement and cross-faded in over 1.5 s. Trees and hedges throw shadows across the fields, crowns are lit on their sunny side and dark on the other (re-baked every few degrees of sun movement), the low cloud deck casts shadows that lie on the ground and **move with the ground**, falling h · cot(sun elevation) down-sun of their clouds and drifting with the wind (the high deck is too thin and high to bother). Under a cloud's shadow the light is diffuse, so tree and hedge shadows, highlights, water glints and the plane's shadow all disappear there. The plane's shadow follows the sun. **The plane's and the clouds' shadows fade as the sun drops** (full from ~52° elevation, gone below ~20°), so they're really only visible around midday; the landscape's own shadows stay as strong at any hour.
- **The light of the hour** is a stylised, semi-transparent overlay: banded and dithered pixel colour, with a tint that's stronger away from the sun, a glow pouring in from the sun's side, and light shafts at sunset.
  - **Sunrise and sunset are deliberately over the top:** a strong multiply of gold and orange toward the sun and rose / magenta away from it, a bright glow, bold light shafts, and nine dithered bands. Every palette's warm end is pinks, oranges and golds. Golden hour warms, sunset blazes, dusk cools to violet, and **night is a flat, dark blue filter** (no vignette), the same every night.
  - **The colourful hours last longer:** golden light starts with the sun ~22° up and the colour runs until it's ~10° below the horizon. The clock also slows by up to 70% around sunrise and sunset.
  - **Every dawn and dusk is different:** each draws one of seven palettes (Ember, Rose Ash, Blood Orange, Candy Floss, Brass, Marigold, Peach & Plum) and an intensity from the seed. All are dramatic, some outrageous; about one in ten is softer.
- **Water glints in sunlight:** sparse glint points flash for about half a second each (every ~6 s), as a bright pixel or a tiny four-point star, but only in the sun's **glitter patch**, the stretch of water angled toward the sun (under you at noon, out toward the horizon at sunset). None at night, dimmed under cloud shadow.
- **Clock:** 05:00 → 22:00 passes in about 12 real minutes. A **FAST TIME** debug toggle (bottom-left, above the gauges; on by default for now) makes it 3× faster. For now each visit **starts at a random hour** of the 24. Development aids: hold **]** to run time 40× faster, or start at a given hour with `?time=19.5`.

### 3.8 Day cycle & sunset
Each sortie is one flying day from **mid-morning to dusk**, compressed to **10–15 minutes** of real time.

- The light visibly changes across the sortie (§3.7).
- **Late afternoon:** shadows lengthen, the haze turns gold and spotting range drops slightly.
- **Sunset warning:** the operator lays the **"go home"** panel, and the pocket-watch HUD pulses. Later in the story this panel may gain a personal touch (a goodnight).
- **Dusk:** the screen darkens progressively. Bursts and panels become hard to read, and gun flashes and fires become the only clear landmarks.
- **Turn for home:** the player heads **west** toward the friendly trenches and the aerodrome. A compass-edge marker shows the way.
- **Exit:** the sortie fades out as the **aerodrome's landing flares** come into view in the dusk **[VERIFY dusk flare practice]**, or as you cross back over your own lines. The landing itself is never shown.
- **Staying out too late** is possible but dangerous: you get lost in the dark, fuel runs out, and the debrief gets less forgiving.

---

## 4. Flight model

Simple, slow and stable. This is a 70 mph aeroplane.

### 4.1 Controls

Desktop and mobile are **equal first-class targets**. Every action must work with one thumb, and nothing needs simultaneous inputs.

| Action | Keyboard | Touch |
|---|---|---|
| Steer | **Mouse side to side** (position relative to screen centre = how hard you turn), with a **dead band in the middle** (7.5% of the steering range) where the plane flies straight. Also A / D or ← / →. | **Drag sideways** from where your finger touched down. Lift to straighten. |
| Full power (engine boost) | **Hold the mouse button** (or Space / W) | **Double-tap and hold** the second tap (you can keep steering with the same finger) |
| Climb / descend one altitude band | E / Q | Altimeter buttons (HUD edge) |
| **Hands off** (straight and level at cruise) | **T**, or the HUD button | HUD button (bottom-right) |
| Hold circuit | C | HUD button **[DECIDE]** (long-press now conflicts with steering) |
| Map | M | Map button / swipe up |
| Clock-code overlay | Tab (hold) | Appears automatically when a shell is in flight |
| Message radial | Enter | Wireless button |
| Reel aerial in / out | R | Aerial lamp button |
| Head for home | H | Compass button |
| Pause | Esc / P | Pause button; also auto-pause when the app loses focus |

**Steering model:** input sets a **bank target**, not a heading. The plane rolls toward that bank at a limited roll rate, and the bank sets the turn rate. A sluggish, stable BE.2c: a full circle takes about **42 seconds** at full bank, and the roll-in is gentle. (Faster turning made the rotating world nauseating.)

**Mobile layout rules:** portrait *and* landscape supported. The game fills the screen in both; the view simply shows more of the world along the long axis. The HUD sits in thumb-reach corners, there are no hover-only interactions, and minimum touch targets are 44 px.

### 4.2 Altitude bands
Three discrete bands keep it readable:

| Band | Approx. | View of bursts | Archie / ground fire | Enemy fighters |
|---|---|---|---|---|
| Low | ~2,000 ft | Sharp, large | High (Archie and machine guns) | Low |
| Spotting | ~4,000–6,000 ft | Good | Medium | Medium |
| High | 8,000 ft+ | Small, hazy | Low | High (they hunt up here) |

Changing band takes several seconds and can't be done instantly.

### 4.3 Wind
- A per-sortie wind vector **drifts the aircraft** and **drifts smoke** from bursts.
- Smoke drifting across the target can hide the next burst, so you reposition upwind.

### 4.3b Hands off (built)
- **Historically grounded:** WWI aircraft had no autopilot, but the BE.2c was designed at the Royal Aircraft Factory to be **inherently stable**, and its test pilots demonstrated flying it with hands off the controls **[VERIFY: Edward Busk's 1914 hands-off flights]**. So "Hands off" simply lets go of the stick.
- **Effect:** the wings level, the engine returns to cruise, and the plane **holds the heading it rolls out on**, with gentle corrections, so engaging mid-turn doesn't swing it back. The mouse is free, so you can click UI without jerking the plane.
- Lives in its own flight-aids module (`sim/aids.ts`), a small tested state machine (off ⇄ hold), ready for more aids such as the hold circuit.
- **The game starts in Hold.**
- **Taking the stick back:** a click or touch on the view takes control *and* opens the throttle for as long as it's held. A steering key takes control without power. The button shows its state.

### 4.4 Hold circuit (a flying aid, not idle play)
- Pressing **C** puts the aircraft into a steady oval or figure-eight around the current point.
- It frees your attention for what matters: watching the ground, reading panels, keying messages. It is never an "auto-play" mode.
- Upgrades improve circuit shape (tighter, better banking toward the target).

### 4.4b Engine: cruise and full power
- **Cruise** is the default: steady speed, low fuel use, and the engine cools.
- **Full power** (hold / double-tap-hold): faster, burns fuel about **2.5× faster**, and the **engine heats up**.
- **Overheating:** at maximum heat the engine is forced back to cruise until it has cooled well down (it won't restart full power at the first chance). Later: risk of engine damage or a stopped engine if abused **[VERIFY]** air-cooled RAF 1a overheating behaviour.
- **Speed changes are gradual** (the plane surges and eases), which is what pushes the plane off its screen home (§3.4c).
- **HUD:** engine-heat gauge and fuel gauge.

### 4.5 Endurance & light
- **Fuel** and **daylight** are both sortie clocks, shown as a pocket-watch and fuel gauge.
- When either runs low, the Major's voice is your conscience: "Head for home."

### 4.6 Damage
No hit-point bar. Damage is **located** and has **readable consequences**:

| Hit | Effect |
|---|---|
| Wings / fabric | Slower turns, visible tatters |
| Engine | Speed loss, smoke trail, forced exit soon |
| Wireless set | Can't transmit, so the shoot is over. Head for home. **[DECIDE]** any backup signalling (e.g. message bag drop)? |
| Trailing aerial | Cut, so no signal until a spare is reeled out (if fitted) |
| Pilot wounded | Screen vignette, the day ends early and calendar days pass in recovery (§10) |

---

## 5. The spotting loop (core gameplay)

### 5.1 Overview
```
Morning orders → In flight over the lines → Find target → Signal battery "ready"
  → Battery fires → Observe burst → Read offset in clock code → Send correction
  → Battery adjusts → … repeat until on target → "OK" → Fire for effect
  → Next target → Sunset → Turn for home → Fade → Evening debrief
```

### 5.2 Finding the target
- The briefing gives a **target on a trench map** with grid squares.
- In flight, **M** opens the map on your knee. By default it does **not** show your position. You match landmarks (crossroads, a wood, a church, a bend in the river) to know where you are.
- Assist option: show an approximate position marker.

### 5.3 The battery fires
- You signal **ready**. A few seconds later you see the **gun flash** at your battery on the friendly side (a visual cue that the shell is on its way).
- **Flight time** of several seconds follows. You must be positioned with the target *visible* (not under the wing, not under cloud, not in smoke) when it lands.
- A missed observation means sending **"not observed"**, which costs time and fuel.

### 5.4 Reading the clock code
Based on the RFC clock code **[VERIFY exact ring values]**:

- Imaginary rings centred on the target. **12 o'clock = north.**
- Rings by distance:

| Letter | Y | Z | A | B | C | D | E | F |
|---|---|---|---|---|---|---|---|---|
| Yards | 10 | 25 | 50 | 100 | 200 | 300 | 400 | 500 |

- A burst 100 yards east → **B3**. 200 yards south-south-west → **C7**.
- Hold **Tab** to overlay a translucent clock-code disc on the target (historically observers carried a celluloid disc **[VERIFY]**).
- Click or tap where the burst landed. The game snaps it to the nearest ring and hour.

### 5.5 Accuracy matters
- Your reported correction is what the battery uses. **A wrong reading moves the next shell the wrong way.** You'll see your mistake land.
- Bursts inside the **Y/Z** ring count as "on target". You send **OK**, and the battery fires for effect.
- Target types have different "kill" thresholds: a trench junction needs a few hits, a gun pit needs a direct hit.

### 5.6 Multiple batteries (later)
- Mid-campaign, you work with **two or more batteries** with different call signs and fire rates.
- Juggling them is the main depth curve. It stays deliberate: batteries wait for your call, so pressure comes from light, fuel and Archie, not reaction speed.

---

## 6. Wireless & Morse

### 6.1 One-way by design
- The set **transmits only**. You never receive anything by radio.
- All replies come from the ground: **signal panels** (§7).

### 6.2 Trailing aerial
- To transmit, the aerial must be **reeled out** (takes a few seconds).
- Reel it **in** before diving or evasive manoeuvres, or risk snapping it.
- A small, very tactile state machine: *stowed → reeling out → deployed → reeling in*.

### 6.3 Sending a message (assisted only)
- Open the **message radial** and pick a message (or, for corrections, tap the clock-code overlay).
- The pilot keys it. You **see and hear** it go out: the Morse tape on the HUD fills dot by dash, with the click of the key and the crackle of the spark.
- There is **no manual keying.** Morse is atmosphere and story, not a dexterity test. This keeps desktop and mobile identical.

### 6.4 Transmission time is the cost
- Every message takes seconds to send, longer for longer messages.
- While a message is going out, the pilot has one hand on the key, so steering is gentle. Use **Hold circuit** first.
- This trade-off (fly, watch or talk) is the core tension.

### 6.5 Message vocabulary
A **game-defined** set inspired by real procedure **[VERIFY real RFC codes/abbreviations]**:

| Message | Meaning |
|---|---|
| Call sign + ready | "I'm in position, fire when ready" |
| Clock code (e.g. B3) | Correction |
| Not observed | Didn't see that one, fire again |
| OK | On target |
| Fire for effect | Proceed with series |
| Going home | Ending the shoot |
| *(Personal messages)* | See §6.7 |

### 6.6 Your "fist"
- Morse operators recognised each other's keying rhythm, called their **fist**.
- The pilot has a **fixed, characterful fist** (a defined rhythm with a recognisable quirk), the same every time it's heard.
- **Story hook:** the operator, an old Post Office telegraphist, knows your fist. When you're hurt, the fist stumbles, and he notices. In Chapter 2, the **new lad** has to learn your fist (see `STORY.md`).

### 6.7 Personal messages (Firewatch-style choices)
- At certain moments you can key **off-procedure messages**: a joke, a question, an apology, silence.
- These cost transmission time (and fuel/light) and are technically against regulations.
- Choices shape **Rapport** (§10.2) and the operator's panel replies.

---

## 7. Ground signal panels ("his voice")

### 7.1 Basics
- White cloth strips laid out near the battery or wireless dugout.
- Readable from the air only when you're **close enough, below cloud and not wing-occluded**.
- Panels change in response to your messages, with a short delay (he has to run out and lay them).

### 7.2 Vocabulary
- **Official** shapes: acknowledge, battery ready, wait, cease fire / go home **[VERIFY real shapes; otherwise game-defined]**.
- **Unofficial** embellishments unlock with Rapport: an extra strip, an odd angle, initials, a shape that answers your joke.
- A **Panel Glossary** in your logbook fills in as you learn each shape. Learning to read him is part of the progression.

### 7.2b Two operators, two panel styles
- **The old hand (Ch. 1):** crisp, fast, perfectly laid panels. Unofficial touches are rare and dry.
- **The new lad (Ch. 2):** slower, sometimes wrong or crooked (a mechanic you must read through). His mistakes decrease as you coach him through letters and patience on the air, and over time he adopts the old hand's quirks.

### 7.3 Silence as a mechanic
- No panels when you expect them is itself a story beat: the dugout was shelled, he's been moved, or he's angry with you.

### 7.4 His voice in writing
Off duty, the operator answers in writing. All of these arrive **between sorties** and are collected in the **logbook**:

| Format | What it is | Tone |
|---|---|---|
| **Morse transcripts** | His wireless log of what *you* sent that day, copied out in pencil. He adds margin notes: corrections, comments on your fist, the odd joke. | Official sheet, unofficial margins |
| **Letters** | Personal letters passed through the battery and squadron. | Where the relationship deepens |
| **Telephone messages** | Battery-to-squadron phone messages, written down by the Recording Officer, who hands them over with a raised eyebrow | Short, often funny |
| **Notes with the supplies** | Scraps tucked into returned equipment, a sketch of what the shoot looked like from the ground | Rare, precious |

- Written messages are **reactive.** They respond to what you did that day: your choices, your accuracy, the personal messages you keyed, whether you stayed out too late.
- Some letters ask questions. You **write back** in the logbook (pick a reply, or keep it short). Your answers shape his next letters and Rapport.
- Transcripts are also a **learning tool.** They show your mistakes ("you sent C7, it fell at C5") so the player improves.
- Paper, handwriting and pencil in pixel art: each format has its own look so they're recognisable at a glance.

---

## 8. Hazards

### 8.1 Archie (anti-aircraft fire)
- Black bursts that **bracket** you: the first lands wide, then they walk closer.
- Accuracy rises the longer you fly **straight, level and at the same band**.
- **Counterplay:** change heading or band. That disrupts spotting, so it's a constant trade-off.
- Bursts leave lingering smoke puffs (pooled particles, capped).

### 8.2 Enemy aircraft
- **Fokker Eindecker** (1915–16). They appear from the east, often out of the sun or from cloud.
- **You are not a fighter.** Counterplay is evasion: dive for friendly lines, hide in cloud, turn tight (the BE.2c's stability makes this hard).
- Defensive armament is a late, limited upgrade **[VERIFY BE.2c single-seat arrangements]**.
- The squadron layer can request **fighter cover** (e.g. DH.2 patrols from 1916), which reduces encounter rate.

### 8.3 Weather
| Weather | Effect |
|---|---|
| Cloud | Blocks view of bursts and panels. Also cover from fighters. |
| Wind | Aircraft drift, smoke drift |
| Haze | Reduced detection range for bursts |
| Rain squall | Ends the shoot (exit trigger) |

The forecast is given at the briefing and is sometimes wrong.

### 8.4 Ground fire
- Rifle and machine-gun fire at **Low** band only.

### 8.5 Friendly shells
- Rare hazard near your own battery at Low band. Aircraft really were occasionally hit by their own artillery **[VERIFY frequency]**. Use sparingly, for story weight.

---

## 9. Sortie structure (no levels)

The game is a **continuous campaign calendar**, not a level list. Each in-game flying day is one **sortie** over the generated sector.

### 9.1 A day in the campaign
1. **Morning in the squadron office.** The Major's orders for the day, weather and the map board. Overnight post arrives: letters, transcripts, phone messages (§7.4).
2. **Cold open in flight.** The sortie starts already airborne, approaching the lines. **No takeoff is ever shown.**
3. **The day's work.** Orders are drawn from a pool weighted by the campaign date and story state (§9.3). New orders can arrive mid-sortie via the operator's panels (e.g. "new target").
4. **Mid-day exits (optional or forced).** Fuel, damage or weather can cut a day short. The plane heads for the nearest exit feature:

| Exit feature | Historical sense |
|---|---|
| Cloud bank | Crews used cloud to escape fighters |
| Rain squall | Weather ends operations |
| Friendly lines | Safe once back over your trenches |
| Coast | Flanders chapter only |

5. **Sunset (the standard ending).** Most days end at dusk (§3.8): the "go home" panel, the darkening screen, the turn west, and a fade on the aerodrome flares.
6. **Evening debrief.** The Recording Officer logs results, the map board updates, and rewards and Rapport are tallied. You can write back to any letters.
7. **Night.** The calendar advances **only when you fly** a day. Nothing happens while you are away.

**No landing is ever shown.**

### 9.2 Failure
- **Shot up:** the day ends early via the nearest exit with partial results.
- **Shot down / badly wounded:** fade to black. There is **no game over.** The story absorbs it:
  - The debrief becomes a **hospital** scene (casualty clearing station). Calendar days pass.
  - His letters and transcripts find you there. His tone reacts to what happened.
  - Squadron news arrives secondhand: who flew your sector, what changed on the ground.
  - Your return flight shows the sector changed while you were away.
- There is **no permadeath.** The pilot can be hurt, but the story always continues.

### 9.3 Order types (drawn per day)

| Order | Gameplay | Becomes available |
|---|---|---|
| **Artillery shoot** | Core loop (§5) | From day 1 |
| **Photo reconnaissance** | Fly a straight strip at a constant band, exposing plates on cue. High Archie risk because you can't weave. | First week |
| **Counter-battery** | The target is *unknown*. Spot enemy gun flashes, mark them, then shoot them. | Act 2 |
| **Fleeting targets** | Spot movement (a column, a train) and call the nearest battery quickly **[VERIFY "zone call" timing]** | Act 2+ |
| **Contact patrol** | During an attack, find your own infantry by their flares or panels and report how far they've got. | Big offensive days only |

### 9.4 How the story advances
The story is driven by **time and state**, not level completion:

- **Calendar beats:** fixed historical dates (e.g. the start of an offensive) that always happen.
- **Conditional beats:** fire when conditions are met (Rapport threshold, number of shoots together, a choice in a letter, a near miss).
- **Ambient beats:** small, repeatable moments (a new panel joke, a margin note) that fill the days between.
- Every day produces *something* for the logbook, so even an uneventful sortie moves the relationship.

## 10. Progression (story-led)

Archie is **not an idle game.** No offline progress, no timers to wait on, no automation layer. Progression exists to serve the story and to make the player feel more capable over time.

### 10.1 What carries over between days
- **The sector itself:** craters, ruins and the shifting front (§3.6)
- **The logbook:** every day's entry, transcripts, letters, photos, panel glossary
- **Rapport** with each operator (§10.2)
- **The squadron:** who's still here, who's new, who's gone. The empty chairs at the mess table are visible in the morning scene.
- **Equipment:** upgrades earned through the story (§10.3)
- **Pilot skill:** the player's own improvement. The game doesn't need XP bars.

### 10.2 Rapport
- A hidden value (never shown as a number) tracking the relationship.
- It rises through reliability, accuracy, personal messages and letter replies. It falls through carelessness, staying out too late, or certain choices.
- It changes **tone, not access.** Panel jokes, letter warmth, his margin notes and how fast he anticipates you all shift. All main story beats remain reachable, but they *land* differently.

### 10.3 Equipment (earned, not bought)
No currency or shop. Upgrades arrive **as story events**: the Major gets you a new engine after a good week, the operator scrounges a better receiver, a fellow pilot leaves you his compass.

| Category | Examples (1915–16 plausible) |
|---|---|
| Aircraft | Engine improvements, better instruments, spare aerial |
| Wireless | Improved transmitter, faster aerial winch |
| Camera | Better plate camera, more plates **[VERIFY camera types]** |
| Navigation | Clock-code disc, better maps, compass |
| Defence | Late, limited gun mounting |
| Ground side | His dugout improves: a telephone line to the battery (faster corrections), more panel cloth |

### 10.4 Difficulty
- **Story mode (default):** generous light, forgiving Archie, position marker on map, slow-motion on bursts.
- **Standard:** as designed.
- **Authentic:** no position marker, no burst slow-motion, harsher weather.
- Difficulty never changes the story, only the flying.

---

## 11. Tutorial: the first week

No tutorial levels. The **first in-game week** teaches one new mechanic per day, triggered by the calendar. **The old hand is the tutor:** his panels guide you in the air, and his pencilled transcript corrections teach you overnight. The Major gives the orders; the old hand shows you how. The world is already generated; day 1 just keeps you on the safe side of it.

| Day | Order | Teaches | How the day ends |
|---|---|---|---|
| 1 | **Practice shoot** behind the lines | Flying, altitude bands, the wing problem, spotting bursts. **First contact: the old hand** lays simple panels to guide you. | First sunset: the "go home" panel and the turn west |
| 2 | **A quiet sector** | Clock code, aerial, assisted Morse, reading panels. **First real shoot with the old hand.** | Sunset, plus the first **Morse transcript** next morning |
| 3 | **Shoot under Archie** | Evasion, the spotting-vs-safety trade-off, reeling the aerial in | Cloud bank or sunset |
| 4 | **Out of the sun** | First Fokker. Evasion, running for cloud or friendly lines. | Friendly lines |
| 5 | **Plates** | Photo reconnaissance | Rain squall |
| 6–7 | Free days | The order pool opens up. The first personal **letter** arrives in the day 6 morning post. | Sunset |

If the player struggles, the day repeats as "another day of the same orders" with fresh generation, so there's never a hard fail state.

---

## 12. HUD & UI

- **Instrument board (built):** pixel-art period instruments along the bottom-left: black faces, cream figures, brass bezels.
  - **Compass:** a liquid compass. The card turns under a fixed lubber line, lags in turns and swings past before settling, as liquid-damped compasses did.
  - **Rev indicator (RPM):** about 1,250 at cruise and 1,800 at full power; revs sag to about 1,100 when the engine overheats **[VERIFY RAF 1a ~90 hp at 1,800 rpm]**.
  - **Temperature:** in the style of the period's "transmitting thermometer". Artistic license: that instrument read radiator water on water-cooled engines, and the BE.2c's air-cooled RAF 1a didn't have one.
  - **Petrol gauge.**
  - The temperature needle sits **mid-scale at cruise** (a warm engine), and climbs from there on full power.
  - All needles lag slightly and tremble with engine vibration, and the danger zones light up when they matter.
- **Engine warnings, in two stages:**
  - **Running hot** (heat past 70% on full power): the RPM and TEMP red zones blink, their labels flash red, the dials shake, needles twitch, and the exhaust trails light grey smoke.
  - **Overheated** (locked to cruise): all of that, harder. The bezels flash red, the prop misfires (the blur keeps collapsing), and thick dark smoke trails behind.
- **Source:** a 1917 RFC cadet's lecture notes list the dashboard as rev indicator, airspeed indicator, altimeter, petrol-tank pressure gauge (kept up with a hand pump), petrol gauge, clinometer, transmitting thermometer, compass and watch. (Australian War Memorial, notebook of J. S. L. Ross.)
- **Pocket watch** (built), **top-left**, its own module (`ui/clock.ts`), with a small brass **AM / PM** tag just off the case at half past ten and a **digital readout** (e.g. `7:29`) under it, above the date: white enamel face, blued-steel hands, brass case and bow, and a red mark on the rim at **sunset**, the time to be heading home. The date sits beneath it on a small plate (e.g. `10 MAY 1915`).
- **Still to add:** altimeter (with altitude bands), the aerial status lamp. Possibly airspeed, the petrol-pressure hand pump (a nice period chore), and a clinometer.
- **Morse tape** strip along the bottom showing what you're sending, letter by letter.
- **Overlays:** map (M), clock-code disc (Tab), message radial.
- **Logbook** (between sorties): daily entries, panel glossary, letters, transcripts, photos.
- Pause is always available.

---

## 12.5 Audio (placeholder; Kevin has strong opinions, to be revisited)

- **All music and sound is synthesised in JavaScript** (Web Audio API). No pre-recorded music tracks.
- **One almost unbroken soundtrack** for the whole game: it flows continuously from the squadron office into flight, through sunset, into the debrief and the next morning, with no hard cuts between scenes.
- Music is **driven by game state** so it lines up seamlessly: time of day, altitude, danger, Rapport, chapter, story beats.
- Sound effects (engine, wind, key clicks, spark crackle, bursts) come from the same synth engine so everything sits in one sonic world.
- Bonus for performance: a tiny download, since there are no audio files.

## 13. Accessibility & assists

- Morse is always assisted. No timing or dexterity input anywhere.
- Position marker on the map
- Slow-motion when a shell is about to land
- Colour-blind-safe burst and panel markers
- Screen shake and flash toggles
- Fully remappable keys, plus mouse-only and touch-only play

---

## 14. Performance-driven design constraints

Detailed in the technical doc, but these shape the mechanics:

- Full-screen canvas, fixed physical pixel size (`TECH.md` §2). Gameplay must fit the smallest (portrait phone) view.
- The rotating world is drawn as **one rotated image per layer per frame** (ground, clouds), composed from cached noise tiles.
- Terrain built from **tile chunks pre-rendered** to offscreen buffers. Only dynamic decals (craters) are redrawn.
- **Pooled particles** with a hard cap (bursts, smoke, Archie).
- Clouds are a small number of large sprites with parallax, not per-pixel simulation.
- **Target 60 fps**, with a 30 fps low-power mode. Stop rendering when the tab is hidden.
- Simulation (flight, shells, story state) is separate from rendering, so rendering can drop to 30 fps on weak phones without changing gameplay.
- **Mobile budget:** must hold 60 fps on a mid-range phone, minimal battery drain, small download (target < 20 MB first load).

---

## 15. Historical notes & deliberate simplifications

| Real history | In game | Why |
|---|---|---|
| Wireless was one-way, Morse only | Same | Core to the story |
| Replies came by ground panels | Same, plus unofficial "personal" panels | The operator's voice |
| Spotting crews used the clock code | Same, simplified snapping | Core mechanic |
| Altitude is continuous | 3 bands | Readability |
| Ground-to-air communication was minimal | Panels in the air; letters, transcripts and phone messages on the ground | His voice without two-way radio |
| Takeoffs and landings happened | Never shown | Design choice. Sorties fade at historically plausible exits, usually dusk. |
| The ground station was manned by RFC wireless operators (air mechanics) | The central character | Story |
| Morse operators recognised each other's "fist" | Mechanic and story hook | Story |

**[VERIFY] list:** clock-code ring values, real RFC message abbreviations, ground-panel shapes, celluloid disc usage, dusk aerodrome flares, BE.2c single-seat armament, 1915–16 camera types, zone-call timing, frequency of friendly-shell hits.

---

## 16. Open questions

1. ✅ Two chapters: Flanders, then the Somme.
2. ✅ No permadeath. The story absorbs being shot down or wounded.
3. ~~NPC idle crews~~ — removed (not an idle game).
4. ✅ Assisted Morse only.
5. ✅ Desktop and mobile equally.
6. ✅ Evolving sector per chapter.
7. ✅ Days last 10–15 min real time. The calendar advances only when you fly.
