import { activeSegments, normalizeIntervals, overlapSeconds, type Interval } from '@openhoop/analytics';
import type { ActivityRow, DayRecord, StrengthSession } from '@openhoop/core';

import type { TranslationKey, TranslationParams } from '@/i18n';
import { isRecord, type Json } from '@/lib/json';

import { LOAD_DAY_MIN, READINESS_HIGH, READINESS_LOW } from './activityDerived';
import { addDays, visibleReadiness, weekdayIndex, weekStart } from './derived';
import { finishedSessions } from './strength';

export const PLAN_GOALS = ['loadDays', 'sleepScore', 'strength', 'steps'] as const;
export type PlanGoal = (typeof PLAN_GOALS)[number];
export const PLAN_LEVELS = ['easy', 'balanced', 'hard'] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];
export const MAX_PLAN_GOALS = 3;

export interface PlanTargets {
  loadDays: number;
  sleepNights: number;
  sleepScoreMin: number;
  strengthMinutes: number;
  steps: number;
}

export interface WeeklyPlan extends PlanTargets {
  goals: PlanGoal[];
  level: PlanLevel;
  sleepScoreNotice: boolean;
}

export type TargetKey = keyof PlanTargets;

export const TARGET_LIMITS: Readonly<Record<TargetKey, { min: number; max: number; step: number }>> = {
  loadDays: { min: 1, max: 7, step: 1 },
  sleepNights: { min: 1, max: 7, step: 1 },
  sleepScoreMin: { min: 50, max: 100, step: 5 },
  strengthMinutes: { min: 15, max: 600, step: 15 },
  steps: { min: 1000, max: 50000, step: 500 },
};

const PRESETS: Readonly<Record<PlanLevel, PlanTargets>> = {
  easy: { loadDays: 2, sleepNights: 3, sleepScoreMin: 70, strengthMinutes: 45, steps: 6000 },
  balanced: { loadDays: 3, sleepNights: 4, sleepScoreMin: 80, strengthMinutes: 90, steps: 8000 },
  hard: { loadDays: 5, sleepNights: 5, sleepScoreMin: 90, strengthMinutes: 150, steps: 10000 },
};

const STEPS_SCALE: Readonly<Record<PlanLevel, number>> = { easy: 0.75, balanced: 1, hard: 1.25 };
const STRENGTH_MINUTES_PER_DAY = 90;
const STEPS_CATCH_UP = 1.5;
const DAY_S = 86_400;

