import { DEFAULT_CALIBRATION, STAGE_EPOCH_S, STRESS_HIGH_FROM, STRESS_MIN_DAY_WINDOWS, STRESS_WINDOW_S, strainNeedMs, type Calibration, type SleepStage, type StageTotals } from '@openhoop/analytics';
import type { DayRecord, SleepPeriodRecord, StageEpochRow } from '@openhoop/core';

import { localMinutes, mainNightSpan, planBedtime, sleepEfficiency, type BedtimePlan } from './dailyDerived';
import { mean } from './derived';
import type { HeartRatePoint } from './types';
import type { SleepGoal } from './userData';
import type { WeeklyPlan } from './weeklyPlan';

export type ContributorStatus = 'optimal' | 'sufficient' | 'poor';
export type ContributorId = 'hoursVsNeed' | 'consistency' | 'efficiency' | 'sleepStress';

interface StatusCut {
  optimal: number;
  sufficient: number;
  higherIsBetter: boolean;
}

/**
 * Efficiency uses the National Sleep Foundation sleep-quality cut-offs (Ohayon M et al., Sleep Health 2017;3(1):6-19):
 * 85 % or more is good, 75-84 % uncertain, 74 % or less poor. The other cut-offs are OpenHoop's own.
 */
export const CONTRIBUTOR_CUTS: Readonly<Record<ContributorId, StatusCut>> = {
  hoursVsNeed: { optimal: 85, sufficient: 70, higherIsBetter: true },
  consistency: { optimal: 85, sufficient: 70, higherIsBetter: true },
  efficiency: { optimal: 85, sufficient: 75, higherIsBetter: true },
  sleepStress: { optimal: 10, sufficient: 25, higherIsBetter: false },
};

export function contributorStatus(id: ContributorId, value: number | null): ContributorStatus | null {
  if (value === null || !Number.isFinite(value)) return null;
  const cut = CONTRIBUTOR_CUTS[id];
  if (cut.higherIsBetter) return value >= cut.optimal ? 'optimal' : value >= cut.sufficient ? 'sufficient' : 'poor';
  return value <= cut.optimal ? 'optimal' : value <= cut.sufficient ? 'sufficient' : 'poor';
}

export function hoursVsNeedPct(day: DayRecord): number | null {
  const need = day.sleep.need.value;
  return day.sleep.asleepS !== null && need !== null && need > 0 ? Math.round((day.sleep.asleepS / need) * 100) : null;
}

export interface Contributor {
  id: ContributorId;
  value: number | null;
  reason: string | null;
  status: ContributorStatus | null;
}

export function sleepContributors(day: DayRecord, stressPct: number | null, stressReason: string | null): Contributor[] {
  const hours = hoursVsNeedPct(day);
  const consistency = day.sleep.consistency.value === null ? null : Math.round(day.sleep.consistency.value);
  const efficiency = sleepEfficiency(day);
  const row = (id: ContributorId, value: number | null, reason: string | null): Contributor => ({ id, value, reason: value === null ? reason : null, status: contributorStatus(id, value) });
  return [
    row('hoursVsNeed', hours, day.sleep.need.value === null ? day.sleep.need.reason : 'no-sleep'),
    row('consistency', consistency, day.sleep.consistency.reason),
    row('efficiency', efficiency, 'no-sleep'),
    row('sleepStress', stressPct, stressReason),
  ];
}

