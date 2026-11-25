import { DEFAULT_CALIBRATION } from './calibration';
import type { Calibration } from './calibration';
import { loadFromSum, loadSum, sumFromLoad } from './load';
import { ALGO, fail, succeed } from './types';
import type { Outcome } from './types';
import { zoneSeconds } from './zones';
import type { ZoneSeconds } from './zones';

export interface Interval {
  start: number;
  end: number;
}

export interface HrPoint {
  t: number;
  hr: number | null;
}

export const MINUTE_S = 60;
export const MINUTE_MIN_VALID_S = 30;
export const ACTIVITY_MIN_COVERAGE = 0.5;

export function normalizeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const next of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && next.start <= last.end) last.end = Math.max(last.end, next.end);
    else out.push(next);
  }
  return out;
}

export function totalSeconds(list: readonly Interval[]): number {
  return normalizeIntervals(list).reduce((sum, i) => sum + (i.end - i.start), 0);
}

export function overlapSeconds(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function subtractIntervals(base: Interval, remove: readonly Interval[]): Interval[] {
  if (!(base.end > base.start)) return [];
  const out: Interval[] = [];
  let cursor = base.start;
  for (const cut of normalizeIntervals(remove)) {
    if (cut.end <= cursor) continue;
    if (cut.start >= base.end) break;
    if (cut.start > cursor) out.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
    if (cursor >= base.end) break;
  }
  if (cursor < base.end) out.push({ start: cursor, end: base.end });
  return out;
}

export function clipIntervals(list: readonly Interval[], from: number): Interval[] {
  return normalizeIntervals(list)
    .map((i) => ({ start: Math.max(i.start, from), end: i.end }))
    .filter((i) => i.end > i.start);
}

export function minuteMeans(points: readonly HrPoint[], start: number, end: number, minValid = MINUTE_MIN_VALID_S): (number | null)[] {
  const minutes = Math.max(0, Math.ceil((end - start) / MINUTE_S));
  const counts = new Int32Array(minutes);
  const sums = new Float64Array(minutes);
  for (const p of points) {
    if (p.hr === null || !Number.isFinite(p.hr) || p.t < start || p.t >= end) continue;
    const m = Math.floor((p.t - start) / MINUTE_S);
    counts[m] = (counts[m] ?? 0) + 1;
    sums[m] = (sums[m] ?? 0) + p.hr;
  }
  const out: (number | null)[] = [];
  for (let m = 0; m < minutes; m++) {
    const c = counts[m] ?? 0;
    out.push(c >= minValid ? (sums[m] ?? 0) / c : null);
  }
  return out;
}

function segmentMinutes(points: readonly HrPoint[], segments: readonly Interval[]): (number | null)[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: (number | null)[] = [];
  let k = 0;
  for (const seg of segments) {
    while (k < sorted.length && (sorted[k]?.t ?? Infinity) < seg.start) k++;
    const inside: HrPoint[] = [];
    for (let j = k; j < sorted.length; j++) {
      const p = sorted[j];
      if (p === undefined || p.t >= seg.end) break;
      inside.push(p);
    }
    out.push(...minuteMeans(inside, seg.start, seg.end));
  }
  return out;
}

function inSegments(t: number, segments: readonly Interval[]): boolean {
  for (const s of segments) if (t >= s.start && t < s.end) return true;
  return false;
}

export interface ActivityMetrics {
  activeS: number;
  load: Outcome<number>;
  zoneSeconds: ZoneSeconds;
  avgHr: number | null;
  maxHr: number | null;
  hrSeconds: number;
}

export function activeSegments(window: Interval, paused: readonly Interval[]): Interval[] {
  return subtractIntervals(window, paused);
}

export function activityMetrics(
  points: readonly HrPoint[],
  window: Interval,
  paused: readonly Interval[],
  rest: number,
  max: number,
  c: Calibration = DEFAULT_CALIBRATION,
): ActivityMetrics {
  const segments = activeSegments(window, paused);
  const activeS = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const hrs: number[] = [];
  let peak: number | null = null;
  let total = 0;
  for (const p of points) {
    if (p.hr === null || !Number.isFinite(p.hr) || !inSegments(p.t, segments)) continue;
    hrs.push(p.hr);
    total += p.hr;
    peak = peak === null ? p.hr : Math.max(peak, p.hr);
  }
  const zonesValid = Number.isFinite(rest) && Number.isFinite(max) && max > rest;
  const zones: ZoneSeconds = zonesValid ? zoneSeconds(hrs, rest, max) : [0, 0, 0, 0, 0, 0];
  return {
    activeS,
    load: activityLoad(segmentMinutes(points, segments), activeS, rest, max, c),
    zoneSeconds: zones,
    avgHr: hrs.length === 0 ? null : total / hrs.length,
    maxHr: peak,
    hrSeconds: hrs.length,
  };
}

export function activityLoad(
  minuteHr: readonly (number | null)[],
  activeS: number,
  rest: number,
  max: number,
  c: Calibration = DEFAULT_CALIBRATION,
): Outcome<number> {
  if (!Number.isFinite(rest) || !Number.isFinite(max) || max <= rest) return fail('missing-signal', ALGO.load);
  const { sum, valid } = loadSum(minuteHr, rest, max, c);
  if (valid === 0) return fail('no-data', ALGO.load);
  const expected = Math.max(1, Math.round(activeS / MINUTE_S));
  const coverage = valid / expected;
  if (coverage < ACTIVITY_MIN_COVERAGE) return fail('low-coverage', ALGO.load);
  return succeed(loadFromSum(sum, c), coverage, ALGO.load);
}

export function projectDayLoad(
  dayLoadValue: number,
  dayEnd: number,
  points: readonly HrPoint[],
  segments: readonly Interval[],
  rest: number,
  max: number,
  c: Calibration = DEFAULT_CALIBRATION,
): number {
  if (!Number.isFinite(rest) || !Number.isFinite(max) || max <= rest) return dayLoadValue;
  const fresh = clipIntervals(segments, dayEnd);
  const { sum } = loadSum(segmentMinutes(points, fresh), rest, max, c);
  return loadFromSum(sumFromLoad(dayLoadValue, c) + sum, c);
}

export const SAME_SESSION_FRACTION = 0.5;

export function coveredFraction(target: Interval, by: readonly Interval[]): number {
  const length = target.end - target.start;
  if (!(length > 0)) return 0;
  const covered = normalizeIntervals(by).reduce((sum, i) => sum + overlapSeconds(target, i), 0);
  return covered / length;
}

export function sameSession(detected: Interval, logged: readonly Interval[]): boolean {
  return coveredFraction(detected, logged) >= SAME_SESSION_FRACTION;
}