export function clampTarget(key: TargetKey, value: number): number {
  const { min, max, step } = TARGET_LIMITS[key];
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

export function presetTargets(level: PlanLevel, stepsGoal: number | null): PlanTargets {
  const base = PRESETS[level];
  return stepsGoal === null ? { ...base } : { ...base, steps: clampTarget('steps', stepsGoal * STEPS_SCALE[level]) };
}

export function defaultPlan(stepsGoal: number | null): WeeklyPlan {
  return { goals: ['loadDays', 'sleepScore', 'strength'], level: 'balanced', sleepScoreNotice: false, ...presetTargets('balanced', stepsGoal) };
}

export function withLevel(plan: WeeklyPlan, level: PlanLevel, stepsGoal: number | null): WeeklyPlan {
  return { ...plan, level, ...presetTargets(level, stepsGoal) };
}

export function isFineTuned(plan: WeeklyPlan, stepsGoal: number | null): boolean {
  const preset = presetTargets(plan.level, stepsGoal);
  return plan.goals.some((goal) => goalTargetKeys(goal).some((key) => plan[key] !== preset[key]));
}

export function goalTargetKeys(goal: PlanGoal): TargetKey[] {
  if (goal === 'loadDays') return ['loadDays'];
  if (goal === 'sleepScore') return ['sleepScoreMin', 'sleepNights'];
  if (goal === 'strength') return ['strengthMinutes'];
  return ['steps'];
}

export function toggleGoal(plan: WeeklyPlan, goal: PlanGoal, on: boolean): WeeklyPlan {
  if (!on) return { ...plan, goals: plan.goals.filter((g) => g !== goal) };
  if (plan.goals.includes(goal) || plan.goals.length >= MAX_PLAN_GOALS) return plan;
  return { ...plan, goals: PLAN_GOALS.filter((g) => g === goal || plan.goals.includes(g)) };
}

export function setTarget(plan: WeeklyPlan, key: TargetKey, value: number): WeeklyPlan {
  return { ...plan, [key]: clampTarget(key, value) };
}

function wholeIn(value: Json | undefined, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

export function parseWeeklyPlan(value: Json | undefined): WeeklyPlan | null {
  if (!isRecord(value)) return null;
  const legacyLoad = wholeIn(value.loadDays, 0, 7);
  const legacySleep = wholeIn(value.sleepNights, 0, 7);
  const level: PlanLevel = PLAN_LEVELS.find((l) => l === value.level) ?? 'balanced';
  const preset = PRESETS[level];
  const target = (key: TargetKey): number => {
    const { min, max } = TARGET_LIMITS[key];
    return wholeIn(value[key], min, max) ?? preset[key];
  };
  const rawGoals = value.goals;
  let goals: PlanGoal[];
  let sleepScoreNotice: boolean;
  if (Array.isArray(rawGoals)) {
    goals = PLAN_GOALS.filter((goal) => rawGoals.includes(goal)).slice(0, MAX_PLAN_GOALS);
    sleepScoreNotice = value.sleepScoreNotice === true;
  } else {
    if (legacyLoad === null || legacySleep === null) return null;
    goals = [...(legacyLoad > 0 ? (['loadDays'] as const) : []), ...(legacySleep > 0 ? (['sleepScore'] as const) : [])];
    sleepScoreNotice = legacySleep > 0;
  }
  return {
    goals,
    level,
    sleepScoreNotice,
    loadDays: target('loadDays'),
    sleepNights: target('sleepNights'),
    sleepScoreMin: target('sleepScoreMin'),
    strengthMinutes: target('strengthMinutes'),
    steps: target('steps'),
  };
}

export type DotState = 'hit' | 'partial' | 'miss' | 'none' | 'open';
export type GoalState = 'met' | 'onTrack' | 'behind';

export interface GoalProgress {
  goal: PlanGoal;
  done: number;
  target: number;
  left: number;
  state: GoalState;
  dots: DotState[];
  measured: number;
}

export interface PlanWeek {
  start: string;
  end: string;
  isoWeek: number;
  elapsed: number;
  remaining: number;
  goals: GoalProgress[];
  onTrack: number;
  met: number;
}

export interface StepsEntry {
  day: string;
  steps: number | null;
}

export interface PlanInput {
  days: readonly DayRecord[];
  sessions: readonly StrengthSession[];
  activities: readonly ActivityRow[];
  steps: readonly StepsEntry[];
  today: string;
  nowS: number;
  tzOffsetS: number;
}

function dayStartUnix(day: string, tzOffsetS: number): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 1000 - tzOffsetS;
}

export function isoWeek(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - yearStart) / (DAY_S * 1000) / 7) + 1;
}

export function strengthIntervals(sessions: readonly StrengthSession[], activities: readonly ActivityRow[], nowS: number, today: string): Interval[] {
  const finished = finishedSessions(sessions).map((s) => ({ start: s.startedAt, end: s.endedAt ?? s.startedAt }));
  const open = sessions.filter((s) => s.endedAt === null && s.day === today && s.startedAt < nowS).map((s) => ({ start: s.startedAt, end: nowS }));
  const fromActivities = activities
    .filter((a) => a.deletedAt === null && a.type === 'strength')
    .flatMap((a) => activeSegments({ start: a.start, end: a.end }, a.paused));
  return normalizeIntervals([...finished, ...open, ...fromActivities]);
}

export function strengthMinutesBetween(intervals: readonly Interval[], window: Interval): number {
  return Math.round(intervals.reduce((sum, i) => sum + overlapSeconds(i, window), 0) / 60);
}

function countState(done: number, target: number, chances: number): GoalState {
  if (done >= target) return 'met';
  return target - done <= chances ? 'onTrack' : 'behind';
}

function dotFor(index: number, todayIndex: number, value: boolean | null): DotState {
  if (index > todayIndex) return 'open';
  if (value === true) return 'hit';
  if (index === todayIndex) return 'partial';
  return value === null ? 'none' : 'miss';
}

