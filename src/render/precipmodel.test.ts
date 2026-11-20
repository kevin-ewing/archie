import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  AREA_SHARE, FADE_S, LEAN, MAX_DROPLETS, MAX_PARTICLES,
  clampIntensity, createPrecipModel, dropletRate, largeCount, rainCount, rainLength, rainSpeed, snowCount, stepPrecip,
  type ModelInput, type PrecipKind, type PrecipModel,
} from './precipmodel.ts';

const W = 320;
const H = 200;
const base = (over: Partial<ModelInput> = {}): ModelInput => ({
  seed: 1, width: W, height: H, precipitation: 'rain', intensity: 0.7, heading: 0, bank: 0, camAngle: 0, t: 0, ...over,
});
const snapshot = (m: PrecipModel) => {
  const out: number[] = [m.n];
  for (let j = 0; j < m.n; j++) out.push(m.px[j], m.py[j], m.ps[j], m.style[j], m.band[j], m.kind[j]);
  return out.join(',');
};
const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });
const intensityArb = fc.oneof(
  fc.double({ min: 0, max: 1, noNaN: true }),
  fc.constantFrom(0, 0.02, 0.4, 0.5, 1, -3, 7, NaN, Infinity, -Infinity),
);
const kindArb = fc.constantFrom<PrecipKind>('rain', 'snow');
const dtArb = fc.double({ min: 0, max: 0.1, noNaN: true });

// Property 21
test('Property 21: counts, sizes and speeds follow intensity and stay in budget', () => {
  // **Validates: Requirements 6.1, 6.5, 6.11, 7.1, 7.2, 7.3, 7.4, 7.8, 8.3, 11.5**
  fc.assert(
    fc.property(
      intensityArb, intensityArb, kindArb, fc.integer({ min: 16, max: 900 }), fc.integer({ min: 16, max: 700 }), seedArb,
      (a, b, kind, w, h, seed) => {
        const [lo, hi] = [clampIntensity(a), clampIntensity(b)].sort((x, y) => x - y);
        assert.ok(rainCount(lo) <= rainCount(hi) && snowCount(lo) <= snowCount(hi));
        assert.ok(rainLength(lo) <= rainLength(hi) && rainSpeed(lo) <= rainSpeed(hi));
        for (const v of [lo, hi]) {
          assert.ok(rainLength(v) >= 2 && rainLength(v) <= 12);
          if (v <= 0.02) assert.ok(rainCount(v) === 0 && snowCount(v) === 0);
          else assert.equal(snowCount(v), Math.round((400 * (v - 0.02)) / 0.98));
          if (v <= 0.5) assert.equal(largeCount(v), 0);
          else assert.ok(largeCount(v) >= 3 && largeCount(v) <= 10);
        }
        assert.ok(rainCount(0.02) <= 20 && rainCount(0.0201) <= 20 && rainCount(1) <= MAX_PARTICLES);

        const m = createPrecipModel();
        const i = clampIntensity(a);
        for (let f = 0; f < 3; f++) {
          stepPrecip(m, { seed, width: w, height: h, precipitation: kind, intensity: a, heading: 0, bank: 0, camAngle: 0, t: f * 0.05 });
          assert.ok(m.n <= AREA_SHARE * w * h, 'covered pixels within 12% of the screen');
          if (i <= 0.02) assert.equal(m.n, 0);
          for (let j = 0; j < m.n; j++) {
            assert.ok(m.ps[j] >= 1 && m.ps[j] <= 3);
            if (kind === 'snow') assert.equal(m.kind[j], 1);
            else assert.ok(m.kind[j] === 0);
          }
        }
        if (kind === 'rain') {
          // Streaks are 1 px wide; only lens droplets are larger, and none exist at first frame.
          const f = createPrecipModel();
          stepPrecip(f, { seed, width: w, height: h, precipitation: 'rain', intensity: a, heading: 0, bank: 0, camAngle: 0, t: 0 });
          for (let j = 0; j < f.n; j++) assert.equal(f.ps[j], 1);
        }
      },
    ),
  );
});

