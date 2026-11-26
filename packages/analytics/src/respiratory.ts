import { cleanRr } from './rr';
import { median, nightGuard, nightSeconds, periodSlices, sortedUnique } from './series';
import { ALGO, fail, succeed } from './types';
import type { Night, Outcome, Sample } from './types';

export const RESP_WINDOW_S = 60;
export const RESP_MIN_WINDOWS = 20;
export const RESP_MIN_COVERAGE = 0.5;

export interface RespiratoryWindow {
  startS: number;
  endS: number;
  beats: number;
  breathsPerMin: number | null;
  peakFraction: number | null;
}

export interface RespiratoryOptions {
  windowS?: number;
  fs?: number;
  loHz?: number;
  hiHz?: number;
  stepHz?: number;
}

interface SpectralTables {
  n: number;
  count: number;
  freqs: Float64Array;
  hann: Float64Array;
  cos: Float64Array;
  sin: Float64Array;
}

let tables: { key: string; value: SpectralTables } | null = null;

// The twiddles and window depend only on these parameters, so one entry serves every window of a night.
function spectralTables(windowS: number, fs: number, loHz: number, hiHz: number, stepHz: number): SpectralTables {
  const key = `${windowS}|${fs}|${loHz}|${hiHz}|${stepHz}`;
  if (tables !== null && tables.key === key) return tables.value;
  const n = Math.trunc(windowS * fs);
  let count = 0;
  while (loHz + count * stepHz <= hiHz + 1e-9) count++;
  const freqs = new Float64Array(count);
  const cos = new Float64Array(count * n);
  const sin = new Float64Array(count * n);
  for (let s = 0; s < count; s++) {
    const f = loHz + s * stepHz;
    freqs[s] = f;
    const w = (2 * Math.PI * f) / fs;
    for (let m = 0; m < n; m++) {
      cos[s * n + m] = Math.cos(w * m);
      sin[s * n + m] = Math.sin(w * m);
    }
  }
  const hann = new Float64Array(n);
  for (let m = 0; m < n; m++) hann[m] = 0.5 - 0.5 * Math.cos((2 * Math.PI * m) / (n - 1));
  const value = { n, count, freqs, hann, cos, sin };
  tables = { key, value };
  return value;
}

function spectralPeak(
  selT: number[],
  selV: number[],
  start: number,
  windowS: number,
  fs: number,
  loHz: number,
  hiHz: number,
  stepHz: number,
): { f: number; fraction: number } | null {
  const tab = spectralTables(windowS, fs, loHz, hiHz, stepHz);
  const n = tab.n;
  const ys = new Float64Array(n);
  let k = 0;
  for (let m = 0; m < n; m++) {
    let q = start + m / fs;
    while (k < selT.length - 2 && (selT[k + 1] ?? Infinity) < q) k++;
    const t0 = selT[k] ?? 0;
    const t1 = selT[k + 1] ?? 0;
    const v0 = selV[k] ?? 0;
    const v1 = selV[k + 1] ?? 0;
    q = Math.min(Math.max(q, t0), t1);
    ys[m] = t1 > t0 ? v0 + ((v1 - v0) * (q - t0)) / (t1 - t0) : v0;
  }
  let sum = 0;
  for (let m = 0; m < n; m++) sum += ys[m] ?? 0;
  const mean = sum / n;
  const xm = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let m = 0; m < n; m++) num += (m - xm) * ((ys[m] ?? 0) - mean);
  for (let m = 0; m < n; m++) den += (m - xm) ** 2;
  const slope = num / den;
  for (let m = 0; m < n; m++) {
    ys[m] = ((ys[m] ?? 0) - mean - slope * (m - xm)) * (tab.hann[m] ?? 0);
  }
  const top = Math.min(hiHz, (0.5 * selT.length) / windowS);
  let bestF: number | null = null;
  let bestP = -1;
  let total = 0;
  for (let s = 0; s < tab.count; s++) {
    const f = tab.freqs[s] ?? 0;
    if (f > top + 1e-9) break;
    const base = s * n;
    let re = 0;
    let im = 0;
    for (let m = 0; m < n; m++) re += (ys[m] ?? 0) * (tab.cos[base + m] ?? 0);
    for (let m = 0; m < n; m++) im += (ys[m] ?? 0) * (tab.sin[base + m] ?? 0);
    const p = (re * re + im * im) * f * f;
    total += p;
    if (p > bestP) {
      bestF = f;
      bestP = p;
    }
  }
  if (bestF === null || !(total > 0)) return null;
  return { f: bestF, fraction: bestP / total };
}

export function respiratoryWindows(rrMs: number[], options: RespiratoryOptions = {}): RespiratoryWindow[] {
  const windowS = options.windowS ?? RESP_WINDOW_S;
  const fs = options.fs ?? 4;
  const loHz = options.loHz ?? 0.1;
  const hiHz = options.hiHz ?? 0.5;
  const stepHz = options.stepHz ?? 0.005;
  const rr = cleanRr(rrMs);
  const times: number[] = [];
  let acc = 0;
  for (const x of rr) {
    acc += x / 1000;
    times.push(acc);
  }
  const out: RespiratoryWindow[] = [];
  const lastTime = times[times.length - 1];
  let start = 0;
  let i = 0;
  while (lastTime !== undefined && start + windowS <= lastTime) {
    const end = start + windowS;
    while (i < times.length && (times[i] ?? Infinity) < start) i++;
    let j = i;
    while (j < times.length && (times[j] ?? Infinity) < end) j++;
    const selT = times.slice(i, j);
    const selV = rr.slice(i, j);
    const row: RespiratoryWindow = { startS: start, endS: end, beats: selT.length, breathsPerMin: null, peakFraction: null };
    if (selT.length >= Math.max(4, windowS / 3)) {
      const peak = spectralPeak(selT, selV, start, windowS, fs, loHz, hiHz, stepHz);
      if (peak !== null) {
        row.breathsPerMin = peak.f * 60;
        row.peakFraction = peak.fraction;
      }
    }
    out.push(row);
    start = end;
  }
  return out;
}

export function respiratoryRate(samples: Sample[], night: Night): Outcome<number> {
  const guard = nightGuard(samples, night);
  if (guard !== null) return fail(guard, ALGO.respiratory);
  const slices = periodSlices(sortedUnique(samples), night);
  if (slices.every((s) => s.length === 0)) return fail('no-data', ALGO.respiratory);
  if (!slices.some((s) => s.some((x) => x.rr.length > 0))) return fail('missing-signal', ALGO.respiratory);

  const rates: number[] = [];
  for (const slice of slices) {
    const rr: number[] = [];
    for (const s of slice) for (const x of s.rr) rr.push(x);
    for (const w of respiratoryWindows(rr)) if (w.breathsPerMin !== null) rates.push(w.breathsPerMin);
  }
  const coverage = (rates.length * RESP_WINDOW_S) / nightSeconds(night);
  const value = median(rates);
  if (value === null || rates.length < RESP_MIN_WINDOWS || coverage < RESP_MIN_COVERAGE) {
    return fail('low-coverage', ALGO.respiratory);
  }
  return succeed(value, coverage, ALGO.respiratory);
}
