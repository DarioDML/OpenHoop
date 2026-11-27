import { describe, expect, it } from 'vitest';
import {
  ALGO,
  DEFAULT_CALIBRATION,
  dayLoad,
  debtMs,
  detectWorkouts,
  effectiveMaxHr,
  hrrZoneFloors,
  isZoneFloors,
  readiness,
  sleepConsistency,
  sleepNeedMs,
  sleepScore,
  strainNeedMs,
  zoneIndex,
  zoneSeconds,
} from '../src';
import type { Sample } from '../src';
import { lcg, sample } from './helpers';

const T0 = 1_764_000_000;

describe('sleep need', () => {
  it('ports the reference self-test assertions for debt', () => {
    expect(debtMs(30e6, 20e6, 5e6)).toBe(5_000_000);
    expect(debtMs(30e6, 20e6, 7e6)).toBe(6_428_571);
    expect(debtMs(40e6, 20e6, 0)).toBe(7_668_000);
    expect(debtMs(20e6, 25e6, 0)).toBe(0);
  });

  it('unknown REM uses the 1/2 factor', () => {
    expect(debtMs(30e6, 20e6, null)).toBe(5_000_000);
  });

  it('sleep need is baseline plus debt plus strain need minus naps', () => {
    expect(strainNeedMs(0)).toBe(0);
    expect(sleepNeedMs({ debtMs: 1_000_000, load: 0, napMs: 600_000 })).toBe(27_834_000 + 400_000);
    expect(sleepNeedMs({ debtMs: 0, load: 10, napMs: 0 })).toBeCloseTo(27_834_000 + strainNeedMs(10), 6);
  });
});

describe('sleep score', () => {
  it('a null consistency counts as 80; a real 0 stays 0', () => {
    const need = 30e6;
    const base = sleepScore({ asleepMs: 27e6, needMs: need, consistency: null });
    const at80 = sleepScore({ asleepMs: 27e6, needMs: need, consistency: 80 });
    const at0 = sleepScore({ asleepMs: 27e6, needMs: need, consistency: 0 });
    expect(base).toEqual(at80);
    expect(base.ok && at0.ok && base.value - at0.value).toBeCloseTo(80 * DEFAULT_CALIBRATION.sleepScoreConsistencyWeight, 9);
  });

  it('is clamped to 0-100 and gives reasons', () => {
    const tiny = sleepScore({ asleepMs: 1e6, needMs: 30e6, consistency: 50 });
    const huge = sleepScore({ asleepMs: 60e6, needMs: 30e6, consistency: 100 });
    expect(tiny).toMatchObject({ ok: true, value: 0, algo: ALGO.sleepScore });
    expect(huge.ok && huge.value).toBeLessThanOrEqual(100);
    expect(huge.ok && huge.value).toBeGreaterThan(98);
    expect(sleepScore({ asleepMs: 0, needMs: 30e6, consistency: null })).toMatchObject({ ok: false, reason: 'no-sleep' });
  });
});

