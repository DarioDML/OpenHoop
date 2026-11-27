import type { DayRecord, Derived } from '@openhoop/core';

export type MetricKey = 'readiness' | 'load' | 'sleepScore' | 'hrv' | 'restingHr' | 'respiratoryRate' | 'spo2' | 'skinTemp' | 'skinTempDeviation' | 'steps' | 'asleepH' | 'sleepNeedH' | 'sleepDebtH' | 'consistency';

export function visibleReadiness(day: DayRecord): Derived {
  if (!day.readinessCalibrating || day.readiness.value === null) return day.readiness;
  return { ...day.readiness, value: null, reason: 'needs-history', coverage: null };
}

export interface ShownLoad {
  value: number | null;
  soFar: boolean;
  reason: string | null;
}

export function shownLoad(days: readonly DayRecord[], index: number): ShownLoad {
  const day = days[index];
  if (day === undefined) return { value: null, soFar: false, reason: null };
  const { value, reason } = day.load;
  if (value === null && index === days.length - 1 && day.loadSoFar != null) return { value: day.loadSoFar, soFar: true, reason: null };
  return { value, soFar: false, reason };
}

export function metricValue(day: DayRecord, key: MetricKey): number | null {
  switch (key) {
    case 'readiness':
      return visibleReadiness(day).value;
    case 'load':
      return day.load.value;
    case 'sleepScore':
      return day.sleep.score.value;
    case 'hrv':
      return day.hrv.value;
    case 'restingHr':
      return day.restingHr.value;
    case 'respiratoryRate':
      return day.respiratoryRate.value;
    case 'spo2':
      return day.spo2.value;
    case 'skinTemp':
      return day.skinTempC.value;
    case 'skinTempDeviation':
      return day.skinTempDeviationC.value;
    case 'steps':
      return day.steps;
    case 'asleepH':
      return day.sleep.asleepS === null ? null : day.sleep.asleepS / 3600;
    case 'sleepNeedH':
      return day.sleep.need.value === null ? null : day.sleep.need.value / 3600;
    case 'sleepDebtH':
      return day.sleep.debt.value === null ? null : day.sleep.debt.value / 3600;
    case 'consistency':
      return day.sleep.consistency.value;
  }
}

export function series(days: readonly DayRecord[], key: MetricKey): Array<number | null> {
  return days.map((day) => metricValue(day, key));
}

export function mean(values: ReadonlyArray<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

export function stdev(values: ReadonlyArray<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < 2) return null;
  const m = present.reduce((sum, v) => sum + v, 0) / present.length;
  const variance = present.reduce((sum, v) => sum + (v - m) ** 2, 0) / (present.length - 1);
  return Math.sqrt(variance);
}

export const BASELINE_DAYS = 30;
export const MIN_BASELINE_NIGHTS = 4;

export interface Baseline {
  mean: number;
  low: number;
  high: number;
  count: number;
}

/**
 * Personal normal range: mean ± 1 SD of the values before `index` (the day itself is excluded),
 * over at most `window` days. Null until there are enough nights.
 */
export function baselineAt(days: readonly DayRecord[], index: number, key: MetricKey, window = BASELINE_DAYS): Baseline | null {
  const from = Math.max(0, index - window);
  const values = days.slice(from, Math.max(0, index)).map((day) => metricValue(day, key));
  const present = values.filter((v): v is number => v !== null);
  if (present.length < MIN_BASELINE_NIGHTS) return null;
  const m = mean(present);
  const sd = stdev(present);
  if (m === null || sd === null) return null;
  return { mean: m, low: m - sd, high: m + sd, count: present.length };
}

export type RangeStatus = 'within' | 'above' | 'below';

export function rangeStatus(value: number | null, baseline: Baseline | null): RangeStatus | null {
  if (value === null || baseline === null) return null;
  if (value > baseline.high) return 'above';
  if (value < baseline.low) return 'below';
  return 'within';
}

export function percentFromBaseline(value: number | null, baseline: Baseline | null): number | null {
  if (value === null || baseline === null || baseline.mean === 0) return null;
  return ((value - baseline.mean) / baseline.mean) * 100;
}

export function dayIndex(days: readonly DayRecord[], day: string): number {
  return days.findIndex((d) => d.day === day);
}

export function lastDays(days: readonly DayRecord[], count: number, endIndex = days.length - 1): DayRecord[] {
  if (endIndex < 0) return [];
  return days.slice(Math.max(0, endIndex - count + 1), endIndex + 1);
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function addDays(day: string, delta: number): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Monday of the ISO week that contains `day`. */
export function weekStart(day: string): string {
  const date = parseDay(day);
  const weekday = (date.getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

export function daysInWeek(days: readonly DayRecord[], anyDayInWeek: string): Array<DayRecord | null> {
  const start = weekStart(anyDayInWeek);
  const byDay = new Map(days.map((d) => [d.day, d]));
  return Array.from({ length: 7 }, (_, i) => byDay.get(addDays(start, i)) ?? null);
}

export function weekdayIndex(day: string): number {
  return (parseDay(day).getUTCDay() + 6) % 7;
}

/** Consecutive days with data ending at the newest day. */
export function wearStreak(days: readonly DayRecord[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    const next = days[i + 1];
    if (!day) break;
    if (next && addDays(day.day, 1) !== next.day) break;
    const worn = day.heartRate.avg !== null || day.sleep.asleepS !== null;
    if (!worn) break;
    streak++;
  }
  return streak;
}

export function zoneTotalS(day: DayRecord): number {
  return day.zoneSeconds.reduce((sum, s) => sum + s, 0);
}
