import type { DayRecord, Derived, LabResult } from '@openhoop/core';
import type { Href } from 'expo-router';

import type { TranslationKey } from '@/i18n';

import type { TermId } from './terms';

import { bodyAgeHeadline, latestFitnessAge, latestPhenoAge } from './bodyAgeDerived';
import { addDays, baselineAt, mean, metricValue, rangeStatus, type Baseline, type MetricKey, type RangeStatus } from './derived';
import { latestStressScore } from './stressDerived';
import type { ParityLevel, Profile } from './types';
import { latestVo2 } from './healthspanDerived';
import type { JournalAnswer, UserData } from './userData';

export type VitalId = 'hrv' | 'rhr' | 'resp' | 'spo2' | 'temp';

export interface VitalSpec {
  id: VitalId;
  term: TermId;
  key: MetricKey;
  level: ParityLevel;
  decimals: number;
  labelKey: TranslationKey;
  unitKey: TranslationKey;
}

export const VITALS: readonly VitalSpec[] = [
  { id: 'hrv', term: 'hrv', key: 'hrv', level: 'B', decimals: 0, labelKey: 'metric.hrv', unitKey: 'unit.ms' },
  { id: 'rhr', term: 'restingHr', key: 'restingHr', level: 'B', decimals: 0, labelKey: 'metric.restingHr', unitKey: 'unit.bpm' },
  { id: 'resp', term: 'respiratoryRate', key: 'respiratoryRate', level: 'B', decimals: 1, labelKey: 'metric.respiratoryRate', unitKey: 'unit.perMin' },
  { id: 'spo2', term: 'spo2', key: 'spo2', level: 'A', decimals: 0, labelKey: 'metric.spo2', unitKey: 'unit.percent' },
  { id: 'temp', term: 'skinTemp', key: 'skinTemp', level: 'A', decimals: 1, labelKey: 'metric.skinTemp', unitKey: 'unit.celsius' },
];

export interface VitalReading {
  spec: VitalSpec;
  value: number | null;
  reason: string | null;
  baseline: Baseline | null;
  status: RangeStatus | null;
}

function vitalDerived(day: DayRecord, id: VitalId): Derived {
  switch (id) {
    case 'hrv':
      return day.hrv;
    case 'rhr':
      return day.restingHr;
    case 'resp':
      return day.respiratoryRate;
    case 'spo2':
      return day.spo2;
    case 'temp':
      return day.skinTempC;
  }
}

export function latestVitalsIndex(days: readonly DayRecord[]): number {
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day && VITALS.some((spec) => metricValue(day, spec.key) !== null)) return i;
  }
  return -1;
}

export function vitalReadings(days: readonly DayRecord[], index: number): VitalReading[] {
  const day = days[index];
  return VITALS.map((spec) => {
    if (!day) return { spec, value: null, reason: 'no-data', baseline: null, status: null };
    const derived = vitalDerived(day, spec.id);
    const baseline = baselineAt(days, index, spec.key);
    return { spec, value: derived.value, reason: derived.reason, baseline, status: rangeStatus(derived.value, baseline) };
  });
}

export interface VitalsSummary {
  measured: number;
  judged: number;
  within: number;
}

export function vitalsSummary(readings: readonly VitalReading[]): VitalsSummary {
  const measured = readings.filter((r) => r.value !== null).length;
  const judged = readings.filter((r) => r.status !== null).length;
  const within = readings.filter((r) => r.status === 'within').length;
  return { measured, judged, within };
}

export function isVitalId(value: string | undefined): value is VitalId {
  return value === 'hrv' || value === 'rhr' || value === 'resp' || value === 'spo2' || value === 'temp';
}

export interface Latest {
  value: number;
  day: string;
}

export function latestValue(days: readonly DayRecord[], key: MetricKey): Latest | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (!day) continue;
    const value = metricValue(day, key);
    if (value !== null) return { value, day: day.day };
  }
  return null;
}

