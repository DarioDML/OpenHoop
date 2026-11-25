/**
 * Healthspan estimates, OpenHoop's own methods (parity C). No combined score and no "body age".
 *
 * VO2 max: Uth N, Sørensen H, Overgaard K, Pedersen PK. "Estimation of VO2max from the ratio between HRmax and
 * HRrest - the Heart Rate Ratio Method." Eur J Appl Physiol 2004;91(1):111-115.
 *   VO2max (mL/kg/min) ≈ 15.3 × HRmax / HRrest
 * Fitted on 46 well-trained men aged 21-51. SEE 2.7 mL/kg/min with measured HRmax, 4.7 with age-predicted HRmax.
 *
 * HRmax without a setting: Tanaka H, Monahan KD, Seals DR. "Age-predicted maximal heart rate revisited."
 * J Am Coll Cardiol 2001;37(1):153-156. HRmax = 208 - 0.7 × age.
 *
 * Norms: Loe H, Rognmo Ø, Saltin B, Wisløff U. "Aerobic capacity reference data in 3816 healthy men and women
 * 20-90 years." PLoS One 2013;8(5):e64319, Table 2 (treadmill VO2max, mean ± SD per sex and age group).
 *
 * Sleep reference: Watson NF, et al. "Recommended amount of sleep for a healthy adult." Sleep 2015;38(6):843-844
 * (7 hours or more per night).
 *
 * Activity reference: Bull FC, et al. "World Health Organization 2020 guidelines on physical activity and sedentary
 * behaviour." Br J Sports Med 2020;54(24):1451-1462 (150-300 minutes of moderate activity per week).
 */

export const UTH_FACTOR = 15.3;
export const UTH_SEE_ML_KG_MIN = { setting: 2.7, age: 4.7 } as const;
export const VO2_WINDOW_NIGHTS = 14;
export const VO2_MIN_NIGHTS = 5;
export const ADULT_AGE_RANGE = { min: 18, max: 100 } as const;
export const RESTING_HR_RANGE = { min: 25, max: 120 } as const;
export const MAX_HR_RANGE = { min: 100, max: 230 } as const;
export const VO2_PLAUSIBLE_RANGE = { min: 10, max: 95 } as const;

export type MaxHrSource = 'setting' | 'age';
export type Vo2Reason = 'no-resting-hr' | 'no-max-hr' | 'out-of-range';

export interface Vo2Inputs {
  restingHr: number;
  nights: number;
  maxHr: number;
  maxHrSource: MaxHrSource;
  ageYears: number | null;
}

export interface Vo2Estimate {
  vo2max: number;
  seeMlKgMin: number;
  inputs: Vo2Inputs;
}

export type Vo2Result = { ok: true; value: Vo2Estimate } | { ok: false; reason: Vo2Reason; nights: number };

export interface Vo2Request {
  restingHrs: ReadonlyArray<number | null>;
  maxHrSetting: number | null;
  ageYears: number | null;
}

function finite(values: ReadonlyArray<number | null>): number[] {
  return values.filter((v): v is number => v !== null && Number.isFinite(v));
}

export function median(values: ReadonlyArray<number | null>): number | null {
  const sorted = finite(values).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
}

