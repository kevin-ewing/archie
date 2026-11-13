// Draws the world for one frame, with a heading-up rotating camera, in this order:
//   ground → sunlight (cast shadows + relief) → water sparkle → cloud shadows → plane shadow → smoke → plane
//   → clouds → light grade
// (The instrument board is drawn on top separately; see ui/hud.ts.)

import { BASE as GROUND_BASE, CHUNK } from '../world/ground.ts';
import type { Plane } from '../sim/flight.ts';
import type { Sun } from '../sim/daylight.ts';
import { planeOffset, type Camera } from './camera.ts';
import type { View } from './display.ts';
import { hash } from '../core/noise.ts';
import type { Profiler } from '../core/profile.ts';
import { createGradeLayer, drawGrade, gradeFor, skyFor, type GradeLayer } from './grade.ts';
import { bankFrame, createPlaneSprites, PROP, propWidth, SPRITE_H, type PlaneSprites } from './plane.ts';
import { easeHeight, heightUnder, shadowCentre, softSilhouette } from './shadow.ts';
import { createSparkleSprites, drawSparkle, type SparkleSprites } from './sparkle.ts';
import { createSmokeSprites, drawSmoke, type Smoke, type SmokeSprites } from './smoke.ts';
import { createTileGen } from './tilegen.ts';
import { createTileLayer, type TileLayer } from './tiles.ts';

const HOME_Y = 0.72; // plane's home spot, as a fraction of screen height (more ground visible ahead)
const CLOUD_PARALLAX = 2; // clouds are closer to the camera, so they move 2× faster than the ground
const CLOUD_HEIGHT = 380; // world px above the ground, for where cloud shadows fall
const PLANE_SHADOW_ALPHA = 0.32;
const CLOUD_SHADOW_ALPHA = 0.6;
const WIND = { x: 3, y: 1.5 }; // cloud drift, cloud px / s
const BASE = `rgb(${GROUND_BASE.join(',')})`; // shown only where a tile hasn't been generated yet
const RAD = Math.PI / 180;

export type Scene = {
  seed: number;
  ground: TileLayer;
  sunlight: TileLayer; // cast shadows + relief, re-baked as the sun moves
  cloudShadows: TileLayer;
  clouds: TileLayer;
  grade: GradeLayer;
  sprites: PlaneSprites;
  smoke: SmokeSprites;
  sparkle: SparkleSprites;
  shadows: HTMLCanvasElement[][]; // [softness][bank frame] soft silhouettes
  shadowGround: number; // eased ground height under the plane's shadow
  lastT: number;
  sun: Sun | null; // the sun this frame (the sunlight layer reads it when it asks for tiles)
};

/** Sun quantised for re-baking the sunlight tiles: a fresh bake every degree or so, cross-faded in. */
const sunVersion = (s: Sun | null) => (s && s.elevation > 0.5 * RAD ? `${Math.round(s.azimuth / (1 * RAD))}:${Math.round(s.elevation / (0.5 * RAD))}` : 'down');
const SUNLIGHT_FADE_MS = 1500;