export function latestHeartRateDayIndex(days: readonly DayRecord[]): number {
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i]?.heartRate.avg !== null && days[i]?.heartRate.avg !== undefined) return i;
  }
  return days.length - 1;
}

export type MetricCategory = 'readiness' | 'sleep' | 'load' | 'health' | 'raw';
export const METRIC_CATEGORIES: readonly MetricCategory[] = ['readiness', 'sleep', 'load', 'health', 'raw'];

export type MetricReading =
  | { kind: 'number'; value: number; decimals: number; unitKey: TranslationKey | null }
  | { kind: 'duration'; seconds: number }
  | { kind: 'none' };

export interface CatalogueItem {
  id: string;
  term: TermId | null;
  labelKey: TranslationKey;
  category: MetricCategory;
  level: ParityLevel | null;
  href: Href;
  read: (days: readonly DayRecord[], weightKg: number | null, profile: Profile, extra?: CatalogueExtra) => MetricReading;
}

export interface CatalogueExtra {
  sex: UserData['sex'];
  labResults: readonly LabResult[];
}

function numeric(key: MetricKey, decimals: number, unitKey: TranslationKey | null): CatalogueItem['read'] {
  return (days) => {
    const latest = latestValue(days, key);
    return latest ? { kind: 'number', value: latest.value, decimals, unitKey } : { kind: 'none' };
  };
}

function seconds(key: 'asleepH' | 'sleepNeedH' | 'sleepDebtH'): CatalogueItem['read'] {
  return (days) => {
    const latest = latestValue(days, key);
    return latest ? { kind: 'duration', seconds: Math.round(latest.value * 3600) } : { kind: 'none' };
  };
}

const none: CatalogueItem['read'] = () => ({ kind: 'none' });

