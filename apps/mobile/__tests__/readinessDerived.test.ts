import type { DayRecord } from '@openhoop/core';

import { addDays } from '@/data/derived';
import { createFixtureDays } from '@/data/fixtureSource';
import { readinessBand } from '@/ui/theme';
import { bandOf, contributorDelta, loadAimRange, lowestReadinessDay, readinessBars, readinessVerdict } from '@/data/readinessDerived';

const base = createFixtureDays(new Date('2026-11-25T12:00:00Z'));

function withReadiness(values: ReadonlyArray<number | null>, start = '2026-11-01'): DayRecord[] {
  const template = base[base.length - 1];
  if (template === undefined) throw new Error('fixture has no days');
  return values.map((value, i) => ({
    ...template,
    day: addDays(start, i),
    readiness: { ...template.readiness, value, reason: value === null ? 'no-data' : null },
    readinessCalibrating: false,
  }));
}

describe('readiness bands and verdict', () => {
  it('uses the same thresholds as the ring colours', () => {
    expect(bandOf(67)).toBe('high');
    expect(bandOf(66.9)).toBe('medium');
    expect(bandOf(34)).toBe('medium');
    expect(bandOf(33)).toBe('low');
    expect(bandOf(null)).toBeNull();
    for (let value = 0; value <= 100; value += 0.5) {
      const ring = readinessBand(value);
      expect(bandOf(value)).toBe(ring === null ? null : ring);
    }
  });

  it('names the contributor that cost the most points', () => {
    expect(readinessVerdict(80, { hrv: -6, sleep: 1, rhr: 0 })).toEqual({ band: 'high', driver: null });
    expect(readinessVerdict(55, { hrv: -6, sleep: 1, rhr: -2 })).toEqual({ band: 'medium', driver: 'hrv' });
    expect(readinessVerdict(20, { hrv: 1, sleep: -3, rhr: -8 })).toEqual({ band: 'low', driver: 'rhr' });
    expect(readinessVerdict(55, { hrv: -0.5, sleep: 2, rhr: 0 })).toEqual({ band: 'medium', driver: null });
    expect(readinessVerdict(55, null)).toEqual({ band: 'medium', driver: null });
    expect(readinessVerdict(null, null)).toBeNull();
  });
});

describe('load aim range', () => {
  const band = { mean: 12, low: 8, high: 16, count: 20 };
  it('follows the readiness advice inside the usual range', () => {
    expect(loadAimRange(band, 20)).toEqual({ low: 8, high: 12 });
    expect(loadAimRange(band, 50)).toEqual({ low: 10, high: 14 });
    expect(loadAimRange(band, 90)).toEqual({ low: 12, high: 16 });
    expect(loadAimRange(band, null)).toEqual({ low: 8, high: 16 });
  });
  it('is empty without a usual range', () => {
    expect(loadAimRange(null, 50)).toBeNull();
  });
});

describe('contributor deltas', () => {
  const baseline = { mean: 60, low: 55, high: 65, count: 20 };
  it('calls a value inside the normal range normal', () => {
    expect(contributorDelta('hrv', 58, baseline)).toEqual({ kind: 'normal' });
  });
  it('shows HRV as a percentage and colours a drop as a warning', () => {
    expect(contributorDelta('hrv', 48, baseline)).toEqual({ kind: 'shift', direction: 'down', amount: 20, percent: true, word: 'lower', tone: 'warning' });
    expect(contributorDelta('hrv', 72, baseline)).toMatchObject({ direction: 'up', word: 'higher', tone: 'positive' });
  });
  it('treats a higher resting heart rate as a warning', () => {
    expect(contributorDelta('rhr', 68, baseline)).toEqual({ kind: 'shift', direction: 'up', amount: 8, percent: false, word: 'higher', tone: 'warning' });
    expect(contributorDelta('rhr', 50, baseline)).toMatchObject({ word: 'lower', tone: 'positive' });
  });
  it('words sleep as better or worse', () => {
    expect(contributorDelta('sleep', 70, baseline)).toMatchObject({ word: 'better', tone: 'positive' });
    expect(contributorDelta('sleep', 50, baseline)).toMatchObject({ word: 'worse', tone: 'warning' });
  });
  it('warns on any respiratory or temperature shift', () => {
    expect(contributorDelta('resp', 70, baseline)).toMatchObject({ tone: 'warning' });
    expect(contributorDelta('temp', 50, baseline)).toMatchObject({ tone: 'warning' });
  });
  it('has nothing to say without a value or baseline', () => {
    expect(contributorDelta('hrv', null, baseline)).toBeNull();
    expect(contributorDelta('hrv', 50, null)).toBeNull();
  });
});

describe('readiness bars', () => {
  it('keeps one bar per day for a week', () => {
    const bars = readinessBars(withReadiness([71, 48, 29, 80, 66, 54, 62]), '1W');
    expect(bars.map((b) => b.value)).toEqual([71, 48, 29, 80, 66, 54, 62]);
    expect(bars.every((b) => b.kind === 'day')).toBe(true);
  });
  it('averages per calendar week and per month', () => {
    const days = withReadiness([50, 70, null, 60, 60, 60, 60, 60, 80], '2026-11-01');
    const weeks = readinessBars(days, '1M');
    expect(weeks.map((w) => w.key)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
    expect(weeks.map((w) => w.value)).toEqual([50, 62, 80]);
    const months = readinessBars(withReadiness([40, 60], '2026-10-31'), '6M');
    expect(months.map((m) => [m.key, m.value])).toEqual([
      ['2026-10', 40],
      ['2026-11', 60],
    ]);
  });
  it('finds the lowest scored day', () => {
    expect(lowestReadinessDay(withReadiness([71, 48, 29, 80]))).toEqual({ day: '2026-11-03', value: 29 });
    expect(lowestReadinessDay(withReadiness([null, null]))).toBeNull();
  });
});
