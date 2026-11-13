// One entry point for generating any tile, used by the worker and by the main-thread fallback.

import { groundChunk, type TileData } from './ground.ts';
import { cloudChunk, cloudShadowChunk } from './clouds.ts';
import { shadeTile, type ShadeSun } from './shading.ts';

export type TileRequest =
  | { kind: 'ground' | 'clouds' | 'cloudShadow'; seed: number; cx: number; cy: number }
  | { kind: 'shade'; cx: number; cy: number; heights: Uint8Array<ArrayBuffer>; sun: ShadeSun };

export function generateTile(req: TileRequest): TileData {
  switch (req.kind) {
    case 'ground':
      return groundChunk(req.seed, req.cx, req.cy);
    case 'clouds':
      return { rgba: cloudChunk(req.seed, req.cx, req.cy) };
    case 'cloudShadow':
      return { rgba: cloudShadowChunk(req.seed, req.cx, req.cy) };
    case 'shade':
      return { rgba: shadeTile(req.heights, req.sun, req.cx, req.cy) };
  }
}

/** Buffers to hand over (not copy) when sending this request to a worker. */
export const requestTransfer = (req: TileRequest): Transferable[] => (req.kind === 'shade' ? [req.heights.buffer] : []);
