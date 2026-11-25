import { cleanRr, rmssd } from './rr';
import { isValidHr, median, nightGuard, nightSeconds, periodSlices, sortedUnique } from './series';
import { ALGO, fail, succeed } from './types';
import type { Night, Outcome, Sample } from './types';

export const HRV_WINDOW_S = 300;
export const HRV_STEP_S = 30;
export const HRV_MIN_BEAT_FRACTION = 0.6;
export const HRV_MIN_WINDOWS = 20;
export const RHR_WINDOW_S = 300;
export const RHR_MIN_VALID_S = 240;

class IntervalUnion {
  private total = 0;
  private start = Number.NaN;
  private end = Number.NaN;

  add(start: number, end: number): void {
    if (!Number.isNaN(this.end) && start <= this.end) {
      this.end = Math.max(this.end, end);
      return;
    }
    this.flush();
    this.start = start;
    this.end = end;
  }

  seconds(): number {
    this.flush();
    return this.total;
  }

  private flush(): void {
    if (!Number.isNaN(this.end)) this.total += this.end - this.start;
    this.start = Number.NaN;
    this.end = Number.NaN;
  }
}

export function nightlyHrv(samples: Sample[], night: Night): Outcome<number> {
  const guard = nightGuard(samples, night);
  if (guard !== null) return fail(guard, ALGO.hrv);
  const slices = periodSlices(sortedUnique(samples), night);
  if (slices.every((s) => s.length === 0)) return fail('no-data', ALGO.hrv);
  if (!slices.some((s) => s.some((x) => x.rr.length > 0))) return fail('missing-signal', ALGO.hrv);

  const values: number[] = [];
  const covered = new IntervalUnion();
  night.periods.forEach((period, p) => {
    const slice = slices[p] ?? [];
    const n = slice.length;
    const hrCount = new Float64Array(n + 1);
    const hrSum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const hr = slice[i]?.hr ?? null;
      const valid = isValidHr(hr);
      hrCount[i + 1] = (hrCount[i] ?? 0) + (valid ? 1 : 0);
      hrSum[i + 1] = (hrSum[i] ?? 0) + (valid ? hr : 0);
    }
    let lo = 0;
    let hi = 0;
    for (let start = period.onset; start + HRV_WINDOW_S <= period.offset + 1; start += HRV_STEP_S) {
      const end = start + HRV_WINDOW_S;
      while (lo < n && (slice[lo]?.t ?? Infinity) < start) lo++;
      if (hi < lo) hi = lo;
      while (hi < n && (slice[hi]?.t ?? Infinity) < end) hi++;
      const count = (hrCount[hi] ?? 0) - (hrCount[lo] ?? 0);
      if (count === 0) continue;
      const meanHr = ((hrSum[hi] ?? 0) - (hrSum[lo] ?? 0)) / count;
      const expectedBeats = (meanHr / 60) * HRV_WINDOW_S;
      const rr: number[] = [];
      for (let i = lo; i < hi; i++) for (const x of slice[i]?.rr ?? []) rr.push(x);
      if (cleanRr(rr).length < HRV_MIN_BEAT_FRACTION * expectedBeats) continue;
      const v = rmssd(rr);
      if (v === null) continue;
      values.push(v);
      covered.add(start, end);
    }
  });

  const value = median(values);
  if (values.length < HRV_MIN_WINDOWS || value === null) return fail('low-coverage', ALGO.hrv);
  return succeed(value, covered.seconds() / nightSeconds(night), ALGO.hrv);
}

export function restingHr(samples: Sample[], night: Night): Outcome<number> {
  const guard = nightGuard(samples, night);
  if (guard !== null) return fail(guard, ALGO.restingHr);
  const slices = periodSlices(sortedUnique(samples), night);
  if (slices.every((s) => s.length === 0)) return fail('no-data', ALGO.restingHr);
  if (!slices.some((s) => s.some((x) => isValidHr(x.hr)))) return fail('missing-signal', ALGO.restingHr);

  const means: number[] = [];
  for (let p = 0; p < night.periods.length; p++) {
    const onset = night.periods[p]?.onset ?? 0;
    let block = Number.NaN;
    let count = 0;
    let sum = 0;
    for (const s of slices[p] ?? []) {
      const b = Math.floor((s.t - onset) / RHR_WINDOW_S);
      if (b !== block) {
        if (count >= RHR_MIN_VALID_S) means.push(sum / count);
        block = b;
        count = 0;
        sum = 0;
      }
      if (isValidHr(s.hr)) {
        count++;
        sum += s.hr;
      }
    }
    if (count >= RHR_MIN_VALID_S) means.push(sum / count);
  }

  if (means.length === 0) return fail('low-coverage', ALGO.restingHr);
  return succeed(Math.min(...means), (means.length * RHR_WINDOW_S) / nightSeconds(night), ALGO.restingHr);
}