// Property 22
test('Property 22: streak direction follows the flight path and eases', () => {
  // **Validates: Requirements 6.2, 6.3, 6.4**
  fc.assert(
    fc.property(
      fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -3, max: 3, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }),
      (heading, cam, bank) => {
        const m = createPrecipModel();
        stepPrecip(m, base({ heading, camAngle: cam, bank }));
        const theta = heading - cam + LEAN * bank;
        assert.ok(Math.abs(m.theta - theta) < 1e-12);
        stepPrecip(m, base({ heading, camAngle: cam, bank, t: 0.1 }));
        const sp = rainSpeed(0.7) * 0.1;
        assert.ok(Math.abs(m.vx - -Math.sin(theta) * sp) < 1e-9 && Math.abs(m.vy - Math.cos(theta) * sp) < 1e-9);
      },
    ),
  );
  const straight = createPrecipModel();
  stepPrecip(straight, base());
  assert.equal(straight.theta, 0);
  fc.assert(
    fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (x, y) => {
      const [b1, b2] = [x, y].sort((p, q) => p - q);
      for (const sign of [1, -1]) {
        const m1 = createPrecipModel(), m2 = createPrecipModel();
        stepPrecip(m1, base({ bank: sign * b1 }));
        stepPrecip(m2, base({ bank: sign * b2 }));
        assert.ok(Math.abs(m1.theta) <= Math.abs(m2.theta) + 1e-12);
      }
    }),
  );
  fc.assert(
    fc.property(
      fc.array(fc.record({ heading: fc.double({ min: -10, max: 10, noNaN: true }), bank: fc.double({ min: -1, max: 1, noNaN: true }), dt: dtArb }), { minLength: 1, maxLength: 60 }),
      (seq) => {
        const m = createPrecipModel();
        stepPrecip(m, base());
        let t = 0;
        for (const s of seq) {
          const before = m.theta;
          t += s.dt;
          stepPrecip(m, base({ heading: s.heading, bank: s.bank, t }));
          assert.ok(Math.abs(m.theta - before) <= (15 * Math.PI) / 180 + 1e-12);
        }
      },
    ),
  );
  // A 90 degree change cannot complete within 0.25 s.
  fc.assert(
    fc.property(fc.array(fc.double({ min: 0.001, max: 0.1, noNaN: true }), { minLength: 1, maxLength: 40 }), (dts) => {
      const m = createPrecipModel();
      stepPrecip(m, base());
      let t = 0;
      for (const dt of dts) {
        if (t + dt >= 0.25) break;
        t += dt;
        stepPrecip(m, base({ heading: Math.PI / 2, t }));
        assert.ok(m.theta < Math.PI / 2 - 1e-6);
      }
    }),
  );
});

// Property 23
test('Property 23: same inputs give the same frame, and pause freezes it', () => {
  // **Validates: Requirements 6.8, 6.9, 7.5, 7.6**
  const stepArb = fc.record({ dt: dtArb, intensity: intensityArb, heading: fc.double({ min: -4, max: 4, noNaN: true }), bank: fc.double({ min: -1, max: 1, noNaN: true }) });
  fc.assert(
    fc.property(seedArb, kindArb, fc.array(stepArb, { minLength: 1, maxLength: 40 }), (seed, kind, seq) => {
      const m1 = createPrecipModel(), m2 = createPrecipModel();
      let t = 0;
      for (const s of seq) {
        t += s.dt;
        const inp = base({ seed, precipitation: kind, intensity: s.intensity, heading: s.heading, bank: s.bank, t });
        stepPrecip(m1, inp);
        stepPrecip(m2, { ...inp });
        const a = snapshot(m1);
        assert.equal(a, snapshot(m2));
        stepPrecip(m1, inp); // paused: same effect time again
        assert.equal(snapshot(m1), a);
      }
    }),
  );
  fc.assert(
    fc.property(seedArb, seedArb, kindArb, (s1, s2, kind) => {
      fc.pre(s1 !== s2);
      const m1 = createPrecipModel(), m2 = createPrecipModel();
      stepPrecip(m1, base({ seed: s1, precipitation: kind }));
      stepPrecip(m2, base({ seed: s2, precipitation: kind }));
      assert.notEqual(snapshot(m1), snapshot(m2));
    }),
  );
});

