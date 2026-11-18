import { barnScene, type BarnScene } from './barn-art.ts';

export type BarnJob = Required<Parameters<typeof barnScene>>;

const worker = self as unknown as {
  onmessage: (event: MessageEvent<BarnJob>) => void;
  postMessage: (scene: BarnScene, transfer: ArrayBuffer[]) => void;
};

worker.onmessage = ({ data }) => {
  const scene = barnScene(...data);
  // This worker serves one request. Transfer its art so the menu thread doesn't copy the rasters.
  const buffers = new Set([scene.px.data.buffer]);
  for (const { art, shadow } of scene.drawn) {
    buffers.add(art.data.buffer);
    buffers.add(shadow.data.buffer);
  }
  worker.postMessage(scene, [...buffers]);
};
