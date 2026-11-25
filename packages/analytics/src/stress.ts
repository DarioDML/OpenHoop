import { RR_MAX_MS, RR_MAX_STEP_MS, RR_MIN_MS } from './rr';
import { isValidHr, lowerBound, median, sortedUnique } from './series';
import { ALGO } from './types';
import type { Reason, Sample } from './types';

/**
 * Intraday stress estimate, OpenHoop's own method (parity C). Not a diagnosis.
 *
 * The day is cut into 5-minute windows, the short-term HRV length of the Task Force of the ESC and NASPE,
 * "Heart rate variability: standards of measurement, physiological interpretation and clinical use",
 * Circulation 1996;93(5):1043-1065. A window is scored only when the wearer is awake and still: at least 80 % of its
 * seconds carry a heart rate, the band reports WAKE or STILL, mean motion stays at or below 0.1 g, mean heart rate
 * stays below 40 % of heart rate reserve (the ACSM "moderate" bound, as for calories), and the window does not touch a
 * workout or the 30 minutes after it (vagal reactivation after exercise: Stanley J, Peake JM, Buchheit M, Sports Med
 * 2013;43(12):1259-1277). Heart rate rises without movement are the "additional heart rate" of Myrtek M, "Heart and
 * Emotion: Ambulatory Monitoring Studies in Everyday Life", Hogrefe & Huber 2004.
 *
 * Per window: mean heart rate, and RMSSD over runs of consecutive beats when at least 30 successive differences are
 * present (ultra-short RMSSD agrees with 5-minute RMSSD: Munoz ML et al., PLoS One 2015;10(9):e0138921).
 * Acute stress raises heart rate and lowers RMSSD (Kim HG et al., Psychiatry Investig 2018;15(3):235-245;
 * Castaldo R et al., Biomed Signal Process Control 2015;18:370-377).
 *
 * Baseline: the eligible windows of up to 14 earlier days, at least 3 days with an hour of windows each. Centre and
 * spread are the median and 1.4826 x MAD (Leys C et al., J Exp Soc Psychol 2013;49(4):764-766); RMSSD is
 * log-transformed as in Plews DJ et al., Sports Med 2013;43(9):773-781.
 *
 * Score: z_hr = (HR - median) / spread and z_hrv = (median ln RMSSD - ln RMSSD) / spread. The window score is the
 * mean of the available z values, clamped to 0..3: the number of robust standard deviations of arousal above the
 * wearer's own awake, still baseline. Levels: low below 1, medium from 1, high from 2.
 */

export const STRESS_WINDOW_S = 300;
export const STRESS_MIN_HR_S = 240;
export const STRESS_MIN_AWAKE_FRACTION = 0.8;
export const STRESS_MAX_MOTION_G = 0.1;
export const STRESS_POST_WORKOUT_S = 1800;
export const STRESS_MIN_RR_DIFFS = 30;
export const STRESS_BASELINE_DAYS = 14;
export const STRESS_BASELINE_MIN_DAYS = 3;
export const STRESS_MIN_DAY_WINDOWS = 12;
export const STRESS_MIN_HRV_WINDOWS = 30;
export const STRESS_MAX_SCORE = 3;
export const STRESS_MEDIUM_FROM = 1;
export const STRESS_HIGH_FROM = 2;
const MAD_TO_SD = 1.4826;
const MILLI = 1000;
const HR_SPREAD_MIN = 2;
const LN_RMSSD_SPREAD_MIN = 0.1;

export type StressLevel = 'low' | 'medium' | 'high';

export interface StressWindow {
  t: number;
  hr: number;
  rmssd: number | null;
  score: number | null;
}

export interface StressDay {
  algo: string;
  reason: Reason | null;
  baselineDays: number;
  windows: StressWindow[];
}

export interface StressSpan {
  start: number;
  end: number;
}

export interface StressInput {
  start: number;
  end: number;
  workouts: readonly StressSpan[];
  activeThresholdBpm: number | null;
}

interface Robust {
  center: number;
  spread: number;
}

