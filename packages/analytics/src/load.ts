import { DEFAULT_CALIBRATION } from './calibration';
import type { Calibration } from './calibration';
import { ALGO, fail, succeed } from './types';
import type { Outcome } from './types';

export const LOAD_MAX = 21;
export const LOAD_MIN_VALID_MINUTES = 600;

export function referenceHr(h: number, rest: number, max: number, c: Calibration = DEFAULT_CALIBRATION): number {
  const span = c.loadReferenceMaxBpm - c.loadReferenceRestBpm;
  return c.loadReferenceRestBpm + ((h - rest) * span) / (max - rest);
}

export interface LoadSum {
  sum: number;
  valid: number;
}

export function minuteLoadTerm(h: number, rest: number, max: number, c: Calibration = DEFAULT_CALIBRATION): number {
  const ref = referenceHr(h, rest, max, c);
  return ref >= c.loadThresholdBpm ? Math.exp(c.loadRate * (ref - c.loadPivotBpm)) : 0;
}

export function loadSum(minuteHr: readonly (number | null)[], rest: number, max: number, c: Calibration = DEFAULT_CALIBRATION): LoadSum {
  let valid = 0;
  let sum = 0;
  for (const h of minuteHr) {
    if (h === null || !Number.isFinite(h)) continue;
    valid++;
    sum += minuteLoadTerm(h, rest, max, c);
  }
  return { sum, valid };
}

export function loadFromSum(sum: number, c: Calibration = DEFAULT_CALIBRATION): number {
  return Math.min(LOAD_MAX, Math.max(0, c.loadScale * Math.max(0, sum) ** c.loadExponent));
}

export function sumFromLoad(load: number, c: Calibration = DEFAULT_CALIBRATION): number {
  if (!Number.isFinite(load) || load <= 0) return 0;
  return (Math.min(LOAD_MAX, load) / c.loadScale) ** (1 / c.loadExponent);
}

export function dayLoad(minuteHr: (number | null)[], rest: number, max: number, c: Calibration = DEFAULT_CALIBRATION): Outcome<number> {
  if (!Number.isFinite(rest) || !Number.isFinite(max) || max <= rest) return fail('missing-signal', ALGO.load);
  if (minuteHr.length === 0) return fail('no-data', ALGO.load);
  const { sum, valid } = loadSum(minuteHr, rest, max, c);
  if (valid === 0) return fail('no-data', ALGO.load);
  if (valid < LOAD_MIN_VALID_MINUTES) return fail('low-coverage', ALGO.load);
  return succeed(loadFromSum(sum, c), valid / minuteHr.length, ALGO.load);
}
