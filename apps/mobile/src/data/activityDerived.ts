import type { DayRecord, WorkoutRecord } from '@openhoop/core';

import type { HcStepsDay } from '@/lib/healthConnectMapping';

import type { Language, Profile } from './types';
import { addDays, baselineAt, mean, weekdayIndex, weekStart, wearStreak, visibleReadiness, type Baseline } from './derived';

export const LOAD_DAY_MIN = 7;
export const MIN_REPORT_DAYS = 3;
export const FALLBACK_MAX_HR = 190;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isLoadDay(day: DayRecord | null): boolean {
  return day !== null && day.load.value !== null && day.load.value >= LOAD_DAY_MIN;
}

export function sleepNightMet(day: DayRecord | null): boolean | null {
  if (day === null) return null;
  const need = day.sleep.need.value;
  if (day.sleep.asleepS === null || need === null) return null;
  return day.sleep.asleepS >= need;
}

export interface WeekProgress {
  start: string;
  elapsed: number;
  remaining: number;
  daysWithData: number;
  loadDays: number;
  sleepNightsMet: number;
  sleepNightsMeasured: number;
}

export function weekProgress(days: readonly DayRecord[], today: string): WeekProgress {
  const start = weekStart(today);
  const elapsed = weekdayIndex(today) + 1;
  const byDay = new Map(days.map((d) => [d.day, d]));
  let daysWithData = 0;
  let loadDays = 0;
  let met = 0;
  let measured = 0;
  for (let i = 0; i < elapsed; i++) {
    const day = byDay.get(addDays(start, i)) ?? null;
    if (day === null) continue;
    daysWithData++;
    if (isLoadDay(day)) loadDays++;
    const ok = sleepNightMet(day);
    if (ok !== null) {
      measured++;
      if (ok) met++;
    }
  }
  return { start, elapsed, remaining: 7 - elapsed, daysWithData, loadDays, sleepNightsMet: met, sleepNightsMeasured: measured };
}

export interface PeriodStats {
  days: number;
  readiness: number | null;
  load: number | null;
  sleepH: number | null;
  hrv: number | null;
  restingHr: number | null;
  loadDays: number;
  peakLoad: { day: string; value: number } | null;
}

export function periodStats(days: readonly DayRecord[]): PeriodStats {
  let peak: { day: string; value: number } | null = null;
  for (const d of days) {
    if (d.load.value !== null && (peak === null || d.load.value > peak.value)) peak = { day: d.day, value: d.load.value };
  }
  return {
    days: days.length,
    readiness: mean(days.map((d) => visibleReadiness(d).value)),
    load: mean(days.map((d) => d.load.value)),
    sleepH: mean(days.map((d) => (d.sleep.asleepS === null ? null : d.sleep.asleepS / 3600))),
    hrv: mean(days.map((d) => d.hrv.value)),
    restingHr: mean(days.map((d) => d.restingHr.value)),
    loadDays: days.filter((d) => isLoadDay(d)).length,
    peakLoad: peak,
  };
}

export interface PeriodWindows {
  current: DayRecord[];
  previous: DayRecord[];
}

export function periodWindows(days: readonly DayRecord[], length: number): PeriodWindows {
  const end = days.length;
  return { current: days.slice(Math.max(0, end - length), end), previous: days.slice(Math.max(0, end - 2 * length), Math.max(0, end - length)) };
}

export type Trend = 'up' | 'down' | 'stable';

export function trendOf(current: number, previous: number, relativeThreshold = 0.05): Trend {
  if (previous === 0) return current === 0 ? 'stable' : current > 0 ? 'up' : 'down';
  const change = (current - previous) / Math.abs(previous);
  if (change > relativeThreshold) return 'up';
  if (change < -relativeThreshold) return 'down';
  return 'stable';
}

export function enoughForReport(days: readonly DayRecord[]): boolean {
  return days.length >= MIN_REPORT_DAYS;
}

export function loadTargetBand(days: readonly DayRecord[]): Baseline | null {
  if (days.length === 0) return null;
  const baseline = baselineAt(days, days.length - 1, 'load');
  if (baseline === null) return null;
  return { ...baseline, low: Math.max(0, baseline.low), high: Math.min(21, baseline.high) };
}

