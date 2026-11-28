import {
  BASELINE_NIGHTS,
  RECENT_NIGHTS,
  VO2_WINDOW_NIGHTS,
  WEEK_DAYS,
  activityPillar,
  compareToOwnBaseline,
  compareVo2ToNorm,
  estimateVo2max,
  isAdultAge,
  parseActiveMinutes,
  sleepPillar,
} from '@openhoop/analytics';
import type { ActivityDayInput, ActivityPillar, BaselineComparison, NormComparison, SleepPillar, Vo2Result } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import { addDays } from './derived';
import { ageOn } from './profile';
import type { Profile } from './types';
import type { UserData } from './userData';

export type { BaselineComparison, NormComparison } from '@openhoop/analytics';
export { PILLAR_MIN_NIGHTS, VO2_MIN_NIGHTS, VO2_WINDOW_NIGHTS } from '@openhoop/analytics';

export const PILLAR_IDS = ['sleep', 'recovery', 'activity', 'fitness'] as const;
export type PillarId = (typeof PILLAR_IDS)[number];

export function isPillarId(value: unknown): value is PillarId {
  return typeof value === 'string' && (PILLAR_IDS as readonly string[]).includes(value);
}

export type NormReason = 'no-sex' | 'other-sex' | 'no-age' | 'age-out-of-range';

export interface Vo2View {
  day: string | null;
  result: Vo2Result;
  norm: NormComparison | null;
  normReason: NormReason | null;
}

export function ageOnDay(profile: Profile, day: string): number | null {
  const age = ageOn(profile, day);
  return age !== null && isAdultAge(age) ? age : null;
}

type DayIndex = ReadonlyMap<string, DayRecord>;

function indexDays(days: readonly DayRecord[]): DayIndex {
  return new Map(days.map((d) => [d.day, d]));
}

function windowOf(byDay: DayIndex, endDay: string, count: number, offset = 0): Array<DayRecord | null> {
  return Array.from({ length: count }, (_, i) => byDay.get(addDays(endDay, -(offset + count - 1 - i))) ?? null);
}

function restingHrs(window: ReadonlyArray<DayRecord | null>): Array<number | null> {
  return window.map((d) => d?.restingHr.value ?? null);
}

function normFor(vo2max: number, sex: UserData['sex'], ageYears: number | null): Pick<Vo2View, 'norm' | 'normReason'> {
  if (sex === null) return { norm: null, normReason: 'no-sex' };
  if (sex === 'other') return { norm: null, normReason: 'other-sex' };
  if (ageYears === null) return { norm: null, normReason: 'no-age' };
  const norm = compareVo2ToNorm(vo2max, sex, ageYears);
  return norm === null ? { norm: null, normReason: 'age-out-of-range' } : { norm, normReason: null };
}

function vo2At(byDay: DayIndex, endDay: string, profile: Profile, sex: UserData['sex']): Vo2View {
  const ageYears = ageOnDay(profile, endDay);
  const result = estimateVo2max({
    restingHrs: restingHrs(windowOf(byDay, endDay, VO2_WINDOW_NIGHTS)),
    maxHrSetting: profile.maxHeartRate,
    ageYears,
  });
  if (!result.ok) return { day: endDay, result, norm: null, normReason: null };
  return { day: endDay, result, ...normFor(result.value.vo2max, sex, ageYears) };
}

export function latestDay(days: readonly DayRecord[]): string | null {
  return days[days.length - 1]?.day ?? null;
}

export function latestVo2(days: readonly DayRecord[], profile: Profile, sex: UserData['sex']): Vo2View {
  const end = latestDay(days);
  if (end === null) return { day: null, result: { ok: false, reason: 'no-resting-hr', nights: 0 }, norm: null, normReason: null };
  return vo2At(indexDays(days), end, profile, sex);
}

export interface Vo2Trend {
  points: Array<number | null>;
  firstDay: string | null;
  lastDay: string | null;
  measured: number;
}

export const VO2_TREND_DAYS = 90;