export const CATALOGUE: readonly CatalogueItem[] = [
  { id: 'readiness', term: 'readiness', labelKey: 'score.readiness', category: 'readiness', level: 'B', href: '/recovery', read: numeric('readiness', 0, null) },
  { id: 'hrv', term: 'hrv', labelKey: 'metric.hrv', category: 'readiness', level: 'B', href: '/recovery/metric/hrv', read: numeric('hrv', 0, 'unit.ms') },
  { id: 'rhr', term: 'restingHr', labelKey: 'metric.restingHr', category: 'readiness', level: 'B', href: '/recovery/metric/rhr', read: numeric('restingHr', 0, 'unit.bpm') },
  { id: 'resp', term: 'respiratoryRate', labelKey: 'metric.respiratoryRate', category: 'readiness', level: 'B', href: '/recovery/metric/resp', read: numeric('respiratoryRate', 1, 'unit.perMin') },
  { id: 'spo2', term: 'spo2', labelKey: 'metric.spo2', category: 'readiness', level: 'A', href: '/recovery/metric/spo2', read: numeric('spo2', 0, 'unit.percent') },
  { id: 'temp', term: 'skinTemp', labelKey: 'metric.skinTemp', category: 'readiness', level: 'A', href: '/recovery/metric/temp', read: numeric('skinTemp', 1, 'unit.celsius') },
  { id: 'tempDeviation', term: 'skinTempChange', labelKey: 'metric.skinTempDeviation', category: 'readiness', level: 'A', href: '/recovery/metric/temp', read: numeric('skinTempDeviation', 1, 'unit.celsiusDelta') },
  { id: 'sleepScore', term: 'sleepScore', labelKey: 'score.sleep', category: 'sleep', level: 'B', href: '/sleep', read: numeric('sleepScore', 0, null) },
  { id: 'asleep', term: 'asleep', labelKey: 'metric.asleep', category: 'sleep', level: 'B', href: '/sleep/last-night', read: seconds('asleepH') },
  { id: 'need', term: 'sleepNeed', labelKey: 'metric.need', category: 'sleep', level: 'B', href: '/sleep/need', read: seconds('sleepNeedH') },
  { id: 'debt', term: 'sleepDebt', labelKey: 'metric.debt', category: 'sleep', level: 'B', href: '/sleep/need', read: seconds('sleepDebtH') },
  { id: 'consistency', term: 'consistency', labelKey: 'metric.consistency', category: 'sleep', level: 'C', href: '/sleep/trends', read: numeric('consistency', 0, 'unit.percent') },
  { id: 'load', term: 'load', labelKey: 'score.load', category: 'load', level: 'B', href: '/load', read: numeric('load', 1, null) },
  { id: 'steps', term: 'steps', labelKey: 'metric.steps', category: 'load', level: 'A', href: '/steps', read: numeric('steps', 0, null) },
  {
    id: 'heartRate24h',
    term: null,
    labelKey: 'health.metrics.heartRate24h',
    category: 'raw',
    level: 'A',
    href: '/health/heart-rate',
    read: (days) => {
      const day = days[latestHeartRateDayIndex(days)];
      const avg = day?.heartRate.avg ?? null;
      return avg === null ? { kind: 'none' } : { kind: 'number', value: avg, decimals: 0, unitKey: 'unit.bpm' };
    },
  },
  {
    id: 'bodyAge',
    term: 'bodyAge',
    labelKey: 'health.metrics.bodyAge',
    category: 'health',
    level: 'C',
    href: '/health/body-age',
    read: (days, _weightKg, profile, extra) => {
      if (extra === undefined) return { kind: 'none' };
      const headline = bodyAgeHeadline(latestFitnessAge(days, profile, extra.sex), latestPhenoAge(extra.labResults, profile));
      return headline.kind === 'age' ? { kind: 'number', value: headline.age, decimals: 1, unitKey: 'health.bodyAge.years' } : { kind: 'none' };
    },
  },
  {
    id: 'vo2max',
    term: 'vo2max',
    labelKey: 'health.metrics.vo2max',
    category: 'health',
    level: 'C',
    href: '/health/vo2max',
    read: (days, _weightKg, profile) => {
      const { result } = latestVo2(days, profile, null);
      return result.ok ? { kind: 'number', value: result.value.vo2max, decimals: 0, unitKey: 'health.vo2max.unit' } : { kind: 'none' };
    },
  },
  {
    id: 'stress',
    term: 'stress',
    labelKey: 'health.metrics.stress',
    category: 'health',
    level: 'C',
    href: '/health/stress',
    read: (days) => {
      const score = latestStressScore(days);
      return score === null ? { kind: 'none' } : { kind: 'number', value: score, decimals: 1, unitKey: null };
    },
  },
  {
    id: 'weight',
    term: null,
    labelKey: 'health.metrics.weight',
    category: 'health',
    level: null,
    href: '/health/body-composition',
    read: (_days, weightKg) => (weightKg === null ? { kind: 'none' } : { kind: 'number', value: weightKg, decimals: 1, unitKey: 'health.unit.kg' }),
  },
  { id: 'ecg', term: null, labelKey: 'health.metrics.ecg', category: 'health', level: null, href: '/health/ecg', read: none },
  { id: 'bloodPressure', term: null, labelKey: 'health.metrics.bloodPressure', category: 'health', level: null, href: '/health/blood-pressure', read: none },
  { id: 'cycle', term: null, labelKey: 'health.metrics.cycle', category: 'health', level: null, href: '/health/cycle', read: none },
  { id: 'labs', term: null, labelKey: 'health.metrics.labs', category: 'health', level: null, href: '/health/labs', read: none },
];

