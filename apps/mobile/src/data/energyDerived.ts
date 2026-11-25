import { ENERGY_AGE_RANGE, dailyEnergy, parseActiveMinutes, windowEnergy } from '@openhoop/analytics';
import type { ActiveMinutes, BodyProfile, EnergyEstimate } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import type { Profile } from './types';
import type { UserData } from './userData';

export interface CaloriesView {
  estimate: EnergyEstimate | null;
  reason: string | null;
  coverage: number | null;
  thresholdBpm: number | null;
}

function yearOfDay(day: string): number | null {
  const year = Number.parseInt(day.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export function bodyProfileFor(userData: UserData, profile: Profile, year: number): BodyProfile | null {
  const { weightKg, heightCm, sex } = userData;
  const { birthYear } = profile;
  if (weightKg === null || heightCm === null || sex === null || birthYear === null) return null;
  const ageYears = year - birthYear;
  if (ageYears < ENERGY_AGE_RANGE.min || ageYears > ENERGY_AGE_RANGE.max) return null;
  return { weightKg, heightCm, sex, ageYears };
}

export function caloriesForDay(day: DayRecord, userData: UserData, profile: Profile): CaloriesView {
  const year = yearOfDay(day.day);
  const body = year === null ? null : bodyProfileFor(userData, profile, year);
  const minutes = parseActiveMinutes(day.activeMinutes);
  const outcome = dailyEnergy(minutes, body);
  const thresholdBpm = minutes?.thresholdBpm ?? null;
  if (!outcome.ok) return { estimate: null, reason: outcome.reason, coverage: null, thresholdBpm };
  return { estimate: outcome.value, reason: null, coverage: outcome.coverage, thresholdBpm };
}

export function caloriesForActivity(minutes: ActiveMinutes | null, start: number, userData: UserData, profile: Profile): CaloriesView {
  const body = bodyProfileFor(userData, profile, new Date(start * 1000).getUTCFullYear());
  const outcome = windowEnergy(minutes, body);
  const thresholdBpm = minutes?.thresholdBpm ?? null;
  if (!outcome.ok) return { estimate: null, reason: outcome.reason, coverage: null, thresholdBpm };
  return { estimate: outcome.value, reason: null, coverage: outcome.coverage, thresholdBpm };
}
