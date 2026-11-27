import type { ZoneFloors } from './zones';

export interface Profile {
  maxHr: number | null;
  birthYear: number | null;
  restingHr: number | null;
  zoneFloors?: ZoneFloors | null;
}

export interface Calibration {
  debtFactorLow: number;
  debtFactorHigh: number;
  debtRemSwitchMs: number;
  debtCapMs: number;
  strainNeedScaleMs: number;
  strainNeedExponent: number;
  strainNeedRate: number;
  sleepBaselineMs: number;
  sleepScoreIntercept: number;
  sleepScoreRatioWeight: number;
  sleepScoreRatioExponent: number;
  sleepScoreConsistencyWeight: number;
  sleepScoreConsistencyNeutral: number;
  hrvPriorWeight: number;
  hrvPriorMs: number;
  hrvWeight: number;
  sleepWeight: number;
  rhrWeight: number;
  rhrReferenceBpm: number;
  rhrOffsetBpm: number;
  loadScale: number;
  loadExponent: number;
  loadRate: number;
  loadPivotBpm: number;
  loadThresholdBpm: number;
  loadReferenceRestBpm: number;
  loadReferenceMaxBpm: number;
}

export const DEFAULT_CALIBRATION: Readonly<Calibration> = Object.freeze({
  debtFactorLow: 1 / 2,
  debtFactorHigh: 9 / 14,
  debtRemSwitchMs: 6_800_000,
  debtCapMs: 7_668_000,
  strainNeedScaleMs: 25995.162137,
  strainNeedExponent: 0.728090984,
  strainNeedRate: 0.167421361,
  sleepBaselineMs: 27_834_000,
  sleepScoreIntercept: 94.81929,
  sleepScoreRatioWeight: 4.67893,
  sleepScoreRatioExponent: -2.8839,
  sleepScoreConsistencyWeight: 0.23588,
  sleepScoreConsistencyNeutral: 80,
  hrvPriorWeight: 5.0265,
  hrvPriorMs: 103.2555,
  hrvWeight: 1.066,
  sleepWeight: 0.07735,
  rhrWeight: 0.05156,
  rhrReferenceBpm: 59.08321,
  rhrOffsetBpm: 4.6,
  loadScale: 0.78115,
  loadExponent: 0.40855,
  loadRate: 0.065,
  loadPivotBpm: 100,
  loadThresholdBpm: 94,
  loadReferenceRestBpm: 57,
  loadReferenceMaxBpm: 189,
});

export const FALLBACK_MAX_HR = 190;

export function effectiveMaxHr(profile: Profile, year: number): number {
  if (profile.maxHr !== null && Number.isFinite(profile.maxHr) && profile.maxHr > 0) return profile.maxHr;
  if (profile.birthYear !== null && Number.isFinite(profile.birthYear) && profile.birthYear <= year) {
    return 208 - 0.7 * (year - profile.birthYear);
  }
  return FALLBACK_MAX_HR;
}