export function weakestContributor(contributors: readonly Contributor[]): Contributor | null {
  const rank: Readonly<Record<ContributorStatus, number>> = { poor: 0, sufficient: 1, optimal: 2 };
  let weakest: Contributor | null = null;
  for (const c of contributors) {
    if (c.status === null) continue;
    if (weakest === null || weakest.status === null || rank[c.status] < rank[weakest.status]) weakest = c;
  }
  return weakest;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const MAD_TO_SD = 1.4826;
export const SLEEP_STRESS_SPREAD_MIN_BPM = 2;

export interface SleepStress {
  pct: number;
  windows: number;
  high: number;
}

/**
 * High sleep stress, OpenHoop's own method (parity C), the night-time twin of the daytime stress score.
 * The daytime score skips sleep, so this uses the sleep span's heart rate in the same 5-minute windows. The night's
 * own windows are the baseline: centre and spread are the median and 1.4826 x MAD (Leys C et al., J Exp Soc Psychol
 * 2013;49(4):764-766), the spread floored at 2 bpm. A window counts as high when it sits at least 2 robust SDs above
 * the centre, the daytime "high" level. The result is the share of the night's windows that were high: heart-rate
 * surges while asleep are a sign of arousal (Myrtek M, Heart and Emotion, Hogrefe & Huber 2004).
 * Needs an hour of windows, as the daytime score does.
 */
export function sleepStress(points: readonly HeartRatePoint[]): SleepStress | null {
  const hr = points.filter((p) => Number.isFinite(p.hr) && p.hr > 0).map((p) => p.hr);
  if (hr.length < STRESS_MIN_DAY_WINDOWS) return null;
  const center = median(hr);
  if (center === null) return null;
  const mad = median(hr.map((v) => Math.abs(v - center))) ?? 0;
  const spread = Math.max(SLEEP_STRESS_SPREAD_MIN_BPM, mad * MAD_TO_SD);
  const high = hr.filter((v) => (v - center) / spread >= STRESS_HIGH_FROM).length;
  return { pct: Math.round((high / hr.length) * 100), windows: hr.length, high };
}

export const SLEEP_STRESS_BUCKET_S = STRESS_WINDOW_S;

export interface Range {
  low: number;
  high: number;
}

/**
 * Typical share of sleep time per stage in healthy adults: N1 2-5 % plus N2 45-55 % (light), N3 13-23 % (deep) and
 * REM 20-25 % (Carskadon MA, Dement WC, Principles and Practice of Sleep Medicine, 6th ed., 2017, ch. 2; Ohayon MM et
 * al., Sleep 2004;27(7):1255-1273). Awake time in bed: up to 30 minutes to fall asleep plus up to 20 minutes awake
 * after sleep onset, the "good" bounds of the National Sleep Foundation (Ohayon M et al., Sleep Health 2017;3(1):6-19).
 */
export const STAGE_SHARE_TYPICAL: Readonly<Record<Exclude<SleepStage, 'wake'>, Range>> = {
  light: { low: 0.47, high: 0.6 },
  deep: { low: 0.13, high: 0.23 },
  rem: { low: 0.2, high: 0.25 },
};
export const AWAKE_TYPICAL_MAX_S = 50 * 60;
export const RESTORATIVE_TYPICAL: Readonly<Range> = {
  low: Math.round((STAGE_SHARE_TYPICAL.deep.low + STAGE_SHARE_TYPICAL.rem.low) * 100),
  high: Math.round((STAGE_SHARE_TYPICAL.deep.high + STAGE_SHARE_TYPICAL.rem.high) * 100),
};

export function asleepFromTotals(totals: StageTotals): number {
  return totals.light + totals.deep + totals.rem;
}

export function typicalStageRanges(totals: StageTotals): Record<SleepStage, Range> {
  const asleep = asleepFromTotals(totals);
  const scaled = (r: Range): Range => ({ low: Math.round(r.low * asleep), high: Math.round(r.high * asleep) });
  return {
    wake: { low: 0, high: AWAKE_TYPICAL_MAX_S },
    light: scaled(STAGE_SHARE_TYPICAL.light),
    deep: scaled(STAGE_SHARE_TYPICAL.deep),
    rem: scaled(STAGE_SHARE_TYPICAL.rem),
  };
}

export type RangeFlag = 'above' | 'below' | null;

export function rangeFlag(value: number, range: Range): RangeFlag {
  if (value > range.high) return 'above';
  if (value < range.low) return 'below';
  return null;
}

export function restorativePct(totals: StageTotals | null | undefined): number | null {
  if (totals === null || totals === undefined) return null;
  const asleep = asleepFromTotals(totals);
  return asleep > 0 ? Math.round(((totals.deep + totals.rem) / asleep) * 100) : null;
}

export interface NightEvents {
  latencyS: number;
  disturbances: number;
}

/** Latency: night onset to the first sleep epoch. Disturbances: wake bouts between the first and last sleep epoch (AASM epoch scoring). */
export function nightEvents(epochs: readonly StageEpochRow[], onset: number): NightEvents | null {
  const sorted = [...epochs].sort((a, b) => a.t - b.t);
  const first = sorted.findIndex((e) => e.stage !== 'wake');
  if (first < 0) return null;
  let last = first;
  for (let i = sorted.length - 1; i > first; i--) {
    if (sorted[i]?.stage !== 'wake') {
      last = i;
      break;
    }
  }
  let disturbances = 0;
  for (let i = first + 1; i <= last; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];
    if (current === undefined || previous === undefined) continue;
    const gap = current.t - previous.t > STAGE_EPOCH_S;
    if (current.stage === 'wake' && (previous.stage !== 'wake' || gap)) disturbances++;
  }
  const firstSleep = sorted[first];
  return { latencyS: Math.max(0, (firstSleep?.t ?? onset) - onset), disturbances };
}

