import type { BodyMeasurement, DayRecord, LabResult } from '@openhoop/core';

import type { TranslationKey } from '@/i18n';

import { sortMeasurements } from './bodyComposition';
import { addDays, mean, stdev } from './derived';
import { caloriesForDay } from './energyDerived';
import { buildHistory, groupKey, parseBiomarkerKey, rangeStatus, resultsFor, sortResults, type BiomarkerRef, type RangeStatus } from './labs';
import type { ParityLevel, Profile } from './types';
import type { UserData } from './userData';

export const REPORT_PERIODS = [30, 90] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export function parseReportPeriod(value: string): ReportPeriod {
  return REPORT_PERIODS.find((period) => `${period}` === value) ?? 30;
}

export const REPORT_SECTIONS = ['scores', 'sleep', 'vitals', 'energy', 'body', 'labs'] as const;
export type ReportSectionId = (typeof REPORT_SECTIONS)[number];

export type ReportValueKind = 'number' | 'duration';
export type TrendDirection = 'up' | 'down' | 'flat';

export const MIN_TREND_VALUES = 6;

export const REASON_NO_ENTRIES = 'no-entries';
export const REASON_NO_BODY_FAT = 'no-body-fat';

export interface ReportRow {
  id: string;
  labelKey: TranslationKey;
  level: ParityLevel;
  kind: ReportValueKind;
  decimals: number;
  unitKey: TranslationKey | null;
  signed: boolean;
  series: Array<number | null>;
  average: number | null;
  min: number | null;
  max: number | null;
  trend: TrendDirection | null;
  coverageDays: number;
  totalDays: number;
  reason: string | null;
}

export interface ReportLabLatest {
  value: number;
  day: string;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  status: RangeStatus | null;
  note: string | null;
}

export interface ReportLab {
  group: string;
  ref: BiomarkerRef;
  unit: string;
  values: number[];
  count: number;
  average: number;
  min: number;
  max: number;
  trend: TrendDirection | null;
  latest: ReportLabLatest;
}

export interface ReportSection {
  id: ReportSectionId;
  rows: ReportRow[];
  labs: ReportLab[];
}

export interface ReportModel {
  period: ReportPeriod;
  from: string;
  to: string;
  generatedOn: string;
  name: string | null;
  sections: ReportSection[];
}

export interface ReportInput {
  days: readonly DayRecord[];
  bodyMeasurements: readonly BodyMeasurement[];
  labResults: readonly LabResult[];
  userData: UserData;
  profile: Profile;
  period: ReportPeriod;
  sections: readonly ReportSectionId[];
  includeName: boolean;
  today: string;
}

interface Reading {
  value: number | null;
  reason: string | null;
}

interface MetricSpec {
  id: string;
  section: Exclude<ReportSectionId, 'body' | 'labs'>;
  labelKey: TranslationKey;
  level: ParityLevel;
  kind: ReportValueKind;
  decimals: number;
  unitKey: TranslationKey | null;
  signed?: boolean;
  read: (day: DayRecord, input: ReportInput) => Reading;
}

function sleepBalance(day: DayRecord): Reading {
  const { asleepS, need } = day.sleep;
  if (asleepS === null) return { value: null, reason: 'no-sleep' };
  if (need.value === null) return { value: null, reason: need.reason };
  return { value: asleepS - need.value, reason: null };
}

