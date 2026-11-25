import { ALGO, fail, succeed } from './types';
import type { Outcome } from './types';

/**
 * Daily energy expenditure estimate, OpenHoop's own method (parity C).
 *
 * Active minutes: Keytel LR, Lambert EV, Lambert MI, et al. "Prediction of energy expenditure from heart rate
 * monitoring during submaximal exercise." J Sports Sci 2005;23(3):289-297. The sex-specific equations without
 * VO2max, in kJ/min:
 *   male:   -55.0969 + 0.6309 HR + 0.1988 W + 0.2017 A
 *   female: -20.4022 + 0.4472 HR - 0.1263 W + 0.0740 A
 *
 * All other minutes: resting energy from Mifflin MD, St Jeor ST, et al. "A new predictive equation for resting
 * energy expenditure in healthy individuals." Am J Clin Nutr 1990;51(2):241-247, in kcal/day:
 *   10 W + 6.25 H - 5 A + 5 (male) or - 161 (female)
 *
 * A minute is active when its mean heart rate reaches 30 % of heart rate reserve, the lower bound of "light"
 * intensity in Garber CE, et al. ACSM position stand, Med Sci Sports Exerc 2011;43(7):1334-1359. Keytel was fitted
 * on exercise, so it is not used below that bound, and an active minute never counts for less than rest.
 * Minutes without heart rate count as rest. For sex 'other' both equations are averaged.
 */

export type EnergySex = 'female' | 'male' | 'other';

export interface BodyProfile {
  weightKg: number;
  heightCm: number;
  sex: EnergySex;
  ageYears: number;
}

export interface ActiveHrBin {
  bpm: number;
  minutes: number;
}

export interface ActiveMinutes {
  totalMinutes: number;
  measuredMinutes: number;
  thresholdBpm: number;
  activeHr: ActiveHrBin[];
}

export interface EnergyEstimate {
  totalKcal: number;
  restingKcal: number;
  activeKcal: number;
  activeMinutes: number;
}

export const KJ_PER_KCAL = 4.184;
export const MINUTES_PER_DAY = 1440;
export const ACTIVE_HRR_FRACTION = 0.3;
export const ENERGY_MIN_MEASURED_MINUTES = 600;
export const ENERGY_AGE_RANGE = { min: 18, max: 100 } as const;

const KEYTEL = {
  male: { intercept: -55.0969, hr: 0.6309, weight: 0.1988, age: 0.2017 },
  female: { intercept: -20.4022, hr: 0.4472, weight: -0.1263, age: 0.074 },
} as const;

const MIFFLIN_SEX_CONSTANT = { male: 5, female: -161 } as const;

function bySex(sex: EnergySex, male: number, female: number): number {
  if (sex === 'male') return male;
  if (sex === 'female') return female;
  return (male + female) / 2;
}

export function restingKcalPerDay(body: BodyProfile): number {
  const base = 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.ageYears;
  return base + bySex(body.sex, MIFFLIN_SEX_CONSTANT.male, MIFFLIN_SEX_CONSTANT.female);
}

function keytelKj(coefficients: (typeof KEYTEL)['male' | 'female'], hr: number, body: BodyProfile): number {
  return coefficients.intercept + coefficients.hr * hr + coefficients.weight * body.weightKg + coefficients.age * body.ageYears;
}

export function keytelKcalPerMinute(hr: number, body: BodyProfile): number {
  return bySex(body.sex, keytelKj(KEYTEL.male, hr, body), keytelKj(KEYTEL.female, hr, body)) / KJ_PER_KCAL;
}

export function activeThresholdBpm(rest: number, max: number): number | null {
  if (!Number.isFinite(rest) || !Number.isFinite(max) || rest <= 0 || max <= rest) return null;
  return rest + ACTIVE_HRR_FRACTION * (max - rest);
}

