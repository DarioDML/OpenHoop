import { isValidHr, lowerBound, median, sortedUnique } from './series';
import { STAGE_MODEL } from './stagesModel';
import { ALGO, fail, succeed } from './types';
import type { Outcome, Sample } from './types';

/**
 * Sleep stages, OpenHoop's own method (parity C). Not the vendor's stages and not a polysomnogram.
 *
 * Design after Walch O, Huang Y, Forger D, Goldstein C, "Sleep stage prediction with raw acceleration and
 * photoplethysmography heart rate data derived from a consumer wearable device", Sleep 2019;42(12):zsz180:
 * 30-second epochs, heart rate and motion features plus time in the night. Fitted on their open dataset (PhysioNet
 * sleep-accel v1.0.0, ODC-BY 1.0) with packages/analytics/test/train_stages.py; only the coefficients ship here.
 *
 * Per epoch: mean heart rate and mean band motion (at least 10 of 30 seconds). Each night is referenced to itself:
 * heart rate as (mean - night median) / (1.4826 x MAD), motion as ln(motion / night median + 0.1), so a constant
 * scale difference between the dataset's accelerometer and the band's motion value cancels. Features use only the
 * current and earlier epochs. A multinomial logistic regression gives wake / light (N1+N2) / deep (N3) / REM
 * probabilities; a four-state hidden Markov model with transition rates from the same dataset smooths them
 * (forward-backward for a finished night, forward only for a night still in progress).
 */

export type SleepStage = (typeof STAGE_MODEL.classes)[number];
export const SLEEP_STAGES: readonly SleepStage[] = STAGE_MODEL.classes;
export const STAGE_EPOCH_S = 30;
export const STAGE_MIN_COVERAGE = 0.8;
export const STAGE_MIN_VALID_S = 10;

const HR_SCALE_FLOOR = 1;
const MOTION_FLOOR_G = 1e-4;
const MOTION_OFFSET = 0.1;
const ACTIVE_RATIO = 2;
const QUIET_CAP = 60;
const HOURS_CAP = 10;
const MAD_SCALE = 1.4826;
const CLASS_COUNT = 4;

export type StageProbabilities = readonly [number, number, number, number];

export interface StageEpoch {
  t: number;
  stage: SleepStage;
}

export interface RecentStageEpoch extends StageEpoch {
  probabilities: StageProbabilities;
}

export type StageTotals = Record<SleepStage, number>;

export interface StagedNight {
  epochs: StageEpoch[];
  totals: StageTotals;
}

export interface StageSpan {
  onset: number;
  offset: number;
}

interface EpochSeries {
  hr: number[];
  motion: number[];
}

interface Reference {
  hrMedian: number;
  hrScale: number;
  motionMedian: number;
}

function epochSeries(rows: readonly Sample[], start: number, count: number): EpochSeries {
  const hrSum = new Array<number>(count).fill(0);
  const hrN = new Array<number>(count).fill(0);
  const motSum = new Array<number>(count).fill(0);
  const motN = new Array<number>(count).fill(0);
  const end = start + count * STAGE_EPOCH_S;
  for (let i = lowerBound(rows, start); i < rows.length; i++) {
    const r = rows[i];
    if (r === undefined || r.t >= end) break;
    const k = Math.floor((r.t - start) / STAGE_EPOCH_S);
    if (isValidHr(r.hr)) {
      hrSum[k] = (hrSum[k] ?? 0) + r.hr;
      hrN[k] = (hrN[k] ?? 0) + 1;
    }
    if (r.motionG !== null && Number.isFinite(r.motionG) && r.motionG >= 0) {
      motSum[k] = (motSum[k] ?? 0) + r.motionG;
      motN[k] = (motN[k] ?? 0) + 1;
    }
  }
  const mean = (sum: number[], n: number[]): number[] =>
    sum.map((s, k) => ((n[k] ?? 0) >= STAGE_MIN_VALID_S ? s / (n[k] ?? 1) : Number.NaN));
  return { hr: mean(hrSum, hrN), motion: mean(motSum, motN) };
}

function finite(values: readonly number[]): number[] {
  return values.filter((v) => !Number.isNaN(v));
}