describe('sleep consistency', () => {
  const night = (day: number, onsetMin: number, offsetMin: number) => ({
    onset: T0 + day * 86_400 + onsetMin * 60,
    offset: T0 + day * 86_400 + offsetMin * 60,
  });

  it('identical clock times score 100; fewer than 2 nights needs history', () => {
    const base = T0 - (T0 % 86_400);
    const n = (d: number) => ({ onset: base + d * 86_400 + 3600, offset: base + d * 86_400 + 8 * 3600 });
    expect(sleepConsistency([n(0), n(1), n(2), n(3)], 0)).toMatchObject({ ok: true, value: 100, coverage: 1 });
    expect(sleepConsistency([n(0)], 0)).toMatchObject({ ok: false, reason: 'needs-history', algo: ALGO.sleepConsistency });
  });

  it('wraps around midnight and averages onset and offset deviations', () => {
    const base = T0 - (T0 % 86_400);
    const a = { onset: base - 10 * 60, offset: base + 7 * 3600 };
    const b = { onset: base + 86_400 + 10 * 60, offset: base + 86_400 + 7 * 3600 };
    const r = sleepConsistency([a, b], 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(100 - 5 / 1.8, 9);
  });

  it('uses only the last 4 nights and honours the time zone', () => {
    const wild = night(0, 300, 900);
    const steady = [1, 2, 3, 4].map((d) => night(d, 0, 420));
    expect(sleepConsistency([wild, ...steady], 0)).toMatchObject({ ok: true, value: 100 });
    const r1 = sleepConsistency(steady, 3600);
    expect(r1).toMatchObject({ ok: true, value: 100 });
  });
});

describe('readiness', () => {
  const c = DEFAULT_CALIBRATION;

  it('the reference self-test case equals 100 once the strap offset is applied', () => {
    const r = readiness({ history: [], hrv: 103.2555, sleepScore: 80, rhr: 59.08321 - c.rhrOffsetBpm });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.score).toBeCloseTo(100, 9);
      expect(r.value.calibrating).toBe(true);
    }
  });

  it('a strap RHR equal to the published reference reads as 4.6 bpm high', () => {
    const r = readiness({ history: [], hrv: 103.2555, sleepScore: 80, rhr: 59.08321 });
    expect(r.ok && r.value.score).toBeCloseTo(100 * Math.exp(-c.rhrWeight * c.rhrOffsetBpm), 9);
  });

  it('switches to the own mean RHR, without offset, from 4 nights of history', () => {
    const h = { hrv: 103.2555, sleepScore: 80, rhr: 60 };
    const three = readiness({ history: [h, h, h], hrv: 103.2555, sleepScore: 80, rhr: 60 });
    const four = readiness({ history: [h, h, h, h], hrv: 103.2555, sleepScore: 80, rhr: 60 });
    expect(three.ok && three.value.score).toBeCloseTo(100 * Math.exp(-c.rhrWeight * (60 + 4.6 - 59.08321)), 9);
    expect(three.ok && three.value.calibrating).toBe(false);
    expect(four.ok && four.value.score).toBeCloseTo(100, 9);
  });

  it('is calibrating with fewer than 3 nights', () => {
    const h = { hrv: 80, sleepScore: 70, rhr: 55 };
    expect(readiness({ history: [h, h], hrv: 80, sleepScore: 70, rhr: 55 })).toMatchObject({ ok: true, value: { calibrating: true } });
  });

  it('stays within 0-100 for HRV 5-300 and RHR 30-120', () => {
    const histories = [[], [{ hrv: 40, sleepScore: 60, rhr: 50 }], Array.from({ length: 6 }, () => ({ hrv: 150, sleepScore: 90, rhr: 70 }))];
    for (const history of histories) {
      for (let hrv = 5; hrv <= 300; hrv += 5) {
        for (let rhr = 30; rhr <= 120; rhr += 5) {
          for (const sleep of [0, 50, 100]) {
            const r = readiness({ history, hrv, sleepScore: sleep, rhr });
            expect(r.ok).toBe(true);
            if (r.ok) {
              expect(r.value.score).toBeGreaterThanOrEqual(0);
              expect(r.value.score).toBeLessThanOrEqual(100);
            }
          }
        }
      }
    }
  });

  it('contributions sum to score - 100 when the score is not clamped', () => {
    const rand = lcg(5);
    let checked = 0;
    for (let k = 0; k < 500; k++) {
      const history = Array.from({ length: Math.floor(rand() * 7) }, () => ({
        hrv: 30 + rand() * 120,
        sleepScore: 50 + rand() * 50,
        rhr: 45 + rand() * 25,
      }));
      const r = readiness({ history, hrv: 20 + rand() * 120, sleepScore: 40 + rand() * 60, rhr: 45 + rand() * 25 });
      if (!r.ok || r.value.score <= 0 || r.value.score >= 100) continue;
      const { hrv, sleep, rhr } = r.value.contributions;
      expect(Math.abs(hrv + sleep + rhr - (r.value.score - 100))).toBeLessThan(0.5);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('a missing HRV returns a reason, not a number (Review Focus 3)', () => {
    expect(readiness({ history: [], hrv: Number.NaN, sleepScore: 80, rhr: 55 })).toEqual({
      ok: false,
      reason: 'missing-signal',
      algo: ALGO.readiness,
    });
    expect(readiness({ history: [], hrv: 0, sleepScore: 80, rhr: 55 }).ok).toBe(false);
  });
});

describe('load', () => {
  it('a day with 200 valid minutes is low-coverage', () => {
    const minutes = Array.from({ length: 1440 }, (_, i) => (i < 200 ? 120 : null));
    expect(dayLoad(minutes, 57, 189)).toEqual({ ok: false, reason: 'low-coverage', algo: ALGO.load });
  });

  it('h = 94 at rest 57 and max 189 counts toward the sum', () => {
    const minutes = Array.from({ length: 1440 }, (_, i) => (i === 0 ? 94 : 60));
    const r = dayLoad(minutes, 57, 189);
    expect(r.ok && r.value).toBeCloseTo(0.78115 * Math.exp(0.065 * -6) ** 0.40855, 12);
  });

  it('maps heart-rate reserve onto the reference wearer', () => {
    const rand = lcg(4);
    const minutes = Array.from({ length: 1440 }, () => 60 + rand() * 100);
    const asRef = dayLoad(minutes, 57, 189);
    const shifted = dayLoad(minutes.map((h) => 50 + ((h - 57) * (199 - 50)) / (189 - 57)), 50, 199);
    expect(asRef.ok && shifted.ok).toBe(true);
    if (asRef.ok && shifted.ok) expect(shifted.value).toBeCloseTo(asRef.value, 9);
  });

  it('is monotonic in every minute and never exceeds 21', () => {
    const rand = lcg(9);
    const minutes = Array.from({ length: 1440 }, () => 50 + rand() * 80);
    const base = dayLoad(minutes, 55, 185);
    if (!base.ok) throw new Error('expected a load');
    for (let k = 0; k < 200; k++) {
      const i = Math.floor(rand() * minutes.length);
      const bumped = minutes.slice();
      bumped[i] = (bumped[i] ?? 0) + rand() * 40;
      const r = dayLoad(bumped, 55, 185);
      expect(r.ok && r.value).toBeGreaterThanOrEqual(base.value);
    }
    const maxed = dayLoad(Array.from({ length: 1440 }, () => 200), 55, 185);
    expect(maxed).toMatchObject({ ok: true, value: 21 });
  });
});

describe('zones and workouts', () => {
  it('zoneSeconds sums to the number of non-null seconds', () => {
    const rand = lcg(2);
    const hr = Array.from({ length: 5000 }, () => (rand() < 0.1 ? null : Math.round(30 + rand() * 180)));
    const z = zoneSeconds(hr, 58, 190);
    expect(z.reduce((a, b) => a + b, 0)).toBe(hr.filter((h) => h !== null).length);
  });

  it('places edges at 40/60/70/80/90 % of reserve', () => {
    expect(zoneSeconds([80, 100, 115, 125, 135, 145, 90], 50, 150)).toEqual([1, 2, 1, 1, 1, 1]);
  });

  it('gives the same zones from heart-rate reserve floors', () => {
    const floors = hrrZoneFloors(50, 150);
    expect(floors).toEqual([90, 110, 120, 130, 140]);
    expect(zoneSeconds([80, 100, 115, 125, 135, 145, 90], 50, 150, floors)).toEqual([1, 2, 1, 1, 1, 1]);
  });

  it('uses custom bpm floors instead of the reserve when given', () => {
    const floors = [100, 120, 140, 160, 180] as const;
    expect(zoneIndex(99, 50, 150, floors)).toBe(0);
    expect(zoneIndex(100, 50, 150, floors)).toBe(1);
    expect(zoneIndex(185, 50, 150, floors)).toBe(5);
    expect(zoneSeconds([90, 130, 150, 170, 190], 200, 100, floors)).toEqual([1, 0, 1, 1, 1, 1]);
  });

  it('accepts only five rising floors in a heart-rate range', () => {
    expect(isZoneFloors([100, 120, 140, 160, 180])).toBe(true);
    expect(isZoneFloors([100, 120, 120, 160, 180])).toBe(false);
    expect(isZoneFloors([100, 120, 140, 160])).toBe(false);
    expect(isZoneFloors([10, 120, 140, 160, 180])).toBe(false);
    expect(isZoneFloors(null)).toBe(false);
  });

  function day(segments: [number, number][]): Sample[] {
    const out: Sample[] = [];
    let t = T0;
    for (const [hr, seconds] of segments) for (let i = 0; i < seconds; i++) out.push(sample(t++, { hr }));
    return out;
  }

  it('detects 15 minutes above 50 % of reserve and bridges a 90 s dip', () => {
    const w = detectWorkouts(day([[60, 600], [160, 450], [100, 90], [160, 450], [60, 600]]), 60, 190);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ start: T0 + 600, end: T0 + 600 + 990 - 1, maxHr: 160 });
    expect(w[0]?.zoneSeconds.reduce((a, b) => a + b, 0)).toBe(990);
  });

  it('splits at a 200 s dip and drops runs under 600 s', () => {
    expect(detectWorkouts(day([[60, 600], [160, 450], [100, 200], [160, 450], [60, 600]]), 60, 190)).toEqual([]);
    expect(detectWorkouts(day([[60, 100], [160, 599], [60, 100]]), 60, 190)).toEqual([]);
  });
});

describe('profile', () => {
  it('uses the set maximum, else 208 - 0.7 x age, else 190', () => {
    expect(effectiveMaxHr({ maxHr: 201, birthYear: 1990, restingHr: null }, 2026)).toBe(201);
    expect(effectiveMaxHr({ maxHr: null, birthYear: 1986, restingHr: null }, 2026)).toBeCloseTo(180, 9);
    expect(effectiveMaxHr({ maxHr: null, birthYear: null, restingHr: null }, 2026)).toBe(190);
  });
});
