// The buildings of the Flanders countryside, generated as you fly and the same every time you pass:
// farmsteads, cottages and hamlets, post mills and tower mills, chapels and wayside shrines. Each is
// assembled from parts (building blocks with their own roofs, wings, lean-tos, yards, gardens,
// orchards, ponds), so no two look alike. Each sits on a tight paved apron and then trampled, speckled
// earth fraying into the fields, and tracks link neighbouring sites (or lead off into the fields).
// Stamped into the ground tiles with real heights: roofs catch the sun on one slope and throw shadows,
// and the plane's shadow climbs over them.
//
// Period references [VERIFY specifics]:
//  - Brick farmsteads ("hoeves") arranged around a yard: closed courtyards, U and L plans, scattered
//    plans; the "langgevel" long-front farm (house and byre under one long roof) is typical of Flanders.
//    Red clay pantile roofs; barns often thatched;
//    orchards, kitchen gardens, haystacks, dung heaps, ponds.
//  - Wooden post mills and brick tower mills; mills near the front were largely destroyed in 1914–18.
//  - Chapels and wayside shrines at crossroads and field corners.
//  - Around the farm: a separate bake house ("bakhuis") behind the house; a well in the yard; carts and
//    wood stacks; hay barracks (a thatched roof on four poles); skeps by the garden; fenced pasture with
//    cattle (West Flemish red, black-pied); pollarded willows along ditches and tracks; orchards hedged
//    with hawthorn; beet clamps; muck heaps in rows on a field waiting to be spread (spring); felled
//    trunks piled at a field edge; long straw/corn ricks with thatched tops; stacks of brushwood faggots
//    to fire the bread oven; hay cocks in rows on a meadow at haymaking. (No modern bales: hay was kept
//    loose in stacks and ricks; pressed bales were mostly army forage.)
//  - Poperinge district hop farms: hop gardens of tall poles, and a hop kiln ("hopast") set apart from
//    the farm because of the fire risk. (Onroerend Erfgoed listings for Watou and Poperinge farmsteads.)
//  - Near the front: ruins (roofs gone, walls broken); behind that, some roofs holed or missing.
// Scale: 1 world px ≈ 0.4 m.

import { hash, valueNoise } from '../core/noise.ts';
import { DIRT, dirtAt, isWater, landAt, type RGB } from './ground.ts';
import { FRONTS, frontInfo } from './fronts.ts';
import { type Stamp } from './military.ts';
import { BARK, hedgeTone, leafCover, leafTone, look, tone } from './season.ts';
import { DEV } from './settings.ts';

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const pick = <T>(list: readonly T[], v: number): T => list[Math.min(list.length - 1, Math.max(0, Math.floor(v * list.length)))];

// Roof colourings: [field A, field B, ridge/eave]. Several of each, so farms differ.
const ROOFS = {
  tiles: [
    [rgb(0xa4492f), rgb(0xb8583a), rgb(0x7a3424)], // red pantiles
    [rgb(0xb86a3a), rgb(0xc97a45), rgb(0x8a4a2a)], // orange
    [rgb(0x8a4a35), rgb(0x9c5a40), rgb(0x663626)], // weathered brown
    [rgb(0x9a3f2e), rgb(0xa84d38), rgb(0x6e2e22)], // deep red
  ],
  thatch: [
    [rgb(0x8a7448), rgb(0x9c8452), rgb(0x655535)],
    [rgb(0x7d6a42), rgb(0x8f7a4c), rgb(0x5c4e30)],
    [rgb(0x6e6440), rgb(0x7c7149), rgb(0x544b30)], // old, mossy
  ],
  slate: [
    [rgb(0x4a4c52), rgb(0x55575d), rgb(0x3a3c42)],
    [rgb(0x50545a), rgb(0x5c6066), rgb(0x404248)],
  ],
} as const;
const S = {
  brick: [rgb(0x6d3d2c), rgb(0x7d4a35), rgb(0x8a5a40)],
  rubble: [rgb(0x6b5d4c), rgb(0x5a4e40), rgb(0x7a6a58)],
  charred: rgb(0x2c241b),
  paving: [rgb(0x8a8170), rgb(0x7b7364), rgb(0x948a78)], // cobbles / setts right round the buildings
  dung: rgb(0x4a3a28),
  hay: [rgb(0xb39a55), rgb(0x9c8548)],
  tree: [rgb(0x4e6638), rgb(0x5c7442), rgb(0x435a30)],
  soil: rgb(0x4d3f2c),
  veg: [rgb(0x5f7a3a), rgb(0x6f8a44)],
  vegDull: rgb(0x6c6640), // garden rows going over
  brassica: rgb(0x3d4c34), // leeks, kale and cabbages, standing through the winter
  weathered: rgb(0x766a4e), // a stack's thatch and sides, greyed by the winter
  water: rgb(0x34494f),
  reeds: rgb(0x535b33),
  millWood: [rgb(0x5a4a38), rgb(0x4d3f30)],
  sailFrame: rgb(0x7d705a), // weathered timber
  mound: rgb(0x6f6249),
  grave: rgb(0xbdb8a8),
  hedge: [rgb(0x2c3a1b), rgb(0x3a4a23)],
  post: rgb(0x3e3426),
  rail: rgb(0x6a5a44),
  cart: [rgb(0x6b5236), rgb(0x4f3c28)],
  logs: [rgb(0x6e5638), rgb(0x8a7050), rgb(0x52402a)],
  skep: [rgb(0xa8904f), rgb(0x8c763f)],
  bine: [rgb(0x4f7034), rgb(0x5f8440), rgb(0x40602c)],
  cattle: [rgb(0x6e3b26), rgb(0x2a2420), rgb(0xb8ad96)], // West Flemish red, black, cream
  patch: rgb(0xd8d0bc),
  clamp: rgb(0x5c4b34),
  straw: rgb(0xa08a52),
  willow: [rgb(0x6c7a58), rgb(0x7d8a66), rgb(0x5a6849)], // grey-green pollards
  muck: [rgb(0x3f3122), rgb(0x4d3c29)],
  bark: [rgb(0x5e574a), rgb(0x46403a)], // grey bark, so a pile reads on brown earth
  cut: rgb(0xc4ad80), // fresh-sawn ends
};

/** Yard colours the season overlay registers as worn earth, so mud wets the paved apron and the dung heap (12.3). */
export const YARD = { paving: S.paving, dung: S.dung };
const BLOSSOM = rgb(0xe8d6d8); // apple and pear blossom, pale pink-white

