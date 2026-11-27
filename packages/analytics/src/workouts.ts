import { sortedUnique } from './series';
import type { Sample } from './types';
import { zoneSeconds } from './zones';
import type { ZoneFloors } from './zones';

export const WORKOUT_MIN_S = 600;
export const WORKOUT_MAX_GAP_S = 120;
export const WORKOUT_RESERVE_FRACTION = 0.5;

export interface Workout {
  start: number;
  end: number;
  zoneSeconds: number[];
  avgHr: number;
  maxHr: number;
}

export function detectWorkouts(samples: Sample[], rest: number, max: number, floors: ZoneFloors | null = null): Workout[] {
  if (!Number.isFinite(rest) || !Number.isFinite(max) || max <= rest) return [];
  const rows = sortedUnique(samples);
  const spans: [number, number][] = [];
  for (const s of rows) {
    if (s.hr === null || (s.hr - rest) / (max - rest) < WORKOUT_RESERVE_FRACTION) continue;
    const last = spans[spans.length - 1];
    if (last !== undefined && s.t - last[1] - 1 <= WORKOUT_MAX_GAP_S) last[1] = s.t;
    else spans.push([s.t, s.t]);
  }

  const out: Workout[] = [];
  let k = 0;
  for (const [start, end] of spans) {
    if (end - start + 1 < WORKOUT_MIN_S) continue;
    while (k < rows.length && (rows[k]?.t ?? Infinity) < start) k++;
    const hrs: number[] = [];
    for (; k < rows.length; k++) {
      const r = rows[k];
      if (r === undefined || r.t > end) break;
      if (r.hr !== null) hrs.push(r.hr);
    }
    let sum = 0;
    let peak = -Infinity;
    for (const h of hrs) {
      sum += h;
      if (h > peak) peak = h;
    }
    out.push({ start, end, zoneSeconds: zoneSeconds(hrs, rest, max, floors), avgHr: sum / hrs.length, maxHr: peak });
  }
  return out;
}
