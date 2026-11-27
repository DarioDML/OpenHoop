import type { DayRecord } from '@openhoop/core';

import { enoughForReport, periodStats, periodWindows, READINESS_HIGH, READINESS_LOW, targetAdvice, trendOf, type PeriodStats } from './activityDerived';
import { mainPeriod } from './dailyDerived';
import { mean, visibleReadiness, weekdayIndex, type Baseline } from './derived';

export const LOAD_MAX = 21;
export { READINESS_HIGH, READINESS_LOW };

export function advisedMaxLoad(readiness: number, band: Baseline): number {
  const width = band.high - band.low;
  const advice = targetAdvice(readiness);
  if (advice === 'lower') return band.low + width / 3;
  if (advice === 'middle') return band.low + (2 * width) / 3;
  return band.high;
}

export interface BalancePoint {
  day: string;
  readiness: number;
  load: number;
  over: boolean | null;
}

export function balancePoints(days: readonly DayRecord[], band: Baseline | null): BalancePoint[] {
  const out: BalancePoint[] = [];
  for (const d of days) {
    const readiness = visibleReadiness(d).value;
    const load = d.load.value;
    if (readiness === null || load === null) continue;
    out.push({ day: d.day, readiness, load, over: band === null ? null : load > advisedMaxLoad(readiness, band) + 1e-9 });
  }
  return out;
}

export function balanceShade(band: Baseline): Array<{ x: number; y: number }> {
  const at = (readiness: number): number => Math.min(LOAD_MAX, Math.max(0, advisedMaxLoad(readiness, band)));
  const low = at(0);
  const mid = at(READINESS_LOW);
  const high = at(READINESS_HIGH);
  return [
    { x: 0, y: 0 },
    { x: low, y: 0 },
    { x: low, y: READINESS_LOW },
    { x: mid, y: READINESS_LOW },
    { x: mid, y: READINESS_HIGH },
    { x: high, y: READINESS_HIGH },
    { x: high, y: 100 },
    { x: 0, y: 100 },
  ];
}

export type WeekVerdict =
  | { kind: 'balanced' }
  | { kind: 'room' }
  | { kind: 'oneOver'; day: string }
  | { kind: 'manyOver'; count: number }
  | { kind: 'moreLoad' }
  | { kind: 'lessLoad' }
  | { kind: 'steady' };

export function weekVerdict(points: readonly BalancePoint[], current: PeriodStats, previous: PeriodStats | null, band: Baseline | null): WeekVerdict {
  const judged = points.filter((p) => p.over !== null);
  if (band !== null && judged.length > 0) {
    const over = judged.filter((p) => p.over === true);
    if (over.length === 1 && over[0]) return { kind: 'oneOver', day: over[0].day };
    if (over.length > 1) return { kind: 'manyOver', count: over.length };
    const readiness = current.readiness;
    if (readiness !== null && readiness >= READINESS_HIGH && current.load !== null && current.load < band.mean) return { kind: 'room' };
    return { kind: 'balanced' };
  }
  if (current.load !== null && previous !== null && previous.load !== null) {
    const trend = trendOf(current.load, previous.load, 0.1);
    if (trend === 'up') return { kind: 'moreLoad' };
    if (trend === 'down') return { kind: 'lessLoad' };
  }
  return { kind: 'steady' };
}

export interface BedPoint {
  day: string;
  minutesFromNoon: number;
}

export function bedtimePoints(days: readonly DayRecord[]): BedPoint[] {
  const out: BedPoint[] = [];
  for (const d of days) {
    const period = mainPeriod(d);
    if (period === null) continue;
    const localSeconds = (((period.onset + d.tzOffsetS) % 86_400) + 86_400) % 86_400;
    const localMinutes = Math.floor(localSeconds / 60);
    out.push({ day: d.day, minutesFromNoon: (localMinutes - 720 + 1440) % 1440 });
  }
  return out;
}

export function bedtimeSpread(points: readonly BedPoint[]): number | null {
  if (points.length < 2) return null;
  const values = points.map((p) => p.minutesFromNoon);
  return Math.max(...values) - Math.min(...values);
}

export function clockFromNoon(minutesFromNoon: number): number {
  return (minutesFromNoon + 720) % 1440;
}

export function averageSleepScore(days: readonly DayRecord[]): number | null {
  return mean(days.map((d) => d.sleep.score.value));
}

export function averageConsistency(days: readonly DayRecord[]): number | null {
  return mean(days.map((d) => d.sleep.consistency.value));
}

export type MonthMetric = 'readiness' | 'sleepScore' | 'hrv';

export type MonthHeadline = { kind: 'bestSleep' } | { kind: 'up'; metric: MonthMetric; delta: number } | { kind: 'down'; metric: MonthMetric; delta: number } | { kind: 'steady' };