/** Time to fall asleep: from getting into bed to falling asleep, when the night carries both. */
export function fallAsleepS(periods: readonly SleepPeriodRecord[]): number | null {
  const first = periods.filter((p) => !p.nap).sort((a, b) => a.onset - b.onset)[0];
  if (first?.bedOnset === undefined || first.sleepOnset === undefined) return null;
  return Math.max(0, first.sleepOnset - first.bedOnset);
}

export const LATENCY_GOOD_MAX_S = 30 * 60;

export interface NeedBreakdown {
  totalS: number;
  baselineS: number;
  loadS: number;
  debtS: number;
  napsS: number;
  otherS: number;
  load: number | null;
  napCount: number;
}

const OTHER_TOLERANCE_S = 60;

/** Rebuilds tonight's need the way the pipeline does: baseline + yesterday's debt + load need - yesterday's naps. */
export function needBreakdown(days: readonly DayRecord[], index: number, calibration: Calibration = DEFAULT_CALIBRATION): NeedBreakdown | null {
  const day = days[index];
  const total = day?.sleep.need.value ?? null;
  if (day === undefined || total === null) return null;
  const previous = index > 0 ? days[index - 1] : undefined;
  const baselineS = calibration.sleepBaselineMs / 1000;
  const debtS = previous?.sleep.debt.value ?? 0;
  const load = previous?.load.value ?? null;
  const loadS = strainNeedMs(load ?? 0, calibration) / 1000;
  const naps = previous?.sleep.periods.filter((p) => p.nap) ?? [];
  const napsS = naps.reduce((sum, p) => sum + p.asleepS, 0);
  const modelled = Math.max(0, baselineS + debtS + loadS - napsS);
  const other = total - modelled;
  return {
    totalS: total,
    baselineS,
    loadS,
    debtS,
    napsS,
    otherS: Math.abs(other) < OTHER_TOLERANCE_S ? 0 : other,
    load,
    napCount: naps.length,
  };
}

export interface NeedSegment {
  id: 'baseline' | 'load' | 'debt' | 'other';
  seconds: number;
}

export function needSegments(breakdown: NeedBreakdown): NeedSegment[] {
  const parts: NeedSegment[] = [
    { id: 'baseline', seconds: breakdown.baselineS - breakdown.napsS },
    { id: 'load', seconds: breakdown.loadS },
    { id: 'debt', seconds: breakdown.debtS },
    { id: 'other', seconds: breakdown.otherS },
  ];
  return parts.filter((p) => p.seconds > 0);
}

const NOON_MIN = 720;
const DAY_MIN = 1440;

export interface BedWake {
  key: string;
  day: string;
  bed: number | null;
  wake: number | null;
}