export function createScene(seed: number): Scene {
  const gen = createTileGen();
  const planeSprites = createPlaneSprites();
  const scene: Scene = {
    seed,
    ground: createTileLayer((cx, cy) => gen({ kind: 'ground', seed, cx, cy }), CHUNK),
    sunlight: createTileLayer((cx, cy) => sunlightRequest(cx, cy), CHUNK, { version: () => sunVersion(scene.sun), fadeMs: SUNLIGHT_FADE_MS }),
    cloudShadows: createTileLayer((cx, cy) => gen({ kind: 'cloudShadow', seed, cx, cy }), CHUNK),
    clouds: createTileLayer((cx, cy) => gen({ kind: 'clouds', seed, cx, cy }), CHUNK),
    grade: createGradeLayer(),
    sprites: planeSprites,
    smoke: createSmokeSprites(),
    sparkle: createSparkleSprites(),
    shadows: [1, 2].map((blur) => planeSprites.masks.map((m) => toCanvas(softSilhouette(m, blur)))),
    shadowGround: 0,
    lastT: 0,
    sun: null,
  };
  // A sunlight tile needs the heights of its tile and all 8 neighbours (shadows cross tile edges).
  function sunlightRequest(cx: number, cy: number) {
    const sun = scene.sun;
    if (!sun || sun.elevation <= 0.5 * RAD) return null;
    const heights = new Uint8Array(9 * CHUNK * CHUNK);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const h = scene.ground.heights(cx + i - 1, cy + j - 1);
        if (!h) return null; // try again once the ground is ready
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

  if (sun.strength > 0) {
    // Sunlight: trees and hedges cast shadows down-sun, crowns lit on their sunny side.
    ctx.globalAlpha = sun.strength;
    const light = scene.sunlight.compose(gx, gy, side);
    ctx.drawImage(light.canvas, light.x, light.y);
    ctx.globalAlpha = 1;
    f.prof.mark('sunlight');
    drawSparkle(ctx, scene.ground, scene.sparkle, { x0: gx, y0: gy, side, r }, t, sun, scene.seed);
    // Cloud shadows: each cloud's shadow lies CLOUD_HEIGHT along the sun's shadow direction, drifting with
    // the wind. Shifted by whole pixels so they stay on the ground's pixel grid.
    const sx = Math.round(sun.shadow.x * CLOUD_HEIGHT + (WIND.x * t) / 2);
    const sy = Math.round(sun.shadow.y * CLOUD_HEIGHT + (WIND.y * t) / 2);
    ctx.globalAlpha = sun.strength * CLOUD_SHADOW_ALPHA;
    const cs = scene.cloudShadows.compose(gx - sx, gy - sy, side);
    ctx.drawImage(cs.canvas, cs.x + sx, cs.y + sy);
    ctx.globalAlpha = 1;
    f.prof.mark('sparkle+cs');
  }

  // The plane's own shadow: a soft silhouette at its exact projected spot, nearer the plane over trees.
  const frame = bankFrame(plane.bank);
  const dt = Math.min(0.1, Math.max(0, t - scene.lastT));
  scene.lastT = t;
  if (sun.strength > 0) {
    const flat = shadowCentre(plane.x, plane.y, sun.shadow, 0);
    scene.shadowGround = easeHeight(scene.shadowGround, heightUnder(scene.ground.heightAt, flat.x, flat.y), dt);
    const at = shadowCentre(plane.x, plane.y, sun.shadow, scene.shadowGround);
    const img = scene.shadows[Math.hypot(sun.shadow.x, sun.shadow.y) > 1.2 ? 1 : 0][frame]; // longer shadow, softer edge
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(plane.heading);
    ctx.globalAlpha = PLANE_SHADOW_ALPHA * sun.strength;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  // Exhaust smoke, left behind in the world (still in the world transform).
  drawSmoke(ctx, f.smoke, scene.smoke);

  // Plane, rotated by how far it has swung from the camera heading.
  const tick = Math.floor(t * 60);
  drawSprite(ctx, scale, scene.sprites.frames[frame], ax + off.x, ay + off.y, plane.heading - cam.angle);
  // Propeller: a new random width every sim tick (seeded, so replays match), drawn on the same transform.
  // An overheated engine misfires: the blur keeps collapsing to a thin bar.
  const misfire = f.warning === 2 && hash(scene.seed, tick, 11) < 0.4;
  const prop = scene.sprites.props[misfire ? PROP.minW : propWidth(hash(scene.seed, tick, 7), plane.bank)];
  ctx.drawImage(prop, -prop.width / 2, -(SPRITE_H + 2) / 2 + PROP.row); // both canvases have a 1-px border
  f.prof.mark('plane');

  // Clouds: closer to the camera, so they slide past faster (parallax) and drift with the wind.
  // Same pixel size as everything else: parallax moves them, it doesn't scale them.
  const qx = c.x * CLOUD_PARALLAX - WIND.x * t;
  const qy = c.y * CLOUD_PARALLAX - WIND.y * t;
  const cx0 = Math.floor(qx - r);
  const cy0 = Math.floor(qy - r);
  worldTransform(ctx, scale, ax, ay, cam.angle, qx, qy);
  const clouds = scene.clouds.compose(cx0, cy0, side);
  ctx.drawImage(clouds.canvas, clouds.x, clouds.y);
  f.prof.mark('clouds');

  // Light of the hour, over everything in the world. The sun's direction turns with the camera.
  const a = -cam.angle;
  const toward = { x: sun.toward.x * Math.cos(a) - sun.toward.y * Math.sin(a), y: sun.toward.x * Math.sin(a) + sun.toward.y * Math.cos(a) };
  drawGrade(ctx, view, scene.grade, gradeFor(sun, skyFor(scene.seed, f.day, sun.evening)), toward);
  f.prof.mark('grade');

  return ground.complete && clouds.complete;
}

function worldTransform(ctx: CanvasRenderingContext2D, scale: number, ax: number, ay: number, angle: number, cx: number, cy: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.translate(ax, ay);
  ctx.rotate(-angle);
  ctx.translate(-cx, -cy);
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
