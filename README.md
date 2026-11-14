# Archie

![Archie in flight](public/social-card.png)

*Archie* is a top-down story game about flying an RFC observation aircraft over the Western Front in 1915–16. You are not a fighter ace: you are the eyes of the artillery, circling above an evolving landscape and communicating by one-way Morse with a wireless operator on the ground.

Across 20–25 sorties in Flanders and the Somme, routine signals become a friendship carried through cloth panels, transcripts, and letters. Every flight ends at sunset. Failure changes the story rather than ending it, and the land retains the scars of the campaign.

The finished game is intended to be a 4–6 hour, historically grounded experience built around patient flying, observation, communication, and the quiet cost of the air war. It uses crisp procedural pixel art and a continuous synthesised soundtrack, and is designed equally for desktop and mobile browsers.

## Development

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Run the checks and production build with:

```sh
npm run check
npm run build
```

Performance checks:

```sh
npm run benchmark         # show median and p95 subsystem timings
npm run benchmark:check   # compare with the checked-in baseline
npm run benchmark:record  # append a dated run to benchmarks/history.jsonl
npm run benchmark:update  # accept a deliberate performance change
npm run verify            # tests, performance regression check, and production build
```

The regression check reports every subsystem's before/after timing and fails when both its median and p95 have slowed by more than 50%. Only update the baseline after examining and accepting the change.

The fuller design lives in [the story bible](docs/STORY.md), [mechanics](docs/MECHANICS.md), and [technical design](docs/TECH.md).
