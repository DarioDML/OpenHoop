import type { StrengthSession } from '@openhoop/core';

import { addDays, weekStart } from './derived';
import { durationS, finishedSessions, sessionTotals } from './strength';
import { planWeek, strengthIntervals, strengthMinutesBetween, type PlanInput, type WeeklyPlan } from './weeklyPlan';

export const TREND_RANGES = ['1w', '1m', '6m'] as const;
export type TrendRange = (typeof TREND_RANGES)[number];
export const RANGE_WEEKS: Readonly<Record<TrendRange, number>> = { '1w': 1, '1m': 4, '6m': 26 };

export function parseTrendRange(value: string): TrendRange {
  return TREND_RANGES.find((range) => range === value) ?? '1m';
}

const DAY_S = 86_400;

function dayStartUnix(day: string, tzOffsetS: number): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 1000 - tzOffsetS;
}

export function monthStart(day: string, offsetMonths = 0): string {
  const [y, m] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + offsetMonths, 1));
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((dayStartUnix(end, 0) - dayStartUnix(start, 0)) / DAY_S) + 1;
}

export interface MinuteBar {
  key: string;
  start: string;
  end: string;
  kind: 'day' | 'week' | 'month';
  minutes: number | null;
  current: boolean;
}

export interface MinutesInput {
  sessions: readonly StrengthSession[];
  activities: PlanInput['activities'];
  today: string;
  nowS: number;
  tzOffsetS: number;
}

function spans(range: TrendRange, today: string): Array<Pick<MinuteBar, 'start' | 'end' | 'kind'>> {
  if (range === '1w') {
    const start = weekStart(today);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      return { start: day, end: day, kind: 'day' as const };
    });
  }
  if (range === '1m') {
    const current = weekStart(today);
    return Array.from({ length: 4 }, (_, i) => {
      const start = addDays(current, -7 * (3 - i));
      return { start, end: addDays(start, 6), kind: 'week' as const };
    });
  }
  return Array.from({ length: 6 }, (_, i) => {
    const start = monthStart(today, i - 5);
    return { start, end: addDays(monthStart(today, i - 4), -1), kind: 'month' as const };
  });
}

export function strengthMinuteBars(range: TrendRange, input: MinutesInput): MinuteBar[] {
  const intervals = strengthIntervals(input.sessions, input.activities, input.nowS, input.today);
  return spans(range, input.today).map((span) => {
    const future = span.start > input.today;
    const current = span.start <= input.today && span.end >= input.today;
    const window = { start: dayStartUnix(span.start, input.tzOffsetS), end: dayStartUnix(addDays(span.end, 1), input.tzOffsetS) };
    return { ...span, key: span.start, current, minutes: future ? null : strengthMinutesBetween(intervals, window) };
  });
}

export interface PeriodTotals {
  start: string;
  end: string;
  sessions: number;
  volumeKg: number;
  previousSessions: number;
  previousVolumeKg: number;
}

export function periodBounds(range: TrendRange, today: string): { start: string; end: string; previousStart: string; previousEnd: string } {
  const all = spans(range, today);
  const start = all[0]?.start ?? today;
  const end = all[all.length - 1]?.end ?? today;
  if (range === '6m') return { start, end, previousStart: monthStart(start, -6), previousEnd: addDays(start, -1) };
  const length = daysBetween(start, end);
  return { start, end, previousStart: addDays(start, -length), previousEnd: addDays(start, -1) };
}

export function periodTotals(range: TrendRange, sessions: readonly StrengthSession[], today: string): PeriodTotals {
  const bounds = periodBounds(range, today);
  const finished = finishedSessions(sessions);
  const within = (from: string, to: string): StrengthSession[] => finished.filter((session) => session.day >= from && session.day <= to);
  const now = within(bounds.start, bounds.end);
  const before = within(bounds.previousStart, bounds.previousEnd);
  return {
    start: bounds.start,
    end: bounds.end,
    sessions: now.length,
    volumeKg: sessionTotals(now.flatMap((session) => session.sets)).volumeKg,
    previousSessions: before.length,
    previousVolumeKg: sessionTotals(before.flatMap((session) => session.sets)).volumeKg,
  };
}

const TYPICAL_HISTORY = 10;

export function typicalSessionMinutes(sessions: readonly StrengthSession[]): number | null {
  const minutes = finishedSessions(sessions)
    .slice(-TYPICAL_HISTORY)
    .map((session) => durationS(session, session.startedAt) / 60)
    .filter((value) => value >= 5)
    .sort((a, b) => a - b);
  if (minutes.length === 0) return null;
  const middle = Math.floor(minutes.length / 2);
  return Math.round(minutes.length % 2 === 1 ? (minutes[middle] ?? 0) : ((minutes[middle - 1] ?? 0) + (minutes[middle] ?? 0)) / 2);
}

export type StrengthGoal =
  | { kind: 'noPlan' }
  | { kind: 'noGoal' }
  | { kind: 'goal'; done: number; target: number; left: number; sessionsNeeded: number | null };

export function strengthGoal(plan: WeeklyPlan | null, input: PlanInput): StrengthGoal {
  if (plan === null) return { kind: 'noPlan' };
  if (!plan.goals.includes('strength')) return { kind: 'noGoal' };
  const progress = planWeek({ ...plan, goals: ['strength'] }, input).goals[0];
  const done = progress?.done ?? 0;
  const target = plan.strengthMinutes;
  const left = Math.max(0, target - done);
  const typical = typicalSessionMinutes(input.sessions);
  return { kind: 'goal', done, target, left, sessionsNeeded: left > 0 && typical !== null ? Math.max(1, Math.ceil(left / typical)) : null };
}