export type TargetAdvice = 'lower' | 'middle' | 'upper' | 'unknown';

export function targetAdvice(readiness: number | null): TargetAdvice {
  if (readiness === null) return 'unknown';
  if (readiness < 34) return 'lower';
  if (readiness >= 67) return 'upper';
  return 'middle';
}

export function effectiveMaxHr(profile: Profile, year: number): number {
  if (profile.maxHeartRate !== null && profile.maxHeartRate > 0) return profile.maxHeartRate;
  if (profile.birthYear !== null && profile.birthYear <= year) return 208 - 0.7 * (year - profile.birthYear);
  return FALLBACK_MAX_HR;
}

export const ZONE_FLOORS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

export function liveZone(heartRate: number, maxHr: number): number | null {
  if (maxHr <= 0) return null;
  const fraction = heartRate / maxHr;
  let zone: number | null = null;
  ZONE_FLOORS.forEach((floor, index) => {
    if (fraction >= floor) zone = index + 1;
  });
  return zone;
}

export function parseDayParam(value: string | string[] | undefined, days: readonly DayRecord[]): DayRecord | null {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return null;
  return days.find((d) => d.day === value) ?? null;
}

export function parseIndexParam(value: string | string[] | undefined, length: number): number | null {
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) return null;
  const index = Number(value);
  return index < length ? index : null;
}

export interface WorkoutRef {
  day: DayRecord;
  index: number;
  workout: WorkoutRecord;
}

export function resolveWorkout(
  days: readonly DayRecord[],
  dayParam: string | string[] | undefined,
  indexParam: string | string[] | undefined,
): WorkoutRef | null {
  const day = parseDayParam(dayParam, days);
  if (day === null) return null;
  const index = parseIndexParam(indexParam, day.workouts.length);
  if (index === null) return null;
  const workout = day.workouts[index];
  return workout ? { day, index, workout } : null;
}

export function formatWeekday(day: string, language: Language, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: style, timeZone: 'UTC' });
}

export function formatMonthYear(day: string, language: Language): string {
  const [y, m] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  return date.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function longestRun(days: readonly DayRecord[], test: (day: DayRecord) => boolean): number {
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const d of days) {
    if (!test(d)) {
      run = 0;
      previous = null;
      continue;
    }
    run = previous !== null && addDays(previous, 1) === d.day ? run + 1 : 1;
    previous = d.day;
    best = Math.max(best, run);
  }
  return best;
}

export function longestStreak(days: readonly DayRecord[]): number {
  return longestRun(days, (d) => d.heartRate.avg !== null || d.sleep.asleepS !== null);
}

export interface Lifetime {
  daysTracked: number;
  nights: number;
  workouts: number;
  steps: number;
  memberSince: string | null;
  wornS: number | null;
}

export function lifetimeStats(days: readonly DayRecord[]): Lifetime {
  const worn = days.map((d) => d.worn?.value ?? null).filter((v): v is number => v !== null);
  return {
    daysTracked: days.length,
    nights: days.filter((d) => d.sleep.asleepS !== null).length,
    workouts: days.reduce((sum, d) => sum + d.workouts.length, 0),
    steps: days.reduce((sum, d) => sum + (d.steps ?? 0), 0),
    memberSince: days[0]?.day ?? null,
    wornS: worn.length === 0 ? null : worn.reduce((a, b) => a + b, 0),
  };
}

export const POINTS_PER_LEVEL = 3;

export interface LevelInfo {
  level: number;
  points: number;
  maxPoints: number;
  toNext: number | null;
  unlocked: number;
  total: number;
}

export function levelOf(list: readonly Achievement[]): LevelInfo {
  const points = list.reduce((sum, a) => sum + (a.unlocked ? a.tier : 0), 0);
  const maxPoints = list.reduce((sum, a) => sum + a.tier, 0);
  const level = 1 + Math.floor(points / POINTS_PER_LEVEL);
  const nextAt = level * POINTS_PER_LEVEL;
  return { level, points, maxPoints, toNext: nextAt > maxPoints ? null : nextAt - points, unlocked: list.filter((a) => a.unlocked).length, total: list.length };
}

export type AchievementGroup = 'streak' | 'nights' | 'workouts' | 'steps10k' | 'highLoad' | 'readyStreak';