const METRICS: readonly MetricSpec[] = [
  { id: 'readiness', section: 'scores', labelKey: 'score.readiness', level: 'B', kind: 'number', decimals: 0, unitKey: null, read: (d) => d.readiness },
  { id: 'sleepScore', section: 'scores', labelKey: 'score.sleep', level: 'B', kind: 'number', decimals: 0, unitKey: null, read: (d) => d.sleep.score },
  { id: 'load', section: 'scores', labelKey: 'score.load', level: 'B', kind: 'number', decimals: 1, unitKey: null, read: (d) => d.load },
  {
    id: 'asleep',
    section: 'sleep',
    labelKey: 'metric.asleep',
    level: 'B',
    kind: 'duration',
    decimals: 0,
    unitKey: null,
    read: (d) => ({ value: d.sleep.asleepS, reason: d.sleep.asleepS === null ? 'no-sleep' : null }),
  },
  { id: 'need', section: 'sleep', labelKey: 'metric.need', level: 'B', kind: 'duration', decimals: 0, unitKey: null, read: (d) => d.sleep.need },
  { id: 'balance', section: 'sleep', labelKey: 'health.report.metric.sleepBalance', level: 'B', kind: 'duration', decimals: 0, unitKey: null, signed: true, read: sleepBalance },
  { id: 'hrv', section: 'vitals', labelKey: 'metric.hrv', level: 'B', kind: 'number', decimals: 0, unitKey: 'unit.ms', read: (d) => d.hrv },
  { id: 'rhr', section: 'vitals', labelKey: 'metric.restingHr', level: 'B', kind: 'number', decimals: 0, unitKey: 'unit.bpm', read: (d) => d.restingHr },
  { id: 'resp', section: 'vitals', labelKey: 'metric.respiratoryRate', level: 'B', kind: 'number', decimals: 1, unitKey: 'unit.perMin', read: (d) => d.respiratoryRate },
  { id: 'spo2', section: 'vitals', labelKey: 'metric.spo2', level: 'A', kind: 'number', decimals: 0, unitKey: 'unit.percent', read: (d) => d.spo2 },
  {
    id: 'tempDeviation',
    section: 'vitals',
    labelKey: 'metric.skinTempDeviation',
    level: 'A',
    kind: 'number',
    decimals: 1,
    unitKey: 'unit.celsiusDelta',
    signed: true,
    read: (d) => d.skinTempDeviationC,
  },
  {
    id: 'calories',
    section: 'energy',
    labelKey: 'health.report.metric.calories',
    level: 'C',
    kind: 'number',
    decimals: 0,
    unitKey: 'calories.unit',
    read: (d, input) => {
      const view = caloriesForDay(d, input.userData, input.profile);
      return { value: view.estimate?.totalKcal ?? null, reason: view.reason };
    },
  },
];

export function periodDates(to: string, period: ReportPeriod): string[] {
  return Array.from({ length: period }, (_, i) => addDays(to, i - period + 1));
}

export function trendOf(values: ReadonlyArray<number | null>): TrendDirection | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length < MIN_TREND_VALUES) return null;
  const half = Math.floor(present.length / 2);
  const first = mean(present.slice(0, half));
  const second = mean(present.slice(present.length - half));
  const spread = stdev(present);
  if (first === null || second === null || spread === null) return null;
  const delta = second - first;
  const noise = (spread * 2) / Math.sqrt(present.length);
  if (Math.abs(delta) <= noise) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function mostCommon(reasons: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [reason, count] of counts) {
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  return best;
}

interface RowShape {
  id: string;
  labelKey: TranslationKey;
  level: ParityLevel;
  kind: ReportValueKind;
  decimals: number;
  unitKey: TranslationKey | null;
  signed: boolean;
}

function buildRow(shape: RowShape, series: Array<number | null>, reasons: readonly string[], fallback: string): ReportRow {
  const present = series.filter((v): v is number => v !== null);
  const hasValues = present.length > 0;
  return {
    ...shape,
    series,
    average: mean(present),
    min: hasValues ? Math.min(...present) : null,
    max: hasValues ? Math.max(...present) : null,
    trend: trendOf(series),
    coverageDays: present.length,
    totalDays: series.length,
    reason: hasValues ? null : (mostCommon(reasons) ?? fallback),
  };
}