// Property 24
test('Property 24: fades are gradual and complementary', () => {
  // **Validates: Requirements 6.10, 7.7**
  const toArb = fc.constantFrom<ModelInput['precipitation']>('none', 'rain', 'snow');
  fc.assert(
    fc.property(toArb, toArb, fc.array(fc.double({ min: 0.005, max: 0.1, noNaN: true }), { minLength: 1, maxLength: 400 }), (from, to, dts) => {
      const m = createPrecipModel();
      stepPrecip(m, base({ precipitation: from }));
      const start = { ...m.opacity };
      let t = 0;
      let elapsed = 0;
      for (const dt of dts) {
        const prev = { ...m.opacity };
        t += dt;
        stepPrecip(m, base({ precipitation: to, t }));
        elapsed += dt;
        for (const k of ['rain', 'snow'] as const) {
          assert.ok(Math.abs(m.opacity[k] - prev[k]) <= dt / FADE_S + 1e-12);
          assert.ok(Math.abs(m.opacity[k] - prev[k]) <= 0.25 * Math.max(start[k], 1 - start[k]) + 1e-12);
          assert.ok(m.opacity[k] >= 0 && m.opacity[k] <= 1);
          if (start[k] === 1 && m.opacity[k] === 0 && prev[k] > 0) assert.ok(elapsed >= FADE_S - 1e-9, 'full fade takes at least 2 s');
        }
        const sum = m.opacity.rain + m.opacity.snow;
        assert.ok(Math.abs(sum - (prev.rain + prev.snow)) <= dt / FADE_S + 1e-12);
      }
    }),
  );
});

// Property 25
test('Property 25: lens droplets obey the intensity gate and the 3 s life', () => {
  // **Validates: Requirements 6.6, 6.7**
  const stepArb = fc.record({ dt: dtArb, intensity: intensityArb });
  fc.assert(
    fc.property(seedArb, kindArb, fc.array(stepArb, { minLength: 1, maxLength: 300 }), (seed, kind, seq) => {
      const m = createPrecipModel();
      const birth = new Float64Array(MAX_DROPLETS).fill(NaN);
      let t = 0;
      const run = (intensity: number, dt: number) => {
        t += dt;
        const spawned = m.spawnN;
        stepPrecip(m, base({ seed, precipitation: kind, intensity, t }));
        if (kind === 'snow' || clampIntensity(intensity) <= 0.4) assert.equal(m.spawnN, spawned, 'no spawn at or below 0.4');
        let live = 0;
        for (let j = 0; j < MAX_DROPLETS; j++) {
          const o = j * 6;
          if (m.droplets[o + 5] <= 0) { birth[j] = NaN; continue; }
          live++;
          if (Number.isNaN(birth[j])) birth[j] = m.T - m.droplets[o + 2];
          assert.ok(m.droplets[o + 3] >= 1 && m.droplets[o + 3] <= 3);
          assert.ok(m.T - birth[j] < 3, 'alive for less than 3 s');
        }
        assert.ok(live <= MAX_DROPLETS);
      };
      for (const s of seq) run(s.intensity, s.dt);
      for (let f = 0; f < 32; f++) run(0.2, 0.1); // intensity at or below 0.4: live droplets finish
      for (let j = 0; j < MAX_DROPLETS; j++) assert.equal(m.droplets[j * 6 + 5], 0);
    }),
  );
  assert.equal(dropletRate(0.4), 0);
  // Saturated at full intensity, then dropped: the spawn accumulator must not leak a droplet.
  const m = createPrecipModel();
  let t = 0;
  for (let f = 0; f < 60; f++) stepPrecip(m, base({ intensity: 1, t: (t += 0.1) }));
  const n = m.spawnN;
  stepPrecip(m, base({ intensity: 0.3, t: (t += 0.1) }));
  assert.equal(m.spawnN, n);
  // Small screen: the droplet cap blocks spawns and backs up the accumulator; closing the gate must clear it.
  const s = createPrecipModel();
  t = 0;
  const small = { width: 100, height: 100 };
  for (let f = 0; f < 60; f++) stepPrecip(s, base({ ...small, intensity: 1, t: (t += 0.1) }));
  const n2 = s.spawnN;
  for (let f = 0; f < 60; f++) stepPrecip(s, base({ ...small, intensity: 0.3, t: (t += 0.1) }));
  assert.equal(s.spawnN, n2);
});

test('reduced motion halves streak count and speed', () => {
  // **Validates: Requirements 8.10**
  const full = createPrecipModel(), half = createPrecipModel();
  for (const [m, reducedMotion] of [[full, false], [half, true]] as const) {
    stepPrecip(m, { ...base({ width: 1000, height: 1000, intensity: 1 }), reducedMotion });
    stepPrecip(m, { ...base({ width: 1000, height: 1000, intensity: 1, t: 0.1 }), reducedMotion });
  }
  assert.ok(Math.abs(half.vy / full.vy - 0.5) < 1e-9);
  const ratio = half.n / full.n;
  assert.ok(ratio > 0.4 && ratio < 0.6, `pixel ratio ${ratio}`);
});