export interface Achievement {
  id: string;
  group: AchievementGroup;
  tier: number;
  target: number;
  current: number;
  unlocked: boolean;
}

export const STEPS_BADGE_MIN = 10_000;
export const HIGH_LOAD_MIN = 15;
export const HIGH_READINESS_MIN = 67;

const TIERS: Record<AchievementGroup, readonly number[]> = {
  streak: [3, 7, 14, 30],
  nights: [7, 30, 90],
  workouts: [1, 10, 25],
  steps10k: [1, 10, 50],
  highLoad: [1, 10],
  readyStreak: [3, 7],
};

export function achievements(days: readonly DayRecord[]): Achievement[] {
  const stats = lifetimeStats(days);
  const currents: Record<AchievementGroup, number> = {
    streak: Math.max(wearStreak(days), longestStreak(days)),
    nights: stats.nights,
    workouts: stats.workouts,
    steps10k: days.filter((d) => d.steps !== null && d.steps >= STEPS_BADGE_MIN).length,
    highLoad: days.filter((d) => d.load.value !== null && d.load.value >= HIGH_LOAD_MIN).length,
    readyStreak: longestRun(days, (d) => {
      const value = visibleReadiness(d).value;
      return value !== null && value >= HIGH_READINESS_MIN;
    }),
  };
  const out: Achievement[] = [];
  (Object.keys(TIERS) as AchievementGroup[]).forEach((group) => {
    TIERS[group].forEach((target, index) => {
      out.push({ id: `${group}-${target}`, group, tier: index + 1, target, current: currents[group], unlocked: currents[group] >= target });
    });
  });
  return out;
}

export const ACTIVITY_TYPES = ['running', 'walking', 'cycling', 'swimming', 'strength', 'yoga', 'hiit', 'football', 'padel', 'pilates', 'hiking', 'other'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export function parseActivityType(value: string | string[] | undefined): ActivityType {
  return typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value) ? (value as ActivityType) : 'other';
}

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export interface StepsStats {
  average: number | null;
  total: number;
  best: { day: string; steps: number } | null;
  daysWithData: number;
  goalDays: number | null;
}

export type StepsSource = 'band' | 'healthConnect';

export interface StepsDay {
  day: string;
  steps: number | null;
  source: StepsSource | null;
  origins: readonly string[];
}

function bandSteps(day: DayRecord): StepsDay {
  return { day: day.day, steps: day.steps, source: day.steps === null ? null : 'band', origins: [] };
}

function importedSteps(entry: HcStepsDay): StepsDay {
  return { day: entry.day, steps: entry.steps, source: 'healthConnect', origins: entry.origins };
}

export function stepsForDay(day: DayRecord, imported: readonly HcStepsDay[]): StepsDay {
  if (day.steps !== null) return bandSteps(day);
  const entry = imported.find((e) => e.day === day.day);
  return entry === undefined ? bandSteps(day) : importedSteps(entry);
}

export function mergeSteps(days: readonly DayRecord[], imported: readonly HcStepsDay[]): StepsDay[] {
  const byDay = new Map<string, StepsDay>();
  for (const entry of imported) byDay.set(entry.day, importedSteps(entry));
  for (const day of days) {
    if (day.steps !== null || !byDay.has(day.day)) byDay.set(day.day, bandSteps(day));
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function stepsStats(days: ReadonlyArray<Pick<StepsDay, 'day' | 'steps'>>, goal: number | null): StepsStats {
  const withSteps = days.filter((d): d is { day: string; steps: number } => d.steps !== null);
  const total = withSteps.reduce((sum, d) => sum + d.steps, 0);
  let best: StepsStats['best'] = null;
  for (const d of withSteps) {
    if (best === null || d.steps > best.steps) best = { day: d.day, steps: d.steps };
  }
  return {
    average: withSteps.length === 0 ? null : total / withSteps.length,
    total,
    best,
    daysWithData: withSteps.length,
    goalDays: goal === null ? null : withSteps.filter((d) => d.steps >= goal).length,
  };
}

export function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,6}$/.test(trimmed) ? Number(trimmed) : null;
}

export function parseDecimal(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  return /^\d{1,3}(\.\d{1,2})?$/.test(trimmed) ? Number(trimmed) : null;
}
