// Draws the world for one frame, with a heading-up rotating camera, in this order:
//   ground → direct sunlight (tree shadows, highlights, glints, plane shadow; erased under cloud shade)
//   → cloud shadows → smoke → plane → low clouds → fly-through wisps → high clouds (no shadow) → light grade
//   → around sunset, lamplight (over the grade so it stays warm; clouds and the plane cut out of it)
// (The instrument board is drawn on top separately; see ui/hud.ts.)

import { BASE as GROUND_BASE, CHUNK } from '../world/ground.ts';
import type { Plane } from '../sim/flight.ts';
import type { Sun } from '../sim/daylight.ts';
import { planeOffset, type Camera } from './camera.ts';
import type { View } from './display.ts';
import { hash } from '../core/noise.ts';
import type { Profiler } from '../core/profile.ts';
import { createGradeLayer, drawGrade, gradeFor, skyFor, type Grade, type GradeLayer } from './grade.ts';
import { bankFrame, createPlaneSprites, prewarmSelfShadow, PROP, propWidth, selfShadowed, SPRITE_H, type PlaneSprites } from './plane.ts';
import { projectShadow, SHADOW_SCALE, shadowCentre, softSilhouette } from './shadow.ts';
import { createSparkleSprites, drawSparkle, type SparkleSprites } from './sparkle.ts';
import { createSmokeSprites, drawSmoke, type Smoke, type SmokeSprites } from './smoke.ts';
import { createTileGen } from './tilegen.ts';
import { cloudLevel } from '../world/clouds.ts';
import { createTileLayer, type TileLayer } from './tiles.ts';
import { createDamage, damageVersion, marksFor, type Damage } from '../world/damage.ts';
import type { Features } from '../world/generate.ts';
import { MAY_LOOK, seasonKey, type SeasonState } from '../sim/seasons.ts';
import { LIGHTS } from '../world/lights.ts';
import { createLampSprite, drawLamps } from './lamps.ts';

const HOME_Y = 0.72; // plane's home spot, as a fraction of screen height (more ground visible ahead)
// Clouds hang in place over the landscape: they move with the ground (parallax 1), only creeping with a
// faint wind, and the plane flies through them. Low enough (CLOUD_HEIGHT) that their shadows, which fall
// CLOUD_HEIGHT × cot(sun elevation) down-sun, stay near their own cloud rather than off-screen. The sense
// of speed comes when the plane is *in* cloud: wisps rush past. A second, higher deck drifts above
// everything — thinner, slower, and casting no shadow (too high and too thin to block the sun usefully).
const CLOUD_PARALLAX = 1;
const CLOUD_HEIGHT = 160; // world px
const WISP_PARALLAX = 3; // fly-through wisps: close to the camera, so they streak past
const WISP_ALPHA = 0.7;
const HIGH_CLOUD_ALPHA = 0.5;
const HIGH_WIND_SCALE = 0.5; // the high deck creeps slower than the low one
const PLANE_SHADOW_ALPHA = 0.26;
const SHADOW_MARGIN = 48; // room around the plane-shadow buffer for pixels shifted toward the plane (≤ 14 px tall × 3 length)
const CLOUD_SHADOW_ALPHA = 0.42; // darkening under a dense cloud (its silhouette is near-opaque)
const WIND = { x: 1, y: 0.5 }; // the clouds' (and their shadows') creep, px / s
const BASE = `rgb(${GROUND_BASE.join(',')})`; // shown only where a tile hasn't been generated yet
const RAD = Math.PI / 180;

