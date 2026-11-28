import type { DayRecord } from '@openhoop/core';

import type { HeartRatePoint, Spo2Point } from './types';

export const HR_TABS = ['24h', 'sleep', 'workouts', 'resting'] as const;
export type HrTab = (typeof HR_TABS)[number];

export interface HrWindow {
  from: number;
  to: number;
}

export interface HrStats {
  min: number;
  max: number;
  avg: number;
}

export function tabWindows(day: DayRecord, tab: Exclude<HrTab, 'resting'>): HrWindow[] {
  if (tab === '24h') return [{ from: day.start, to: day.end }];
  if (tab === 'sleep') return day.sleep.periods.map((p) => ({ from: p.onset, to: p.offset }));
  return day.workouts.map((w) => ({ from: w.start, to: w.end }));
}

export function pointsIn(points: readonly HeartRatePoint[], windows: readonly HrWindow[]): HeartRatePoint[] {
  return points.filter((p) => windows.some((w) => p.t >= w.from && p.t < w.to));
}

export function hrStats(points: readonly HeartRatePoint[]): HrStats | null {
  if (points.length === 0) return null;
  const values = points.map((p) => p.hr);
  return { min: Math.min(...values), max: Math.max(...values), avg: values.reduce((sum, v) => sum + v, 0) / values.length };
}

export function windowSpan(windows: readonly HrWindow[]): HrWindow | null {
  if (windows.length === 0) return null;
  return { from: Math.min(...windows.map((w) => w.from)), to: Math.max(...windows.map((w) => w.to)) };
}

export function restingSeries(days: readonly DayRecord[], index: number, count = 30): Array<number | null> {
  const from = Math.max(0, index - count + 1);
  return days.slice(from, index + 1).map((d) => d.restingHr.value);
}

export const SPO2_BUCKET_S = 600;

export function bucketSpo2(points: readonly Spo2Point[], from: number, to: number, bucketS = SPO2_BUCKET_S): Array<number | null> {
  if (!(to > from)) return [];
  const count = Math.ceil((to - from) / bucketS);
  const sums = new Array<number>(count).fill(0);
  const counts = new Array<number>(count).fill(0);
  for (const p of points) {
    const i = Math.floor((p.t - from) / bucketS);
    if (i < 0 || i >= count) continue;
    sums[i] = (sums[i] ?? 0) + p.pct;
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return sums.map((sum, i) => ((counts[i] ?? 0) === 0 ? null : sum / (counts[i] ?? 1)));
}

export function nearestPoint(points: readonly HeartRatePoint[], t: number): HeartRatePoint | null {
  let best: HeartRatePoint | null = null;
  for (const p of points) {
    if (best === null || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  }
  return best;
}
