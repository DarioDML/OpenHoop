import type { Night, Reason, Sample } from './types';

export function sortedUnique(samples: readonly Sample[]): readonly Sample[] {
  let ordered = true;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a === undefined || b === undefined || b.t <= a.t) {
      ordered = false;
      break;
    }
  }
  if (ordered) return samples;
  const sorted = samples.slice().sort((a, b) => a.t - b.t);
  const out: Sample[] = [];
  let last = Number.NaN;
  for (const s of sorted) {
    if (s.t !== last) {
      out.push(s);
      last = s.t;
    }
  }
  return out;
}

export function lowerBound(sorted: readonly Sample[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const s = sorted[mid];
    if (s !== undefined && s.t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function periodSlices(sorted: readonly Sample[], night: Night): Sample[][] {
  return night.periods.map((p) => sorted.slice(lowerBound(sorted, p.onset), lowerBound(sorted, p.offset + 1)));
}

export function nightSeconds(night: Night): number {
  let total = 0;
  for (const p of night.periods) total += p.offset - p.onset + 1;
  return total;
}

export function nightGuard(samples: readonly Sample[], night: Night): Reason | null {
  if (samples.length === 0) return 'no-data';
  if (night.periods.length === 0 || nightSeconds(night) <= 0) return 'no-sleep';
  return null;
}

export function median(sortedOrNot: readonly number[]): number | null {
  if (sortedOrNot.length === 0) return null;
  const v = sortedOrNot.slice().sort((a, b) => a - b);
  const k = v.length;
  const mid = k >> 1;
  const hi = v[mid] ?? Number.NaN;
  if (k % 2 === 1) return hi;
  const lo = v[mid - 1] ?? Number.NaN;
  return (lo + hi) / 2;
}

export function isValidHr(hr: number | null): hr is number {
  return hr !== null && hr >= 25 && hr <= 230;
}
