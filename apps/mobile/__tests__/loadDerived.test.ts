import { loadFromSum, loadSum, sumFromLoad } from '@openhoop/analytics';
import type { DayRecord, WorkoutRecord } from '@openhoop/core';

import { loadTargetBand } from '@/data/activityDerived';
import { visibleReadiness } from '@/data/derived';
import { createFixtureDays } from '@/data/fixtureSource';
import {
  aimAt,
  compactThousands,
  daysOnTarget,
  hourlyStepBars,
  isoWeekNumber,
  loadBandAt,
  loadTargetView,
  minutesToLoad,
  readyAdvice,
  roundMinutes,
  typicalTrainingHr,
} from '@/data/loadDerived';
import { loadAimRange } from '@/data/readinessDerived';

import { FIXTURE_NOW } from './support/appData';

const days = createFixtureDays(FIXTURE_NOW);
const REF = { rest: 60, max: 190 };
const NOW_S = Math.floor(FIXTURE_NOW.getTime() / 1000);

function workout(start: number, avgHr: number): WorkoutRecord {
  return { start, end: start + 1800, zoneSeconds: [0, 0, 1800, 0, 0, 0], avgHr, maxHr: avgHr + 10, source: 'auto', label: null };
}

function last(): DayRecord {
  const day = days[days.length - 1];
  if (day === undefined) throw new Error('fixture');
  return day;
}

describe('load target', () => {
  it('uses the same usual band as the Load screen and narrows it by readiness', () => {
    const index = days.length - 1;
    expect(loadBandAt(days, index)).toEqual(loadTargetBand(days));
    expect(aimAt(days, index)).toEqual(loadAimRange(loadTargetBand(days), visibleReadiness(last()).value));
    expect(aimAt(days, 0)).toBeNull();
    expect(aimAt(days, 99)).toBeNull();
  });

  it('shows how far the load is from the target', () => {
    const aim = { low: 7.6, high: 15.6 };
    expect(loadTargetView(4.1, aim)).toEqual({ aim, status: 'below', toGo: 3.5, progress: 4.1 / 7.6 });
    expect(loadTargetView(9, aim)).toMatchObject({ status: 'within', toGo: 0, progress: 1 });
    expect(loadTargetView(17, aim)).toMatchObject({ status: 'above', toGo: 0, progress: 1 });
    expect(loadTargetView(null, aim)).toEqual({ aim, status: null, toGo: null, progress: null });
    expect(loadTargetView(3, null)).toBeNull();
    expect(loadTargetView(3, { low: 0, high: 2 })?.progress).toBe(1);
  });
});

describe('time to target', () => {
  it('turns the missing load into minutes at the given heart rate', () => {
    const perMinute = loadSum([150], REF.rest, REF.max).sum;
    const minutes = minutesToLoad(4, 9, 150, REF);
    expect(minutes).not.toBeNull();
    const reached = loadFromSum(sumFromLoad(4) + perMinute * (minutes ?? 0));
    expect(reached).toBeCloseTo(9, 6);
    expect(minutesToLoad(9, 4, 150, REF)).toBe(0);
    expect(minutesToLoad(4, 9, 70, REF)).toBeNull();
    expect(minutesToLoad(4, 9, 150, { rest: 60, max: 60 })).toBeNull();
  });

  it('takes the typical heart rate from recent zone 2 to 3 workouts', () => {
    const base = last();
    const withWorkouts = (list: WorkoutRecord[]): DayRecord[] => [{ ...base, workouts: list }];
    const fallback = REF.rest + 0.7 * (REF.max - REF.rest);
    expect(typicalTrainingHr(withWorkouts([]), REF, NOW_S)).toBeCloseTo(fallback, 6);
    expect(typicalTrainingHr(withWorkouts([workout(NOW_S - 3600, 140), workout(NOW_S - 7200, 150), workout(NOW_S - 9000, 180)]), REF, NOW_S)).toBe(145);
    expect(typicalTrainingHr(withWorkouts([workout(NOW_S - 3600, 140), workout(NOW_S - 7200, 150), workout(NOW_S - 9000, 152)]), REF, NOW_S)).toBe(150);
    expect(typicalTrainingHr(withWorkouts([workout(NOW_S - 40 * 86_400, 140)]), REF, NOW_S)).toBeCloseTo(fallback, 6);
  });

  it('uses custom zone floors for the zone 2 to 3 heart rate', () => {
    const base = last();
    const ref = { ...REF, zoneFloors: [100, 120, 135, 150, 170] as const };
    expect(typicalTrainingHr([{ ...base, workouts: [] }], ref, NOW_S)).toBe(135);
    expect(typicalTrainingHr([{ ...base, workouts: [workout(NOW_S - 3600, 125), workout(NOW_S - 7200, 160)] }], ref, NOW_S)).toBe(125);
  });

  it('rounds to five minutes and never below five', () => {
    expect(roundMinutes(0.4)).toBe(5);
    expect(roundMinutes(12)).toBe(10);
    expect(roundMinutes(13)).toBe(15);
  });

  it('gives advice from the load and the target', () => {
    const aim = { low: 7.6, high: 15.6 };
    expect(readyAdvice(5, null, 150, REF)).toEqual({ kind: 'calibrating' });
    expect(readyAdvice(null, aim, 150, REF)).toEqual({ kind: 'noLoad' });
    expect(readyAdvice(16, aim, 150, REF)).toEqual({ kind: 'above' });
    expect(readyAdvice(8, aim, 150, REF)).toEqual({ kind: 'within' });
    expect(readyAdvice(4, aim, 70, REF)).toEqual({ kind: 'noEstimate' });
    const below = readyAdvice(4, aim, 150, REF);
    expect(below.kind).toBe('below');
    if (below.kind === 'below') {
      expect(below.minutesLow).toBe(roundMinutes(minutesToLoad(4, aim.low, 150, REF) ?? 0));
      expect(below.minutesHigh).toBe(roundMinutes(minutesToLoad(4, aim.high, 150, REF) ?? 0));
      expect(below.minutesHigh).toBeGreaterThan(below.minutesLow);
    }
  });
});

