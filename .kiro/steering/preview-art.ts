import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
// One drawing alone, 8x, on desk brown: node .kiro/steering/preview-art.ts src/story/clutter.ts shellAshtray [turn]
const [, , mod, fn, arg] = process.argv, out = 'debug/preview.png';
const m = await import(new URL('../../' + mod, import.meta.url).href);
const a = m[fn](arg ? Number(arg) : undefined), S = 8, W = a.w * S, H = a.h * S, raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (Math.floor(y / S) * a.w + Math.floor(x / S)) * 4; raw.set(a.data[i + 3] ? [a.data[i], a.data[i + 1], a.data[i + 2]] : [84, 72, 62], y * (W * 3 + 1) + 1 + x * 3); }
const crc = (b: Buffer) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
const ch = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const h = Buffer.alloc(13); h.writeUInt32BE(W, 0); h.writeUInt32BE(H, 4); h[8] = 8; h[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', h), ch('IDAT', deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
