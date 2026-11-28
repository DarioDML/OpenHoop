import { STRESS_BASELINE_MIN_DAYS, STRESS_WINDOW_S, parseStressDay, stressLevel, stressSummary } from '@openhoop/analytics';
import type { StressLevel, StressSummary, StressWindow } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

export const STRESS_LEVELS: readonly StressLevel[] = ['low', 'medium', 'high'];

export interface StressLatest {
  t: number;
  score: number;
  level: StressLevel;
}

export interface StressView {
  reason: string | null;
  calibrating: boolean;
  baselineDays: number;
  neededDays: number;
  windows: readonly StressWindow[];
  seconds: StressSummary['seconds'];
  latest: StressLatest | null;
}

const EMPTY_SECONDS: StressSummary['seconds'] = { low: 0, medium: 0, high: 0 };

export function stressForDay(day: DayRecord | undefined): StressView {
  const stress = day === undefined ? null : parseStressDay(day.stress);
  if (stress === null) {
    return { reason: 'no-data', calibrating: false, baselineDays: 0, neededDays: STRESS_BASELINE_MIN_DAYS, windows: [], seconds: EMPTY_SECONDS, latest: null };
  }
  const summary = stressSummary(stress);
  const latest = summary.latest === null ? null : { t: summary.latest.t, score: summary.latest.score, level: stressLevel(summary.latest.score) };
  return {
    reason: stress.reason,
    calibrating: stress.reason === 'needs-history',
    baselineDays: stress.baselineDays,
    neededDays: STRESS_BASELINE_MIN_DAYS,
    windows: stress.windows,
    seconds: summary.seconds,
    latest,
  };
}

export function stressTimeline(windows: readonly StressWindow[], start: number, end: number): (number | null)[] {
  if (!(end > start)) return [];
  const first = Math.floor(start / STRESS_WINDOW_S) * STRESS_WINDOW_S;
  const slots: (number | null)[] = Array.from({ length: Math.ceil((end - first) / STRESS_WINDOW_S) }, () => null);
  for (const w of windows) {
    if (w.score === null) continue;
    const slot = Math.floor((w.t - first) / STRESS_WINDOW_S);
    if (slot >= 0 && slot < slots.length) slots[slot] = w.score;
  }
  return slots;
}

export function latestStressDayIndex(days: readonly DayRecord[]): number {
  for (let i = days.length - 1; i >= 0; i--) {
    if (stressForDay(days[i]).latest !== null) return i;
  }
  return days.length - 1;
}

export function latestStressScore(days: readonly DayRecord[]): number | null {
  return stressForDay(days[latestStressDayIndex(days)]).latest?.score ?? null;
}

export const STRESS_HOURS = 12;
const HOUR_S = 3600;

export interface StressHour {
  start: number;
  tzOffsetS: number;
  score: number | null;
  level: StressLevel | null;
}

export interface StressSpan {
  start: number;
  tzOffsetS: number;
}

export interface RecentStress {
  windows: StressWindow[];
  spans: StressSpan[];
}

export function mergeStressWindows(...lists: ReadonlyArray<readonly StressWindow[]>): StressWindow[] {
  const byTime = new Map<number, StressWindow>();
  for (const list of lists) for (const window of list) byTime.set(window.t, window);
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function recentStress(days: readonly DayRecord[], index: number): RecentStress {
  const picked = [index > 0 ? days[index - 1] : undefined, days[index]].filter((day): day is DayRecord => day !== undefined);
  return {
    windows: mergeStressWindows(...picked.map((day) => stressForDay(day).windows)),
    spans: picked.map((day) => ({ start: day.start, tzOffsetS: day.tzOffsetS })),
  };
}

function offsetAt(t: number, spans: readonly StressSpan[], fallback: number): number {
  return spans.reduce<StressSpan | null>((found, span) => (span.start <= t && (found === null || span.start >= found.start) ? span : found), null)?.tzOffsetS ?? fallback;
}

export function hourTicks(count: number, step = 4): number[] {
  if (count <= 0) return [];
  const ticks: number[] = [];
  for (let i = 0; i < count; i += step) ticks.push(i);
  const lastTick = ticks[ticks.length - 1] ?? 0;
  if (count - 1 - lastTick >= step / 2) ticks.push(count - 1);
  return ticks;
}

export function stressHours(windows: readonly StressWindow[], endS: number, tzOffsetS: number, hours = STRESS_HOURS, spans: readonly StressSpan[] = []): StressHour[] {
  const lastStart = Math.floor((endS + tzOffsetS) / HOUR_S) * HOUR_S - tzOffsetS;
  return Array.from({ length: hours }, (_, i) => {
    const start = lastStart - (hours - 1 - i) * HOUR_S;
    const offset = offsetAt(start, spans, tzOffsetS);
    const scores = windows.flatMap((w) => (w.score !== null && w.t >= start && w.t < start + HOUR_S ? [w.score] : []));
    if (scores.length === 0) return { start, tzOffsetS: offset, score: null, level: null };
    const score = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return { start, tzOffsetS: offset, score, level: stressLevel(score) };
  });
}