export interface StressBaseline {
  days: number;
  hr: Robust;
  lnRmssd: Robust | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function robust(values: readonly number[], floor: number): Robust | null {
  const center = median(values);
  if (center === null) return null;
  const mad = median(values.map((v) => Math.abs(v - center)));
  return { center, spread: Math.max(floor, (mad ?? 0) * MAD_TO_SD) };
}

function isAwake(state: Sample['state']): boolean {
  return state === 'WAKE' || state === 'STILL';
}

function inRange(x: number): boolean {
  return x >= RR_MIN_MS && x <= RR_MAX_MS;
}

function windowRmssd(rows: readonly Sample[]): number | null {
  let count = 0;
  let sum = 0;
  let prev: number | null = null;
  let lastT = Number.NaN;
  for (const s of rows) {
    if (s.rr.length === 0 || s.t !== lastT + 1) prev = null;
    lastT = s.t;
    for (const x of s.rr) {
      if (!inRange(x)) continue;
      if (prev !== null && Math.abs(x - prev) < RR_MAX_STEP_MS) {
        sum += (x - prev) ** 2;
        count++;
      }
      prev = x;
    }
  }
  return count < STRESS_MIN_RR_DIFFS ? null : Math.sqrt(sum / count);
}

function blocked(t: number, workouts: readonly StressSpan[]): boolean {
  const end = t + STRESS_WINDOW_S;
  return workouts.some((w) => t <= w.end + STRESS_POST_WORKOUT_S && end > w.start);
}

function eligibleFeature(rows: readonly Sample[], t: number, input: StressInput): StressWindow | null {
  if (rows.length === 0 || blocked(t, input.workouts)) return null;
  let hrCount = 0;
  let hrSum = 0;
  let awake = 0;
  let motionCount = 0;
  let motionSum = 0;
  for (const s of rows) {
    if (isValidHr(s.hr)) {
      hrCount++;
      hrSum += s.hr;
    }
    if (isAwake(s.state)) awake++;
    if (s.motionG !== null && Number.isFinite(s.motionG)) {
      motionCount++;
      motionSum += s.motionG;
    }
  }
  if (hrCount < STRESS_MIN_HR_S) return null;
  if (awake < STRESS_MIN_AWAKE_FRACTION * STRESS_WINDOW_S) return null;
  if (motionCount < STRESS_MIN_AWAKE_FRACTION * STRESS_WINDOW_S) return null;
  if (Math.round((motionSum / motionCount) * MILLI) / MILLI > STRESS_MAX_MOTION_G) return null;
  const hr = hrSum / hrCount;
  if (input.activeThresholdBpm !== null && hr >= input.activeThresholdBpm) return null;
  const rmssd = windowRmssd(rows);
  return { t, hr: round1(hr), rmssd: rmssd === null ? null : round1(rmssd), score: null };
}

export function stressFeatures(samples: readonly Sample[], input: StressInput): StressWindow[] {
  if (!(input.end > input.start)) return [];
  const rows = sortedUnique(samples);
  const out: StressWindow[] = [];
  const first = Math.ceil(input.start / STRESS_WINDOW_S) * STRESS_WINDOW_S;
  let lo = lowerBound(rows, first);
  for (let t = first; t + STRESS_WINDOW_S <= input.end; t += STRESS_WINDOW_S) {
    while (lo < rows.length && (rows[lo]?.t ?? Infinity) < t) lo++;
    let hi = lo;
    while (hi < rows.length && (rows[hi]?.t ?? Infinity) < t + STRESS_WINDOW_S) hi++;
    const feature = eligibleFeature(rows.slice(lo, hi), t, input);
    if (feature !== null) out.push(feature);
    lo = hi;
  }
  return out;
}

export function stressBaseline(history: readonly (readonly StressWindow[])[]): StressBaseline | null {
  const days = history.filter((windows) => windows.length >= STRESS_MIN_DAY_WINDOWS).slice(-STRESS_BASELINE_DAYS);
  if (days.length < STRESS_BASELINE_MIN_DAYS) return null;
  const hrs: number[] = [];
  const lns: number[] = [];
  for (const windows of days) {
    for (const w of windows) {
      hrs.push(w.hr);
      if (w.rmssd !== null && w.rmssd > 0) lns.push(Math.log(w.rmssd));
    }
  }
  const hr = robust(hrs, HR_SPREAD_MIN);
  if (hr === null) return null;
  const lnRmssd = lns.length >= STRESS_MIN_HRV_WINDOWS ? robust(lns, LN_RMSSD_SPREAD_MIN) : null;
  return { days: days.length, hr, lnRmssd };
}

export function stressScore(window: Pick<StressWindow, 'hr' | 'rmssd'>, baseline: StressBaseline): number {
  const z: number[] = [(window.hr - baseline.hr.center) / baseline.hr.spread];
  if (baseline.lnRmssd !== null && window.rmssd !== null && window.rmssd > 0) {
    z.push((baseline.lnRmssd.center - Math.log(window.rmssd)) / baseline.lnRmssd.spread);
  }
  const mean = z.reduce((a, b) => a + b, 0) / z.length;
  return round1(Math.min(STRESS_MAX_SCORE, Math.max(0, mean)));
}

export function stressLevel(score: number): StressLevel {
  if (score >= STRESS_HIGH_FROM) return 'high';
  if (score >= STRESS_MEDIUM_FROM) return 'medium';
  return 'low';
}

export function dayStress(
  samples: readonly Sample[],
  input: StressInput,
  history: readonly (readonly StressWindow[])[],
): StressDay {
  const features = stressFeatures(samples, input);
  const baseline = stressBaseline(history);
  const reason: Reason | null =
    samples.length === 0 ? 'no-data' : features.length === 0 ? 'low-coverage' : baseline === null ? 'needs-history' : null;
  const windows =
    reason === null && baseline !== null ? features.map((w) => ({ ...w, score: stressScore(w, baseline) })) : features;
  return { algo: ALGO.stress, reason, baselineDays: baseline?.days ?? 0, windows };
}

export interface StressSummary {
  seconds: Record<StressLevel, number>;
  latest: (StressWindow & { score: number }) | null;
}

export function stressSummary(day: StressDay): StressSummary {
  const seconds: Record<StressLevel, number> = { low: 0, medium: 0, high: 0 };
  let latest: (StressWindow & { score: number }) | null = null;
  for (const w of day.windows) {
    if (w.score === null) continue;
    seconds[stressLevel(w.score)] += STRESS_WINDOW_S;
    if (latest === null || w.t > latest.t) latest = { ...w, score: w.score };
  }
  return { seconds, latest };
}

const REASONS: readonly Reason[] = ['no-data', 'low-coverage', 'no-sleep', 'missing-signal', 'needs-history', 'no-profile'];

function isReason(value: unknown): value is Reason {
  return typeof value === 'string' && REASONS.some((r) => r === value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseWindow(value: unknown): StressWindow | null {
  if (typeof value !== 'object' || value === null) return null;
  const { t, hr, rmssd, score } = value as { t?: unknown; hr?: unknown; rmssd?: unknown; score?: unknown };
  if (!isFiniteNumber(t) || !isFiniteNumber(hr) || hr <= 0) return null;
  if (rmssd !== null && (!isFiniteNumber(rmssd) || rmssd < 0)) return null;
  if (score !== null && (!isFiniteNumber(score) || score < 0 || score > STRESS_MAX_SCORE)) return null;
  return { t, hr, rmssd, score };
}

export function parseStressDay(value: unknown): StressDay | null {
  if (typeof value !== 'object' || value === null) return null;
  const { algo, reason, baselineDays, windows } = value as {
    algo?: unknown;
    reason?: unknown;
    baselineDays?: unknown;
    windows?: unknown;
  };
  if (typeof algo !== 'string' || (reason !== null && !isReason(reason))) return null;
  if (!isFiniteNumber(baselineDays) || baselineDays < 0 || !Array.isArray(windows)) return null;
  const parsed: StressWindow[] = [];
  for (const raw of windows) {
    const w = parseWindow(raw);
    if (w === null) return null;
    parsed.push(w);
  }
  return { algo, reason, baselineDays, windows: parsed };
}