export type Scene = {
  seed: number;
  features: Features; // which additions are stamped into the ground (development toggles)
  damage: Damage; // live damage marks, stamped into the tiles they touch
  season: { state: SeasonState; key: number }; // the date's look; `key` is its bucketed hash (tiles regenerate when it changes)
  ground: TileLayer;
  sunlight: TileLayer; // cast shadows + relief, re-baked as the sun moves
  cloudShadows: TileLayer;
  clouds: TileLayer;
  wisps: TileLayer; // a second, different cloud field for fly-through streaks
  cloudBuf: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }; // clouds are drawn here, tinted, then onto the screen
  highClouds: TileLayer; // a higher deck, drawn above everything, that casts no shadow
  inCloud: number; // eased: how deep in cloud the plane is, 0 … 1
  grade: GradeLayer;
  sprites: PlaneSprites;
  smoke: SmokeSprites;
  sparkle: SparkleSprites;
  shadows: HTMLCanvasElement[][]; // [softness][bank frame] soft silhouettes
  shadowGround: Float32Array; // eased ground height under each pixel of the plane's shadow
  shadowBuf: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; data: ImageData }; // plane-aligned scratch for the projected shadow
  light: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }; // direct-sunlight buffer (screen size)
  lamp: HTMLCanvasElement; // one lamp's glow (see render/lamps.ts)
  lightBuf: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }; // lights minus clouds and plane (screen size)
  lastT: number;
  selfShadowWarm?: boolean; // the likely self-shadow bakes have been made
  hourLight?: Grade; // this frame's light of the hour (the HUD takes it too)
  sun: Sun | null; // the sun this frame (the sunlight layer reads it when it asks for tiles)
};

/** Sun quantised for re-baking the sunlight tiles: a fresh bake every half degree or so, cross-faded in. */
const sunKey = (s: Sun | null) => (s && s.elevation > 0.5 * RAD ? `${Math.round(s.azimuth / (0.5 * RAD))}:${Math.round(s.elevation / (0.25 * RAD))}` : 'down');
// Asked once per visible tile per frame: worked out once per sun (the scene sets a new sun each frame).
let lastSun: Sun | null | undefined;
let lastSunKey = 'down';
const sunVersion = (s: Sun | null) => (s === lastSun ? lastSunKey : ((lastSun = s), (lastSunKey = sunKey(s))));
const SUNLIGHT_FADE_MS = 1500;