export function meanOf(values: ReadonlyArray<number | null>): number | null {
  const present = finite(values);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

export function sdOf(values: ReadonlyArray<number | null>): number | null {
  const present = finite(values);
  const m = meanOf(present);
  if (present.length < 2 || m === null) return null;
  return Math.sqrt(present.reduce((sum, v) => sum + (v - m) ** 2, 0) / (present.length - 1));
}

export function isAdultAge(ageYears: number | null): ageYears is number {
  return ageYears !== null && Number.isFinite(ageYears) && ageYears >= ADULT_AGE_RANGE.min && ageYears <= ADULT_AGE_RANGE.max;
}

export function tanakaMaxHr(ageYears: number): number {
  return 208 - 0.7 * ageYears;
}

export function uthVo2max(maxHr: number, restingHr: number): number {
  return (UTH_FACTOR * maxHr) / restingHr;
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

export function estimateVo2max(request: Vo2Request): Vo2Result {
  const nights = finite(request.restingHrs).filter((v) => inRange(v, RESTING_HR_RANGE));
  if (nights.length < VO2_MIN_NIGHTS) return { ok: false, reason: 'no-resting-hr', nights: nights.length };
  const restingHr = median(nights);
  if (restingHr === null) return { ok: false, reason: 'no-resting-hr', nights: 0 };
  const ageYears = isAdultAge(request.ageYears) ? request.ageYears : null;
  const setting = request.maxHrSetting;
  let maxHr: number;
  let maxHrSource: MaxHrSource;
  if (setting !== null && inRange(setting, MAX_HR_RANGE)) {
    maxHr = setting;
    maxHrSource = 'setting';
  } else if (ageYears !== null) {
    maxHr = tanakaMaxHr(ageYears);
    maxHrSource = 'age';
  } else {
    return { ok: false, reason: 'no-max-hr', nights: nights.length };
  }
  if (maxHr <= restingHr) return { ok: false, reason: 'out-of-range', nights: nights.length };
  const vo2max = uthVo2max(maxHr, restingHr);
  if (!inRange(vo2max, VO2_PLAUSIBLE_RANGE)) return { ok: false, reason: 'out-of-range', nights: nights.length };
  return {
    ok: true,
    value: { vo2max, seeMlKgMin: UTH_SEE_ML_KG_MIN[maxHrSource], inputs: { restingHr, nights: nights.length, maxHr, maxHrSource, ageYears } },
  };
}

export type NormSex = 'female' | 'male';

export interface Vo2Norm {
  sex: NormSex;
  ageFrom: number;
  ageTo: number | null;
  mean: number;
  sd: number;
  n: number;
}

export const LOE_2013_NORMS: readonly Vo2Norm[] = [
  { sex: 'male', ageFrom: 20, ageTo: 29, mean: 54.4, sd: 8.4, n: 199 },
  { sex: 'male', ageFrom: 30, ageTo: 39, mean: 49.1, sd: 7.5, n: 324 },
  { sex: 'male', ageFrom: 40, ageTo: 49, mean: 47.2, sd: 7.7, n: 526 },
  { sex: 'male', ageFrom: 50, ageTo: 59, mean: 42.6, sd: 7.4, n: 466 },
  { sex: 'male', ageFrom: 60, ageTo: 69, mean: 39.2, sd: 6.7, n: 300 },
  { sex: 'male', ageFrom: 70, ageTo: null, mean: 35.3, sd: 6.5, n: 76 },
  { sex: 'female', ageFrom: 20, ageTo: 29, mean: 43.0, sd: 7.7, n: 215 },
  { sex: 'female', ageFrom: 30, ageTo: 39, mean: 40.0, sd: 6.8, n: 359 },
  { sex: 'female', ageFrom: 40, ageTo: 49, mean: 38.4, sd: 6.9, n: 493 },
  { sex: 'female', ageFrom: 50, ageTo: 59, mean: 34.4, sd: 5.7, n: 428 },
  { sex: 'female', ageFrom: 60, ageTo: 69, mean: 31.1, sd: 5.1, n: 240 },
  { sex: 'female', ageFrom: 70, ageTo: null, mean: 28.3, sd: 5.2, n: 53 },
];

export function vo2Norm(sex: NormSex, ageYears: number): Vo2Norm | null {
  if (!Number.isFinite(ageYears)) return null;
  return LOE_2013_NORMS.find((norm) => norm.sex === sex && ageYears >= norm.ageFrom && (norm.ageTo === null || ageYears < norm.ageTo + 1)) ?? null;
}

export type RangePosition = 'below' | 'within' | 'above';

export function positionInRange(value: number, mean: number, sd: number): RangePosition {
  if (value > mean + sd) return 'above';
  if (value < mean - sd) return 'below';
  return 'within';
}

export interface NormComparison {
  norm: Vo2Norm;
  position: RangePosition;
  deltaSd: number;
}

export function compareVo2ToNorm(vo2max: number, sex: NormSex, ageYears: number): NormComparison | null {
  const norm = vo2Norm(sex, ageYears);
  if (norm === null || !Number.isFinite(vo2max)) return null;
  return { norm, position: positionInRange(vo2max, norm.mean, norm.sd), deltaSd: (vo2max - norm.mean) / norm.sd };
}

export const SLEEP_REFERENCE_S = 7 * 3600;
export const PILLAR_MIN_NIGHTS = 4;

export interface SleepNightInput {
  asleepS: number | null;
  needS: number | null;
  consistency: number | null;
}

export interface SleepPillar {
  nights: number;
  meanAsleepS: number;
  meanNeedS: number | null;
  needRatio: number | null;
  meanConsistency: number | null;
  meetsReference: boolean;
}

export function sleepPillar(nights: readonly SleepNightInput[]): SleepPillar | null {
  const slept = nights.filter((n): n is SleepNightInput & { asleepS: number } => n.asleepS !== null && Number.isFinite(n.asleepS) && n.asleepS > 0);
  if (slept.length < PILLAR_MIN_NIGHTS) return null;
  const meanAsleepS = meanOf(slept.map((n) => n.asleepS)) ?? 0;
  const paired = slept.filter((n): n is SleepNightInput & { asleepS: number; needS: number } => n.needS !== null && Number.isFinite(n.needS) && n.needS > 0);
  const enoughNeed = paired.length >= PILLAR_MIN_NIGHTS;
  const meanNeedS = enoughNeed ? meanOf(paired.map((n) => n.needS)) : null;
  const needRatio = enoughNeed ? paired.reduce((sum, n) => sum + n.asleepS, 0) / paired.reduce((sum, n) => sum + n.needS, 0) : null;
  const consistency = finite(slept.map((n) => n.consistency));
  return {
    nights: slept.length,
    meanAsleepS,
    meanNeedS,
    needRatio,
    meanConsistency: consistency.length >= PILLAR_MIN_NIGHTS ? meanOf(consistency) : null,
    meetsReference: meanAsleepS >= SLEEP_REFERENCE_S,
  };
}

export const RECENT_NIGHTS = 7;
export const BASELINE_NIGHTS = 30;
export const MIN_RECENT_NIGHTS = 3;

export interface BaselineComparison {
  recentMean: number;
  recentCount: number;
  baselineMean: number;
  baselineSd: number;
  baselineCount: number;
  position: RangePosition;
}

export function compareToOwnBaseline(baseline: ReadonlyArray<number | null>, recent: ReadonlyArray<number | null>): BaselineComparison | null {
  const recentValues = finite(recent);
  const baselineValues = finite(baseline);
  if (recentValues.length < MIN_RECENT_NIGHTS || baselineValues.length < PILLAR_MIN_NIGHTS) return null;
  const recentMean = meanOf(recentValues);
  const baselineMean = meanOf(baselineValues);
  const baselineSd = sdOf(baselineValues);
  if (recentMean === null || baselineMean === null || baselineSd === null) return null;
  return {
    recentMean,
    recentCount: recentValues.length,
    baselineMean,
    baselineSd,
    baselineCount: baselineValues.length,
    position: positionInRange(recentMean, baselineMean, baselineSd),
  };
}

export const WHO_WEEKLY_MINUTES = { low: 150, high: 300 } as const;
export const WEEK_DAYS = 7;
export const ACTIVITY_FULL_DAY_MINUTES = 600;

export interface ActivityDayInput {
  activeMinutes: number;
  measuredMinutes: number;
}

export type ActivityStatus = 'above-range' | 'in-range' | 'below' | 'incomplete';

export interface ActivityPillar {
  activeMinutes: number;
  measuredDays: number;
  fullDays: number;
  status: ActivityStatus;
}

export function activityPillar(week: ReadonlyArray<ActivityDayInput | null>): ActivityPillar | null {
  const measured = week.filter((d): d is ActivityDayInput => d !== null && Number.isFinite(d.activeMinutes) && d.activeMinutes >= 0 && d.measuredMinutes > 0);
  if (measured.length === 0) return null;
  const activeMinutes = measured.reduce((sum, d) => sum + d.activeMinutes, 0);
  const fullDays = measured.filter((d) => d.measuredMinutes >= ACTIVITY_FULL_DAY_MINUTES).length;
  let status: ActivityStatus;
  if (activeMinutes > WHO_WEEKLY_MINUTES.high) status = 'above-range';
  else if (activeMinutes >= WHO_WEEKLY_MINUTES.low) status = 'in-range';
  else if (fullDays >= WEEK_DAYS) status = 'below';
  else status = 'incomplete';
  return { activeMinutes, measuredDays: measured.length, fullDays, status };
}
