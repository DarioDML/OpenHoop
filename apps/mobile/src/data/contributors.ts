import { PILLAR_MIN_NIGHTS } from '@openhoop/analytics';
import type { BodyMeasurement, DayRecord, StrengthSession } from '@openhoop/core';

import { sortMeasurements } from './bodyComposition';
import { addDays, mean } from './derived';
import { ageOnDay, healthspanPillars, latestVo2 } from './healthspanDerived';
import type { Profile } from './types';
import type { UserData } from './userData';

export const CONTRIBUTOR_IDS = ['sleepConsistency', 'sleepHours', 'zones13', 'zones45', 'strength', 'steps', 'vo2max', 'restingHr', 'leanMass'] as const;
export type ContributorId = (typeof CONTRIBUTOR_IDS)[number];

export function isContributorId(value: unknown): value is ContributorId {
  return typeof value === 'string' && (CONTRIBUTOR_IDS as readonly string[]).includes(value);
}

export const CONTRIBUTOR_WINDOW_DAYS = 28;
const WEEKS = CONTRIBUTOR_WINDOW_DAYS / 7;

export const SLEEP_TARGET_H = { adult: { low: 7, high: 9 }, older: { low: 7, high: 8 }, olderFrom: 65 } as const;
export const STEPS_TARGET = { younger: { low: 8000, high: 10000 }, older: { low: 6000, high: 8000 }, olderFrom: 60 } as const;
export const WHO_MODERATE_MIN = { low: 150, high: 300 } as const;
export const WHO_STRENGTH_DAYS = 2;

export type ContributorStatus = 'below' | 'met' | 'above';
export type TargetBasis = 'age' | 'adults' | 'ageSex' | 'own';

export type ContributorTarget = { kind: 'range'; low: number; high: number | null; basis: TargetBasis } | { kind: 'none' };

export type ContributorReason = 'needs-days' | 'needs-nights' | 'no-sessions' | 'no-entries' | 'no-body-fat' | 'no-vo2' | 'needs-baseline';
export type TargetReason = 'no-age' | 'no-sex' | 'other-sex' | 'age-out-of-range' | 'none-published';

export interface Contributor {
  id: ContributorId;
  value: number | null;
  minutes: number | null;
  measured: number;
  target: ContributorTarget;
  targetReason: TargetReason | null;
  status: ContributorStatus | null;
  reason: ContributorReason | null;
}

export interface ContributorInput {
  days: readonly DayRecord[];
  profile: Profile;
  sex: UserData['sex'];
  sessions: readonly StrengthSession[];
  bodyMeasurements: readonly BodyMeasurement[];
  today: string;
}

export function statusFor(value: number, target: ContributorTarget): ContributorStatus | null {
  if (target.kind === 'none') return null;
  if (value < target.low) return 'below';
  if (target.high !== null && value > target.high) return 'above';
  return 'met';
}

function windowDays(input: ContributorInput): DayRecord[] {
  const from = addDays(input.today, -CONTRIBUTOR_WINDOW_DAYS);
  return input.days.filter((day) => day.day >= from && day.day < input.today);
}

function build(id: ContributorId, value: number | null, measured: number, target: ContributorTarget, targetReason: TargetReason | null, reason: ContributorReason | null, minutes: number | null = null): Contributor {
  return { id, value, minutes, measured, target, targetReason, status: value === null ? null : statusFor(value, target), reason: value === null ? reason : null };
}

const NO_TARGET: ContributorTarget = { kind: 'none' };

function nightly(id: ContributorId, values: Array<number | null>, target: ContributorTarget, targetReason: TargetReason | null): Contributor {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const value = present.length >= PILLAR_MIN_NIGHTS ? mean(present) : null;
  return build(id, value, present.length, target, targetReason, 'needs-nights');
}

function sleepTarget(age: number | null): ContributorTarget {
  if (age !== null && age >= SLEEP_TARGET_H.olderFrom) return { kind: 'range', low: SLEEP_TARGET_H.older.low * 3600, high: SLEEP_TARGET_H.older.high * 3600, basis: 'age' };
  return { kind: 'range', low: SLEEP_TARGET_H.adult.low * 3600, high: SLEEP_TARGET_H.adult.high * 3600, basis: age === null ? 'adults' : 'age' };
}

function worn(day: DayRecord): boolean {
  return day.heartRate.avg !== null;
}

function zoneMinutesPerWeek(id: ContributorId, days: readonly DayRecord[], zones: readonly number[], target: ContributorTarget, targetReason: TargetReason | null): Contributor {
  const measured = days.filter(worn);
  if (measured.length < PILLAR_MIN_NIGHTS) return build(id, null, measured.length, target, targetReason, 'needs-days');
  const seconds = measured.reduce((sum, day) => sum + zones.reduce((acc, zone) => acc + (day.zoneSeconds[zone] ?? 0), 0), 0);
  return build(id, (seconds / 60 / measured.length) * 7, measured.length, target, targetReason, 'needs-days');
}

