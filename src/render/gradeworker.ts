// Web Worker: paints the light of the hour (render/grade.ts paintGrade: the overlay's tint and glow, and the
// cloud tint) off the main thread, and hands them back as images ready to draw, so a new painting (on every
// quarter degree of a turn, or a change in the light) costs the frame nothing.

import { paintGrade, type GradeJob } from './grade.ts';

const worker = self as unknown as { onmessage: (e: MessageEvent<GradeJob>) => void; postMessage: (msg: unknown, transfer: Transferable[]) => void };
const bitmap = (px: Uint8ClampedArray<ArrayBuffer> | null, w: number, h: number) => (px ? createImageBitmap(new ImageData(px, w, h)) : Promise.resolve(null));
worker.onmessage = async ({ data: job }) => {
  const p = paintGrade(job);
  const [tint, glow, cloud] = await Promise.all([bitmap(p.tint, job.w, job.h), bitmap(p.glow, job.w, job.h), bitmap(p.cloud, job.w, job.h)]);
  worker.postMessage({ tint, glow, cloud }, [tint!, glow, cloud].filter((b): b is ImageBitmap => !!b));
};
