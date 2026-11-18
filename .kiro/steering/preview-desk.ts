// Render the Story desk as barn.ts draws it (each thing turned whole, nearest neighbour, its shadow `depth` px
// down-right) to a PNG at 2x, to look at new desk art beside its neighbours: node .kiro/steering/preview-desk.ts [W H] [boxes] [mail] (writes debug/preview.png)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { barnScene } from '../../src/story/barn-art.ts';
const [W, H] = [Number(process.argv[2] ?? 720), Number(process.argv[3] ?? 420)];
const sc = barnScene(W, H, { day: 14, month: 'MAR', year: 1917, sortie: 1, date: '14 MAR 1917', hours: 9, sunset: 18, mail: process.argv.includes('mail') }, [], [], 4);
const out = new Float32Array(W * H * 3);
for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = sc.px.data[i * 4 + c];
const blit = (img: { w: number; h: number; data: Uint8ClampedArray }, cx: number, cy: number, turn: number, k: number) => {
  const c = Math.cos(turn), s = Math.sin(turn), R = Math.hypot(img.w, img.h) * k / 2 + 2;
  for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(H, cy + R); y++) for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(W, cx + R); x++) {
    const dx = (x + 0.5 - cx) / k, dy = (y + 0.5 - cy) / k, u = Math.floor(dx * c + dy * s + img.w / 2), v = Math.floor(-dx * s + dy * c + img.h / 2);
    if (u < 0 || v < 0 || u >= img.w || v >= img.h) continue;
    const j = (v * img.w + u) * 4, a = img.data[j + 3] / 255;
    for (let n = 0; n < 3; n++) out[(y * W + x) * 3 + n] += (img.data[j + n] - out[(y * W + x) * 3 + n]) * a;
  }
};
for (const d of sc.drawn) { blit(d.shadow, d.cx + d.depth, d.cy + d.depth, d.turn, d.k); blit(d.art, d.cx, d.cy, d.turn, d.k); }
if (process.argv.includes('boxes')) { // the layout's boxes, as the story page's ?boxes draws them
  const STYLE = { box: [51, 170, 221], shy: [255, 153, 0], keep: [255, 221, 34], clear: [238, 68, 238] } as const;
  for (const b of sc.boxes) {
    const c = b.kind === 'box' && b.bears === false ? [255, 68, 68] : STYLE[b.kind];
    b.quad.forEach(([x0, y0], i) => {
      const [x1, y1] = b.quad[(i + 1) % b.quad.length], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let j = 0; j <= n; j++) { const x = Math.round(x0 + ((x1 - x0) * j) / n), y = Math.round(y0 + ((y1 - y0) * j) / n); if (x >= 0 && y >= 0 && x < W && y < H) for (let k = 0; k < 3; k++) out[(y * W + x) * 3 + k] = c[k]; }
    });
  }
}
const S = 2, OW = W * S, OH = H * S, raw = Buffer.alloc((OW * 3 + 1) * OH);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) for (let n = 0; n < 3; n++) raw[y * (OW * 3 + 1) + 1 + x * 3 + n] = Math.round(out[(Math.floor(y / S) * W + Math.floor(x / S)) * 3 + n]);
const crc = (b: Buffer) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(OW, 0); ihdr.writeUInt32BE(OH, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync('debug/preview.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
