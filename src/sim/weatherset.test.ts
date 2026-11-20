import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { dayNumber } from './calendar.ts';
import { keyOfCover, weatherAtDay, type WeatherKind } from './weather.ts';
import {
  DEFAULTS,
  applyWeather,
  formatWeatherSetting,
  parseWeatherOverrides,
  resolveWeather,
  type WeatherOverride,
  type WeatherSetting,
} from './weatherset.ts';

const KINDS: WeatherKind[] = ['clear', 'cloudy', 'overcast', 'rain', 'snow'];
const kind = fc.constantFrom(...KINDS);
const wet = fc.constantFrom<WeatherKind>('rain', 'snow');
const unit = fc.double({ min: 0, max: 1, noNaN: true }).map((v) => v + 0); // +0 turns -0 into 0
const seed = fc.integer({ min: 0, max: 0x7fffffff });
const day = fc.integer({ min: dayNumber({ year: 1900, month: 1, day: 1 }), max: dayNumber({ year: 2100, month: 12, day: 31 }) });
const hours = fc.double({ min: 0, max: 23.99, noNaN: true });
const opt = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: undefined });

// Feature: weather-system, Property 17: Weather settings survive formatting and parsing
test('Property 17: parseWeatherOverrides(formatWeatherSetting(s)) gives back s', () => {
  const setting = fc.record({ kind, intensity: opt(unit), cloudCover: opt(unit) }, { requiredKeys: ['kind'] });
  fc.assert(
    fc.property(setting, (s: WeatherSetting) => {
      const { overrides, problems } = parseWeatherOverrides(formatWeatherSetting(s));
      assert.deepEqual(problems, []);
      assert.equal(overrides.kind, s.kind);
      assert.equal(overrides.intensity, s.intensity);
      assert.equal(overrides.cloud, s.cloudCover); // overrides store `cloud`, settings `cloudCover`
    }),
    { numRuns: 1000, seed: 17 },
  );
});

// Feature: weather-system, Property 18: Bad override values are dropped and reported once each
test('Property 18: valid values are kept, each invalid one is reported once by name and value', () => {
  const badNum = fc.constantFrom('abc', '1.5', '-0.1', '2', '', 'NaN', 'Infinity', '0..5');
  const badSeed = fc.constantFrom('abc', '-1', '1.5', '', '2147483648', '1e3');
  const badKind = fc.constantFrom('hail', 'RAIN', '', 'fog');
  const field = (good: fc.Arbitrary<string>, bad: fc.Arbitrary<string>) =>
    fc.oneof(fc.constant(undefined), good.map((raw) => ({ raw, ok: true })), bad.map((raw) => ({ raw, ok: false })));
  const num = unit.map(String);
  fc.assert(
    fc.property(
      field(fc.constantFrom(...KINDS), badKind),
      field(num, badNum),
      field(num, badNum),
      field(fc.integer({ min: 0, max: 0x7fffffff }).map(String), badSeed),
      (w, p, c, s) => {
        const q = new URLSearchParams();
        const names = [['weather', w], ['precip', p], ['cloud', c], ['weatherSeed', s]] as const;
        for (const [n, f] of names) if (f) q.set(n, f.raw);
        const r = parseWeatherOverrides(q.toString());
        const expected: WeatherOverride = {};
        if (w?.ok) expected.kind = w.raw as WeatherKind;
        if (p?.ok) expected.intensity = Number(p.raw);
        if (c?.ok) expected.cloud = Number(c.raw);
        if (s?.ok) expected.seed = Number(s.raw);
        assert.deepEqual(r.overrides, expected);
        const bad = names.filter(([, f]) => f && !f.ok);
        assert.equal(r.problems.length, bad.length);
        for (const [n, f] of bad) {
          assert.equal(r.problems.filter((m) => m.startsWith(`${n}=${f!.raw}:`)).length, 1, `${n}=${f!.raw}`);
        }
        assert.deepEqual(parseWeatherOverrides(q.toString()), r);
      },
    ),
    { numRuns: 500, seed: 18 },
  );
});

// Feature: weather-system, Property 19: Overrides win, then game settings, then generated weather
const base = { worldSeed: 1, weatherSeed: null, setting: null, override: null } as const;

test('Property 19: no setting and no override gives the generated state; seed order is override, weather, world', () => {
  fc.assert(
    fc.property(seed, opt(seed), opt(seed), day, hours, (world, ws, os, d, h) => {
      const r = resolveWeather({ worldSeed: world, weatherSeed: ws ?? null, setting: null, override: os === undefined ? null : { seed: os }, day: d, hours: h });
      const want = os ?? ws ?? world;
      assert.equal(r.seed, want);
      assert.deepEqual(r.state, weatherAtDay(want, d, h));
      assert.equal(r.source, os === undefined ? 'generated' : 'override');
    }),
    { numRuns: 200, seed: 19 },
  );
});