function metricMean(days: readonly DayRecord[], metric: MonthMetric): number | null {
  if (metric === 'readiness') return mean(days.map((d) => visibleReadiness(d).value));
  if (metric === 'sleepScore') return averageSleepScore(days);
  return mean(days.map((d) => d.hrv.value));
}

export function monthHeadline(all: readonly DayRecord[], length: number): MonthHeadline {
  const { current, previous } = periodWindows(all, length);
  const score = averageSleepScore(current);
  const earlier: number[] = [];
  for (let end = all.length - length; end > 0; end -= length) {
    const window = all.slice(Math.max(0, end - length), end);
    if (!enoughForReport(window)) break;
    const value = averageSleepScore(window);
    if (value !== null) earlier.push(value);
  }
  if (score !== null && earlier.length > 0 && earlier.every((v) => score > v)) return { kind: 'bestSleep' };
  if (!enoughForReport(previous)) return { kind: 'steady' };
  let best: { metric: MonthMetric; change: number; delta: number } | null = null;
  let worst: { metric: MonthMetric; change: number; delta: number } | null = null;
  for (const metric of ['readiness', 'sleepScore', 'hrv'] as const) {
    const now = metricMean(current, metric);
    const before = metricMean(previous, metric);
    if (now === null || before === null || before === 0) continue;
    const trend = trendOf(now, before);
    const change = (now - before) / Math.abs(before);
    const entry = { metric, change, delta: Math.round(Math.abs(now - before)) };
    if (trend === 'up' && (best === null || change > best.change)) best = entry;
    if (trend === 'down' && (worst === null || change < worst.change)) worst = entry;
  }
  if (best !== null) return { kind: 'up', metric: best.metric, delta: best.delta };
  if (worst !== null) return { kind: 'down', metric: worst.metric, delta: worst.delta };
  return { kind: 'steady' };
}

export interface BestDay {
  day: string;
  readiness: number;
  asleepS: number | null;
  load: number | null;
}

export function bestDay(days: readonly DayRecord[]): BestDay | null {
  let best: BestDay | null = null;
  for (const d of days) {
    const readiness = visibleReadiness(d).value;
    if (readiness === null) continue;
    if (best === null || readiness > best.readiness) best = { day: d.day, readiness, asleepS: d.sleep.asleepS, load: d.load.value };
  }
  return best;
}

export type MonthFocus =
  | { kind: 'weekendBedtime'; minutes: number }
  | { kind: 'consistency'; value: number }
  | { kind: 'sleepNeed'; minutes: number }
  | { kind: 'loadDays'; perWeek: number }
  | { kind: 'keep' };

const WEEKEND_GAP_MIN = 30;
const CONSISTENCY_TARGET = 80;
const SLEEP_GAP_MIN = 20;

export function monthFocus(days: readonly DayRecord[]): MonthFocus {
  const beds = bedtimePoints(days);
  const weekend = beds.filter((b) => weekdayIndex(b.day) >= 5).map((b) => b.minutesFromNoon);
  const weekday = beds.filter((b) => weekdayIndex(b.day) < 5).map((b) => b.minutesFromNoon);
  const weekendMean = mean(weekend);
  const weekdayMean = mean(weekday);
  if (weekendMean !== null && weekdayMean !== null && weekend.length >= 2 && weekendMean - weekdayMean >= WEEKEND_GAP_MIN) {
    return { kind: 'weekendBedtime', minutes: Math.round((weekendMean - weekdayMean) / 5) * 5 };
  }
  const consistency = averageConsistency(days);
  if (consistency !== null && consistency < CONSISTENCY_TARGET) return { kind: 'consistency', value: Math.round(consistency) };
  const asleep = mean(days.map((d) => d.sleep.asleepS));
  const need = mean(days.map((d) => d.sleep.need.value));
  if (asleep !== null && need !== null && need - asleep >= SLEEP_GAP_MIN * 60) return { kind: 'sleepNeed', minutes: Math.round((need - asleep) / 60 / 5) * 5 };
  const stats = periodStats(days);
  const perWeek = days.length === 0 ? 0 : (stats.loadDays / days.length) * 7;
  if (days.length >= 14 && perWeek < 2) return { kind: 'loadDays', perWeek: Math.round(perWeek * 10) / 10 };
  return { kind: 'keep' };
}

export interface Delta {
  value: number;
  trend: 'up' | 'down' | 'stable';
}

export function deltaOf(current: number | null, previous: number | null, comparable: boolean): Delta | null {
  if (!comparable || current === null || previous === null) return null;
  return { value: Math.round(Math.abs(current - previous)), trend: trendOf(current, previous, 0.03) };
}