// Seasonal presence of farm features, by the look's date (12.4). At MAY_LOOK (doy 130, wheat stage 2, hay 0,
// leaf days 60) every test below is true; hay cocks wait for June. [VERIFY] the day windows.
const inSpring = () => look.s.doy >= 50 && look.s.doy <= 150; // muck heaps wait on the field to be spread
const inOffSeason = () => look.s.doy < 165 || look.s.doy > 270; // beet clamps and brushwood stand except high summer
/** A piecewise-linear value over the year, by the look's day of year (`pts` sorted, covering 1-366). */
const byDay = (pts: readonly (readonly [number, number])[]) => {
  const d = look.s.doy;
  for (let i = 1; i < pts.length; i++) if (d <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (d - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
  return pts[pts.length - 1][1];
};
/** Share of ricks and stacks standing: last year's are used up through winter and spring, the new ones go up after the harvest. */
const STACKS = [[1, 0.6], [90, 0.45], [165, 0.2], [200, 0.2], [235, 0.85], [300, 0.8], [366, 0.6]] as const;
/** Does stack `k` of site `id` stand on the date? Each site's stacks go up and come down on their own days. */
const stands = (id: number, k: number) => hash(id + 61, k, 7) < byDay(STACKS);
/** Stack straw on the date: fresh gold after the harvest, greyed by the winter. */
const stackTone = (c: RGB) => tone(c, S.weathered, (1 - look.s.grassGreen) * 0.55);
/** How far a kitchen garden's rows have grown: little but winter greens until April, full by July, cleared in autumn. */
const GARDEN = [[1, 0.1], [75, 0.05], [110, 0.3], [160, 0.85], [195, 1], [250, 0.85], [290, 0.45], [330, 0.15], [366, 0.1]] as const;
/** How much of an orchard's canopy is in blossom: 0 once the leaf is full (and at MAY_LOOK), following `bloom.hawthorn`. */
const blossom = () => look.s.bloom.hawthorn * Math.min(1, Math.max(0, (60 - look.s.leafDays) / 40));

type Roof = keyof typeof ROOFS;
/** A block of building: rectangle in the site's frame, with a roof. */
type Part = { x: number; y: number; hw: number; hh: number; roof: Roof; tone: number; eave: number; rise: number; style: 'gable' | 'hip' | 'lean'; roofless: boolean };
type Box = { x: number; y: number; hw: number; hh: number };
type Disc = { x: number; y: number; r: number };
/** A small farm feature in the site's frame (see `bitPixel`). `step` is its spacing, where it has one. */
type BitKind = 'well' | 'cart' | 'wood' | 'hives' | 'hops' | 'muck' | 'pasture' | 'clamp' | 'willows' | 'logs' | 'cocks' | 'rick' | 'faggots';
type Bit = Box & { kind: BitKind; step: number };
export type Kind = 'farm' | 'cottage' | 'hamlet' | 'post mill' | 'tower mill' | 'chapel' | 'shrine';
export type Structure = {
  kind: Kind;
  x: number;
  y: number;
  angle: number;
  cos: number; // of −angle, to turn world offsets into the site's frame (kept, not recomputed per pixel)
  sin: number;
  radius: number; // bounding circle, world px (including tracks)
  core: number; // radius of the built-up area (for placement checks)
  ruined: boolean;
  id: number;
  parts: Part[];
  yards: Box[];
  gardens: Box[];
  orchards: (Box & { step: number; hedge: boolean })[];
  bits: Bit[];
  hay: Disc[];
  ponds: Disc[];
  graves?: Box;
  tower?: Disc;
  sails?: { angle: number; len: number }; // angle: the wind's bearing (tower mill cap) and the sails' turn
  worn: number; // width of the trampled earth around the buildings
};

export const CELL = 900; // one candidate site per CELL×CELL px (÷ √DEV.density in development)
const cellSize = () => CELL / Math.sqrt(DEV.density);

/** Random numbers for one site: r(k) in [0, 1), stable per site and k. */
const rng = (seed: number, id: number) => (k: number) => hash(seed + 400 + k, id, 11);

function part(r: (k: number) => number, k: number, x: number, y: number, hw: number, hh: number, roof: Roof, eave: number, rise: number, style: Part['style'] = r(k) < 0.25 ? 'hip' : 'gable'): Part {
  return { x, y, hw, hh, roof, tone: r(k + 1), eave, rise, style, roofless: false };
}

/** Bounding radius of a site's parts and extras (tracks are added separately). */
function extent(s: Pick<Structure, 'parts' | 'yards' | 'gardens' | 'orchards' | 'bits' | 'hay' | 'ponds' | 'worn'>): number {
  let r = 0;
  for (const b of [...s.parts, ...s.yards, ...s.gardens, ...s.orchards, ...s.bits]) r = Math.max(r, Math.hypot(Math.abs(b.x) + b.hw, Math.abs(b.y) + b.hh));
  for (const d of [...s.hay, ...s.ponds]) r = Math.max(r, Math.hypot(d.x, d.y) + d.r);
  return r + s.worn;
}

function farm(r: (k: number) => number) {
  const layout = pick(['courtyard', 'U', 'L', 'scattered', 'longhouse'] as const, r(0));
  const thatchBarn = r(1) < 0.4;
  const houseRoof: Roof = r(2) < 0.1 ? 'slate' : 'tiles';
  const hw = 12 + r(3) * 7;
  const hh = 6 + r(4) * 2;
  const barnHw = 7 + r(5) * 3;
  const barnHh = 15 + r(6) * 9;
  const yard = { x: 0, y: 4, hw: 9 + r(7) * 5, hh: 8 + r(8) * 5 };
  const parts: Part[] = [];
  const top = yard.y - yard.hh - hh;
  if (layout === 'longhouse') {
    // House and byre under one long roof (the house end a little lower), with a separate barn.
    const len = hw + 12 + r(9) * 8;
    parts.push(part(r, 10, 0, top, len, hh, houseRoof, 5, 4, 'gable'));
    parts.push(part(r, 12, -len * 0.55, top, len * 0.45, hh - 0.5, houseRoof, 4.5, 3.5, 'gable'));
    parts.push(part(r, 14, yard.hw + barnHw + 4, yard.y + 4, barnHw, barnHh, thatchBarn ? 'thatch' : 'tiles', 7, 6));
  } else {
    parts.push(part(r, 10, (layout === 'scattered' ? (r(20) - 0.5) * 20 : 0), top, hw, hh, houseRoof, 6, 4)); // farmhouse
    parts.push(part(r, 12, -yard.hw - barnHw, yard.y + (r(21) - 0.5) * 6, barnHw, barnHh, thatchBarn ? 'thatch' : 'tiles', 7, 6)); // barn
    if (layout !== 'L' && r(38) < 0.4) parts.push(part(r, 14, yard.hw + 5 + r(22) * 2, yard.y, 5 + r(23) * 2, 10 + r(24) * 6, 'tiles', 5, 3)); // stables
    if (layout === 'courtyard' && r(39) < 0.35) parts.push(part(r, 16, 4, yard.y + yard.hh + 5, yard.hw - 4, 4 + r(25) * 2, r(26) < 0.5 ? 'tiles' : 'thatch', 4, 3)); // cart shed, gate beside it
    if (layout === 'scattered') parts.push(part(r, 16, (r(27) - 0.5) * 50, yard.y + yard.hh + 14, 6 + r(28) * 3, 4 + r(29) * 2, 'thatch', 4, 3));
  }
  // A rear wing on the house, a lean-to on the barn: plans that aren't just rectangles.
  const house = parts[0];
  if (r(30) < 0.25) parts.push(part(r, 18, house.x + (r(31) < 0.5 ? -1 : 1) * (house.hw - 5), house.y - house.hh - 4, 4 + r(32) * 2, 5 + r(33) * 2, house.roof, house.eave - 1, house.rise - 0.5, 'gable'));
  const barn = parts[1];
  if (r(34) < 0.3) parts.push({ ...part(r, 19, barn.x - barn.hw - 3, barn.y + (r(35) - 0.5) * barn.hh, 3, barn.hh * (0.4 + r(36) * 0.4), 'tiles', 3, 1.5, 'lean'), tone: r(37) });

  const left = barn.x - barn.hw;
  const side = r(70) < 0.5 ? -1 : 1;
  if (r(71) < 0.45) parts.push(part(r, 72, house.x + side * (house.hw + 7), top - 3, 4 + r(73), 3.5, 'tiles', 3.5, 2.5)); // bake house
  if (r(74) < 0.3) parts.push(part(r, 75, left - 10, yard.y - 16, 3.5, 3.5, 'thatch', 6, 3, 'hip')); // hay barrack
  const bits: Bit[] = [];
  const bit = (kind: BitKind, x: number, y: number, hw: number, hh: number, step = 0) => bits.push({ kind, x, y, hw, hh, step });
  if (r(76) < 0.6) bit('well', yard.x + (r(77) - 0.5) * yard.hw, yard.y - yard.hh * 0.4, 2.2, 2.2);
  if (r(78) < 0.5) bit('cart', -yard.hw + 4.5, yard.y + yard.hh - 3, 3.5, 1.6);
  if (r(79) < 0.4) bit('wood', house.x - side * (house.hw - 4), top + house.hh + 2, 4 + r(80) * 2, 1.2);
  const hops = r(81) < 0.3;
  if (hops) {
    const hh2 = 14 + r(82) * 10;
    const hx = (r(83) - 0.5) * 30;
    const hy = top - 22 - hh2;
    bit('hops', hx, hy, 22 + r(84) * 14, hh2, 5);
    if (r(85) < 0.7) parts.push(part(r, 86, hx + 40 + r(87) * 10, hy, 5, 5, 'tiles', 7, 6, 'hip')); // hop kiln, apart for fire
  }
  if (r(88) < 0.45) bit('pasture', yard.hw + 32 + r(89) * 10, yard.y + (r(90) - 0.5) * 20, 22 + r(91) * 12, 16 + r(92) * 10);
  if (r(93) < 0.2) bit('muck', -yard.hw - 50 - r(94) * 10, yard.y + 30, 20 + r(95) * 10, 14 + r(96) * 6, 9);
  if (r(97) < 0.25) bit('clamp', yard.hw + 10, yard.y + yard.hh + 8, 8 + r(98) * 4, 2.2);
  if (r(106) < 0.3) bit('logs', left - 6 - r(107) * 6, yard.y + yard.hh + 12, 5 + r(108) * 3, 1.5 + Math.floor(r(109) * 2) * 0.75);
  if (r(110) < 0.35) bit('rick', left - 14 - r(111) * 6, yard.y - 4 - r(112) * 8, 3.5, 8 + r(113) * 5);
  if (r(114) < 0.3) bit('faggots', house.x + side * (house.hw + 7), top - 9, 4, 1.6);
  if (r(115) < 0.15) bit('cocks', -yard.hw - 40, yard.y - 40 - r(116) * 10, 24 + r(117) * 10, 14 + r(118) * 6, 13);
  if (r(99) < 0.45) bit('willows', (r(100) - 0.5) * 20, yard.y + yard.hh + 40 + r(101) * 12, 30 + r(102) * 20, 3, 7 + Math.floor(r(103) * 2));
  const hay: Disc[] = Array.from({ length: Math.floor(r(40) * 4) }, (_, k) => ({ x: left - 6 - r(41 + k) * 18, y: yard.y + (r(45 + k) - 0.3) * 40, r: 3 + r(49 + k) * 2 }));
  const orchards = r(50) < 0.55 ? [{ x: (r(51) - 0.5) * 30, y: yard.y + yard.hh + 18 + r(52) * 10, hw: 16 + r(53) * 16, hh: 7 + r(54) * 7, step: 8 + Math.floor(r(55) * 3), hedge: r(104) < 0.5 }] : [];
  const gardens = r(56) < 0.5 ? [{ x: house.x + house.hw + 8 + r(57) * 4, y: house.y - 2, hw: 6 + r(58) * 5, hh: 5 + r(59) * 4 }] : [];
  if (gardens.length && r(105) < 0.35) bit('hives', gardens[0].x, gardens[0].y - gardens[0].hh - 3, 4.5, 1.5);
  const ponds = r(60) < 0.3 && !hops ? [{ x: (r(61) - 0.5) * 70, y: top - 18 - r(62) * 8, r: 4 + r(63) * 5 }] : [];
  const yards = [yard];
  const worn = 16 + r(64) * 12; // reach of the speckle; the dense part is only the inner third or so
  return { parts, yards, gardens, orchards, bits, hay, ponds, worn };
}

function cottage(r: (k: number) => number, at = { x: 0, y: 0 }, k = 0): Part[] {
  const parts = [part(r, 70 + k * 5, at.x, at.y, 6 + r(71 + k * 5) * 4, 4 + r(72 + k * 5) * 1.5, r(73 + k * 5) < 0.35 ? 'thatch' : 'tiles', 4, 3)];
  if (r(74 + k * 5) < 0.4) parts.push({ ...part(r, 75 + k * 5, at.x + parts[0].hw + 2, at.y, 2.5, parts[0].hh * 0.7, 'tiles', 2.5, 1.5, 'lean') });
  return parts;
}

function site(seed: number, id: number, kind: Kind): Omit<Structure, 'x' | 'y' | 'angle' | 'cos' | 'sin' | 'ruined' | 'radius' | 'core'> {
  const r = rng(seed, id);
  const empty = { parts: [] as Part[], yards: [] as Box[], gardens: [] as Box[], orchards: [] as (Box & { step: number; hedge: boolean })[], bits: [] as Bit[], hay: [] as Disc[], ponds: [] as Disc[], worn: 10 + r(90) * 8 };
  switch (kind) {
    case 'farm':
      return { kind, id, ...farm(r) };
    case 'cottage':
    {
      const bits: Bit[] = [];
      if (r(160) < 0.35) bits.push({ kind: 'well', x: -9 - r(161) * 3, y: 6, hw: 2, hh: 2, step: 0 });
      if (r(162) < 0.35) bits.push({ kind: 'wood', x: 0, y: -8, hw: 3.5, hh: 1.1, step: 0 });
      if (r(163) < 0.2) bits.push({ kind: 'hives', x: 9 + r(164) * 2, y: 12, hw: 3, hh: 1.5, step: 0 });
      return { kind, id, ...empty, bits, parts: cottage(r), gardens: r(80) < 0.7 ? [{ x: 0, y: 12 + r(81) * 3, hw: 6 + r(82) * 4, hh: 4 + r(83) * 3 }] : [] };
    }
    case 'hamlet': {
      // A few cottages strung along a lane, each with its garden behind.
      const n = 3 + Math.floor(r(84) * 4);
      const parts = Array.from({ length: n }, (_, k) => cottage(r, { x: (k - (n - 1) / 2) * (20 + r(85) * 6) + (r(100 + k) - 0.5) * 6, y: (k & 1 ? 1 : -1) * (9 + r(110 + k) * 4) }, k)).flat();
      const gardens = parts.filter((p) => p.style !== 'lean' && r(120 + Math.round(p.x)) < 0.7).map((p) => ({ x: p.x, y: p.y + Math.sign(p.y) * (p.hh + 7), hw: p.hw - 1, hh: 4 + r(130) * 2 }));
      return { kind, id, ...empty, parts, gardens, worn: 9, yards: [{ x: 0, y: 0, hw: n * 11, hh: 2.5 }] }; // the lane through the hamlet
    }
    case 'post mill':
      return { kind, id, ...empty, parts: [part(r, 86, 0, 0, 6, 5, 'tiles', 12, 3, 'gable')], sails: { angle: r(87) * Math.PI, len: 15 + r(88) * 4 } };
    case 'tower mill':
      return { kind, id, ...empty, tower: { x: 0, y: 0, r: 5 + r(89) * 2 }, sails: { angle: r(87) * Math.PI, len: 16 + r(88) * 4 } };
    case 'chapel':
      return { kind, id, ...empty, parts: [part(r, 96, 0, 0, 7 + r(97) * 3, 4.5, 'slate', 6, 4, 'gable')], graves: r(98) < 0.6 ? { x: 0, y: 12, hw: 10, hh: 5 } : undefined, worn: 7 };
    case 'shrine':
      return { kind, id, ...empty, parts: [part(r, 99, 0, 0, 2, 1.5, 'slate', 2.5, 1.5, 'gable')], worn: 4 };
  }
}

/** Site plans are drawn at this scale: everything (buildings, yards, gardens, orchard trees, ponds, sails,
 * worn ground) shrinks together, so proportions hold. Roof heights shrink a little less. */
export const SITE_SCALE = 0.8;

function scaled<T extends ReturnType<typeof site>>(b: T, k: number): T {
  const box = <B extends Box>(o: B): B => ({ ...o, x: o.x * k, y: o.y * k, hw: o.hw * k, hh: o.hh * k });
  const disc = (o: Disc): Disc => ({ x: o.x * k, y: o.y * k, r: o.r * k });
  const kh = (1 + k) / 2;
  return {
    ...b,
    parts: b.parts.map((p) => ({ ...box(p), eave: p.eave * kh, rise: p.rise * kh })),
    yards: b.yards.map(box),
    gardens: b.gardens.map(box),
    orchards: b.orchards.map((o) => ({ ...box(o), step: o.step * k })),
    bits: b.bits.map((o) => ({ ...box(o), step: o.step * k })),
    hay: b.hay.map(disc),
    ponds: b.ponds.map(disc),
    graves: b.graves && box(b.graves),
    tower: b.tower && disc(b.tower),
    sails: b.sails && { ...b.sails, len: b.sails.len * k },
    worn: b.worn * k,
  };
}

const KINDS: [Kind, number][] = [['farm', 0.55], ['cottage', 0.2], ['hamlet', 0.07], ['post mill', 0.07], ['tower mill', 0.04], ['chapel', 0.04], ['shrine', 0.03]];
const cellCache = new Map<string, Structure | null>();

/** The structure (if any) whose site is in grid cell (i, j). Deterministic; cached. */
function structureInCell(seed: number, i: number, j: number): Structure | null {
  const key = `${seed},${DEV.density},${DEV.fronts},${i},${j}`;
  if (cellCache.has(key)) return cellCache.get(key)!;
  if (cellCache.size > 20_000) cellCache.clear();
  let out: Structure | null = null;
  if (hash(seed + 302, i, j) < 0.5) {
    const size = cellSize();
    const x = (i + 0.15 + 0.7 * hash(seed + 303, i, j)) * size;
    const y = (j + 0.15 + 0.7 * hash(seed + 304, i, j)) * size;
    let roll = hash(seed + 306, i, j);
    const kind = KINDS.find(([, w]) => (roll -= w) < 0)?.[0] ?? 'farm';
    const id = Math.floor(hash(seed + 301, i, j) * 1e9);
    const body = scaled(site(seed, id, kind), SITE_SCALE);
    const core = extent(body) - body.worn;
    const front = DEV.fronts ? frontInfo(seed, x, y) : { u: Infinity, dev: 0, nml: 0 }; // no front: nothing is ruined
    const clear = front.u > front.nml + 600 && !(front.u > FRONTS.battery - 380 && front.u < FRONTS.camps[1] + 120) && front.dev < 0.85; // clear of trenches, guns and camps
    const angle = hash(seed + 305, i, j) * Math.PI;
    if (clear && onOpenLand(seed, body, x, y, angle, core)) {
      const ruined = front.dev > 0.3 || front.u < FRONTS.battery - 380; // the shelled zone just behind the lines
      const damaged = !ruined && front.u < 3200; // within shell range: some roofs holed or gone
      const r = rng(seed, id);
      body.parts.forEach((p, k) => (p.roofless = ruined || (damaged && r(200 + k) < 0.3)));
      out = { ...body, x, y, angle, cos: Math.cos(-angle), sin: Math.sin(-angle), ruined, radius: core + body.worn * 1.6 + 4, core }; // the fray reaches 1.6 × worn
    }
  }
  cellCache.set(key, out);
  return out;
}

/**
 * True if the whole site stands on open farmland: the centre and every corner of every building, yard,
 * garden, orchard and feature, plus a ring round the edge, so nothing clips a lake shore or a wood.
 */
function onOpenLand(seed: number, b: ReturnType<typeof site>, x: number, y: number, angle: number, core: number): boolean {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const open = (lx: number, ly: number) => landAt(seed, Math.round(x + lx * c - ly * sn), Math.round(y + lx * sn + ly * c)) === 'open';
  for (const o of [...b.parts, ...b.yards, ...b.gardens, ...b.orchards, ...b.bits]) {
    for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) if (!open(o.x + u * o.hw, o.y + v * o.hh)) return false;
  }
  for (const d of b.hay) if (!open(d.x, d.y)) return false;
  for (let k = 0; k < 12; k++) if (!open(Math.cos((k / 12) * 2 * Math.PI) * core, Math.sin((k / 12) * 2 * Math.PI) * core)) return false;
  return open(0, 0);
}

/** Every structure that could touch the world rectangle [x0, x1) × [y0, y1). */
export function structuresNear(seed: number, x0: number, y0: number, x1: number, y1: number): Structure[] {
  const out: Structure[] = [];
  const cell = cellSize();
  const pad = 120; // the furthest a site's worn ground reaches
  for (let j = Math.floor((y0 - pad) / cell); j <= Math.floor((y1 + pad) / cell); j++) {
    for (let i = Math.floor((x0 - pad) / cell); i <= Math.floor((x1 + pad) / cell); i++) {
      const s = structureInCell(seed, i, j);
      if (s && s.x + s.radius > x0 && s.x - s.radius < x1 && s.y + s.radius > y0 && s.y - s.radius < y1) out.push(s);
    }
  }
  return out;
}

/** Roof height of a part at (x, y) relative to the part's centre, or -1 if outside it. */
function roofHeight(p: Part, x: number, y: number): number {
  if (Math.abs(x) > p.hw || Math.abs(y) > p.hh) return -1;
  const alongX = p.hw >= p.hh;
  const across = alongX ? y : x;
  const along = alongX ? x : y;
  const half = alongX ? p.hh : p.hw;
  const long = alongX ? p.hw : p.hh;
  if (p.style === 'lean') return p.eave + p.rise * (1 - (across + half) / (2 * half)); // one slope
  const slope = 1 - Math.abs(across) / half;
  return p.eave + p.rise * (p.style === 'hip' ? Math.min(slope, (long - Math.abs(along)) / half) : slope);
}

/** The pixel of one building part (roof, or ruined walls and rubble). */
function partPixel(p: Part, x: number, y: number, h: number, d: number): Stamp {
  if (p.roofless) {
    const wall = Math.abs(x) > p.hw - 1.2 || Math.abs(y) > p.hh - 1.2;
    if (wall) return d < 0.3 ? [S.rubble[0], 1] : [pick(S.brick, d), 4 * (0.4 + d * 0.6)]; // broken walls
    return d < 0.08 ? [S.charred, 1.5] : [pick(S.rubble, d), 0.6];
  }
  const [a, b, edge] = pick(ROOFS[p.roof], p.tone);
  const alongX = p.hw >= p.hh;
  const across = alongX ? y : x;
  if (Math.abs(x) > p.hw - 0.8 || Math.abs(y) > p.hh - 0.8 || (p.style !== 'lean' && Math.abs(across) < 0.8)) return [edge, h]; // eaves, gables, ridge
  if (p.roof === 'thatch') return [mod(Math.floor(Math.abs(across) / 2), 2) ? (d < 0.12 ? edge : a) : d < 0.08 ? edge : b, h]; // courses of straw, the odd dark tuft
  if (p.roof === 'slate') return [mod(Math.floor(Math.abs(across)), 2) ? a : b, h];
  return [d < 0.05 ? edge : mod(Math.floor(Math.abs(across) / 2), 2) ? a : b, h]; // pantile courses, the odd weathered tile
}

const inBox = (b: Box, x: number, y: number) => Math.abs(x - b.x) <= b.hw && Math.abs(y - b.y) <= b.hh;
/** Squared distance from (x, y) to a box (0 inside): compare these, and take one square root at the end. */
const boxDist2 = (b: { x: number; y: number; hw: number; hh: number }, x: number, y: number) => {
  const ex = Math.max(0, Math.abs(x - b.x) - b.hw);
  const ey = Math.max(0, Math.abs(y - b.y) - b.hh);
  return ex * ex + ey * ey;
};

/** One farm feature's pixel, in its own frame (x, y from its centre), or null where it leaves the ground. */
function bitPixel(b: Bit, x: number, y: number, id: number, d: number, ruined: boolean): Stamp | null {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const inside = ax <= b.hw && ay <= b.hh;
  switch (b.kind) {
    case 'well': {
      const r = Math.hypot(x, y);
      return r > b.hw ? null : r < b.hw - 1.1 ? [S.water, 0] : [S.paving[d < 0.5 ? 0 : 2], 1.4]; // brick ring
    }
    case 'cart':
      if (ruined) return inside && d < 0.4 ? [S.charred, 0.4] : null;
      if (inside) return [S.cart[ax > b.hw - 0.8 || ay > b.hh - 0.8 ? 1 : 0], 1.6];
      if (ay <= b.hh + 1 && ax <= 1.4) return [S.post, 1.2]; // wheels
      if (x > b.hw && x < b.hw + 4.5 && Math.abs(ay - b.hh + 0.5) < 0.5) return [S.cart[1], 0.9]; // shafts
      return null;
    case 'wood':
      return inside ? [d < 0.12 ? S.logs[1] : S.logs[mod(Math.floor(y + b.hh), 2) * 2], 1.5] : null; // log ends in rows
    case 'hives': {
      if (!inside || ruined) return null;
      const hx = mod(x + b.hw, 3) - 1.5;
      return Math.hypot(hx, y) < 1.1 ? [S.skep[hx + y < 0 ? 0 : 1], 1.2] : null; // straw skeps
    }
    case 'hops': {
      if (!inside) return null;
      const gx = mod(x + b.hw, b.step);
      const gy = mod(y + b.hh, b.step);
      if (gx < 1 && gy < 1) return [S.post, 10]; // the tall poles
      if (gy < 1.8 && !ruined && valueNoise(id + 11, x / 3, y) > 0.3 + 0.7 * (1 - look.s.foliage)) return [S.bine[d < 0.4 ? 0 : d < 0.8 ? 1 : 2], 5 + 2 * d]; // bines up the strings
      return [d < 0.35 ? DIRT.worn : S.soil, 0]; // hoed ground between
    }
    case 'muck': {
      if (!inside || !inSpring()) return null;
      const row = Math.floor((y + b.hh) / b.step);
      const hx = mod(x + b.hw + (row & 1) * b.step * 0.5, b.step) - b.step / 2;
      const hy = mod(y + b.hh, b.step) - b.step / 2;
      const r = Math.hypot(hx, hy);
      return r < 1.6 ? [S.muck[r < 0.8 ? 0 : 1], 0.8 * (1.6 - r)] : null; // heaps in rows, waiting to be spread
    }
    case 'pasture': {
      if (!inside) return null;
      if (ax > b.hw - 0.8 || ay > b.hh - 0.8) return mod(Math.round(x + y), 4) === 0 ? [S.post, 1.8] : d < 0.85 ? [S.rail, 1.2] : null; // post-and-rail
      if (ruined) return null;
      const ci = Math.floor((x + b.hw) / 7);
      const cj = Math.floor((y + b.hh) / 7);
      if (hash(id + 21, ci, cj) > 0.4) return null;
      const cx = (ci + 0.3 + 0.4 * hash(id + 22, ci, cj)) * 7 - b.hw;
      const cy = (cj + 0.3 + 0.4 * hash(id + 23, ci, cj)) * 7 - b.hh;
      const turn = hash(id + 24, ci, cj) < 0.5;
      const u = turn ? x - cx : y - cy; // along the beast
      const v = turn ? y - cy : x - cx;
      if (Math.abs(u) > 1.8 || Math.abs(v) > 0.9) return null;
      const coat = hash(id + 25, ci, cj);
      const pied = coat >= 0.5 && coat < 0.85;
      return [u > 1.2 ? S.cattle[1] : pied && d < 0.4 ? S.patch : S.cattle[coat < 0.5 ? 0 : pied ? 1 : 2], 1.2]; // head darker; pied patches
    }
    case 'logs': {
      // Felled trunks side by side, bark along their length, pale cut ends.
      if (ax > b.hw || ay > b.hh) return null;
      const k = Math.floor((y + b.hh) / 1.5);
      const end = b.hw - (hash(id + 41, k, 0) * 2);
      if (ax > end) return null;
      return [ax > end - 0.9 ? S.cut : S.bark[k & 1], 1.2 + (k & 1) * 0.4];
    }
    case 'rick': {
      // A long rick: straw sides, thatched ridge along its length.
      if (!inside || !stands(id, 0)) return null;
      const t = 1 - ax / b.hw;
      return [stackTone(ax < 0.8 ? S.hay[1] : mod(Math.floor(y / 1.5), 2) ? S.hay[0] : S.straw), 2.5 + 2 * t];
    }
    case 'faggots':
      // Brushwood bundles stacked against a wall, tied in the middle.
      return inside && inOffSeason() ? [Math.abs(mod(x + b.hw, 2.5) - 1.25) < 0.4 ? S.post : mod(Math.round(x + y), 2) ? S.logs[0] : S.logs[2], 1.4] : null;
    case 'cocks': {
      // Hay cocks in loose rows on the meadow.
      if (!inside) return null;
      const row = Math.floor((y + b.hh) / b.step);
      const col = Math.floor((x + b.hw) / b.step);
      const hx = mod(x + b.hw, b.step) - b.step / 2 - (hash(id + 51, col, row) - 0.5) * 2;
      const hy = mod(y + b.hh, b.step) - b.step / 2;
      const r = Math.hypot(hx, hy);
      const pr = hash(id + 52, col, row);
      if (pr < 0.6 || (pr - 0.6) / 0.4 > look.s.hay || look.s.hay <= 0.05) return null; // just a few, and fewer as the hay is carried
      return r < 2 ? [S.hay[r < 1 ? 0 : 1], 2 * (2 - r)] : null;
    }
    case 'clamp': {
      if (!inOffSeason()) return null;
      const e = (x / b.hw) ** 2 + (y / b.hh) ** 2;
      return e > 1 ? null : [d < 0.15 ? S.straw : S.clamp, 1.2 * (1 - e)]; // earthed-over beet
    }
    case 'willows': {
      if (!inside) return null;
      const k = Math.round(x / b.step);
      const r = Math.hypot(x - k * b.step, y);
      const t = hash(id + 31, k, 0);
      if (t < 0.15) return r < 0.9 ? [S.post, 2.5] : null; // freshly pollarded: just the stump
      const cr = 1.8 + t;
      if (r >= cr || ruined) return null;
      const lc = leafCover(1, (id * 17 + k) | 0);
      if (lc.cover > d * 0.95) return [leafTone(S.willow[r < cr * 0.5 ? 1 : d < 0.5 ? 0 : 2], lc), 4 + 1.5 * (1 - r / cr)];
      return r < 0.8 || d < 0.45 ? [BARK.twig[2], 3.5] : null; // bare withies on the pollard head
    }
  }
}

/** The stamp of one structure at a world pixel, or null. */
function structure(s: Structure, wx: number, wy: number): Stamp | null {
  const dx = wx - s.x;
  const dy = wy - s.y;
  if (dx * dx + dy * dy > s.radius * s.radius) return null;
  const lx = dx * s.cos - dy * s.sin;
  const ly = dx * s.sin + dy * s.cos;
  const d = hash(s.id, Math.round(wx), Math.round(wy));

  // Mill sails, above everything (unless the mill is ruined). From straight above they turn in a vertical
  // plane facing the wind, so they're seen edge-on: one thin line (the stocks) across the front of the
  // mill, reaching as far sideways as the arms do at their current angle.
  if (s.sails && !s.ruined) {
    const dir = s.kind === 'post mill' ? 0 : s.sails.angle; // a post mill turns its whole body to the wind
    const front = s.kind === 'post mill' ? s.parts[0].hw + 0.8 : (s.tower?.r ?? 0) + 0.8;
    const u = lx * Math.cos(dir) + ly * Math.sin(dir);
    const v = -lx * Math.sin(dir) + ly * Math.cos(dir);
    const reach = s.sails.len * Math.max(Math.abs(Math.cos(s.sails.angle)), Math.abs(Math.sin(s.sails.angle)));
    if (Math.abs(u - front) < 0.75 && Math.abs(v) < reach) return [Math.abs(v) < 1.2 ? S.millWood[1] : S.sailFrame, 11];
    if (s.kind === 'post mill' && Math.abs(ly) < 0.8 && lx < -6 * SITE_SCALE && lx > -20 * SITE_SCALE) return [S.sailFrame, 6]; // tail pole
  }

  // Buildings: the highest roof wins where parts overlap (wings, lean-tos), so junctions look right.
  let best: Part | null = null;
  let bestH = -1;
  for (const p of s.parts) {
    const h = roofHeight(p, lx - p.x, ly - p.y);
    if (h > bestH) {
      bestH = h;
      best = p;
    }
  }
  if (best) {
    const px = partPixel(best, lx - best.x, ly - best.y, bestH, d);
    return s.kind === 'post mill' && !best.roofless ? [pick(S.millWood, (Math.abs(lx) % 2) / 2), px[1] + 1] : px;
  }
  if (s.tower) {
    const r = Math.hypot(lx - s.tower.x, ly - s.tower.y);
    if (r < s.tower.r) {
      if (s.ruined) return r > s.tower.r - 1.5 ? [pick(S.brick, d), 6 * d] : [pick(S.rubble, d), 0.8];
      return [r < 2 ? S.millWood[0] : pick(S.brick, d * 0.6 + (lx + ly > 0 ? 0.4 : 0)), 12 + 4 * (1 - r / s.tower.r)]; // brick tower, wooden cap
    }
    if (s.ruined && r < s.tower.r + 6 && d < 0.5) return [pick(S.rubble, d), 0.5];
  }
  if (s.kind === 'post mill' && Math.hypot(lx, ly) < 9 * SITE_SCALE) return [S.mound, 1.5 * (1 - Math.hypot(lx, ly) / (9 * SITE_SCALE))]; // the mill mound

  for (const b of s.bits) {
    if (Math.abs(lx - b.x) > b.hw + 5 || Math.abs(ly - b.y) > b.hh + 5) continue;
    const px = bitPixel(b, lx - b.x, ly - b.y, s.id, d, s.ruined);
    if (px) return px;
  }
  for (let k = 0; k < s.hay.length; k++) {
    const h = s.hay[k];
    const r = Math.hypot(lx - h.x, ly - h.y);
    if (r < h.r && !s.ruined && !stands(s.id, k + 1)) continue; // each stack built and used on its own days
    if (r < h.r) return s.ruined ? [S.charred, 0.5] : [stackTone(S.hay[r < h.r / 2 ? 0 : 1]), 1 + 3 * (1 - r / h.r)];
  }
  for (const p of s.ponds) {
    if (Math.abs(lx - p.x) > p.r + 1 || Math.abs(ly - p.y) > p.r + 1) continue; // the ragged edge reaches ≤ 1 px out
    const r = Math.hypot(lx - p.x, ly - p.y) + (valueNoise(s.id, lx / 3, ly / 3) - 0.5) * 2;
    if (r < p.r - 1) return [S.water, 0];
    if (r < p.r) return [S.reeds, 1];
  }
  if (s.graves && inBox(s.graves, lx, ly) && mod(Math.round(lx), 3) === 0 && mod(Math.round(ly), 3) === 0) return [S.grave, 0.8]; // headstones in the grass
  for (const g of s.gardens) {
    if (!inBox(g, lx, ly)) continue;
    if (s.ruined) return [pick(S.rubble, d), 0];
    if (mod(Math.floor(ly - g.y + g.hh), 3) === 0) return [S.soil, 0];
    // Vegetable rows, grown as far as the season has them; a few winter greens all year.
    const grown = byDay(GARDEN);
    const v = hash(s.id + 8, Math.round(wx), Math.round(wy));
    if (v < grown) return [tone(S.veg[d < 0.5 ? 0 : 1], S.vegDull, (1 - look.s.grassGreen) * 0.5), 0.1 + 0.3 * grown];
    return v < grown + 0.1 ? [S.brassica, 0.3] : [S.soil, 0];
  }
  for (const o of s.orchards) {
    if (!inBox(o, lx, ly)) continue;
    // Fruit trees in rows, a little irregular; near the front, only stumps remain.
    const gx = lx - o.x + o.hw;
    const gy = ly - o.y + o.hh;
    if (o.hedge && Math.min(gx, gy, 2 * o.hw - gx, 2 * o.hh - gy) < 1.4 && valueNoise(s.id + 9, lx / 4, ly / 4) > 0.2) return [hedgeTone(S.hedge[d < 0.5 ? 0 : 1], d < 0.5), 2.5]; // hawthorn
    const ci = Math.floor(gx / o.step);
    const cj = Math.floor(gy / o.step);
    const jx = (hash(s.id + 1, ci, cj) - 0.5) * 2;
    const jy = (hash(s.id + 2, ci, cj) - 0.5) * 2;
    const rr = Math.hypot(gx - (ci + 0.5) * o.step - jx, gy - (cj + 0.5) * o.step - jy);
    const cr = (2.6 + hash(s.id + 3, ci, cj) * 0.9) * SITE_SCALE;
    if (s.ruined) {
      if (rr < 1) return [S.charred, 3];
    } else if (rr < cr) {
      // Fruit trees leaf, blossom, colour and drop like the woods (an early species), each on its own days.
      const lc = leafCover(1, (s.id * 31 + ci * 7 + cj) | 0);
      if (lc.cover > Math.min(0.99, valueNoise(s.id + 6, lx / 1.6, ly / 1.6) * 0.6 + d * 0.25 + (rr / cr) * 0.15)) {
        const c = leafTone(S.tree[rr < cr / 2 ? 1 : d < 0.5 ? 0 : 2], lc);
        const bl = blossom();
        return [bl > 0.05 && hash(s.id + 4, Math.round(wx), Math.round(wy)) < bl * 0.6 ? tone(c, BLOSSOM, 0.7) : c, 4 + 3.5 * lc.cover * (1 - rr / cr)];
      }
      if (rr < 0.9) return [BARK.trunk, 4];
      if (d < 0.3 + 0.2 * (1 - rr / cr)) return [BARK.twig[1], 3]; // bare twigs; the grass shows between
    }
  }
  // Paving right round the buildings (cobbles, setts), then the yard and trampled earth fraying out into
  // the fields, speckled with tufts.
  let near2 = Infinity;
  for (const p of s.parts) near2 = Math.min(near2, boxDist2(p, lx, ly));
  let near = Math.sqrt(near2);
  if (s.tower) near = Math.min(near, Math.max(0, Math.hypot(lx, ly) - s.tower.r));
  if (near < 1.5 + d * 1.5 && !s.ruined) return [pick(S.paving, valueNoise(s.id + 7, lx / 2, ly / 2)), 0];
  for (const y of s.yards) {
    if (!inBox(y, lx, ly)) continue;
    if (!s.ruined && s.kind === 'farm' && Math.hypot(lx - y.x - y.hw * 0.3, ly - y.y) < 3) return [S.dung, 1]; // the dung heap
    const dirt = dirtAt(s.id, Math.round(wx), Math.round(wy), 0.8); // trodden but not solid: grass shows through
    if (dirt) return [s.ruined && d < 0.3 ? S.rubble[1] : dirt, 0];
  }
  for (const y of s.yards) near2 = Math.min(near2, boxDist2(y, lx, ly));
  near = Math.min(near, Math.sqrt(near2));
  if (near >= s.worn * 1.6) return null; // beyond the furthest fray (0.35 + 1.25 × worn): skip the noise  // Density falls off smoothly to below dirtAt's threshold, so the speckle thins out into the field
  // with no edge: dense trodden earth at the walls, then scattered flecks, then just the field. The reach
  // is frayed into fingers that fan out (footpaths, cart turns), so it's never a round blob.
  const fray = valueNoise(s.id + 5, lx / 9, ly / 9);
  const wear = 1 - near / (s.worn * (0.35 + 1.25 * fray));
  if (wear > 0) {
    const dirt = dirtAt(s.id, Math.round(wx), Math.round(wy), 0.05 + 0.85 * wear * wear);
    if (dirt) return [dirt, 0];
  }
  return null;
}

/** The stamp of whichever structure in `list` covers a world pixel, or null. */
export function structureAt(list: readonly Structure[], x: number, y: number): Stamp | null {
  for (const s of list) {
    const px = structure(s, x, y);
    if (px) return px;
  }
  return null;
}

// --- Tracks ------------------------------------------------------------------------------------------
// Neighbouring sites are linked by worn tracks (each links to its nearest, often its second nearest);
// a site with no neighbour in reach gets a track leading off into the fields. Tracks wander, widen into
// muddy patches here and there, and are most worn near the buildings, fading toward the middle.

export type Track = { ax: number; ay: number; bx: number; by: number; id: number; stub: boolean; len: number; ux: number; uy: number }; // stub: b is a free end in the fields; u: unit vector a → b
const track = (ax: number, ay: number, bx: number, by: number, id: number, stub: boolean): Track => {
  const len = Math.hypot(bx - ax, by - ay);
  return { ax, ay, bx, by, id, stub, len, ux: (bx - ax) / len, uy: (by - ay) / len };
};
const LINK = 1.9; // link sites up to this many cells apart
const trackCache = new Map<string, Track[]>();

function tracksFromCell(seed: number, i: number, j: number): Track[] {
  const key = `${seed},${DEV.density},${DEV.fronts},${i},${j}`;
  const hit = trackCache.get(key);
  if (hit) return hit;
  if (trackCache.size > 20_000) trackCache.clear();
  const s = structureInCell(seed, i, j);
  const out: Track[] = [];
  if (s && s.kind !== 'shrine') {
    const max = LINK * cellSize();
    const others: { t: Structure; d: number }[] = [];
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        if (!di && !dj) continue;
        const t = structureInCell(seed, i + di, j + dj);
        const d = t ? Math.hypot(t.x - s.x, t.y - s.y) : Infinity;
        if (t && d < max) others.push({ t, d });
      }
    }
    others.sort((a, b) => a.d - b.d);
    const link = (t: Structure) => {
      const [p, q] = s.id < t.id ? [s, t] : [t, s]; // the same segment from either end
      out.push(track(p.x, p.y, q.x, q.y, Math.floor(hash(seed + 410, p.id % 1e6, q.id % 1e6) * 1e9), false));
    };
    const r = rng(seed, s.id);
    if (others[0] && r(150) < 0.9 && dryRun(seed, s.x, s.y, others[0].t.x, others[0].t.y) === 1) link(others[0].t);
    if (others[1] && r(151) < 0.4 && dryRun(seed, s.x, s.y, others[1].t.x, others[1].t.y) === 1) link(others[1].t);
    if (!out.length) {
      const a = r(152) * 2 * Math.PI;
      const want = s.core + 60 + r(153) * 140;
      const len = want * dryRun(seed, s.x, s.y, s.x + Math.cos(a) * want, s.y + Math.sin(a) * want); // stops short of any water
      if (len > s.core + 30) out.push(track(s.x, s.y, s.x + Math.cos(a) * len, s.y + Math.sin(a) * len, s.id, true));
    }
  }
  trackCache.set(key, out);
  return out;
}

