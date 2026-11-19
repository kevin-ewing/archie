// Web Worker: generates tiles off the main thread so flying never hitches (a ground tile takes ~15 ms).

import type { TileData } from './ground.ts';
import { generateTile, type TileRequest } from './generate.ts';

export type TileJob = { id: number; req: TileRequest };
export type TileResult = { id: number; tile: TileData; ms: number }; // ms: how long it took to make (the debug panel's tile counters)

const worker = self as unknown as {
  onmessage: (e: MessageEvent<TileJob>) => void;
  postMessage: (msg: TileResult, transfer: Transferable[]) => void;
};

worker.onmessage = ({ data: { id, req } }) => {
  const t0 = performance.now();
  const tile = generateTile(req);
  const ms = performance.now() - t0;
  const buffers = [tile.rgba.buffer, tile.heights?.buffer, tile.glints?.buffer].filter((b) => b !== undefined);
  worker.postMessage({ id, tile, ms }, buffers);
};
