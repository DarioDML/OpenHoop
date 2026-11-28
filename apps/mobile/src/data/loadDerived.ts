import { loadReference, loadSum, sumFromLoad, type LoadReference } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import { addDays, baselineAt, rangeStatus, visibleReadiness, weekStart, type Baseline, type RangeStatus } from './derived';
import { analyticsProfileOf } from './profile';
import { loadAimRange, type AimRange } from './readinessDerived';
import type { Profile } from './types';

export const LOAD_SCALE_MAX = 21;
export const ZONE_23_HRR = { low: 0.6, high: 0.8 } as const;
export const TYPICAL_HR_DAYS = 28;
export const MINUTES_STEP = 5;

export function loadBandAt(days: readonly DayRecord[], index: number): Baseline | null {
  const baseline = baselineAt(days, index, 'load');
  if (baseline === null) return null;
  return { ...baseline, low: Math.max(0, baseline.low), high: Math.min(LOAD_SCALE_MAX, baseline.high) };
}

export function aimAt(days: readonly DayRecord[], index: number): AimRange | null {
  const day = days[index];
  if (day === undefined) return null;
  return loadAimRange(loadBandAt(days, index), visibleReadiness(day).value);
}

export interface LoadTargetView {
  aim: AimRange;
  status: RangeStatus | null;
  toGo: number | null;
  progress: number | null;
}

export function loadTargetView(load: number | null, aim: AimRange | null): LoadTargetView | null {
  if (aim === null) return null;
  if (load === null) return { aim, status: null, toGo: null, progress: null };
  const status = rangeStatus(load, { mean: (aim.low + aim.high) / 2, low: aim.low, high: aim.high, count: 0 });
  return {
    aim,
    status,
    toGo: Math.max(0, aim.low - load),
    progress: aim.low <= 0 ? 1 : Math.min(1, Math.max(0, load / aim.low)),
  };
}

export function referenceFor(days: readonly DayRecord[], profile: Profile, nowS: number): LoadReference {
  return loadReference(days, analyticsProfileOf(profile), nowS, new Date(nowS * 1000).getUTCFullYear());
}

function hrAt(ref: LoadReference, fraction: number): number {
  return ref.rest + fraction * (ref.max - ref.rest);
}

export function zone23Bounds(ref: LoadReference): { low: number; high: number } {
  const floors = ref.zoneFloors ?? null;
  if (floors !== null) return { low: floors[1], high: floors[3] };
  return { low: hrAt(ref, ZONE_23_HRR.low), high: hrAt(ref, ZONE_23_HRR.high) };
}

export function typicalTrainingHr(days: readonly DayRecord[], ref: LoadReference, nowS: number): number {
  const { low, high } = zone23Bounds(ref);
  const fallback = (low + high) / 2;
  if (!(ref.max > ref.rest) && (ref.zoneFloors ?? null) === null) return fallback;
  const since = nowS - TYPICAL_HR_DAYS * 86_400;
  const rates = days
    .flatMap((day) => day.workouts)
    .filter((w) => w.start >= since && w.start <= nowS && Number.isFinite(w.avgHr) && w.avgHr >= low && w.avgHr <= high)
    .map((w) => w.avgHr)
    .sort((a, b) => a - b);
  if (rates.length === 0) return fallback;
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 === 1 ? (rates[mid] ?? fallback) : ((rates[mid - 1] ?? fallback) + (rates[mid] ?? fallback)) / 2;
}

export function minutesToLoad(from: number, to: number, hr: number, ref: LoadReference): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(ref.max > ref.rest)) return null;
  const need = sumFromLoad(to) - sumFromLoad(Math.max(0, from));
  if (need <= 0) return 0;
  const perMinute = loadSum([hr], ref.rest, ref.max).sum;
  if (!(perMinute > 0)) return null;
  return need / perMinute;
}

export function roundMinutes(minutes: number): number {
  return Math.max(MINUTES_STEP, Math.round(minutes / MINUTES_STEP) * MINUTES_STEP);
}

