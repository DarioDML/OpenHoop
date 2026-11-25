import { describe, expect, it } from 'vitest';
import {
  ALGO,
  activityMetrics,
  clipIntervals,
  coveredFraction,
  dayLoad,
  loadFromSum,
  loadSum,
  minuteMeans,
  normalizeIntervals,
  overlapSeconds,
  projectDayLoad,
  sameSession,
  subtractIntervals,
  sumFromLoad,
  totalSeconds,
  windowEnergy,
} from '../src';
import type { HrPoint } from '../src';

const T0 = 1_800_000_000;

function steady(start: number, seconds: number, hr: number | null): HrPoint[] {
  return Array.from({ length: seconds }, (_, i) => ({ t: start + i, hr }));
}

describe('intervals', () => {
  it('merges overlapping and touching intervals and drops empty ones', () => {
    expect(
      normalizeIntervals([
        { start: 50, end: 60 },
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 15, end: 30 },
        { start: 40, end: 40 },
      ]),
    ).toEqual([
      { start: 0, end: 30 },
      { start: 50, end: 60 },
    ]);
  });

  it('counts the union of overlapping activities once', () => {
    const manual = { start: 0, end: 3600 };
    const detected = { start: 1800, end: 4200 };
    expect(totalSeconds([manual, detected])).toBe(4200);
    expect(overlapSeconds(manual, detected)).toBe(1800);
    expect(overlapSeconds(manual, { start: 3600, end: 4000 })).toBe(0);
  });

  it('subtracts pauses from a window', () => {
    expect(subtractIntervals({ start: 0, end: 100 }, [{ start: 20, end: 30 }, { start: 25, end: 40 }, { start: 90, end: 200 }])).toEqual([
      { start: 0, end: 20 },
      { start: 40, end: 90 },
    ]);
    expect(subtractIntervals({ start: 0, end: 100 }, [{ start: -10, end: 200 }])).toEqual([]);
    expect(subtractIntervals({ start: 10, end: 10 }, [])).toEqual([]);
  });

  it('clips intervals to a starting point', () => {
    expect(clipIntervals([{ start: 0, end: 50 }, { start: 60, end: 80 }], 70)).toEqual([{ start: 70, end: 80 }]);
  });

  it('treats a detected workout mostly inside a logged activity as the same session', () => {
    const detected = { start: 1000, end: 2000 };
    expect(coveredFraction(detected, [{ start: 900, end: 1600 }])).toBeCloseTo(0.6);
    expect(sameSession(detected, [{ start: 900, end: 1600 }])).toBe(true);
    expect(sameSession(detected, [{ start: 1700, end: 2500 }])).toBe(false);
    expect(coveredFraction(detected, [{ start: 900, end: 1600 }, { start: 1200, end: 1500 }])).toBeCloseTo(0.6);
    expect(coveredFraction({ start: 5, end: 5 }, [{ start: 0, end: 10 }])).toBe(0);
  });
});

describe('minute means', () => {
  it('needs 30 valid seconds per minute', () => {
    const points = [...steady(T0, 29, 120), ...steady(T0 + 60, 30, 140)];
    expect(minuteMeans(points, T0, T0 + 120)).toEqual([null, 140]);
  });
});

describe('load sum', () => {
  it('round-trips between a load and its minute sum', () => {
    for (const load of [0.5, 4, 9.3, 17]) expect(loadFromSum(sumFromLoad(load))).toBeCloseTo(load, 10);
    expect(sumFromLoad(0)).toBe(0);
    expect(sumFromLoad(Number.NaN)).toBe(0);
  });

  it('gives dayLoad the same value as the shared sum', () => {
    const minutes = Array.from({ length: 1440 }, (_, i) => (i % 3 === 0 ? 150 : 70));
    const day = dayLoad(minutes, 57, 189);
    expect(day.ok && day.value).toBeCloseTo(loadFromSum(loadSum(minutes, 57, 189).sum), 12);
  });
});

