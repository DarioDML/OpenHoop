import type { DayRecord, VendorCycle, VendorData, VendorSleep } from '@openhoop/core';

export const ACCURACY_METRICS = ['readiness', 'load', 'sleepScore', 'hrv', 'restingHr', 'respiratoryRate', 'spo2', 'skinTemp'] as const;
export type AccuracyMetric = (typeof ACCURACY_METRICS)[number];

export const ACCURACY_TARGETS: Readonly<Partial<Record<AccuracyMetric, number>>> = {
  readiness: 5,
  load: 1,
  sleepScore: 3,
  hrv: 5,
  spo2: 1,
  skinTemp: 0.2,
};

export const MIN_PAIRS = 3;

export interface MetricComparison {
  metric: AccuracyMetric;
  pairs: number;
  meanAbsError: number | null;
  target: number | null;
  pass: boolean | null;
}

function mainSleep(sleeps: readonly VendorSleep[]): VendorSleep | null {
  let best: VendorSleep | null = null;
  for (const sleep of sleeps) {
    if (sleep.nap) continue;
    if (best === null || (sleep.asleepMin ?? 0) > (best.asleepMin ?? 0)) best = sleep;
  }
  return best;
}

function official(metric: AccuracyMetric, cycle: VendorCycle | undefined, sleep: VendorSleep | null): number | null {
  switch (metric) {
    case 'readiness':
      return cycle?.recoveryPct ?? null;
    case 'load':
      return cycle?.dayStrain ?? null;
    case 'sleepScore':
      return sleep?.performancePct ?? null;
    case 'hrv':
      return cycle?.hrvMs ?? null;
    case 'restingHr':
      return cycle?.restingHr ?? null;
    case 'respiratoryRate':
      return cycle?.respiratoryRate ?? sleep?.respiratoryRate ?? null;
    case 'spo2':
      return cycle?.spo2Pct ?? null;
    case 'skinTemp':
      return cycle?.skinTempC ?? null;
  }
}

function ours(metric: AccuracyMetric, day: DayRecord): number | null {
  switch (metric) {
    case 'readiness':
      return day.readiness.value;
    case 'load':
      return day.load.value;
    case 'sleepScore':
      return day.sleep.score.value;
    case 'hrv':
      return day.hrv.value;
    case 'restingHr':
      return day.restingHr.value;
    case 'respiratoryRate':
      return day.respiratoryRate.value;
    case 'spo2':
      return day.spo2.value;
    case 'skinTemp':
      return day.skinTempC.value;
  }
}

export function compareWithOfficial(days: readonly DayRecord[], vendor: VendorData): MetricComparison[] {
  const cycles = new Map(vendor.cycles.map((cycle) => [cycle.day, cycle]));
  const sleepsByDay = new Map<string, VendorSleep[]>();
  for (const sleep of vendor.sleeps) sleepsByDay.set(sleep.day, [...(sleepsByDay.get(sleep.day) ?? []), sleep]);
  return ACCURACY_METRICS.map((metric) => {
    const errors: number[] = [];
    for (const day of days) {
      const mine = ours(metric, day);
      const theirs = official(metric, cycles.get(day.day), mainSleep(sleepsByDay.get(day.day) ?? []));
      if (mine === null || theirs === null || !Number.isFinite(mine) || !Number.isFinite(theirs)) continue;
      errors.push(Math.abs(mine - theirs));
    }
    const target = ACCURACY_TARGETS[metric] ?? null;
    if (errors.length < MIN_PAIRS) return { metric, pairs: errors.length, meanAbsError: null, target, pass: null };
    const meanAbsError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
    return { metric, pairs: errors.length, meanAbsError, target, pass: target === null ? null : meanAbsError <= target };
  });
}

export interface AccuracySummary {
  measured: number;
  withTarget: number;
  passing: number;
  nights: number;
}

export function summarise(comparisons: readonly MetricComparison[]): AccuracySummary {
  const measured = comparisons.filter((comparison) => comparison.meanAbsError !== null);
  const judged = measured.filter((comparison) => comparison.pass !== null);
  return {
    measured: measured.length,
    withTarget: judged.length,
    passing: judged.filter((comparison) => comparison.pass === true).length,
    nights: measured.reduce((most, comparison) => Math.max(most, comparison.pairs), 0),
  };
}