export type ReadyAdvice =
  | { kind: 'calibrating' }
  | { kind: 'noLoad' }
  | { kind: 'above' }
  | { kind: 'within' }
  | { kind: 'below'; minutesLow: number; minutesHigh: number }
  | { kind: 'noEstimate' };

export function readyAdvice(load: number | null, aim: AimRange | null, hr: number, ref: LoadReference): ReadyAdvice {
  if (aim === null) return { kind: 'calibrating' };
  if (load === null) return { kind: 'noLoad' };
  if (load > aim.high) return { kind: 'above' };
  if (load >= aim.low) return { kind: 'within' };
  const low = minutesToLoad(load, aim.low, hr, ref);
  const high = minutesToLoad(load, aim.high, hr, ref);
  if (low === null || high === null) return { kind: 'noEstimate' };
  const minutesLow = roundMinutes(low);
  return { kind: 'below', minutesLow, minutesHigh: Math.max(minutesLow, roundMinutes(high)) };
}

export interface TargetDays {
  on: number;
  measured: number;
}

export function daysOnTarget(days: readonly DayRecord[], from: number, to: number): TargetDays {
  let on = 0;
  let measured = 0;
  for (let i = Math.max(0, from); i < Math.min(days.length, to); i++) {
    const load = days[i]?.load.value ?? null;
    const aim = aimAt(days, i);
    if (load === null || aim === null) continue;
    measured++;
    if (load >= aim.low && load <= aim.high) on++;
  }
  return { on, measured };
}

export function isoWeekNumber(day: string): number {
  const thursday = addDays(weekStart(day), 3);
  const [year] = thursday.split('-').map(Number);
  const jan4 = `${String(year ?? 1970).padStart(4, '0')}-01-04`;
  const firstThursday = addDays(weekStart(jan4), 3);
  const diff = (Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${firstThursday}T00:00:00Z`)) / 86_400_000;
  return Math.round(diff / 7) + 1;
}

export interface HourBar {
  t: number;
  hour: number;
  steps: number | null;
}

const HOUR_S = 3_600;

export function hourlyStepBars(day: DayRecord, nowS: number): HourBar[] | null {
  const source = day.stepsByHour;
  if (source === undefined || source === null) return null;
  const hours = source.filter((h) => h.t >= day.start - HOUR_S && h.t < day.end && h.t <= nowS);
  const counted = hours.filter((h) => h.steps > 0);
  const first = counted[0];
  const last = counted[counted.length - 1];
  if (first === undefined || last === undefined) return [];
  const byHour = new Map(hours.map((h) => [h.t, h.steps]));
  const out: HourBar[] = [];
  for (let t = first.t; t <= last.t; t += HOUR_S) {
    const local = Math.floor((t + day.tzOffsetS) / HOUR_S);
    out.push({ t, hour: ((local % 24) + 24) % 24, steps: byHour.get(t) ?? null });
  }
  return out;
}

export function compactThousands(value: number): number {
  return Math.round(value / 100) / 10;
}

export type BlockGap = 'future' | 'noData' | 'open' | 'calibrating' | 'missing';

export interface WeekBlockGap {
  load: BlockGap | null;
  loadReason: string | null;
  soFar: number | null;
  readiness: BlockGap | null;
  readinessReason: string | null;
}

export function weekBlockGaps(week: ReadonlyArray<DayRecord | null>, start: string, latestDay: string): WeekBlockGap[] {
  return week.map((day, i) => {
    if (day === null) {
      const gap: BlockGap = addDays(start, i) > latestDay ? 'future' : 'noData';
      return { load: gap, loadReason: null, soFar: null, readiness: gap, readinessReason: null };
    }
    const open = day.day === latestDay;
    const visible = visibleReadiness(day);
    const load: BlockGap | null = day.load.value !== null ? null : open ? 'open' : 'missing';
    const readiness: BlockGap | null = visible.value !== null ? null : day.readinessCalibrating || visible.reason === 'needs-history' ? 'calibrating' : 'missing';
    return {
      load,
      loadReason: load === 'missing' ? day.load.reason : null,
      soFar: load === 'open' ? (day.loadSoFar ?? null) : null,
      readiness,
      readinessReason: readiness === 'missing' ? visible.reason : null,
    };
  });
}