describe('activity metrics', () => {
  it('computes load, zones and heart rate from the samples in the window', () => {
    const points = [...steady(T0 - 600, 600, 170), ...steady(T0, 1800, 150), ...steady(T0 + 1800, 600, 170)];
    const m = activityMetrics(points, { start: T0, end: T0 + 1800 }, [], 60, 190);
    expect(m.activeS).toBe(1800);
    expect(m.hrSeconds).toBe(1800);
    expect(m.avgHr).toBe(150);
    expect(m.maxHr).toBe(150);
    expect(m.zoneSeconds.reduce((a, b) => a + b, 0)).toBe(1800);
    expect(m.zoneSeconds[2]).toBe(1800);
    const expected = loadFromSum(loadSum(Array.from({ length: 30 }, () => 150), 60, 190).sum);
    expect(m.load).toMatchObject({ ok: true, value: expected, algo: ALGO.load });
  });

  it('reports no-data when the window has no heart rate', () => {
    const m = activityMetrics(steady(T0, 1800, null), { start: T0, end: T0 + 1800 }, [], 60, 190);
    expect(m.load).toEqual({ ok: false, reason: 'no-data', algo: ALGO.load });
    expect(m.avgHr).toBeNull();
    expect(m.maxHr).toBeNull();
    expect(m.zoneSeconds).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('reports low-coverage when under half of the minutes have heart rate', () => {
    const m = activityMetrics(steady(T0, 600, 150), { start: T0, end: T0 + 3600 }, [], 60, 190);
    expect(m.load).toEqual({ ok: false, reason: 'low-coverage', algo: ALGO.load });
    expect(m.avgHr).toBe(150);
  });

  it('reports missing-signal when the maximum is not above rest', () => {
    const m = activityMetrics(steady(T0, 600, 150), { start: T0, end: T0 + 600 }, [], 190, 190);
    expect(m.load).toMatchObject({ ok: false, reason: 'missing-signal' });
  });

  it('leaves paused time out of every value', () => {
    const points = [...steady(T0, 600, 140), ...steady(T0 + 600, 600, 185), ...steady(T0 + 1200, 600, 140)];
    const paused = activityMetrics(points, { start: T0, end: T0 + 1800 }, [{ start: T0 + 600, end: T0 + 1200 }], 60, 190);
    const flat = activityMetrics([...steady(T0, 600, 140), ...steady(T0 + 600, 600, 140)], { start: T0, end: T0 + 1200 }, [], 60, 190);
    expect(paused.activeS).toBe(1200);
    expect(paused.maxHr).toBe(140);
    expect(paused.load.ok && flat.load.ok && paused.load.value).toBeCloseTo(flat.load.ok ? flat.load.value : -1, 12);
  });

  it('never counts one second twice when points repeat', () => {
    const points = steady(T0, 600, 150);
    const once = activityMetrics(points, { start: T0, end: T0 + 600 }, [], 60, 190);
    expect(once.hrSeconds).toBe(600);
  });
});

describe('activity calories', () => {
  const body = { weightKg: 70, heightCm: 178, sex: 'male' as const, ageYears: 35 };

  it('bins the active minutes of the window for the calorie estimate', () => {
    const m = activityMetrics(steady(T0, 1800, 150), { start: T0, end: T0 + 1800 }, [], 60, 190);
    expect(m.activeMinutes).toMatchObject({ totalMinutes: 30, measuredMinutes: 30, activeHr: [{ bpm: 150, minutes: 30 }] });
    const kcal = windowEnergy(m.activeMinutes, body);
    expect(kcal.ok && kcal.value.activeMinutes).toBe(30);
    expect(kcal.ok && kcal.value.totalKcal).toBeGreaterThan(kcal.ok ? kcal.value.restingKcal : Infinity);
  });

  it('gives a reason instead of calories when data or profile is missing', () => {
    const empty = activityMetrics(steady(T0, 1800, null), { start: T0, end: T0 + 1800 }, [], 60, 190);
    expect(windowEnergy(empty.activeMinutes, body)).toMatchObject({ ok: false, reason: 'no-data' });
    const sparse = activityMetrics(steady(T0, 600, 150), { start: T0, end: T0 + 3600 }, [], 60, 190);
    expect(windowEnergy(sparse.activeMinutes, body)).toMatchObject({ ok: false, reason: 'low-coverage' });
    expect(windowEnergy(sparse.activeMinutes, null)).toMatchObject({ ok: false, reason: 'no-profile' });
    expect(windowEnergy(null, body)).toMatchObject({ ok: false, reason: 'missing-signal' });
  });
});

describe('live projection', () => {
  it('adds only session minutes after the end of the stored day', () => {
    const dayLoadValue = 8;
    const dayEnd = T0 + 600;
    const points = steady(T0, 1800, 160);
    const segments = [{ start: T0, end: T0 + 1800 }];
    const projected = projectDayLoad(dayLoadValue, dayEnd, points, segments, 60, 190);
    const fresh = loadSum(Array.from({ length: 20 }, () => 160), 60, 190).sum;
    expect(projected).toBeCloseTo(loadFromSum(sumFromLoad(dayLoadValue) + fresh), 10);
    expect(projected).toBeGreaterThan(dayLoadValue);
  });

  it('adds nothing when the session is already in the stored day', () => {
    const points = steady(T0, 1800, 160);
    expect(projectDayLoad(8, T0 + 1800, points, [{ start: T0, end: T0 + 1800 }], 60, 190)).toBeCloseTo(8, 10);
  });

  it('never goes past 21 and keeps the day value without a usable maximum', () => {
    const points = steady(T0, 7200, 189);
    expect(projectDayLoad(20.9, T0, points, [{ start: T0, end: T0 + 7200 }], 60, 190)).toBeLessThanOrEqual(21);
    expect(projectDayLoad(5, T0, points, [{ start: T0, end: T0 + 7200 }], 190, 190)).toBe(5);
  });
});