function strength(input: ContributorInput): Contributor {
  const from = addDays(input.today, -CONTRIBUTOR_WINDOW_DAYS);
  const done = input.sessions.filter((s) => s.endedAt !== null && s.day >= from && s.day < input.today);
  const target: ContributorTarget = { kind: 'range', low: WHO_STRENGTH_DAYS, high: null, basis: 'adults' };
  if (done.length === 0) return build('strength', null, 0, target, null, 'no-sessions');
  const activeDays = new Set(done.map((s) => s.day)).size;
  const seconds = done.reduce((sum, s) => sum + Math.max(0, (s.endedAt ?? s.startedAt) - s.startedAt), 0);
  return build('strength', activeDays / WEEKS, activeDays, target, null, 'no-sessions', seconds / 60 / WEEKS);
}

function steps(days: readonly DayRecord[], age: number | null): Contributor {
  const target: ContributorTarget =
    age === null
      ? NO_TARGET
      : age >= STEPS_TARGET.olderFrom
        ? { kind: 'range', low: STEPS_TARGET.older.low, high: STEPS_TARGET.older.high, basis: 'age' }
        : { kind: 'range', low: STEPS_TARGET.younger.low, high: STEPS_TARGET.younger.high, basis: 'age' };
  const values = days.filter(worn).map((day) => day.steps);
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const value = present.length >= PILLAR_MIN_NIGHTS ? mean(present) : null;
  return build('steps', value, present.length, target, age === null ? 'no-age' : null, 'needs-days');
}

function vo2(input: ContributorInput): Contributor {
  const view = latestVo2(input.days, input.profile, input.sex);
  if (!view.result.ok) return build('vo2max', null, 0, NO_TARGET, null, 'no-vo2');
  const { vo2max, inputs } = view.result.value;
  if (view.norm === null) return build('vo2max', vo2max, inputs.nights, NO_TARGET, view.normReason ?? 'no-age', null);
  const { mean: avg, sd } = view.norm.norm;
  return build('vo2max', vo2max, inputs.nights, { kind: 'range', low: avg - sd, high: avg + sd, basis: 'ageSex' }, null, null);
}

function restingHr(input: ContributorInput): Contributor {
  const { rhr } = healthspanPillars(input.days, input.profile, input.sex);
  if (rhr === null) return build('restingHr', null, 0, NO_TARGET, null, 'needs-baseline');
  const target: ContributorTarget = { kind: 'range', low: rhr.baselineMean - rhr.baselineSd, high: rhr.baselineMean + rhr.baselineSd, basis: 'own' };
  return build('restingHr', rhr.recentMean, rhr.recentCount, target, null, null);
}

function leanMass(measurements: readonly BodyMeasurement[]): Contributor {
  const sorted = sortMeasurements(measurements);
  if (sorted.length === 0) return build('leanMass', null, 0, NO_TARGET, 'none-published', 'no-entries');
  const latest = [...sorted].reverse().find((m) => m.bodyFatPct !== null);
  if (latest === undefined || latest.bodyFatPct === null) return build('leanMass', null, 0, NO_TARGET, 'none-published', 'no-body-fat');
  return build('leanMass', latest.weightKg * (1 - latest.bodyFatPct / 100), 1, NO_TARGET, 'none-published', null);
}

export function bodyAgeContributors(input: ContributorInput): Contributor[] {
  const days = windowDays(input);
  const age = ageOnDay(input.profile, input.today);
  return CONTRIBUTOR_IDS.map((id) => {
    switch (id) {
      case 'sleepConsistency':
        return nightly(id, days.map((d) => d.sleep.consistency.value), NO_TARGET, 'none-published');
      case 'sleepHours':
        return nightly(id, days.map((d) => d.sleep.asleepS), sleepTarget(age), null);
      case 'zones13':
        return zoneMinutesPerWeek(id, days, [1, 2, 3], { kind: 'range', low: WHO_MODERATE_MIN.low, high: WHO_MODERATE_MIN.high, basis: 'adults' }, null);
      case 'zones45':
        return zoneMinutesPerWeek(id, days, [4, 5], NO_TARGET, 'none-published');
      case 'strength':
        return strength(input);
      case 'steps':
        return steps(days, age);
      case 'vo2max':
        return vo2(input);
      case 'restingHr':
        return restingHr(input);
      case 'leanMass':
        return leanMass(input.bodyMeasurements);
    }
  });
}

export function contributorById(input: ContributorInput, id: ContributorId): Contributor {
  const found = bodyAgeContributors(input).find((c) => c.id === id);
  if (found === undefined) throw new Error(`unknown contributor ${id}`);
  return found;
}

export type ScaleZone = 'below' | 'target' | 'above';

export interface ContributorScale {
  segments: Array<{ from: number; to: number; zone: ScaleZone }>;
  position: number | null;
}

export function contributorScale(c: Contributor): ContributorScale | null {
  if (c.target.kind === 'none') return null;
  const { low, high } = c.target;
  const clamp = (f: number): number => Math.min(1, Math.max(0, f));
  if (high === null) {
    const max = low * 2;
    return {
      segments: [
        { from: 0, to: 0.5, zone: 'below' },
        { from: 0.5, to: 1, zone: 'target' },
      ],
      position: c.value === null || max <= 0 ? null : clamp(c.value / max),
    };
  }
  const width = Math.max(high - low, Number.EPSILON);
  const min = low - width;
  return {
    segments: [
      { from: 0, to: 1 / 3, zone: 'below' },
      { from: 1 / 3, to: 2 / 3, zone: 'target' },
      { from: 2 / 3, to: 1, zone: 'above' },
    ],
    position: c.value === null ? null : clamp((c.value - min) / (width * 3)),
  };
}