test('Property 19: a forced kind, intensity and cloud give one state at every day and hour', () => {
  fc.assert(
    fc.property(kind, unit, unit, fc.tuple(day, hours), fc.tuple(day, hours), fc.boolean(), (k, i, c, [d1, h1], [d2, h2], asOverride) => {
      const set = { kind: k, intensity: i, cloudCover: c };
      const mk = (d: number, h: number) =>
        resolveWeather({ ...base, setting: asOverride ? null : set, override: asOverride ? { kind: k, intensity: i, cloud: c } : null, day: d, hours: h });
      const a = mk(d1, h1);
      assert.deepEqual(a.state, mk(d2, h2).state);
      assert.equal(a.source, asOverride ? 'override' : 'game state');
      assert.equal(a.state.cloudCover, c);
      assert.equal(a.state.coverKey, keyOfCover(c));
      if (k === 'rain' || k === 'snow') {
        assert.equal(a.state.precipitation, k);
        assert.equal(a.state.intensity, i);
      } else {
        assert.equal(a.state.precipitation, 'none');
        assert.equal(a.state.intensity, 0);
      }
    }),
    { numRuns: 300, seed: 191 },
  );
});

test('Property 19: forced rain or snow without a cloud value has cover of at least 0.8', () => {
  fc.assert(
    fc.property(seed, day, hours, wet, opt(unit), fc.boolean(), (s, d, h, k, i, asOverride) => {
      const set: WeatherSetting = { kind: k, intensity: i };
      const r = resolveWeather({
        worldSeed: s, weatherSeed: null,
        setting: asOverride ? null : set,
        override: asOverride ? { kind: k, intensity: i } : null,
        day: d, hours: h,
      });
      assert.ok(r.state.cloudCover >= 0.8);
      assert.equal(r.state.precipitation, k);
      assert.equal(r.state.intensity, i ?? DEFAULTS[k]);
    }),
    { numRuns: 200, seed: 192 },
  );
});

test('Property 19: the override cloud and intensity win over the setting; unnamed fields come from the setting or the generated state', () => {
  fc.assert(
    fc.property(seed, day, hours, fc.record({ kind: wet, intensity: opt(unit), cloudCover: opt(unit) }, { requiredKeys: ['kind'] }), unit, unit, (s, d, h, set, oc, oi) => {
      const gen = weatherAtDay(s, d, h);
      const both = resolveWeather({ ...base, worldSeed: s, setting: set, override: { cloud: oc, intensity: oi }, day: d, hours: h }).state;
      assert.equal(both.cloudCover, oc);
      assert.equal(both.intensity, oi);
      assert.equal(both.coverKey, keyOfCover(oc));

      const cloudOnly = resolveWeather({ ...base, worldSeed: s, setting: set, override: { cloud: oc }, day: d, hours: h }).state;
      assert.equal(cloudOnly.cloudCover, oc);
      assert.equal(cloudOnly.precipitation, set.kind);
      assert.equal(cloudOnly.intensity, set.intensity ?? DEFAULTS[set.kind]);

      const none = resolveWeather({ ...base, worldSeed: s, setting: null, override: { cloud: oc }, day: d, hours: h }).state;
      assert.equal(none.cloudCover, oc);
      assert.equal(none.precipitation, gen.precipitation);
      assert.equal(none.intensity, gen.intensity);
    }),
    { numRuns: 200, seed: 193 },
  );
});

test('Property 19: forced intensity above 0 with no kind keeps the base precipitation, or rain if none', () => {
  fc.assert(
    fc.property(seed, day, hours, fc.double({ min: 0.001, max: 1, noNaN: true }), (s, d, h, i) => {
      const gen = weatherAtDay(s, d, h);
      const r = resolveWeather({ ...base, worldSeed: s, setting: null, override: { intensity: i }, day: d, hours: h }).state;
      assert.equal(r.precipitation, gen.precipitation === 'none' ? 'rain' : gen.precipitation);
      assert.equal(r.intensity, i);
      assert.ok(r.cloudCover >= 0.8);
      assert.equal(resolveWeather({ ...base, worldSeed: s, setting: null, override: { intensity: 0 }, day: d, hours: h }).state.precipitation, 'none');
    }),
    { numRuns: 200, seed: 194 },
  );
});

test('applyWeather does not mutate its base', () => {
  fc.assert(
    fc.property(seed, day, hours, kind, unit, (s, d, h, k, c) => {
      const b = weatherAtDay(s, d, h);
      const copy = structuredClone(b);
      applyWeather(b, { kind: k, cloudCover: c });
      assert.deepEqual(b, copy);
    }),
    { numRuns: 100, seed: 195 },
  );
});

test('default intensities are 0.6 for rain and 0.5 for snow', () => {
  assert.equal(DEFAULTS.rain, 0.6);
  assert.equal(DEFAULTS.snow, 0.5);
  const at = (k: WeatherKind) => resolveWeather({ ...base, setting: { kind: k }, day: 20000, hours: 12 }).state.intensity;
  assert.equal(at('rain'), 0.6);
  assert.equal(at('snow'), 0.5);
});
