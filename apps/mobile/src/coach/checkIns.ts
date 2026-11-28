import type { DayRecord } from '@openhoop/core';

import { addDays, baselineAt, mean, weekStart } from '@/data/derived';

import { coachMetricValue, type CoachMetric } from './metrics';
import { effectiveProactivity, type CoachPrefs } from './prefs';

export const CHECK_IN_METRICS: readonly CoachMetric[] = ['readiness', 'hrv', 'restingHr', 'sleepScore'];
export const CHECK_IN_SPREAD = 1.5;
export const WEEK_MIN_DAYS = 4;
const MAX_STREAK = 7;

export type CheckInKind = 'change' | 'week';

export interface CheckIn {
  id: string;
  metric: CoachMetric;
  day: string;
  value: number;
  usual: number;
  direction: 'up' | 'down';
  kind?: CheckInKind;
}

export type CheckInScan = { status: 'no-data' } | { status: 'needs-history' } | { status: 'ok'; checkIns: CheckIn[] };

export function checkInId(day: string, metric: CoachMetric): string {
  return `${day}:${metric}`;
}

export function weekCheckInId(start: string): string {
  return `${start}:week`;
}

export function activeCheckIns(days: readonly DayRecord[], dismissed: readonly string[]): CheckIn[] {
  const result = scanForCheckIns(days, dismissed);
  return result.status === 'ok' ? result.checkIns : [];
}

function outside(days: readonly DayRecord[], index: number, metric: CoachMetric): 'up' | 'down' | null {
  const day = days[index];
  if (day === undefined) return null;
  const value = coachMetricValue(day, metric);
  const baseline = baselineAt(days, index, metric);
  if (value === null || baseline === null) return null;
  const spread = (baseline.high - baseline.low) / 2;
  if (spread <= 0 || Math.abs(value - baseline.mean) <= CHECK_IN_SPREAD * spread) return null;
  return value > baseline.mean ? 'up' : 'down';
}

export function scanForCheckIns(days: readonly DayRecord[], dismissed: readonly string[]): CheckInScan {
  const index = days.length - 1;
  const latest = days[index];
  if (latest === undefined) return { status: 'no-data' };
  const checkIns: CheckIn[] = [];
  let compared = 0;
  for (const metric of CHECK_IN_METRICS) {
    const value = coachMetricValue(latest, metric);
    const baseline = baselineAt(days, index, metric);
    if (value === null || baseline === null) continue;
    compared += 1;
    const direction = outside(days, index, metric);
    if (direction === null) continue;
    const id = checkInId(latest.day, metric);
    if (dismissed.includes(id)) continue;
    checkIns.push({ id, metric, day: latest.day, value, usual: baseline.mean, direction, kind: 'change' });
  }
  if (compared === 0) return { status: 'needs-history' };
  return { status: 'ok', checkIns };
}

/** Days in a row, ending on the check-in day, where the metric sat outside the usual band in the same direction. */
export function checkInStreak(days: readonly DayRecord[], checkIn: CheckIn): number {
  if (checkIn.kind === 'week') return 0;
  let index = days.findIndex((day) => day.day === checkIn.day);
  let streak = 0;
  while (index >= 0 && streak < MAX_STREAK && outside(days, index, checkIn.metric) === checkIn.direction) {
    streak += 1;
    index -= 1;
  }
  return streak;
}

function weekAverage(days: readonly DayRecord[], start: string, metric: CoachMetric): number | null {
  const end = addDays(start, 6);
  const values = days.filter((day) => day.day >= start && day.day <= end).map((day) => coachMetricValue(day, metric));
  const present = values.filter((value): value is number => value !== null);
  return present.length >= WEEK_MIN_DAYS ? mean(present) : null;
}

export function weeklyCheckIn(days: readonly DayRecord[], today: string, metric: CoachMetric = 'readiness'): CheckIn | null {
  const lastWeek = addDays(weekStart(today), -7);
  const weekBefore = addDays(lastWeek, -7);
  const value = weekAverage(days, lastWeek, metric);
  const usual = weekAverage(days, weekBefore, metric);
  if (value === null || usual === null) return null;
  return { id: weekCheckInId(lastWeek), metric, day: lastWeek, value, usual, direction: value >= usual ? 'up' : 'down', kind: 'week' };
}

export function coachCheckIns(days: readonly DayRecord[], prefs: CoachPrefs, today: string): CheckIn[] {
  const mode = effectiveProactivity(prefs);
  if (!prefs.enabled || mode === 'off') return [];
  const changes = activeCheckIns(days, prefs.dismissedCheckIns);
  if (mode !== 'weekly') return changes;
  const week = weeklyCheckIn(days, today);
  return week === null || prefs.dismissedCheckIns.includes(week.id) ? changes : [week, ...changes];
}

export function findCheckIn(days: readonly DayRecord[], id: string, today: string): CheckIn | null {
  return activeCheckIns(days, []).find((checkIn) => checkIn.id === id) ?? (weeklyCheckIn(days, today)?.id === id ? weeklyCheckIn(days, today) : null);
}