describe('days on target', () => {
  it('counts days whose load landed in that day’s own target', () => {
    const from = days.length - 7;
    const result = daysOnTarget(days, from, days.length);
    let on = 0;
    let measured = 0;
    for (let i = from; i < days.length; i++) {
      const aim = aimAt(days, i);
      const load = days[i]?.load.value ?? null;
      if (aim === null || load === null) continue;
      measured++;
      if (load >= aim.low && load <= aim.high) on++;
    }
    expect(result).toEqual({ on, measured });
    expect(result.measured).toBe(7);
    expect(daysOnTarget(days, 0, 3)).toEqual({ on: 0, measured: 0 });
  });
});

describe('isoWeekNumber', () => {
  it('follows ISO 8601 weeks', () => {
    expect(isoWeekNumber('2026-11-25')).toBe(48);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekNumber('2021-01-03')).toBe(53);
    expect(isoWeekNumber('2024-12-30')).toBe(1);
  });
});

describe('hourlyStepBars', () => {
  it('fills the hours between the first and last counted hour', () => {
    const day = last();
    const hour = (h: number): number => day.start + h * 3600;
    const bars = hourlyStepBars({ ...day, stepsByHour: [{ t: hour(5), steps: 0 }, { t: hour(7), steps: 300 }, { t: hour(9), steps: 120 }, { t: hour(10), steps: 0 }] }, hour(12));
    expect(bars).toEqual([
      { t: hour(7), hour: 7, steps: 300 },
      { t: hour(8), hour: 8, steps: null },
      { t: hour(9), hour: 9, steps: 120 },
    ]);
  });

  it('says when there is no hourly split yet', () => {
    const day = last();
    expect(hourlyStepBars({ ...day, stepsByHour: undefined }, NOW_S)).toBeNull();
    expect(hourlyStepBars({ ...day, stepsByHour: [] }, NOW_S)).toEqual([]);
    expect(hourlyStepBars({ ...day, stepsByHour: [{ t: day.start + 7 * 3600, steps: 0 }] }, NOW_S)).toEqual([]);
  });

  it('skips hours after now and adds up to the fixture day total', () => {
    const day = days[days.length - 2];
    if (day === undefined) throw new Error('fixture');
    const bars = hourlyStepBars(day, day.end) ?? [];
    expect(bars.reduce((sum, b) => sum + (b.steps ?? 0), 0)).toBe(day.steps);
    expect(hourlyStepBars(day, day.start + 9 * 3600 + 10)?.map((b) => b.hour)).toEqual([7, 8, 9]);
  });

  it('shows thousands with one decimal', () => {
    expect(compactThousands(8_249)).toBe(8.2);
    expect(compactThousands(11_450)).toBe(11.5);
  });
});
