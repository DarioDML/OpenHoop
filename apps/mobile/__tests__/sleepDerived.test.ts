import { DEFAULT_CALIBRATION, strainNeedMs } from '@openhoop/analytics';
import type { DayRecord, StageEpochRow } from '@openhoop/core';

import { createFixtureDays } from '@/data/fixtureSource';
import {
  AWAKE_TYPICAL_MAX_S,
  RESTORATIVE_TYPICAL,
  bedWakeBars,
  bedWakeWindow,
  clockFromNoon,
  contributorStatus,
  goalFraction,
  needBreakdown,
  needSegments,
  nightEvents,
  planNights,
  rangeFlag,
  restorativePct,
  sleepContributors,
  sleepStress,
  sleepTrendStats,
  typicalStageRanges,
  weakestContributor,
  windDownAt,
} from '@/data/sleepDerived';

import { FIXTURE_NOW } from './support/appData';

const days = createFixtureDays(FIXTURE_NOW);

function withNeed(day: DayRecord, patch: Partial<DayRecord['sleep']>, rest: Partial<DayRecord> = {}): DayRecord {
  return { ...day, ...rest, sleep: { ...day.sleep, ...patch } };
}

function derived(value: number | null, reason: string | null = null): DayRecord['sleep']['need'] {
  return { value, reason, coverage: value === null ? null : 1, algo: 'test@1' };
}

describe('contributor status', () => {
  it('rates higher-is-better contributors with the cut-offs', () => {
    expect(contributorStatus('hoursVsNeed', 95)).toBe('optimal');
    expect(contributorStatus('consistency', 81)).toBe('sufficient');
    expect(contributorStatus('efficiency', 85)).toBe('optimal');
    expect(contributorStatus('efficiency', 80)).toBe('sufficient');
    expect(contributorStatus('efficiency', 74)).toBe('poor');
    expect(contributorStatus('hoursVsNeed', null)).toBeNull();
  });

  it('rates sleep stress lower-is-better', () => {
    expect(contributorStatus('sleepStress', 4)).toBe('optimal');
    expect(contributorStatus('sleepStress', 18)).toBe('sufficient');
    expect(contributorStatus('sleepStress', 40)).toBe('poor');
  });

  it('builds the four contributors and finds the weakest', () => {
    const day = days[days.length - 1];
    if (day === undefined) throw new Error('no fixture day');
    const rows = sleepContributors(day, 30, null);
    expect(rows.map((r) => r.id)).toEqual(['hoursVsNeed', 'consistency', 'efficiency', 'sleepStress']);
    expect(rows[3]?.status).toBe('poor');
    expect(weakestContributor(rows)?.id).toBe('sleepStress');
    const missing = sleepContributors(day, null, 'needs-history');
    expect(missing[3]).toEqual({ id: 'sleepStress', value: null, reason: 'needs-history', status: null });
    expect(weakestContributor([{ id: 'consistency', value: null, reason: 'no-sleep', status: null }])).toBeNull();
  });
});

describe('sleep stress', () => {
  const at = (hr: number, i: number) => ({ t: 1_000 + i * 300, hr });

  it('needs an hour of five-minute windows', () => {
    expect(sleepStress(Array.from({ length: 11 }, (_, i) => at(55, i)))).toBeNull();
    expect(sleepStress([])).toBeNull();
  });

  it('counts windows two robust SDs above the night centre', () => {
    const calm = Array.from({ length: 36 }, (_, i) => at(54 + (i % 3), i));
    const surges = [at(70, 40), at(72, 41), at(69, 42), at(75, 43)];
    const result = sleepStress([...calm, ...surges]);
    expect(result).toEqual({ pct: 10, windows: 40, high: 4 });
    expect(sleepStress(calm)?.pct).toBe(0);
  });

  it('floors the spread so a flat night does not flag tiny rises', () => {
    const flat = Array.from({ length: 20 }, (_, i) => at(55, i));
    expect(sleepStress([...flat, at(58, 30)])?.high).toBe(0);
    expect(sleepStress([...flat, at(59, 30)])?.high).toBe(1);
  });
});

describe('stage ranges', () => {
  const totals = { wake: 97 * 60, light: 252 * 60, deep: 70 * 60, rem: 89 * 60 };

  it('scales the typical shares to the night and flags values outside them', () => {
    const ranges = typicalStageRanges(totals);
    const asleep = (252 + 70 + 89) * 60;
    expect(ranges.wake).toEqual({ low: 0, high: AWAKE_TYPICAL_MAX_S });
    expect(ranges.deep).toEqual({ low: Math.round(0.13 * asleep), high: Math.round(0.23 * asleep) });
    expect(rangeFlag(totals.wake, ranges.wake)).toBe('above');
    expect(rangeFlag(totals.deep, ranges.deep)).toBeNull();
    expect(rangeFlag(totals.rem, ranges.rem)).toBeNull();
    expect(rangeFlag(10, { low: 20, high: 30 })).toBe('below');
  });

  it('computes the restorative share of sleep', () => {
    expect(restorativePct(totals)).toBe(39);
    expect(restorativePct(null)).toBeNull();
    expect(restorativePct({ wake: 60, light: 0, deep: 0, rem: 0 })).toBeNull();
    expect(RESTORATIVE_TYPICAL).toEqual({ low: 33, high: 48 });
  });
});

