// Colours shared by ground.ts, military.ts and season.ts. A leaf module (no imports), so the three can import
// each other's functions without a cycle breaking their top-level constants.

export type RGB = readonly [number, number, number];

export const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

export const WATER = { deep: rgb(0x34494f), shallow: rgb(0x48606a), glint: rgb(0x7d9599), pool: [rgb(0x3c4642), rgb(0x46524c)] as const }; // pool: muddy standing water (shell holes, flooded ditches)
export const SHORE = { mud: rgb(0x6a5e43), reeds: rgb(0x535b33) };
export const DIRT = { dry: rgb(0x7d6a49), worn: rgb(0x6c5a3d), rut: rgb(0x574732) };