export function bmi(heightCm: number | null, weightKg: number | null): number | null {
  if (heightCm === null || weightKg === null || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export const MIN_DAYS_PER_SIDE = 5;
export const TREND_DAYS = 30;

export function answerIsYes(answer: JournalAnswer | undefined): boolean | null {
  if (answer === undefined) return null;
  return typeof answer === 'number' ? answer > 0 : answer;
}

export interface YesRate {
  yes: number;
  answered: number;
  cells: Array<boolean | null>;
}

export function yesRate(journal: Record<string, Record<string, JournalAnswer>>, questionId: string, endDay: string, count = TREND_DAYS): YesRate {
  const cells: Array<boolean | null> = [];
  for (let i = count - 1; i >= 0; i--) {
    cells.push(answerIsYes(journal[addDays(endDay, -i)]?.[questionId]));
  }
  return { yes: cells.filter((c) => c === true).length, answered: cells.filter((c) => c !== null).length, cells };
}

export interface BehaviourComparison {
  withAvg: number | null;
  withoutAvg: number | null;
  nWith: number;
  nWithout: number;
  deltaPct: number | null;
  enough: boolean;
}

export interface BehaviourSamples {
  withValues: number[];
  withoutValues: number[];
}

export function behaviourSamples(days: readonly DayRecord[], journal: Record<string, Record<string, JournalAnswer>>, questionId: string, metric: MetricKey): BehaviourSamples {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const withValues: number[] = [];
  const withoutValues: number[] = [];
  for (const [day, answers] of Object.entries(journal)) {
    const yes = answerIsYes(answers[questionId]);
    if (yes === null) continue;
    const next = byDay.get(addDays(day, 1));
    if (!next) continue;
    const value = metricValue(next, metric);
    if (value === null) continue;
    (yes ? withValues : withoutValues).push(value);
  }
  return { withValues, withoutValues };
}

export function compareBehaviour(
  days: readonly DayRecord[],
  journal: Record<string, Record<string, JournalAnswer>>,
  questionId: string,
  metric: MetricKey,
  minDays = MIN_DAYS_PER_SIDE,
): BehaviourComparison {
  const { withValues, withoutValues } = behaviourSamples(days, journal, questionId, metric);
  const withAvg = mean(withValues);
  const withoutAvg = mean(withoutValues);
  const deltaPct = withAvg !== null && withoutAvg !== null && withoutAvg !== 0 ? ((withAvg - withoutAvg) / Math.abs(withoutAvg)) * 100 : null;
  return {
    withAvg,
    withoutAvg,
    nWith: withValues.length,
    nWithout: withoutValues.length,
    deltaPct,
    enough: withValues.length >= minDays && withoutValues.length >= minDays,
  };
}

export type BreathPhase = 'inhale' | 'holdIn' | 'exhale' | 'holdOut';
export type BreathPatternId = 'calm' | 'box' | 'relax';

export interface BreathPattern {
  id: BreathPatternId;
  steps: ReadonlyArray<{ phase: BreathPhase; seconds: number }>;
}

export const BREATH_PATTERNS: readonly BreathPattern[] = [
  { id: 'calm', steps: [{ phase: 'inhale', seconds: 4 }, { phase: 'exhale', seconds: 6 }] },
  {
    id: 'box',
    steps: [
      { phase: 'inhale', seconds: 4 },
      { phase: 'holdIn', seconds: 4 },
      { phase: 'exhale', seconds: 4 },
      { phase: 'holdOut', seconds: 4 },
    ],
  },
  { id: 'relax', steps: [{ phase: 'inhale', seconds: 4 }, { phase: 'holdIn', seconds: 7 }, { phase: 'exhale', seconds: 8 }] },
];

export const BREATH_DURATIONS_MIN = [1, 3, 5] as const;

export interface BreathPosition {
  phase: BreathPhase;
  secondsLeft: number;
  phaseSeconds: number;
}

export function breathPositionAt(pattern: BreathPattern, elapsedS: number): BreathPosition {
  const cycle = pattern.steps.reduce((sum, step) => sum + step.seconds, 0);
  let t = Math.max(0, elapsedS) % cycle;
  for (const step of pattern.steps) {
    if (t < step.seconds) return { phase: step.phase, secondsLeft: step.seconds - t, phaseSeconds: step.seconds };
    t -= step.seconds;
  }
  const first = pattern.steps[0];
  return { phase: first?.phase ?? 'inhale', secondsLeft: first?.seconds ?? 1, phaseSeconds: first?.seconds ?? 1 };
}
