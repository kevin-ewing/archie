# Archie — agent instructions

Follow **[AGENTS.md](AGENTS.md)** (Ponytail) for all code. Project-specific rules below take precedence where they're more specific.

## Read first
- `docs/MECHANICS.md`: what the game does
- [Story workshop](docs/story/README.md) and [story bible](docs/STORY.md): current crew decisions, campaign continuity and the [four dossiers and writing skills](docs/STORY.md#current-cast-and-writing-references). Follow the story-work guidance in [AGENTS.md](AGENTS.md#archie-story-work).
- `docs/TECH.md`: stack, module layout, performance rules
- `docs/TRENCHES.md`: how British/French and German trenches differed (for drawing the fronts)
- `docs/AGENT_TOOLS.md`: **see what your change does, fast**: `npm run snap` (world → PNG), `npm run fingerprint` (output unchanged?), URL scenarios, and the `archie` console API in the running game (state, timings, time/place, snapshots). Use these to check your own work.

## Modularity, the Ponytail way
Kevin wants clean modules, and Ponytail wants no speculative code. Both hold:
- **One module per real responsibility** (display, loop, flight, terrain gen…). Split when a file does two jobs, not before.
- **Modules talk through plain data and small functions.** No class hierarchies, DI containers, event buses or "managers" until two real callers need one.
- **No empty folders or placeholder files.** A module is created when the first feature needs it.
- **Keep runtime dependencies exceptional.** Tone.js is the sole runtime dependency; do not add another when the platform or existing code covers it.

## Hard rules
- Pixels must stay crisp: never draw the game scaled with smoothing on (see `src/render/display.ts`).
- **One pixel size for everything:** ground, plane, shadow and clouds all use 1 game pixel = 1 texel. Parallax moves layers; it never scales them.
- World graphics are bitmaps drawn with `drawImage`. Never fill vector shapes under rotation (they antialias). One rotated image per layer (see `docs/TECH.md` §2).
- Simulation never reads from rendering; rendering only reads simulation state.
- Everything random goes through `src/core/noise.ts` (seeded) so worlds are reproducible.
- World layers are generated in order: front plan (`world/fronts.ts`) → landscape (`ground.ts`) → farms (`structures.ts`) → stamps (`generate.ts`). A layer reads only earlier layers, never a later one.
- Historical claims in docs stay marked **[VERIFY]** until checked.
- Non-trivial logic ships with one runnable check: `npm run check`.