function fromNoon(minutes: number): number {
  return (((minutes - NOON_MIN) % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

export function bedWakeOf(day: DayRecord): BedWake {
  const span = mainNightSpan(day);
  if (span === null) return { key: day.day, day: day.day, bed: null, wake: null };
  return { key: day.day, day: day.day, bed: fromNoon(localMinutes(span.onset, day.tzOffsetS)), wake: fromNoon(localMinutes(span.offset, day.tzOffsetS)) };
}

export function bedWakeBars(days: readonly DayRecord[], maxBars = 31): BedWake[] {
  const nights = days.map(bedWakeOf);
  if (nights.length <= maxBars) return nights;
  const size = Math.max(7, Math.ceil(nights.length / maxBars));
  const out: BedWake[] = [];
  for (let i = 0; i < nights.length; i += size) {
    const chunk = nights.slice(i, i + size);
    const first = chunk[0];
    if (first === undefined) continue;
    const bed = mean(chunk.map((n) => n.bed));
    const wake = mean(chunk.map((n) => n.wake));
    out.push({ key: first.day, day: first.day, bed: bed === null ? null : Math.round(bed), wake: wake === null ? null : Math.round(wake) });
  }
  return out;
}

export function bedWakeWindow(bars: readonly BedWake[]): { from: number; to: number } | null {
  const beds = bars.map((b) => b.bed).filter((v): v is number => v !== null);
  const wakes = bars.map((b) => b.wake).filter((v): v is number => v !== null);
  if (beds.length === 0 || wakes.length === 0) return null;
  const from = Math.floor(Math.min(...beds) / 60) * 60;
  const to = Math.ceil(Math.max(...wakes) / 60) * 60;
  return to > from ? { from, to } : null;
}

export function clockFromNoon(minutes: number): number {
  return (minutes + NOON_MIN) % DAY_MIN;
}

export interface TrendStats {
  consistency: number | null;
  efficiency: number | null;
  debtS: number | null;
  restorative: number | null;
}

export function sleepTrendStats(slice: readonly DayRecord[]): TrendStats {
  const latest = [...slice].reverse().find((d) => d.sleep.debt.value !== null);
  const consistency = mean(slice.map((d) => d.sleep.consistency.value));
  const efficiency = mean(slice.map(sleepEfficiency));
  const restorative = mean(slice.map((d) => restorativePct(d.sleep.stages?.totals)));
  return {
    consistency: consistency === null ? null : Math.round(consistency),
    efficiency: efficiency === null ? null : Math.round(efficiency),
    debtS: latest?.sleep.debt.value ?? null,
    restorative: restorative === null ? null : Math.round(restorative),
  };
}

export const PEAK_FRACTION = 1;
export const GET_BY_FRACTION = 0.7;
export const MAX_PLAN_FRACTION = 1.25;

/**
 * The share of tonight's need that the calibrated Sleep score model turns into `score`, at the given consistency:
 * the inverse of score = intercept - weight * ratio^exponent + consistencyWeight * (consistency - neutral).
 * Null when the score sits above what any amount of sleep can reach at that consistency.
 */
export function ratioForScore(score: number, consistency: number | null, c: Calibration = DEFAULT_CALIBRATION): number | null {
  const ceiling = c.sleepScoreIntercept + c.sleepScoreConsistencyWeight * ((consistency ?? c.sleepScoreConsistencyNeutral) - c.sleepScoreConsistencyNeutral);
  const gap = ceiling - score;
  if (!Number.isFinite(gap) || gap <= 0) return null;
  return (gap / c.sleepScoreRatioWeight) ** (1 / c.sleepScoreRatioExponent);
}

export function planScoreOf(plan: WeeklyPlan | null): number | null {
  return plan !== null && plan.goals.includes('sleepScore') ? plan.sleepScoreMin : null;
}

export function effectiveGoal(goal: SleepGoal | null, planScore: number | null): SleepGoal {
  if (goal === null) return planScore === null ? 'peak' : 'plan';
  return goal === 'plan' && planScore === null ? 'peak' : goal;
}

export interface TonightPlan {
  goal: SleepGoal;
  fraction: number;
  reachable: boolean;
  targetS: number;
  bed: BedtimePlan | null;
}

export function tonightPlan(days: readonly DayRecord[], index: number, goal: SleepGoal, planScore: number | null, wakeOverride: number | null = null): TonightPlan | null {
  const day = days[index];
  const need = day?.sleep.need.value ?? null;
  if (day === undefined || need === null) return null;
  const found = goal === 'plan' && planScore !== null ? ratioForScore(planScore, day.sleep.consistency.value) : null;
  const ratio = found !== null && found <= MAX_PLAN_FRACTION ? found : null;
  const fraction = goal === 'getBy' ? GET_BY_FRACTION : goal === 'plan' && ratio !== null ? ratio : PEAK_FRACTION;
  const targetS = need * fraction;
  return { goal, fraction, reachable: goal !== 'plan' || ratio !== null, targetS, bed: planBedtime(days, index, targetS, wakeOverride) };
}

export const WIND_DOWN_LEAD_MIN = 30;

/** Epoch ms of the reminder before the next bedtime, or null when that bedtime is closer than the lead. */
export function windDownAt(bedMinutes: number, now: Date, leadMin = WIND_DOWN_LEAD_MIN): number | null {
  for (let add = 0; add <= 1; add++) {
    const bed = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, Math.floor(bedMinutes / 60), bedMinutes % 60, 0, 0);
    if (bed.getTime() <= now.getTime()) continue;
    const at = bed.getTime() - leadMin * 60_000;
    return at > now.getTime() ? at : null;
  }
  return null;
}
