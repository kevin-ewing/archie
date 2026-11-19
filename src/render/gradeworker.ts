// Web Worker: paints the light of the hour's two overlay images (render/grade.ts gradePixels) off the main
// thread, so a repaint (several a second around sunset, ~1–4 ms each) never lands inside a frame.

import { gradePixels, type Grade } from './grade.ts';

export type GradeJob = { size: number; g: Grade; radius: number };
export type GradeResult = { tint: Uint8ClampedArray<ArrayBuffer>; glow: Uint8ClampedArray<ArrayBuffer> };

const worker = self as unknown as { onmessage: (e: MessageEvent<GradeJob>) => void; postMessage: (msg: GradeResult, transfer: Transferable[]) => void };
worker.onmessage = ({ data: { size, g, radius } }) => {
  const px = gradePixels(size, size, g, { x: 1, y: 0 }, undefined, radius);
  worker.postMessage(px, [px.tint.buffer, px.glow.buffer]);
};
