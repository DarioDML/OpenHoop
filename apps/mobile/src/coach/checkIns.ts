import type { DayRecord } from '@openhoop/core';

import { baselineAt } from '@/data/derived';

import { coachMetricValue, type CoachMetric } from './metrics';

export const CHECK_IN_METRICS: readonly CoachMetric[] = ['readiness', 'hrv', 'restingHr', 'sleepScore'];
export const CHECK_IN_SPREAD = 1.5;

export interface CheckIn {
  id: string;
  metric: CoachMetric;
  day: string;
  value: number;
  usual: number;
  direction: 'up' | 'down';
}

export type CheckInScan = { status: 'no-data' } | { status: 'needs-history' } | { status: 'ok'; checkIns: CheckIn[] };

export function checkInId(day: string, metric: CoachMetric): string {
  return `${day}:${metric}`;
}

export function activeCheckIns(days: readonly DayRecord[], dismissed: readonly string[]): CheckIn[] {
  const result = scanForCheckIns(days, dismissed);
  return result.status === 'ok' ? result.checkIns : [];
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
    const spread = (baseline.high - baseline.low) / 2;
    if (spread <= 0 || Math.abs(value - baseline.mean) <= CHECK_IN_SPREAD * spread) continue;
    const id = checkInId(latest.day, metric);
    if (dismissed.includes(id)) continue;
    checkIns.push({ id, metric, day: latest.day, value, usual: baseline.mean, direction: value > baseline.mean ? 'up' : 'down' });
  }
  if (compared === 0) return { status: 'needs-history' };
  return { status: 'ok', checkIns };
}
