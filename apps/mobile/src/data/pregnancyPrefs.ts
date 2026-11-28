import type { CycleData } from '@openhoop/core';

import { isRecord, type Json } from '@/lib/json';

export interface PregnancyPrefs {
  hideLoadTargets: boolean;
  pauseWeightGoals: boolean;
}

export function defaultPregnancyPrefs(): PregnancyPrefs {
  return { hideLoadTargets: false, pauseWeightGoals: false };
}

export function parsePregnancyPrefs(value: Json | undefined): PregnancyPrefs {
  if (!isRecord(value)) return defaultPregnancyPrefs();
  return { hideLoadTargets: value.hideLoadTargets === true, pauseWeightGoals: value.pauseWeightGoals === true };
}

export function loadTargetsHidden(prefs: PregnancyPrefs, cycle: Pick<CycleData, 'pregnancy'>): boolean {
  return cycle.pregnancy !== null && prefs.hideLoadTargets;
}

export function weightGoalsPaused(prefs: PregnancyPrefs, cycle: Pick<CycleData, 'pregnancy'>): boolean {
  return cycle.pregnancy !== null && prefs.pauseWeightGoals;
}

export type Trimester = 1 | 2 | 3;

export const TRIMESTER_WEEKS = { second: 14, third: 28 } as const;

export function trimesterOf(weeks: number): Trimester {
  if (weeks >= TRIMESTER_WEEKS.third) return 3;
  return weeks >= TRIMESTER_WEEKS.second ? 2 : 1;
}
