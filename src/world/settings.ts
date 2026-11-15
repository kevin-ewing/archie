// World generation settings for the current tile request, read by every layer (fronts, landscape, farms,
// front works). Set per request from the scene's features (see world/generate.ts); a plain module of its
// own so no layer has to import another just to read them.

/**
 * Development density: `density` > 1 packs the world's additions closer together for local debugging
 * (fronts and farms `density`× as frequent). Set per tile request from the scene's features (see
 * world/generate.ts); 1 in production.
 */
/**
 * Fire-trench styles (the front is being built one part at a time; see `only` in world/generate.ts):
 *  - traversed:  dug in, a square wave of fire bays staggered by traverses (the standard design).
 *  - hasty:      a shallow, roughly straight ditch with a low spoil bank and the odd sandbag (newly taken
 *                ground, early war).
 */
export const TRENCH_STYLES = ['traversed', 'hasty'] as const;
export type TrenchStyle = (typeof TRENCH_STYLES)[number];

/** Per-request settings: development density, whether the fronts exist (when off, buildings ignore
 *  them), only the trench lines (development: everything else on the front is left out), and their style. */
export const DEV: { density: number; fronts: boolean; onlyTrenches: boolean; trenchStyle: TrenchStyle; frontLine: boolean } = { density: 1, fronts: true, onlyTrenches: false, trenchStyle: 'traversed', frontLine: false };