/**
 * How much of the straight run a → b is dry (0 … 1, 1 = all of it): the share before it first meets
 * water, looking along its line and either side of it (its wander and widest fan), with a little margin
 * so a track never touches a shore. Sampled every 12 px when a track is planned (cached with it).
 */
function dryRun(seed: number, ax: number, ay: number, bx: number, by: number): number {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  const n = Math.ceil(len / 12);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    for (const o of [-14, 0, 14]) {
      if (isWater(seed, ax + (bx - ax) * t + nx * o, ay + (by - ay) * t + ny * o)) return Math.max(0, (i - 2) / n);
    }
  }
  return 1;
}

/** Every track that could touch the world rectangle [x0, x1) × [y0, y1). */
export function tracksNear(seed: number, x0: number, y0: number, x1: number, y1: number): Track[] {
  const cell = cellSize();
  const pad = LINK * cell + 20;
  const seen = new Set<number>();
  const out: Track[] = [];
  for (let j = Math.floor((y0 - pad) / cell); j <= Math.floor((y1 + pad) / cell); j++) {
    for (let i = Math.floor((x0 - pad) / cell); i <= Math.floor((x1 + pad) / cell); i++) {
      for (const t of tracksFromCell(seed, i, j)) {
        if (seen.has(t.id) || Math.max(t.ax, t.bx) < x0 - TRACK_PAD || Math.min(t.ax, t.bx) > x1 + TRACK_PAD || Math.max(t.ay, t.by) < y0 - TRACK_PAD || Math.min(t.ay, t.by) > y1 + TRACK_PAD) continue;
        seen.add(t.id);
        out.push(t);
      }
    }
  }
  return out;
}