/** `density`: development only, packs farms and the front closer (see DEV in world/military.ts). */
export function createScene(seed: number, density = 1): Scene {
  const gen = createTileGen();
  const planeSprites = createPlaneSprites();
  // A ground tile's version: the feature toggles plus that tile's damage count. A change regenerates
  // just the tiles affected (old ones stay on screen until the new ones arrive).
  let shared = '';
  let sharedSun = '';
  let sharedGround = NaN;
  const groundVersion = (cx: number, cy: number) => (scene.features.structures ? 1 : 0) + (scene.features.military ? 2 : 0) + (scene.features.frontLine ? 4 : 0) + 8 * damageVersion(scene.damage, cx, cy) + 2 ** 6 * scene.season.key;
  const scene: Scene = {
    seed,
    features: { structures: false, military: true, density },
    damage: createDamage(),
    season: { state: MAY_LOOK, key: seasonKey(MAY_LOOK) },
    ground: createTileLayer(
      (cx, cy) => gen({ kind: 'ground', seed, cx, cy, features: { ...scene.features }, damage: marksFor(scene.damage, cx, cy), season: scene.season.state }),
      CHUNK,
      { version: (cx, cy) => String(groundVersion(cx, cy)), fadeMs: 400 }, // toggles and new damage fade in
    ),
    // Sunlight depends on the sun and on the heights of the tile and its neighbours (shadows cross edges).
    sunlight: createTileLayer((cx, cy) => sunlightRequest(cx, cy), CHUNK, {
      version: (cx, cy) => {
        const sv = sunVersion(scene.sun);
        // No damage anywhere (the usual case): every tile's neighbours share one ground version, so every
        // tile has the same sunlight version. Build that string once, not once per tile per frame.
        if (!scene.damage.version.size) {
          const v0 = groundVersion(0, 0);
          if (sv !== sharedSun || v0 !== sharedGround) {
            let g = 0;
            for (let k = 0; k < 9; k++) g = g * 31 + v0;
            sharedSun = sv;
            sharedGround = v0;
            shared = `${sv}|${g}`;
          }
          return shared;
        }
        let g = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) g = g * 31 + groundVersion(cx + i, cy + j);
        return `${sv}|${g}`;
      },
      fadeMs: SUNLIGHT_FADE_MS,
    }),
    cloudShadows: createTileLayer((cx, cy) => gen({ kind: 'cloudShadow', seed, cx, cy }), CHUNK),
    clouds: createTileLayer((cx, cy) => gen({ kind: 'clouds', seed, cx, cy }), CHUNK),
    wisps: createTileLayer((cx, cy) => gen({ kind: 'clouds', seed: seed + 5, cx, cy }), CHUNK, { prefetchTiles: 3, maxInFlight: 8 }),
    highClouds: createTileLayer((cx, cy) => gen({ kind: 'clouds', seed: seed + 13, cx, cy }), CHUNK, { prefetchTiles: 2 }),
    cloudBuf: (() => {
      const canvas = document.createElement('canvas');
      return { canvas, ctx: canvas.getContext('2d')! };
    })(),
    inCloud: 0,
    grade: createGradeLayer(),
    sprites: planeSprites,
    smoke: createSmokeSprites(),
    sparkle: createSparkleSprites(),
    shadows: [1, 2].map((blur) => planeSprites.masks.map((m) => toCanvas(softSilhouette(m, blur, SHADOW_SCALE)))), // smaller: see SHADOW_SCALE
    shadowGround: new Float32Array(64 * 64), // indexed by silhouette pixel (the silhouettes are well under 64 px)
    shadowBuf: (() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      return { canvas, ctx, data: new ImageData(1, 1) };
    })(),
    light: (() => {
      const canvas = document.createElement('canvas');
      return { canvas, ctx: canvas.getContext('2d')! };
    })(),
    lamp: createLampSprite(),
    lightBuf: (() => {
      const canvas = document.createElement('canvas');
      return { canvas, ctx: canvas.getContext('2d')! };
    })(),
    lastT: 0,
    sun: null,
  };
  // A sunlight tile needs the heights of its tile and all 8 neighbours (shadows cross tile edges).
  function sunlightRequest(cx: number, cy: number) {
    const sun = scene.sun;
    if (!sun || sun.elevation <= 0.5 * RAD) return null;
    // All nine ground tiles must be ready (checked before allocating anything: this is asked often).
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!scene.ground.heights(cx + i, cy + j) || !scene.ground.isCurrent(cx + i, cy + j)) return null; // try again once the ground is ready
    const heights = new Uint8Array(9 * CHUNK * CHUNK);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const h = scene.ground.heights(cx + i - 1, cy + j - 1)!;
        for (let row = 0; row < CHUNK; row++) heights.set(h.subarray(row * CHUNK, row * CHUNK + CHUNK), (j * CHUNK + row) * 3 * CHUNK + i * CHUNK);
      }
    }
    return gen({ kind: 'shade', cx, cy, heights, sun: { tx: sun.toward.x, ty: sun.toward.y, elevation: sun.elevation } });
  }
  return scene;
}

export type Frame = {
  t: number;
  smoke: Smoke;
  warning: 0 | 1 | 2; // engine warning: the prop misfires, the exhaust smokes
  sun: Sun;
  day: number;
  prof: Profiler;
};

