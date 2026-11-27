import type { DayRecord } from '@openhoop/core';

import { targetAdvice } from './activityDerived';
import type { TrendRange } from './dailyDerived';
import { mean, rangeStatus, visibleReadiness, weekStart, type Baseline } from './derived';

export const READINESS_HIGH = 67;
export const READINESS_LOW = 34;

export type ReadinessBand = 'high' | 'medium' | 'low';

export function bandOf(value: number | null): ReadinessBand | null {
  if (value === null) return null;
  if (value >= READINESS_HIGH) return 'high';
  if (value >= READINESS_LOW) return 'medium';
  return 'low';
}

export interface AimRange {
  low: number;
  high: number;
}

export function loadAimRange(band: Baseline | null, readiness: number | null): AimRange | null {
  if (band === null) return null;
  const span = band.high - band.low;
  if (span <= 0) return { low: band.low, high: band.high };
  const mid = band.low + span / 2;
  switch (targetAdvice(readiness)) {
    case 'lower':
      return { low: band.low, high: mid };
    case 'upper':
      return { low: mid, high: band.high };
    case 'middle':
      return { low: band.low + span / 4, high: band.high - span / 4 };
    case 'unknown':
      return { low: band.low, high: band.high };
  }
}

export type ContributorId = 'hrv' | 'rhr' | 'sleep' | 'resp' | 'spo2' | 'temp';

export type DeltaWord = 'higher' | 'lower' | 'better' | 'worse';

export type ContributorDelta =
  | { kind: 'normal' }
  | { kind: 'shift'; direction: 'up' | 'down'; amount: number; percent: boolean; word: DeltaWord; tone: 'positive' | 'warning' };

interface DeltaRule {
  percent: boolean;
  good: 'up' | 'down' | null;
  words: 'level' | 'quality';
}

const DELTA_RULES: Readonly<Record<ContributorId, DeltaRule>> = {
  hrv: { percent: true, good: 'up', words: 'level' },
  rhr: { percent: false, good: 'down', words: 'level' },
  sleep: { percent: false, good: 'up', words: 'quality' },
  resp: { percent: false, good: null, words: 'level' },
  spo2: { percent: false, good: 'up', words: 'level' },
  temp: { percent: false, good: null, words: 'level' },
};

export function contributorDelta(id: ContributorId, value: number | null, baseline: Baseline | null): ContributorDelta | null {
  const status = rangeStatus(value, baseline);
  if (status === null || value === null || baseline === null) return null;
  if (status === 'within') return { kind: 'normal' };
  const rule = DELTA_RULES[id];
  if (rule.percent && baseline.mean === 0) return null;
  const diff = value - baseline.mean;
  const amount = rule.percent ? Math.abs((diff / baseline.mean) * 100) : Math.abs(diff);
  const direction = status === 'above' ? 'up' : 'down';
  const good = rule.good === direction;
  const word: DeltaWord = rule.words === 'quality' ? (good ? 'better' : 'worse') : direction === 'up' ? 'higher' : 'lower';
  return { kind: 'shift', direction, amount, percent: rule.percent, word, tone: good ? 'positive' : 'warning' };
}

export type VerdictDriver = 'hrv' | 'sleep' | 'rhr';

export interface Verdict {
  band: ReadinessBand;
  driver: VerdictDriver | null;
}

const DRIVER_FLOOR = -1;

export function readinessVerdict(value: number | null, contributions: Readonly<Record<VerdictDriver, number>> | null): Verdict | null {
  const band = bandOf(value);
  if (band === null) return null;
  if (band === 'high' || contributions === null) return { band, driver: null };
  const drivers: readonly VerdictDriver[] = ['hrv', 'sleep', 'rhr'];
  let driver: VerdictDriver | null = null;
  let lowest = DRIVER_FLOOR;
  for (const id of drivers) {
    const points = contributions[id];
    if (points < lowest) {
      lowest = points;
      driver = id;
    }
  }
  return { band, driver };
}

export interface ReadinessBar {
  key: string;
  start: string;
  value: number | null;
  kind: 'day' | 'week' | 'month';
}

function groupKey(day: string, kind: ReadinessBar['kind']): string {
  if (kind === 'week') return weekStart(day);
  if (kind === 'month') return day.slice(0, 7);
  return day;
}

export function readinessBars(slice: readonly DayRecord[], range: TrendRange): ReadinessBar[] {
  const kind: ReadinessBar['kind'] = range === '1W' ? 'day' : range === '1M' ? 'week' : 'month';
  const groups = new Map<string, { start: string; values: Array<number | null> }>();
  for (const day of slice) {
    const key = groupKey(day.day, kind);
    const group = groups.get(key) ?? { start: day.day, values: [] };
    group.values.push(visibleReadiness(day).value);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const average = mean(group.values);
    return { key, start: group.start, value: average === null ? null : Math.round(average), kind };
  });
}

export interface LowestDay {
  day: string;
  value: number;
}

export function lowestReadinessDay(slice: readonly DayRecord[]): LowestDay | null {
  let lowest: LowestDay | null = null;
  for (const day of slice) {
    const value = visibleReadiness(day).value;
    if (value === null) continue;
    if (lowest === null || value < lowest.value) lowest = { day: day.day, value };
  }
  return lowest;
}
