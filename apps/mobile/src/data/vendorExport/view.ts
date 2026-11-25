import type { VendorData } from '@openhoop/core';

export const HISTORY_PAGE = 20;
export const CHART_POINTS = 60;

export function newestFirst<T>(items: readonly T[]): T[] {
  return [...items].reverse();
}

export function storedTotal(data: VendorData): number {
  return data.cycles.length + data.sleeps.length + data.workouts.length + data.journal.length;
}

export interface RecoverySeries {
  values: number[];
  firstDay: string | null;
  lastDay: string | null;
}

export function recoverySeries(data: VendorData, limit: number = CHART_POINTS): RecoverySeries {
  const points = data.cycles.flatMap((cycle) => (cycle.recoveryPct === null ? [] : [{ day: cycle.day, value: cycle.recoveryPct }]));
  const recent = points.slice(-limit);
  return { values: recent.map((p) => p.value), firstDay: recent[0]?.day ?? null, lastDay: recent[recent.length - 1]?.day ?? null };
}

export function dayRange(data: VendorData): { first: string; last: string } | null {
  const days = [...data.cycles, ...data.sleeps, ...data.workouts, ...data.journal].map((row) => row.day).sort();
  const first = days[0];
  const last = days[days.length - 1];
  return first === undefined || last === undefined ? null : { first, last };
}