const TRACK_PAD = 40; // the widest a track gets, fanned out at its ends, plus its wander

/**
 * A track's worn-earth pixel, or null. Narrow and worn in the middle; at the sites it fans out wide and
 * breaks into speckle; a free end frays and fades into the field. A halo of speckle either side blends it in.
 */
export function trackAt(tracks: readonly Track[], x: number, y: number): RGB | null {
  for (const t of tracks) {
    const len = t.len;
    const along = (x - t.ax) * t.ux + (y - t.ay) * t.uy;
    if (along < -10 || along > len + 10) continue;
    const side = (y - t.ay) * t.ux - (x - t.ax) * t.uy; // straight-line offset, before the wander
    const fromA = Math.max(0, 1 - along / 90);
    const fromB = Math.max(0, 1 - (len - along) / 90);
    const fan = 1 + 3 * fromA * fromA + 3 * fromB * fromB; // spreads out where it meets a site (or its free end)
    // Cheap reject before any noise: beyond the widest this stretch could be (wander ±7, width ≤ 2.7·fan
    // + 5.8 of mud, halo ×1.8, ragged edges ÷0.8), it can't be track.
    if (Math.abs(side) > 7 + 2.25 * (2.7 * fan + 5.8)) continue;
    const off = side - (valueNoise(t.id, along / 45, 0) - 0.5) * 14; // wandering
    // Width varies, and it spreads into muddy patches here and there.
    const width = (1.3 + 1.4 * valueNoise(t.id + 1, along / 60, 0.5)) * fan + Math.max(0, valueNoise(t.id + 2, x / 11, y / 11) - 0.68) * 18;
    const a = Math.abs(off) * (0.8 + 0.4 * valueNoise(t.id + 3, x / 5, y / 5)); // ragged edges
    if (a > width * 1.8) continue;
    const core = 1 - a / width; // 1 on the line, 0 at its edge, down to -0.8 in the halo
    let density = core > 0 ? 0.25 + core * (0.6 - 0.25 * Math.max(fromA, fromB)) : 0.25 + core * 0.4;
    if (t.stub) density *= 1 - fromB * fromB; // fades out into the field
    if (along < 0) density *= 1 + along / 10;
    if (along > len) density *= 1 - (along - len) / 10;
    const dirt = dirtAt(t.id, x, y, density);
    if (dirt) return dirt;
  }
  return null;
}
