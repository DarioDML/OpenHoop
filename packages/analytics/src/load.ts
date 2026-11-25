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

export function dayLoad(minuteHr: (number | null)[], rest: number, max: number, c: Calibration = DEFAULT_CALIBRATION): Outcome<number> {
  if (!Number.isFinite(rest) || !Number.isFinite(max) || max <= rest) return fail('missing-signal', ALGO.load);
  if (minuteHr.length === 0) return fail('no-data', ALGO.load);
  let valid = 0;
  let sum = 0;
  for (const h of minuteHr) {
    if (h === null || !Number.isFinite(h)) continue;
    valid++;
    const ref = referenceHr(h, rest, max, c);
    if (ref >= c.loadThresholdBpm) sum += Math.exp(c.loadRate * (ref - c.loadPivotBpm));
  }
  if (valid === 0) return fail('no-data', ALGO.load);
  if (valid < LOAD_MIN_VALID_MINUTES) return fail('low-coverage', ALGO.load);
  const value = Math.min(LOAD_MAX, Math.max(0, c.loadScale * sum ** c.loadExponent));
  return succeed(value, valid / minuteHr.length, ALGO.load);
}
