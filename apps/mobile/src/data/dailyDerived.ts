import type { DayRecord, SleepPeriodRecord, StrengthSession } from '@openhoop/core';

import { isLoadDay, sleepNightMet } from './activityDerived';
import { addDays, baselineAt, daysInWeek, mean, metricValue, rangeStatus, visibleReadiness, weekStart, type Baseline, type MetricKey } from './derived';
import { finishedSessions } from './strength';

export const VITAL_KEYS = ['hrv', 'restingHr', 'respiratoryRate', 'spo2', 'skinTemp'] as const satisfies readonly MetricKey[];

export type TrendRange = '1W' | '1M' | '6M';
export const TREND_RANGES: Readonly<Record<TrendRange, number>> = { '1W': 7, '1M': 30, '6M': 180 };

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function singleParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.length > 0 && first.length <= 40 ? first : null;
}

export function isDayString(value: string | null): value is string {
  if (value === null || !DAY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function indexOfDay(days: readonly DayRecord[], day: string): number {
  return days.findIndex((d) => d.day === day);
}

export interface VitalsSummary {
  measured: number;
  inRange: number;
  outside: MetricKey[];
  calibrating: boolean;
  withValue: number;
  total: number;
}

export function vitalsSummary(days: readonly DayRecord[], index: number): VitalsSummary {
  let measured = 0;
  let inRange = 0;
  let withValue = 0;
  const outside: MetricKey[] = [];
  for (const key of VITAL_KEYS) {
    const day = days[index];
    if (!day) break;
    const value = metricValue(day, key);
    if (value === null) continue;
    withValue++;
    const status = rangeStatus(value, baselineAt(days, index, key));
    if (status === null) continue;
    measured++;
    if (status === 'within') inRange++;
    else outside.push(key);
  }
  return { measured, inRange, outside, calibrating: withValue > 0 && measured === 0, withValue, total: VITAL_KEYS.length };
}

export function mainNightSpan(day: DayRecord): { onset: number; offset: number } | null {
  const own = day.sleep.periods.filter((p) => !p.nap);
  if (own.length === 0) return null;
  return { onset: Math.min(...own.map((p) => p.onset)), offset: Math.max(...own.map((p) => p.offset)) };
}

export function mainPeriod(day: DayRecord): SleepPeriodRecord | null {
  let best: SleepPeriodRecord | null = null;
  for (const period of day.sleep.periods) {
    if (period.nap) continue;
    if (best === null || period.asleepS > best.asleepS) best = period;
  }
  return best;
}

export function localMinutes(epochS: number, tzOffsetS: number): number {
  const local = Math.floor(epochS + tzOffsetS);
  return Math.floor((((local % 86400) + 86400) % 86400) / 60);
}

export function formatMinutes(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatHm(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const low = sorted[mid - 1];
  const high = sorted[mid];
  if (high === undefined) return null;
  return sorted.length % 2 === 1 ? high : ((low ?? high) + high) / 2;
}

export interface BedtimePlan {
  wakeMinutes: number;
  bedMinutes: number;
  awakeInBedS: number;
  nights: number;
}

/** Typical wake clock time over the last nights that have a main sleep period. */
export function typicalWake(days: readonly DayRecord[], endIndex: number, count = 7): { minutes: number; nights: number } | null {
  const wakes: number[] = [];
  for (let i = endIndex; i >= 0 && wakes.length < count; i--) {
    const day = days[i];
    const main = day ? mainPeriod(day) : null;
    if (day && main) wakes.push(localMinutes(main.offset, day.tzOffsetS));
  }
  const minutes = median(wakes);
  return minutes === null ? null : { minutes, nights: wakes.length };
}

export function typicalAwakeInBedS(days: readonly DayRecord[], endIndex: number, count = 7): number | null {
  const gaps: number[] = [];
  for (let i = endIndex; i >= 0 && gaps.length < count; i--) {
    const day = days[i];
    if (day && day.sleep.inBedS !== null && day.sleep.asleepS !== null) gaps.push(Math.max(0, day.sleep.inBedS - day.sleep.asleepS));
  }
  return mean(gaps);
}

export function planBedtime(days: readonly DayRecord[], endIndex: number, asleepTargetS: number, wakeOverrideMinutes: number | null = null): BedtimePlan | null {
  const wake = typicalWake(days, endIndex);
  const wakeMinutes = wakeOverrideMinutes ?? wake?.minutes ?? null;
  if (wakeMinutes === null) return null;
  const awakeInBedS = typicalAwakeInBedS(days, endIndex) ?? 0;
  const bedMinutes = wakeMinutes - (asleepTargetS + awakeInBedS) / 60;
  return { wakeMinutes, bedMinutes: ((Math.round(bedMinutes) % 1440) + 1440) % 1440, awakeInBedS, nights: wake?.nights ?? 0 };
}

export interface WeekProgress {
  loadDots: Array<boolean | null>;
  sleepDots: Array<boolean | null>;
  loadCount: number;
  sleepCount: number;
  recorded: number;
}

export function weekProgress(days: readonly DayRecord[], anyDayInWeek: string): WeekProgress {
  const week = daysInWeek(days, anyDayInWeek);
  const loadDots = week.map((d) => (d ? isLoadDay(d) : null));
  const sleepDots = week.map((d) => (d ? sleepNightMet(d) : null));
  return {
    loadDots,
    sleepDots,
    loadCount: loadDots.filter((v) => v === true).length,
    sleepCount: sleepDots.filter((v) => v === true).length,
    recorded: week.filter((d) => d !== null).length,
  };
}

export interface StrengthWeekMinutes {
  minutes: number;
  sessions: number;
}

export function strengthWeekMinutes(sessions: readonly StrengthSession[], anyDayInWeek: string): StrengthWeekMinutes {
  const start = weekStart(anyDayInWeek);
  const end = addDays(start, 6);
  const inWeek = finishedSessions(sessions).filter((session) => session.day >= start && session.day <= end);
  const seconds = inWeek.reduce((sum, session) => sum + Math.max(0, (session.endedAt ?? session.startedAt) - session.startedAt), 0);
  return { minutes: Math.round(seconds / 60), sessions: inWeek.length };
}

export function goalMet(count: number, target: number | null | undefined): boolean {
  return target !== null && target !== undefined && target > 0 && count >= target;
}

export interface MonthCell {
  day: string | null;
}

/** Monday-first weeks for a calendar month (month is 1-12). */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ day: null });
  for (let d = 1; d <= length; d++) {
    cells.push({ day: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}` });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null });
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export interface ImpactComparison {
  id: 'load' | 'sleep';
  nHigh: number;
  nLow: number;
  meanHigh: number;
  meanLow: number;
  difference: number;
  threshold: number;
}

const MIN_IMPACT_GROUP = 4;

function compare(days: readonly DayRecord[], id: ImpactComparison['id'], pick: (day: DayRecord) => number | null): ImpactComparison | null {
  const pairs: Array<{ x: number; next: number }> = [];
  for (let i = 0; i < days.length - 1; i++) {
    const day = days[i];
    const next = days[i + 1];
    if (!day || !next || addDays(day.day, 1) !== next.day) continue;
    const x = pick(day);
    const readiness = visibleReadiness(next).value;
    if (x === null || readiness === null) continue;
    pairs.push({ x, next: readiness });
  }
  const threshold = median(pairs.map((p) => p.x));
  if (threshold === null) return null;
  const high = pairs.filter((p) => p.x > threshold).map((p) => p.next);
  const low = pairs.filter((p) => p.x <= threshold).map((p) => p.next);
  const meanHigh = mean(high);
  const meanLow = mean(low);
  if (high.length < MIN_IMPACT_GROUP || low.length < MIN_IMPACT_GROUP || meanHigh === null || meanLow === null) return null;
  return { id, nHigh: high.length, nLow: low.length, meanHigh, meanLow, difference: meanHigh - meanLow, threshold };
}

/** Next-day readiness after days above vs at-or-below the own median. Descriptive only. */
export function readinessImpacts(days: readonly DayRecord[]): ImpactComparison[] {
  const load = compare(days, 'load', (d) => d.load.value);
  const sleep = compare(days, 'sleep', (d) => (d.sleep.asleepS === null ? null : d.sleep.asleepS / 3600));
  return [load, sleep].filter((c): c is ImpactComparison => c !== null);
}

export function readinessBandCounts(values: ReadonlyArray<number | null>): { high: number; medium: number; low: number } {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const v of values) {
    if (v === null) continue;
    if (v >= 67) high++;
    else if (v >= 34) medium++;
    else low++;
  }
  return { high, medium, low };
}

export function normalRange(days: readonly DayRecord[], index: number, key: MetricKey): Baseline | null {
  return baselineAt(days, index, key);
}

export function sliceEndingAt(days: readonly DayRecord[], count: number, endIndex = days.length - 1): DayRecord[] {
  if (endIndex < 0) return [];
  return days.slice(Math.max(0, endIndex - count + 1), endIndex + 1);
}

export function formatLongDay(day: string, language: 'nl' | 'en'): string {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatMonthTitle(year: number, month: number, language: 'nl' | 'en'): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function weekdayInitials(language: 'nl' | 'en'): string[] {
  const base = Date.UTC(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) =>
    (new Date(base + i * 86400000).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'narrow', timeZone: 'UTC' })).toUpperCase(),
  );
}

export function sleepEfficiency(day: DayRecord): number | null {
  const { asleepS, inBedS, stages } = day.sleep;
  if (inBedS === null || inBedS <= 0) return null;
  const wake = stages?.totals?.wake;
  const asleep = wake === undefined ? asleepS : inBedS - wake;
  if (asleep === null) return null;
  return Math.min(100, Math.max(0, Math.round((asleep / inBedS) * 100)));
}