describe('night events', () => {
  const epoch = (i: number, stage: StageEpochRow['stage']): StageEpochRow => ({ t: 10_000 + i * 30, stage });

  it('measures latency and counts wake bouts between sleep', () => {
    const night = [epoch(0, 'wake'), epoch(1, 'wake'), epoch(2, 'light'), epoch(3, 'wake'), epoch(4, 'deep'), epoch(5, 'wake'), epoch(6, 'wake'), epoch(7, 'rem'), epoch(8, 'wake')];
    expect(nightEvents(night, 10_000)).toEqual({ latencyS: 60, disturbances: 2 });
  });

  it('gives nothing for a night without sleep epochs', () => {
    expect(nightEvents([epoch(0, 'wake')], 10_000)).toBeNull();
    expect(nightEvents([], 10_000)).toBeNull();
  });
});

describe('need breakdown', () => {
  const base = days[days.length - 1];
  const before = days[days.length - 2];
  if (base === undefined || before === undefined) throw new Error('no fixture days');

  it('rebuilds the need from baseline, load, debt and naps', () => {
    const load = 9.8;
    const debtS = 22 * 60;
    const nap = { onset: before.start + 13 * 3600, offset: before.start + 13.5 * 3600, asleepS: 1200, inBedS: 1800, nap: true, source: 'detected' as const, editId: null };
    const previous = withNeed(before, { debt: derived(debtS), periods: [...before.sleep.periods.filter((p) => !p.nap), nap] }, { load: derived(load) });
    const loadS = strainNeedMs(load) / 1000;
    const total = DEFAULT_CALIBRATION.sleepBaselineMs / 1000 + debtS + loadS - 1200;
    const today = withNeed(base, { need: derived(total) });
    const breakdown = needBreakdown([previous, today], 1);
    expect(breakdown).not.toBeNull();
    expect(breakdown?.baselineS).toBe(27_834);
    expect(breakdown?.debtS).toBe(debtS);
    expect(breakdown?.loadS).toBeCloseTo(loadS, 6);
    expect(breakdown?.napsS).toBe(1200);
    expect(breakdown?.napCount).toBe(1);
    expect(breakdown?.otherS).toBe(0);
    expect(breakdown?.load).toBe(load);
    const segments = breakdown === null ? [] : needSegments(breakdown);
    expect(segments.map((s) => s.id)).toEqual(['baseline', 'load', 'debt']);
    expect(segments.reduce((sum, s) => sum + s.seconds, 0)).toBeCloseTo(total, 6);
  });

  it('shows what the parts do not explain and stays empty without a need', () => {
    const previous = withNeed(before, { debt: derived(0), periods: [] }, { load: derived(null, 'low-coverage') });
    const today = withNeed(base, { need: derived(30_000) });
    const breakdown = needBreakdown([previous, today], 1);
    expect(breakdown?.load).toBeNull();
    expect(breakdown?.loadS).toBe(0);
    expect(breakdown?.otherS).toBeCloseTo(30_000 - 27_834, 6);
    expect(needBreakdown([withNeed(base, { need: derived(null, 'needs-history') })], 0)).toBeNull();
  });
});

describe('bed and wake times', () => {
  it('places nights on a noon-based scale and frames them in whole hours', () => {
    const week = days.slice(-7);
    const bars = bedWakeBars(week);
    expect(bars).toHaveLength(7);
    const window = bedWakeWindow(bars);
    expect(window).not.toBeNull();
    if (window === null) return;
    expect(window.from % 60).toBe(0);
    expect(window.to % 60).toBe(0);
    for (const bar of bars) {
      if (bar.bed === null || bar.wake === null) continue;
      expect(bar.bed).toBeGreaterThanOrEqual(window.from);
      expect(bar.wake).toBeLessThanOrEqual(window.to);
    }
    expect(clockFromNoon(660)).toBe(23 * 60);
    expect(clockFromNoon(1140)).toBe(7 * 60);
  });

  it('groups long ranges into weeks', () => {
    expect(bedWakeBars(days).length).toBeLessThanOrEqual(31);
    expect(bedWakeWindow([{ key: 'a', day: 'a', bed: null, wake: null }])).toBeNull();
  });
});

describe('trend stats and goals', () => {
  it('averages the range and takes the newest debt', () => {
    const stats = sleepTrendStats(days.slice(-7));
    expect(stats.consistency).not.toBeNull();
    expect(stats.efficiency).not.toBeNull();
    expect(stats.restorative).not.toBeNull();
    expect(stats.debtS).toBe([...days].reverse().find((d) => d.sleep.debt.value !== null)?.sleep.debt.value);
  });

  it('follows the weekly plan: full need until the week is met', () => {
    const index = days.length - 1;
    const plan = planNights(days, index, 4);
    expect(plan).not.toBeNull();
    if (plan === null) return;
    expect(plan.left).toBeGreaterThanOrEqual(1);
    expect(plan.left).toBeLessThanOrEqual(7);
    expect(goalFraction('plan', { target: 4, met: 2, left: 3 })).toBe(1);
    expect(goalFraction('plan', { target: 4, met: 4, left: 3 })).toBe(0.85);
    expect(goalFraction('plan', null)).toBe(1);
    expect(goalFraction('peak', null)).toBe(1);
    expect(goalFraction('getBy', null)).toBe(0.7);
  });
});

describe('wind-down time', () => {
  const now = new Date(2026, 10, 25, 20, 0);

  it('reminds half an hour before the next bedtime', () => {
    expect(windDownAt(22 * 60 + 55, now)).toBe(new Date(2026, 10, 25, 22, 25).getTime());
    expect(windDownAt(30, now)).toBe(new Date(2026, 10, 26, 0, 0).getTime());
    expect(windDownAt(19 * 60, now)).toBe(new Date(2026, 10, 26, 18, 30).getTime());
  });

  it('gives nothing when bedtime is closer than the lead', () => {
    expect(windDownAt(20 * 60 + 20, now)).toBeNull();
  });
});
