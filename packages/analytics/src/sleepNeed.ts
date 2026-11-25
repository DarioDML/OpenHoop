import { DEFAULT_CALIBRATION } from './calibration';
import type { Calibration } from './calibration';
import { ALGO, fail, succeed } from './types';
import type { Outcome } from './types';

export const CONSISTENCY_NIGHTS = 4;
export const CONSISTENCY_MIN_NIGHTS = 2;
export const CONSISTENCY_MINUTES_PER_POINT = 1.8;

const DAY_S = 86_400;
const DAY_MIN = 1440;

export function debtMs(needMs: number, asleepMs: number, remMs: number | null, c: Calibration = DEFAULT_CALIBRATION): number {
  const f = remMs !== null && remMs > c.debtRemSwitchMs ? c.debtFactorHigh : c.debtFactorLow;
  return Math.max(0, Math.min(c.debtCapMs, Math.floor(f * (needMs - asleepMs))));
}

export function strainNeedMs(load: number, c: Calibration = DEFAULT_CALIBRATION): number {
  const l = Math.max(0, load);
  return c.strainNeedScaleMs * l ** c.strainNeedExponent * Math.exp(c.strainNeedRate * l);
}

export function sleepNeedMs(i: { debtMs: number; load: number; napMs: number }, c: Calibration = DEFAULT_CALIBRATION): number {
  return Math.max(0, c.sleepBaselineMs + i.debtMs + strainNeedMs(i.load, c) - i.napMs);
}

function clockMinutes(t: number, tzOffsetS: number): number {
  return ((((t + tzOffsetS) % DAY_S) + DAY_S) % DAY_S) / 60;
}

function meanAbsoluteDeviation(clock: number[]): number {
  const ref = clock[0] ?? 0;
  const unwrapped = clock.map((x) => {
    let d = x - ref;
    if (d >= DAY_MIN / 2) d -= DAY_MIN;
    if (d < -DAY_MIN / 2) d += DAY_MIN;
    return d;
  });
  const mean = unwrapped.reduce((a, b) => a + b, 0) / unwrapped.length;
  return unwrapped.reduce((a, b) => a + Math.abs(b - mean), 0) / unwrapped.length;
}

export function sleepConsistency(nights: { onset: number; offset: number }[], tzOffsetS: number): Outcome<number> {
  const recent = nights
    .filter((n) => Number.isFinite(n.onset) && Number.isFinite(n.offset))
    .sort((a, b) => a.onset - b.onset)
    .slice(-CONSISTENCY_NIGHTS);
  if (recent.length < CONSISTENCY_MIN_NIGHTS) return fail('needs-history', ALGO.sleepConsistency);
  const mad =
    (meanAbsoluteDeviation(recent.map((n) => clockMinutes(n.onset, tzOffsetS))) +
      meanAbsoluteDeviation(recent.map((n) => clockMinutes(n.offset, tzOffsetS)))) /
    2;
  const score = Math.min(100, Math.max(0, 100 - mad / CONSISTENCY_MINUTES_PER_POINT));
  return succeed(score, recent.length / CONSISTENCY_NIGHTS, ALGO.sleepConsistency);
}

export function sleepScore(
  i: { asleepMs: number; needMs: number; consistency: number | null },
  c: Calibration = DEFAULT_CALIBRATION,
): Outcome<number> {
  if (!Number.isFinite(i.needMs) || i.needMs <= 0 || !Number.isFinite(i.asleepMs)) return fail('no-data', ALGO.sleepScore);
  if (i.asleepMs <= 0) return fail('no-sleep', ALGO.sleepScore);
  const consistency = i.consistency ?? c.sleepScoreConsistencyNeutral;
  const raw =
    c.sleepScoreIntercept -
    c.sleepScoreRatioWeight * (i.asleepMs / i.needMs) ** c.sleepScoreRatioExponent +
    c.sleepScoreConsistencyWeight * (consistency - c.sleepScoreConsistencyNeutral);
  return succeed(Math.min(100, Math.max(0, raw)), 1, ALGO.sleepScore);
}