function metricRow(spec: MetricSpec, dates: readonly string[], byDay: ReadonlyMap<string, DayRecord>, input: ReportInput): ReportRow {
  const reasons: string[] = [];
  const series = dates.map((date) => {
    const day = byDay.get(date);
    if (day === undefined) return null;
    const reading = spec.read(day, input);
    if (reading.value === null) {
      if (reading.reason !== null) reasons.push(reading.reason);
      return null;
    }
    return Number.isFinite(reading.value) ? reading.value : null;
  });
  const { id, labelKey, level, kind, decimals, unitKey, signed = false } = spec;
  return buildRow({ id, labelKey, level, kind, decimals, unitKey, signed }, series, reasons, 'no-data');
}

function bodyRows(dates: readonly string[], measurements: readonly BodyMeasurement[]): ReportRow[] {
  const byDay = new Map<string, BodyMeasurement>();
  for (const entry of sortMeasurements(measurements)) byDay.set(entry.day, entry);
  const weight = dates.map((date) => byDay.get(date)?.weightKg ?? null);
  const fat = dates.map((date) => byDay.get(date)?.bodyFatPct ?? null);
  const base = { level: 'D', kind: 'number', decimals: 1, signed: false } as const;
  return [
    buildRow({ ...base, id: 'weight', labelKey: 'health.metrics.weight', unitKey: 'health.unit.kg' }, weight, [], REASON_NO_ENTRIES),
    buildRow({ ...base, id: 'bodyFat', labelKey: 'health.bodyComposition.field.bodyFat', unitKey: 'unit.percent' }, fat, [], weight.some((v) => v !== null) ? 'no-body-fat' : REASON_NO_ENTRIES),
  ];
}

function labsFor(results: readonly LabResult[], from: string, to: string): ReportLab[] {
  const inPeriod = results.filter((result) => result.day >= from && result.day <= to);
  const groups = new Map<string, string>();
  for (const result of sortResults(inPeriod)) groups.set(groupKey(result.biomarker), result.biomarker);
  const labs: ReportLab[] = [];
  for (const [group, key] of groups) {
    const entries = resultsFor(inPeriod, key);
    const latestEntry = entries[entries.length - 1];
    const history = buildHistory(entries, null);
    if (latestEntry === undefined || history === null) continue;
    const values = history.points.map((point) => point.value);
    const average = mean(values);
    if (average === null || values.length === 0) continue;
    const latestPoint = history.points[history.points.length - 1];
    if (latestPoint === undefined) continue;
    labs.push({
      group,
      ref: parseBiomarkerKey(key),
      unit: history.unit,
      values,
      count: entries.length,
      average,
      min: Math.min(...values),
      max: Math.max(...values),
      trend: trendOf(values),
      latest: {
        value: latestPoint.value,
        day: latestEntry.day,
        unit: history.unit,
        refLow: latestEntry.refLow,
        refHigh: latestEntry.refHigh,
        status: rangeStatus(latestEntry),
        note: latestEntry.note,
      },
    });
  }
  return labs;
}

export function buildReport(input: ReportInput): ReportModel {
  const dates = periodDates(input.today, input.period);
  const from = dates[0] ?? input.today;
  const byDay = new Map(input.days.map((day) => [day.day, day]));
  const sections: ReportSection[] = [];
  for (const id of REPORT_SECTIONS) {
    if (!input.sections.includes(id)) continue;
    if (id === 'labs') {
      sections.push({ id, rows: [], labs: labsFor(input.labResults, from, input.today) });
    } else if (id === 'body') {
      sections.push({ id, rows: bodyRows(dates, input.bodyMeasurements), labs: [] });
    } else {
      sections.push({ id, rows: METRICS.filter((spec) => spec.section === id).map((spec) => metricRow(spec, dates, byDay, input)), labs: [] });
    }
  }
  return {
    period: input.period,
    from,
    to: input.today,
    generatedOn: input.today,
    name: input.includeName ? input.userData.name : null,
    sections,
  };
}