export function activeMinutes(minuteHr: (number | null)[], rest: number, max: number): ActiveMinutes | null {
  const threshold = activeThresholdBpm(rest, max);
  if (threshold === null) return null;
  const bins = new Map<number, number>();
  let measured = 0;
  for (const h of minuteHr) {
    if (h === null || !Number.isFinite(h)) continue;
    measured++;
    if (h < threshold) continue;
    const bpm = Math.round(h);
    bins.set(bpm, (bins.get(bpm) ?? 0) + 1);
  }
  const activeHr = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([bpm, minutes]) => ({ bpm, minutes }));
  return { totalMinutes: minuteHr.length, measuredMinutes: measured, thresholdBpm: Math.round(threshold * 10) / 10, activeHr };
}

export function isValidBody(body: BodyProfile): boolean {
  return (
    Number.isFinite(body.weightKg) &&
    body.weightKg > 0 &&
    Number.isFinite(body.heightCm) &&
    body.heightCm > 0 &&
    Number.isFinite(body.ageYears) &&
    body.ageYears >= ENERGY_AGE_RANGE.min &&
    body.ageYears <= ENERGY_AGE_RANGE.max &&
    restingKcalPerDay(body) > 0
  );
}

export function dailyEnergy(minutes: ActiveMinutes | null, body: BodyProfile | null): Outcome<EnergyEstimate> {
  if (body === null || !isValidBody(body)) return fail('no-profile', ALGO.energy);
  if (minutes === null) return fail('missing-signal', ALGO.energy);
  if (minutes.measuredMinutes === 0 || minutes.totalMinutes <= 0) return fail('no-data', ALGO.energy);
  if (minutes.measuredMinutes < ENERGY_MIN_MEASURED_MINUTES) return fail('low-coverage', ALGO.energy);
  const restPerMinute = restingKcalPerDay(body) / MINUTES_PER_DAY;
  let activeKcal = 0;
  let active = 0;
  for (const bin of minutes.activeHr) {
    if (!Number.isFinite(bin.bpm) || !Number.isFinite(bin.minutes) || bin.minutes <= 0) continue;
    active += bin.minutes;
    activeKcal += bin.minutes * Math.max(0, keytelKcalPerMinute(bin.bpm, body) - restPerMinute);
  }
  const restingKcal = restPerMinute * minutes.totalMinutes;
  return succeed(
    { totalKcal: restingKcal + activeKcal, restingKcal, activeKcal, activeMinutes: active },
    minutes.measuredMinutes / minutes.totalMinutes,
    ALGO.energy,
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isActiveHrBin(value: unknown): value is ActiveHrBin {
  if (typeof value !== 'object' || value === null) return false;
  const bin = value as { bpm?: unknown; minutes?: unknown };
  return isFiniteNumber(bin.bpm) && bin.bpm > 0 && isFiniteNumber(bin.minutes) && bin.minutes >= 0;
}

export function parseActiveMinutes(value: unknown): ActiveMinutes | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { totalMinutes?: unknown; measuredMinutes?: unknown; thresholdBpm?: unknown; activeHr?: unknown };
  const { totalMinutes, measuredMinutes, thresholdBpm, activeHr } = candidate;
  if (!isFiniteNumber(totalMinutes) || totalMinutes < 0) return null;
  if (!isFiniteNumber(measuredMinutes) || measuredMinutes < 0 || measuredMinutes > totalMinutes) return null;
  if (!isFiniteNumber(thresholdBpm) || thresholdBpm <= 0) return null;
  if (!Array.isArray(activeHr) || !activeHr.every(isActiveHrBin)) return null;
  const binned = activeHr.reduce((sum: number, bin: ActiveHrBin) => sum + bin.minutes, 0);
  if (binned > measuredMinutes) return null;
  return { totalMinutes, measuredMinutes, thresholdBpm, activeHr: activeHr.map((bin: ActiveHrBin) => ({ bpm: bin.bpm, minutes: bin.minutes })) };
}