export function vo2Trend(days: readonly DayRecord[], profile: Profile, count = VO2_TREND_DAYS): Vo2Trend {
  const end = latestDay(days);
  if (end === null) return { points: [], firstDay: null, lastDay: null, measured: 0 };
  const byDay = indexDays(days);
  const points = Array.from({ length: count }, (_, i) => {
    const view = vo2At(byDay, addDays(end, -(count - 1 - i)), profile, null);
    return view.result.ok ? view.result.value.vo2max : null;
  });
  return { points, firstDay: addDays(end, -(count - 1)), lastDay: end, measured: points.filter((p) => p !== null).length };
}

export interface HealthspanPillars {
  endDay: string | null;
  sleep: SleepPillar | null;
  hrv: BaselineComparison | null;
  rhr: BaselineComparison | null;
  activity: ActivityPillar | null;
  fitness: Vo2View;
}

function activityInput(day: DayRecord | null): ActivityDayInput | null {
  const minutes = parseActiveMinutes(day?.activeMinutes ?? null);
  if (minutes === null) return null;
  return { activeMinutes: minutes.activeHr.reduce((sum, bin) => sum + bin.minutes, 0), measuredMinutes: minutes.measuredMinutes };
}

export function healthspanPillars(days: readonly DayRecord[], profile: Profile, sex: UserData['sex']): HealthspanPillars {
  const endDay = latestDay(days);
  const fitness = latestVo2(days, profile, sex);
  if (endDay === null) return { endDay, sleep: null, hrv: null, rhr: null, activity: null, fitness };
  const byDay = indexDays(days);
  const recent = windowOf(byDay, endDay, RECENT_NIGHTS);
  const baseline = windowOf(byDay, endDay, BASELINE_NIGHTS, RECENT_NIGHTS);
  return {
    endDay,
    sleep: sleepPillar(recent.map((d) => ({ asleepS: d?.sleep.asleepS ?? null, needS: d?.sleep.need.value ?? null, consistency: d?.sleep.consistency.value ?? null }))),
    hrv: compareToOwnBaseline(
      baseline.map((d) => d?.hrv.value ?? null),
      recent.map((d) => d?.hrv.value ?? null),
    ),
    rhr: compareToOwnBaseline(restingHrs(baseline), restingHrs(recent)),
    activity: activityPillar(windowOf(byDay, endDay, WEEK_DAYS).map(activityInput)),
    fitness,
  };
}

export const FITNESS_LEVELS = ['poor', 'fair', 'good', 'excellent', 'superior'] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

export const QUINTILE_Z = [-0.8416212, -0.2533471, 0.2533471, 0.8416212] as const;

export interface FitnessLevelView {
  level: FitnessLevel;
  cuts: [number, number, number, number];
  norm: NormComparison['norm'];
}

export function fitnessLevel(vo2max: number, norm: NormComparison['norm']): FitnessLevelView {
  const at = (z: number): number => norm.mean + z * norm.sd;
  const [z1, z2, z3, z4] = QUINTILE_Z;
  const cuts: FitnessLevelView['cuts'] = [at(z1), at(z2), at(z3), at(z4)];
  const index = cuts.filter((cut) => vo2max >= cut).length;
  return { level: FITNESS_LEVELS[index] ?? 'superior', cuts, norm };
}

export function scalePosition(vo2max: number, view: FitnessLevelView): number {
  const [c1, c2, c3, c4] = view.cuts;
  const edges = [c1 - (c2 - c1), c1, c2, c3, c4, c4 + (c4 - c3)];
  const segments = edges.length - 1;
  for (let i = 0; i < segments; i++) {
    const lo = edges[i] ?? 0;
    const hi = edges[i + 1] ?? lo;
    if (vo2max < hi || i === segments - 1) {
      const within = hi > lo ? Math.min(1, Math.max(0, (vo2max - lo) / (hi - lo))) : 0;
      return (i + within) / segments;
    }
  }
  return 1;
}