export function planWeek(plan: WeeklyPlan, input: PlanInput): PlanWeek {
  const start = weekStart(input.today);
  const todayIndex = weekdayIndex(input.today);
  const elapsed = todayIndex + 1;
  const remaining = 7 - elapsed;
  const keys = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = new Map(input.days.map((d) => [d.day, d]));
  const stepsByDay = new Map(input.steps.map((s) => [s.day, s.steps]));
  const intervals = strengthIntervals(input.sessions, input.activities, input.nowS, input.today);

  const progress = (goal: PlanGoal): GoalProgress => {
    if (goal === 'loadDays') {
      const values = keys.map((k) => {
        const day = byDay.get(k);
        const value = day === undefined ? null : (day.load.value ?? day.loadSoFar ?? null);
        return value === null ? null : value >= LOAD_DAY_MIN;
      });
      const dots = values.map((v, i) => dotFor(i, todayIndex, v));
      const done = dots.filter((d) => d === 'hit').length;
      const chances = remaining + (dots[todayIndex] === 'hit' ? 0 : 1);
      return { goal, done, target: plan.loadDays, left: Math.max(0, plan.loadDays - done), state: countState(done, plan.loadDays, chances), dots, measured: values.filter((v) => v !== null).length };
    }
    if (goal === 'sleepScore') {
      const values = keys.map((k) => {
        const score = byDay.get(k)?.sleep.score.value ?? null;
        return score === null ? null : score >= plan.sleepScoreMin;
      });
      const dots = values.map((v, i) => (i === todayIndex && v === false ? 'miss' : dotFor(i, todayIndex, v)));
      const done = dots.filter((d) => d === 'hit').length;
      const chances = remaining + (dots[todayIndex] === 'partial' ? 1 : 0);
      return { goal, done, target: plan.sleepNights, left: Math.max(0, plan.sleepNights - done), state: countState(done, plan.sleepNights, chances), dots, measured: values.filter((v) => v !== null).length };
    }
    if (goal === 'strength') {
      const minutes = keys.map((k) => strengthMinutesBetween(intervals, { start: dayStartUnix(k, input.tzOffsetS), end: dayStartUnix(k, input.tzOffsetS) + DAY_S }));
      const dots = minutes.map((m, i) => dotFor(i, todayIndex, m > 0));
      const done = minutes.slice(0, elapsed).reduce((a, b) => a + b, 0);
      const left = Math.max(0, plan.strengthMinutes - done);
      const state: GoalState = left === 0 ? 'met' : left <= (remaining + 1) * STRENGTH_MINUTES_PER_DAY ? 'onTrack' : 'behind';
      return { goal, done, target: plan.strengthMinutes, left, state, dots, measured: minutes.filter((m) => m > 0).length };
    }
    const values = keys.map((k) => stepsByDay.get(k) ?? byDay.get(k)?.steps ?? null);
    const dots = values.map((v, i) => dotFor(i, todayIndex, v === null ? null : v >= plan.steps));
    const total = values.slice(0, elapsed).reduce<number>((sum, v) => sum + (v ?? 0), 0);
    const weekTarget = plan.steps * 7;
    const left = Math.max(0, weekTarget - total);
    const state: GoalState = left === 0 ? 'met' : left <= (remaining + 1) * plan.steps * STEPS_CATCH_UP ? 'onTrack' : 'behind';
    return { goal, done: total, target: weekTarget, left, state, dots, measured: values.filter((v) => v !== null).length };
  };

  const goals = plan.goals.map(progress);
  return {
    start,
    end: addDays(start, 6),
    isoWeek: isoWeek(start),
    elapsed,
    remaining,
    goals,
    onTrack: goals.filter((g) => g.state !== 'behind').length,
    met: goals.filter((g) => g.state === 'met').length,
  };
}

export interface AdviceLine {
  key: TranslationKey;
  params?: TranslationParams;
}

export function planAdvice(plan: WeeklyPlan, week: PlanWeek, today: DayRecord | null): AdviceLine[] {
  if (week.goals.length === 0) return [];
  if (week.goals.every((g) => g.state === 'met')) return [{ key: 'plan.left.allDone' }];
  const lines: AdviceLine[] = [];
  const daysToGo = week.remaining + 1;
  for (const g of week.goals) {
    if (g.state === 'met') continue;
    if (g.state === 'behind') {
      lines.push({ key: `plan.left.behind.${g.goal}` });
      continue;
    }
    if (g.goal === 'loadDays') lines.push({ key: g.left === 1 ? 'plan.left.loadDays.one' : 'plan.left.loadDays.other', params: { count: g.left, threshold: LOAD_DAY_MIN } });
    else if (g.goal === 'sleepScore') lines.push({ key: g.left === 1 ? 'plan.left.sleepScore.one' : 'plan.left.sleepScore.other', params: { count: g.left, min: plan.sleepScoreMin } });
    else if (g.goal === 'strength') lines.push({ key: 'plan.left.strength', params: { minutes: g.left } });
    else lines.push({ key: 'plan.left.steps', params: { steps: Math.ceil(g.left / daysToGo / 100) * 100 } });
  }
  const load = week.goals.find((g) => g.goal === 'loadDays');
  const readiness = today === null ? null : visibleReadiness(today).value;
  if (load !== undefined && load.state === 'onTrack' && load.dots[week.elapsed - 1] !== 'hit' && readiness !== null) {
    if (readiness >= READINESS_HIGH) lines.push({ key: 'plan.left.todayHigh' });
    else if (readiness < READINESS_LOW) lines.push({ key: 'plan.left.todayLow' });
  }
  if (week.remaining === 0) lines.push({ key: 'plan.left.lastDay' });
  else lines.push({ key: week.remaining === 1 ? 'plan.left.daysLeft.one' : 'plan.left.daysLeft.other', params: { count: week.remaining } });
  return lines;
}