export function drawScene(ctx: CanvasRenderingContext2D, view: View, scene: Scene, plane: Plane, cam: Camera, f: Frame): boolean {
  const { scale, w, h } = view;
  const { t, sun } = f;
  scene.sun = sun;
  const ax = w / 2;
  const ay = h * HOME_Y;
  // Radius around the home spot that covers the whole screen at any rotation.
  const r = Math.hypot(Math.max(ax, w - ax), Math.max(ay, h - ay)) + 1;
  const c = { x: cam.x, y: cam.y }; // world point drawn at the home spot
  const off = planeOffset(cam, plane);
  const side = Math.ceil(2 * r) + 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BASE;
  ctx.fillRect(0, 0, view.devW, view.devH);

  // Ground: one rotated image, composed from tiles around the camera centre.
  const gx = Math.floor(c.x - r);
  const gy = Math.floor(c.y - r);
  worldTransform(ctx, scale, ax, ay, cam.angle, c.x, c.y);
  const ground = scene.ground.compose(gx, gy, side);
  ctx.drawImage(ground.canvas, ground.x, ground.y);
  f.prof.mark('ground');

  // Clouds live in their own (parallax) space: q = camera − wind·t.
  const qx = c.x * CLOUD_PARALLAX - WIND.x * t;
  const qy = c.y * CLOUD_PARALLAX - WIND.y * t;
  const cx0 = Math.floor(qx - r);
  const cy0 = Math.floor(qy - r);
  let lightingComplete = true; // night needs no direct-light layers
  let wispsComplete = true; // only needed at startup when the plane begins inside cloud

  // Direct sunlight, and what blocks it. Everything that only exists in direct sun (tree and hedge
  // shadows, sunny-side highlights, water glints, the plane's shadow) is drawn into one buffer, then
  // erased wherever a cloud's shadow falls: in cloud shade the light is diffuse, so those vanish. Then
  // the cloud shadows themselves darken the ground.
  const frame = bankFrame(plane.bank);
  const dt = Math.min(0.1, Math.max(0, t - scene.lastT));
  scene.lastT = t;
  if (sun.strength > 0) {
    const L = scene.light;
    if (L.canvas.width !== view.devW || L.canvas.height !== view.devH) {
      L.canvas.width = view.devW;
      L.canvas.height = view.devH;
      L.ctx.imageSmoothingEnabled = false;
    } else {
      L.ctx.setTransform(1, 0, 0, 1, 0, 0);
      L.ctx.clearRect(0, 0, view.devW, view.devH);
    }
    const lc = L.ctx;
    worldTransform(lc, scale, ax, ay, cam.angle, c.x, c.y);
    const shade = sun.shadowStrength; // the plane's and the clouds' shadows fade as the sun drops: only really visible around midday
    lc.globalAlpha = sun.strength; // landscape shadows stay as strong at any hour
    const light = scene.sunlight.compose(gx, gy, side);
    lightingComplete = light.complete;
    lc.drawImage(light.canvas, light.x, light.y);
    lc.globalAlpha = 1;
    drawSparkle(lc, scene.ground, scene.sparkle, { x0: gx, y0: gy, side, r }, t, sun, scene.seed);

    // The plane's own shadow: a soft silhouette cast pixel by pixel (see projectShadow), so it drapes
    // over trees and hedges: each pixel lifts toward the plane only where it is actually over something.
    // It's assembled in a small buffer, then drawn once, rotated, at the flat-ground shadow spot.
    const img = scene.shadows[Math.hypot(sun.shadow.x, sun.shadow.y) > 1.2 ? 1 : 0][frame]; // longer shadow, softer edge
    const B = scene.shadowBuf;
    const bw = img.width + 2 * SHADOW_MARGIN;
    const bh = img.height + 2 * SHADOW_MARGIN;
    if (B.canvas.width !== bw || B.canvas.height !== bh) {
      B.canvas.width = bw;
      B.canvas.height = bh;
      B.data = new ImageData(bw, bh);
    } else B.data.data.fill(0);
    projectShadow({
      alpha: alphaOf(img),
      iw: img.width,
      ih: img.height,
      plane,
      shadow: sun.shadow,
      heightAt: scene.ground.heightAt,
      heights: scene.shadowGround,
      dt,
      out: B.data.data,
      bw,
      bh,
    });
    B.ctx.putImageData(B.data, 0, 0);
    const at = shadowCentre(plane.x, plane.y, sun.shadow, 0);
    lc.save();
    lc.translate(at.x, at.y);
    lc.rotate(plane.heading);
    lc.globalAlpha = PLANE_SHADOW_ALPHA * shade;
    lc.drawImage(B.canvas, -bw / 2, -bh / 2);
    lc.restore();

    // Cloud shadows, on the ground (ground transform): the clouds' shapes, down-sun, drifting with the
    // wind and moving with the ground. The shift is fractional, so as the sun and wind move they glide
    // rather than hop a whole pixel at a time (the tiles are fetched at the nearest whole pixel).
    const dx = sun.shadow.x * CLOUD_HEIGHT + WIND.x * t;
    const dy = sun.shadow.y * CLOUD_HEIGHT + WIND.y * t;
    const cs = scene.cloudShadows.compose(gx - Math.round(dx), gy - Math.round(dy), side);
    lightingComplete &&= cs.complete;
    lc.globalAlpha = shade;
    lc.globalCompositeOperation = 'destination-out'; // no direct sun under a cloud
    lc.drawImage(cs.canvas, cs.x + dx, cs.y + dy);
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(L.canvas, 0, 0);
    worldTransform(ctx, scale, ax, ay, cam.angle, c.x, c.y);
    ctx.globalAlpha = shade * CLOUD_SHADOW_ALPHA;
    ctx.drawImage(cs.canvas, cs.x + dx, cs.y + dy);
    ctx.globalAlpha = 1;
    f.prof.mark('sunlight');
  }

  // Exhaust smoke, left behind in the world (still in the world transform).
  drawSmoke(ctx, f.smoke, scene.smoke);

  // Plane, rotated by how far it has swung from the camera heading.
  const tick = Math.floor(t * 60);
  // With its own shadow (upper wing on the fuselage and lower wing) for this light: baked and cached per
  // bank frame and quantised sun direction, so this is a lookup on almost every frame (see plane.ts).
  if (!scene.selfShadowWarm && sun.strength > 0) {
    scene.selfShadowWarm = true;
    prewarmSelfShadow(scene.sprites, sun.shadow, sun.strength); // the first frames draw under the loading screen
  }
  drawSprite(ctx, scale, selfShadowed(scene.sprites, frame, sun.shadow, plane.heading, sun.strength), ax + off.x, ay + off.y, plane.heading - cam.angle);
  // Propeller: a new random width every sim tick (seeded, so replays match), drawn on the same transform.
  // An overheated engine misfires: the blur keeps collapsing to a thin bar.
  const misfire = f.warning === 2 && hash(scene.seed, tick, 11) < 0.4;
  const prop = scene.sprites.props[misfire ? PROP.minW : propWidth(hash(scene.seed, tick, 7), plane.bank)];
  ctx.drawImage(prop, -prop.width / 2, -(SPRITE_H + 2) / 2 + PROP.row); // both canvases have a 1-px border
  f.prof.mark('plane');

  // The light of the hour, and the sun's direction on screen (it turns with the camera).
  const grade = gradeFor(sun, skyFor(scene.seed, f.day, sun.evening, scene.season.state.skyBias), scene.season.state);
  scene.hourLight = grade; // for the HUD, which takes the same light (see ui/hud.ts gradeMatrix)
  const sa = -cam.angle;
  const toward = { x: sun.toward.x * Math.cos(sa) - sun.toward.y * Math.sin(sa), y: sun.toward.x * Math.sin(sa) + sun.toward.y * Math.cos(sa) };

  // All the clouds go into their own screen-size buffer first, so the light of the hour can colour them
  // (far more strongly than the ground): pink and gold at sunrise and sunset, then dusk blue.
  const CB = scene.cloudBuf;
  if (CB.canvas.width !== view.devW || CB.canvas.height !== view.devH) {
    CB.canvas.width = view.devW;
    CB.canvas.height = view.devH;
    CB.ctx.imageSmoothingEnabled = false;
  }
  const cc = CB.ctx;
  cc.setTransform(1, 0, 0, 1, 0, 0);
  cc.clearRect(0, 0, view.devW, view.devH);
  // Clouds: a slow layer drifting with the wind. Same pixel size as everything else.
  worldTransform(cc, scale, ax, ay, cam.angle, qx, qy);
  const clouds = scene.clouds.compose(cx0, cy0, side);
  cc.drawImage(clouds.canvas, clouds.x, clouds.y);

  // Flying through cloud: how dense the cloud is where the plane is, eased; while in it, a second
  // field of wisps streaks past close to the camera, so passing through cloud feels fast.
  const pa = cam.angle;
  const pq = { x: qx + off.x * Math.cos(pa) - off.y * Math.sin(pa), y: qy + off.x * Math.sin(pa) + off.y * Math.cos(pa) };
  const cloudDepth = (cloudLevel(scene.seed, Math.round(pq.x), Math.round(pq.y)) + 1) / 6;
  scene.inCloud += (cloudDepth - scene.inCloud) * (1 - Math.exp(-dt / 0.4));
  const preloadWisps = t === 0 && cloudDepth > 0.02;
  const wx = c.x * WISP_PARALLAX - WIND.x * t;
  const wy = c.y * WISP_PARALLAX - WIND.y * t;
  if (scene.inCloud > 0.02 || preloadWisps) {
    worldTransform(cc, scale, ax, ay, cam.angle, wx, wy);
    const wisps = scene.wisps.compose(Math.floor(wx - r), Math.floor(wy - r), side);
    if (preloadWisps) wispsComplete = wisps.complete;
    cc.globalAlpha = Math.min(1, scene.inCloud * 1.6) * WISP_ALPHA;
    cc.drawImage(wisps.canvas, wisps.x, wisps.y);
    cc.globalAlpha = 1;
  } else {
    // Keep fast wisps ready before entering cloud; no composite or draw while they're hidden.
    scene.wisps.prefetch(Math.floor(wx - r), Math.floor(wy - r), side);
  }

  // A higher deck, above everything else: thinner and slower, and (too high to meaningfully block the
  // sun) it casts no shadow.
  const hx = c.x - WIND.x * HIGH_WIND_SCALE * t;
  const hy = c.y - WIND.y * HIGH_WIND_SCALE * t;
  worldTransform(cc, scale, ax, ay, cam.angle, hx, hy);
  const high = scene.highClouds.compose(Math.floor(hx - r), Math.floor(hy - r), side);
  cc.globalAlpha = HIGH_CLOUD_ALPHA;
  cc.drawImage(high.canvas, high.x, high.y);
  cc.globalAlpha = 1;
  tintClouds(cc, view.devW, view.devH, grade.cloud, toward); // the sun's direction turns with the camera
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(CB.canvas, 0, 0);
  f.prof.mark('clouds');

  // Light of the hour, over everything in the world.
  drawGrade(ctx, view, scene.grade, grade, toward);
  f.prof.mark('grade');

  // Lamplight, from just before sunset until a while after, each flame flickering. Added over the grade so
  // the dusk doesn't dull it, but under the clouds and the plane: those are cut out of it first.
  const m = sun.horizonMinutes;
  if (sun.evening && m >= LIGHTS.from && m < LIGHTS.to && scene.features.structures) {
    const B = scene.lightBuf;
    if (B.canvas.width !== view.devW || B.canvas.height !== view.devH) {
      B.canvas.width = view.devW;
      B.canvas.height = view.devH;
      B.ctx.imageSmoothingEnabled = false;
    }
    const bc = B.ctx;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, view.devW, view.devH);
    worldTransform(bc, scale, ax, ay, cam.angle, c.x, c.y);
    drawLamps(bc, scene.lamp, scene.seed, gx, gy, side, m, t, scene.features.density ?? 1, scene.features.military);
    bc.globalCompositeOperation = 'destination-out';
    drawSprite(bc, scale, scene.sprites.frames[frame], ax + off.x, ay + off.y, plane.heading - cam.angle);
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.drawImage(CB.canvas, 0, 0);
    bc.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; // light adds to the dusk
    ctx.drawImage(B.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  return ground.complete && lightingComplete && wispsComplete && clouds.complete && high.complete;
}

/**
 * The landing page's window onto the world: the landscape with its shadows, cloud shadows and clouds,
 * under the light of the hour (no plane), north up, with world point (x, y) at the centre of `ctx`'s
 * canvas, and the clouds' drift at time `t` (s). Same pixel size as the game. Returns true once every tile
 * in it is ready.
 *
 * Buffered for how it moves: slowly, and only ever north (the clouds also creep west on the wind). With
 * no rotation, each layer composes exactly the window's rectangle (the game's rotating view needs a square
 * the size of the screen's diagonal), and preloads only the rows ahead, plus a tile west for the clouds.
 */
const AHEAD = { n: 2, e: 0, s: 0, w: 0 };
const AHEAD_WIND = { n: 2, e: 0, s: 0, w: 1 };
const AHEAD_GROUND = { n: 3, e: 1, s: 1, w: 1 }; // a sunlight tile is baked from the ground tiles all round it
export function drawTerrain(ctx: CanvasRenderingContext2D, view: View, scene: Scene, x: number, y: number, sun: Sun, day: number, t: number): boolean {
  const { width, height } = ctx.canvas;
  const { scale } = view;
  scene.sun = sun;
  const w = width / scale;
  const h = height / scale;
  const rw = Math.ceil(w) + 2;
  const rh = Math.ceil(h) + 2;
  // World point (px, py) at the window's centre, on whole device pixels (no rotation: the tiles land exactly
  // on the screen's pixel grid).
  const place = (c: CanvasRenderingContext2D, px: number, py: number) => c.setTransform(scale, 0, 0, scale, Math.round(width / 2 - px * scale), Math.round(height / 2 - py * scale));
  const gx = Math.floor(x - w / 2) - 1;
  const gy = Math.floor(y - h / 2) - 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BASE;
  ctx.fillRect(0, 0, width, height);
  place(ctx, x, y);
  const ground = scene.ground.compose(gx, gy, rw, rh, AHEAD_GROUND);
  ctx.drawImage(ground.canvas, ground.x, ground.y);
  let complete = ground.complete;

  // Direct sunlight, erased under the clouds' shade, then the cloud shadows themselves (as in drawScene).
  if (sun.strength > 0) {
    const L = scene.light;
    if (L.canvas.width !== width || L.canvas.height !== height) {
      L.canvas.width = width;
      L.canvas.height = height;
      L.ctx.imageSmoothingEnabled = false;
    } else {
      L.ctx.setTransform(1, 0, 0, 1, 0, 0);
      L.ctx.clearRect(0, 0, width, height);
    }
    const lc = L.ctx;
    place(lc, x, y);
    lc.globalAlpha = sun.strength;
    const light = scene.sunlight.compose(gx, gy, rw, rh, AHEAD);
    lc.drawImage(light.canvas, light.x, light.y);
    const shade = sun.shadowStrength;
    const dx = sun.shadow.x * CLOUD_HEIGHT + WIND.x * t;
    const dy = sun.shadow.y * CLOUD_HEIGHT + WIND.y * t;
    const cs = scene.cloudShadows.compose(gx - Math.round(dx), gy - Math.round(dy), rw, rh, AHEAD_WIND);
    lc.globalAlpha = shade;
    lc.globalCompositeOperation = 'destination-out';
    lc.drawImage(cs.canvas, cs.x + dx, cs.y + dy);
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(L.canvas, 0, 0);
    place(ctx, x, y);
    ctx.globalAlpha = shade * CLOUD_SHADOW_ALPHA;
    ctx.drawImage(cs.canvas, cs.x + dx, cs.y + dy);
    ctx.globalAlpha = 1;
    complete &&= light.complete && cs.complete;
  }

  // The clouds (both decks), coloured by the light of the hour, then the light of the hour over everything.
  const grade = gradeFor(sun, skyFor(scene.seed, day, sun.evening, scene.season.state.skyBias), scene.season.state);
  const CB = scene.cloudBuf;
  if (CB.canvas.width !== width || CB.canvas.height !== height) {
    CB.canvas.width = width;
    CB.canvas.height = height;
    CB.ctx.imageSmoothingEnabled = false;
  }
  const cc = CB.ctx;
  cc.setTransform(1, 0, 0, 1, 0, 0);
  cc.clearRect(0, 0, width, height);
  const qx = x - WIND.x * t;
  const qy = y - WIND.y * t;
  place(cc, qx, qy);
  const clouds = scene.clouds.compose(Math.floor(qx - w / 2) - 1, Math.floor(qy - h / 2) - 1, rw, rh, AHEAD_WIND);
  cc.drawImage(clouds.canvas, clouds.x, clouds.y);
  const hx = x - WIND.x * HIGH_WIND_SCALE * t;
  const hy = y - WIND.y * HIGH_WIND_SCALE * t;
  place(cc, hx, hy);
  const high = scene.highClouds.compose(Math.floor(hx - w / 2) - 1, Math.floor(hy - h / 2) - 1, rw, rh, AHEAD_WIND);
  cc.globalAlpha = HIGH_CLOUD_ALPHA;
  cc.drawImage(high.canvas, high.x, high.y);
  cc.globalAlpha = 1;
  tintClouds(cc, width, height, grade.cloud, sun.toward);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(CB.canvas, 0, 0);
  drawGrade(ctx, { ...view, devW: width, devH: height, w, h }, scene.grade, grade, sun.toward); // north up: the sun's direction needs no turning
  return complete && clouds.complete && high.complete;
}

/** Colour the clouds in `cc` with the light of the hour: sunlit side toward the sun (`toward`, on screen). */
function tintClouds(cc: CanvasRenderingContext2D, devW: number, devH: number, tint: Grade['cloud'], toward: { x: number; y: number }) {
  if (tint.amount <= 0.01) return;
  cc.setTransform(1, 0, 0, 1, 0, 0);
  const R = Math.hypot(devW, devH) / 2;
  const mx = devW / 2;
  const my = devH / 2;
  const gr = cc.createLinearGradient(mx - toward.x * R, my - toward.y * R, mx + toward.x * R, my + toward.y * R);
  gr.addColorStop(0, `rgb(${tint.far.map(Math.round).join(',')})`);
  gr.addColorStop(1, `rgb(${tint.near.map(Math.round).join(',')})`);
  cc.globalCompositeOperation = 'source-atop'; // colour only where there is cloud
  cc.globalAlpha = tint.amount;
  cc.fillStyle = gr;
  cc.fillRect(0, 0, devW, devH);
  cc.globalAlpha = 1;
  cc.globalCompositeOperation = 'source-over';
}

function worldTransform(ctx: CanvasRenderingContext2D, scale: number, ax: number, ay: number, angle: number, cx: number, cy: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.translate(ax, ay);
  ctx.rotate(-angle);
  ctx.translate(-cx, -cy);
}

const alphas = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();
/** A silhouette canvas's alpha channel, read once and kept. */
function alphaOf(c: HTMLCanvasElement): Uint8ClampedArray {
  let a = alphas.get(c);
  if (!a) {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    a = new Uint8ClampedArray(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    alphas.set(c, a);
  }
  return a;
}

function toCanvas(px: { w: number; h: number; rgba: Uint8ClampedArray<ArrayBuffer> }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px.w;
  c.height = px.h;
  c.getContext('2d')!.putImageData(new ImageData(px.rgba, px.w, px.h), 0, 0);
  return c;
}

function drawSprite(ctx: CanvasRenderingContext2D, scale: number, img: HTMLCanvasElement, x: number, y: number, angle: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -img.width / 2, -img.height / 2); // the transform is left in place for the prop
}
