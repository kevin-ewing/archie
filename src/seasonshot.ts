// Season shot: the same representative patch of the world on any date, as a lossless PNG at 1 image px per
// world px (every pixel is the generated one), for comparing the seasonal looks side by side. Renders with
// `npm run snap` (the game's own tile code, dev features: farms + front trenches, density 10), lit at 15:00.
//
//   npm run seasonshot -- 1915-08-13                               → debug/seasons/1915-08-13.png
//   npm run seasonshot -- --from=1915-01-01 --to=1915-12-31        every day, one snap per CPU core
//   npm run seasonshot -- --from=1915-01-01 --to=1915-12-31 --step=7 --jobs=4 --out=somewhere
//
// Seed 5151, 4096×4096 world px centred on (-1748, 1748), was picked by searching seeds 1-5300 for one window
// that holds, with every flower out: lake (deep, shallows, mud, reeds), deep wood, every crop, every flower
// region (poppy, cornflower, buttercup, daisy, clover, bluebell, hawthorn, cow parsley, colza in flower),
// hay cocks, every building kind (farm, cottage, hamlet, post and tower mill, chapel, shrine) both ruined and
// intact, and the start's front through the corner. If world generation changes, check it still does.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';

const SEED = 5151;
const VIEW = { x: -1748, y: 1748, w: 4096, h: 4096 };
const HOUR = 15;

const opt = new Map(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=') as [string, string]));
const single = process.argv.slice(2).find((a) => !a.startsWith('--'));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const from = single ?? opt.get('from');
const to = single ?? opt.get('to') ?? from;
if (!from || !to || !ISO.test(from) || !ISO.test(to)) throw new Error('Usage: npm run seasonshot -- YYYY-MM-DD | --from=YYYY-MM-DD --to=YYYY-MM-DD [--step=days] [--jobs=n] [--out=dir]');
const step = Math.max(1, Number(opt.get('step') ?? 1));
const jobs = Math.max(1, Number(opt.get('jobs') ?? availableParallelism()));
const dir = opt.get('out') ?? 'debug/seasons';
mkdirSync(dir, { recursive: true });

const dates: string[] = [];
for (let t = Date.parse(`${from}T00:00Z`); t <= Date.parse(`${to}T00:00Z`); t += step * 86_400_000) dates.push(new Date(t).toISOString().slice(0, 10));

const started = Date.now();
let next = 0;
let failed = 0;
const snap = (date: string) =>
  new Promise<void>((done) => {
    const args = ['--experimental-strip-types', 'src/snap.ts', `--seed=${SEED}`, `--x=${VIEW.x}`, `--y=${VIEW.y}`, `--w=${VIEW.w}`, `--h=${VIEW.h}`, '--zoom=1', `--hour=${HOUR}`, `--date=${date}`, `--out=${dir}/${date}.png`];
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (code) => {
      if (code !== 0) (failed++, console.error(`${date}: snap failed (${code})`));
      else console.log(`${dir}/${date}.png  (${next >= dates.length ? dates.length : next}/${dates.length}, ${Math.round((Date.now() - started) / 1000)} s)`);
      done();
    });
  });
const worker = async () => { while (next < dates.length) await snap(dates[next++]); };
await Promise.all(Array.from({ length: Math.min(jobs, dates.length) }, worker));
console.log(`${dates.length - failed}/${dates.length} dates, ${VIEW.w}×${VIEW.h}, seed ${SEED}, ${HOUR}:00, ${jobs} jobs, ${Math.round((Date.now() - started) / 1000)} s`);
if (failed) process.exit(1);