function reference(series: EpochSeries): Reference | null {
  const hr = finite(series.hr);
  const motion = finite(series.motion);
  const hrMedian = median(hr);
  const motionMedian = median(motion);
  if (hrMedian === null || motionMedian === null) return null;
  const mad = median(hr.map((v) => Math.abs(v - hrMedian))) ?? 0;
  return { hrMedian, hrScale: Math.max(MAD_SCALE * mad, HR_SCALE_FLOOR), motionMedian: Math.max(motionMedian, MOTION_FLOOR_G) };
}

function trailing(values: readonly number[], k: number, width: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, k - width + 1); i <= k; i++) {
    const v = values[i];
    if (v !== undefined && !Number.isNaN(v)) out.push(v);
  }
  return out;
}

function average(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function stageFeatures(series: EpochSeries, ref: Reference): (number[] | null)[] {
  const { hrMedian, hrScale, motionMedian } = ref;
  const m = series.motion.map((v) => Math.log(v / motionMedian + MOTION_OFFSET));
  const hz = series.hr.map((v) => (v - hrMedian) / hrScale);
  const step = hz.map((v, k) => (k === 0 ? 0 : Math.abs(v - (hz[k - 1] ?? Number.NaN))));
  const out: (number[] | null)[] = [];
  let sinceActive = 0;
  for (let k = 0; k < series.hr.length; k++) {
    const hr = series.hr[k] ?? Number.NaN;
    const motion = series.motion[k] ?? Number.NaN;
    if (!Number.isNaN(motion) && motion > ACTIVE_RATIO * motionMedian) sinceActive = 0;
    else sinceActive++;
    if (Number.isNaN(hr) || Number.isNaN(motion)) {
      out.push(null);
      continue;
    }
    const h10 = trailing(series.hr, k, 10);
    const mean10 = average(h10);
    let ss = 0;
    for (const v of h10) ss += (v - mean10) ** 2;
    const z60 = average(trailing(hz, k, 60));
    const hours = Math.min(((k + 0.5) * STAGE_EPOCH_S) / 3600, HOURS_CAP);
    const features = [
      (average(trailing(series.hr, k, 5)) - hrMedian) / hrScale,
      (average(trailing(series.hr, k, 20)) - hrMedian) / hrScale,
      Math.sqrt(ss / h10.length) / hrScale,
      m[k] ?? Number.NaN,
      average(trailing(m, k, 10)),
      average(trailing(m, k, 40)),
      Math.log(1 + Math.min(sinceActive, QUIET_CAP)),
      hours,
      (hours * hours) / HOURS_CAP,
      z60,
      (hz[k] ?? Number.NaN) - z60,
      average(trailing(m, k, 120)),
      average(trailing(step, k, 10)),
    ];
    out.push(features.every(Number.isFinite) ? features : null);
  }
  return out;
}

function normalize(values: number[]): number[] {
  let sum = 0;
  for (const v of values) sum += v;
  return values.map((v) => v / sum);
}

function emission(features: readonly number[] | null): number[] {
  if (features === null) return new Array<number>(CLASS_COUNT).fill(1);
  const z = STAGE_MODEL.weights.map((row, c) => {
    let acc = STAGE_MODEL.intercept[c] ?? 0;
    row.forEach((w, f) => {
      acc += w * (((features[f] ?? 0) - (STAGE_MODEL.mean[f] ?? 0)) / (STAGE_MODEL.scale[f] ?? 1));
    });
    return acc;
  });
  const top = Math.max(...z);
  const p = normalize(z.map((v) => Math.exp(v - top)));
  return normalize(p.map((v, c) => v / (STAGE_MODEL.prior[c] ?? 1) ** STAGE_MODEL.priorPower));
}

function forward(emissions: readonly number[][]): number[][] {
  const alpha: number[][] = [];
  emissions.forEach((em, k) => {
    const prev = alpha[k - 1];
    const pred =
      prev === undefined
        ? [...STAGE_MODEL.prior]
        : STAGE_MODEL.transition.map((_, j) => prev.reduce((acc, a, i) => acc + a * (STAGE_MODEL.transition[i]?.[j] ?? 0), 0));
    alpha.push(normalize(pred.map((v, c) => v * (em[c] ?? 1))));
  });
  return alpha;
}

function forwardBackward(emissions: readonly number[][]): number[][] {
  const alpha = forward(emissions);
  const beta: number[][] = emissions.map(() => new Array<number>(CLASS_COUNT).fill(1));
  for (let k = emissions.length - 2; k >= 0; k--) {
    const next = emissions[k + 1] ?? [];
    const after = beta[k + 1] ?? [];
    beta[k] = normalize(
      STAGE_MODEL.transition.map((row) => row.reduce((acc, p, j) => acc + p * (next[j] ?? 1) * (after[j] ?? 1), 0)),
    );
  }
  return alpha.map((a, k) => normalize(a.map((v, c) => v * (beta[k]?.[c] ?? 1))));
}

function argmax(values: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if ((values[i] ?? -Infinity) > (values[best] ?? -Infinity)) best = i;
  return best;
}

function stageAt(index: number): SleepStage {
  return SLEEP_STAGES[index] ?? 'light';
}

function noSignal(series: EpochSeries): boolean {
  return finite(series.hr).length === 0 || finite(series.motion).length === 0;
}

export interface StageTrace {
  features: (number[] | null)[];
  posterior: number[][];
}

export function stageTrace(samples: readonly Sample[], onset: number, epochs: number): StageTrace | null {
  const series = epochSeries(sortedUnique(samples), onset, epochs);
  const ref = reference(series);
  if (ref === null) return null;
  const features = stageFeatures(series, ref);
  return { features, posterior: forwardBackward(features.map(emission)) };
}

export function classifyStages(samples: readonly Sample[], spans: readonly StageSpan[]): Outcome<StagedNight> {
  const sorted = spans.slice().sort((a, b) => a.onset - b.onset);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return fail('no-sleep', ALGO.stages);
  const onset = first.onset;
  const count = Math.floor((last.offset + 1 - onset) / STAGE_EPOCH_S);
  if (count <= 0) return fail('no-sleep', ALGO.stages);
  const rows = sortedUnique(samples);
  const series = epochSeries(rows, onset, count);
  if (noSignal(series)) return fail('missing-signal', ALGO.stages);
  const ref = reference(series);
  if (ref === null) return fail('missing-signal', ALGO.stages);
  const features = stageFeatures(series, ref);
  const posterior = forwardBackward(features.map(emission));
  const inside = (t: number): boolean => sorted.some((s) => t >= s.onset && t + STAGE_EPOCH_S <= s.offset + 1);
  const totals: StageTotals = { wake: 0, light: 0, deep: 0, rem: 0 };
  const epochs: StageEpoch[] = [];
  let expected = 0;
  for (let k = 0; k < count; k++) {
    const t = onset + k * STAGE_EPOCH_S;
    if (!inside(t)) continue;
    expected++;
    const p = posterior[k];
    if (features[k] === null || p === undefined) continue;
    const stage = stageAt(argmax(p));
    epochs.push({ t, stage });
    totals[stage] += STAGE_EPOCH_S;
  }
  if (expected === 0) return fail('no-sleep', ALGO.stages);
  const coverage = epochs.length / expected;
  if (coverage < STAGE_MIN_COVERAGE) return fail('low-coverage', ALGO.stages);
  return succeed({ epochs, totals }, coverage, ALGO.stages);
}

/**
 * Stages for a night that is still going on, for example a smart-wake window. Uses the samples from `onset` to `now`
 * only: the night reference is the epochs so far and the smoothing runs forward, so an epoch's probabilities never
 * depend on later data. Returns the last `count` scored epochs, oldest first.
 */
export function classifyRecentStages(samples: readonly Sample[], onset: number, now: number, count = 10): Outcome<RecentStageEpoch[]> {
  const epochs = Math.floor((now - onset) / STAGE_EPOCH_S);
  if (epochs <= 0) return fail('no-sleep', ALGO.stages);
  const series = epochSeries(sortedUnique(samples), onset, epochs);
  const ref = noSignal(series) ? null : reference(series);
  if (ref === null) return fail('missing-signal', ALGO.stages);
  const features = stageFeatures(series, ref);
  const alpha = forward(features.map(emission));
  const out: RecentStageEpoch[] = [];
  for (let k = Math.max(0, epochs - count); k < epochs; k++) {
    const a = alpha[k];
    if (features[k] === null || a === undefined) continue;
    out.push({
      t: onset + k * STAGE_EPOCH_S,
      stage: stageAt(argmax(a)),
      probabilities: [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0],
    });
  }
  if (out.length === 0) return fail('low-coverage', ALGO.stages);
  return succeed(out, out.length / Math.min(count, epochs), ALGO.stages);
}

export const STAGE_VALIDATION = STAGE_MODEL.validation;
