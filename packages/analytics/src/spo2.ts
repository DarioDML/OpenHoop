import { median, nightGuard, periodSlices, sortedUnique } from './series';
import { ALGO, fail, succeed } from './types';
import type { Night, Outcome, Sample } from './types';

export const SPO2_MIN_PERCENT = 70;
export const SPO2_MAX_PERCENT = 100;
export const SPO2_MAX_GAP_S = 2;
export const SPO2_MIN_VALID_S = 5;
export const SPO2_MIN_WINDOWS = 3;

export interface Spo2Window {
  start: number;
  percent: number;
  validSeconds: number;
}

interface RawWindow {
  start: number;
  percent: number | null;
  validSeconds: number;
}

export function spo2Percent(raw: number | null): number | null {
  return raw !== null && raw >= SPO2_MIN_PERCENT && raw <= SPO2_MAX_PERCENT ? raw : null;
}

function allWindows(samples: readonly Sample[]): RawWindow[] {
  const windows: { t: number; pct: number | null }[][] = [];
  let cur: { t: number; pct: number | null }[] = [];
  for (const s of sortedUnique(samples)) {
    if (s.spo2Raw === null || s.spo2Raw === 0) continue;
    const last = cur[cur.length - 1];
    if (last !== undefined && s.t - last.t > SPO2_MAX_GAP_S) {
      windows.push(cur);
      cur = [];
    }
    cur.push({ t: s.t, pct: spo2Percent(s.spo2Raw) });
  }
  if (cur.length > 0) windows.push(cur);
  return windows.map((w) => {
    const valid = w.flatMap((x) => (x.pct === null ? [] : [x.pct]));
    return {
      start: w[0]?.t ?? 0,
      validSeconds: valid.length,
      percent: valid.length >= Math.max(1, SPO2_MIN_VALID_S) ? median(valid) : null,
    };
  });
}

export function spo2Windows(samples: Sample[]): Spo2Window[] {
  const out: Spo2Window[] = [];
  for (const w of allWindows(samples)) {
    if (w.percent !== null) out.push({ start: w.start, percent: w.percent, validSeconds: w.validSeconds });
  }
  return out;
}

export function nightlySpo2(samples: Sample[], night: Night): Outcome<number> {
  const guard = nightGuard(samples, night);
  if (guard !== null) return fail(guard, ALGO.spo2);
  const inside = periodSlices(sortedUnique(samples), night).flat();
  if (inside.length === 0) return fail('no-data', ALGO.spo2);
  const windows = allWindows(inside);
  if (windows.length === 0) return fail('missing-signal', ALGO.spo2);
  let sum = 0;
  let valid = 0;
  for (const w of windows) {
    if (w.percent === null) continue;
    sum += w.percent;
    valid++;
  }
  if (valid < SPO2_MIN_WINDOWS) return fail('low-coverage', ALGO.spo2);
  return succeed(sum / valid, valid / windows.length, ALGO.spo2);
}
