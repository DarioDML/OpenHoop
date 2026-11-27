import type { DayRecord, LabResult } from '@openhoop/core';

import { LOAD_DAY_MIN, READINESS_HIGH, currentRun } from './activityDerived';
import { latestFitnessAge, latestPhenoAge } from './bodyAgeDerived';
import { visibleReadiness } from './derived';
import type { Profile } from './types';
import type { UserData } from './userData';

export type BodyAgeSummary =
  | { kind: 'value'; value: number; bound: 'exact' | 'below' | 'above'; ageYears: number | null; source: 'labs' | 'fitness' }
  | { kind: 'missing'; reason: 'noAge' | 'needsNights' | 'noSex' | 'none' };

export function bodyAgeSummary(days: readonly DayRecord[], labResults: readonly LabResult[], profile: Profile, sex: UserData['sex']): BodyAgeSummary {
  const pheno = latestPhenoAge(labResults, profile);
  if (pheno.result.ok) return { kind: 'value', value: pheno.result.value.phenoAge, bound: 'exact', ageYears: pheno.ageYears, source: 'labs' };
  const fitness = latestFitnessAge(days, profile, sex);
  if (fitness.fitness !== null) {
    const { point } = fitness.fitness;
    const bound = point.kind === 'age' ? 'exact' : point.kind === 'younger-than' ? 'below' : 'above';
    return { kind: 'value', value: point.age, bound, ageYears: fitness.ageYears, source: 'fitness' };
  }
  if (profile.birthYear === null) return { kind: 'missing', reason: 'noAge' };
  if (!fitness.vo2.ok) return { kind: 'missing', reason: 'needsNights' };
  if (fitness.reason === 'no-sex') return { kind: 'missing', reason: 'noSex' };
  return { kind: 'missing', reason: 'none' };
}

export const SLEEP_STREAK_MIN = 70;
export const READY_STREAK_MIN = READINESS_HIGH;

export interface Streaks {
  loadDays: number;
  highReadiness: number;
  sleepScore: number;
}

export function streaks(days: readonly DayRecord[]): Streaks {
  return {
    loadDays: currentRun(
      days,
      (d) => {
        const value = d.load.value ?? d.loadSoFar ?? null;
        return value === null ? null : value >= LOAD_DAY_MIN;
      },
      true,
    ),
    highReadiness: currentRun(days, (d) => {
      const value = visibleReadiness(d).value;
      return value === null ? null : value >= READY_STREAK_MIN;
    }),
    sleepScore: currentRun(days, (d) => {
      const value = d.sleep.score.value;
      return value === null ? null : value >= SLEEP_STREAK_MIN;
    }),
  };
}
