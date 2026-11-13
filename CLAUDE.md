# Archie — agent instructions

Follow **[AGENTS.md](AGENTS.md)** (Ponytail) for all code. Project-specific rules below take precedence where they're more specific.

## Read first
- `docs/MECHANICS.md`: what the game does
- `docs/STORY.md`: narrative bible
- `docs/TECH.md`: stack, module layout, performance rules

## Modularity, the Ponytail way
Kevin wants clean modules, and Ponytail wants no speculative code. Both hold:
- **One module per real responsibility** (display, loop, flight, terrain gen…). Split when a file does two jobs, not before.
- **Modules talk through plain data and small functions.** No class hierarchies, DI containers, event buses or "managers" until two real callers need one.
- **No empty folders or placeholder files.** A module is created when the first feature needs it.
- **Zero runtime dependencies.** Dev-only: TypeScript and Vite.

## Hard rules
- Pixels must stay crisp: never draw the game scaled with smoothing on (see `src/render/display.ts`).
- **One pixel size for everything:** ground, plane, shadow and clouds all use 1 game pixel = 1 texel. Parallax moves layers; it never scales them.
- World graphics are bitmaps drawn with `drawImage`. Never fill vector shapes under rotation (they antialias). One rotated image per layer (see `docs/TECH.md` §2).
- Simulation never reads from rendering; rendering only reads simulation state.
- Everything random goes through `src/core/noise.ts` (seeded) so worlds are reproducible.
- Historical claims in docs stay marked **[VERIFY]** until checked.
- Non-trivial logic ships with one runnable check: `npm run check`.
