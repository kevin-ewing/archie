// Web Worker: generates tiles off the main thread so flying never hitches (a ground tile takes ~15 ms).

import type { TileData } from './ground.ts';
import { generateTile, type TileRequest } from './generate.ts';

export type TileJob = { id: number; req: TileRequest };
export type TileResult = { id: number; tile: TileData };

const worker = self as unknown as {
  onmessage: (e: MessageEvent<TileJob>) => void;
  postMessage: (msg: TileResult, transfer: Transferable[]) => void;
};

worker.onmessage = ({ data: { id, req } }) => {
  const tile = generateTile(req);
  const buffers = [tile.rgba.buffer, tile.heights?.buffer, tile.glints?.buffer].filter((b) => b !== undefined);
  worker.postMessage({ id, tile }, buffers);
};
