import { fitnessAge, phenotypicAge } from '@openhoop/analytics';
import type { FitnessAge, PhenoAgeEstimate, PhenoAgeInputs, PhenoAgeReason, Vo2Result } from '@openhoop/analytics';
import type { DayRecord, LabResult } from '@openhoop/core';

import { addDays } from './derived';
import { ageOnDay, latestVo2 } from './healthspanDerived';
import { convertLabValue, parseBiomarkerKey, resultsFor, type BiomarkerId } from './labs';
import type { Profile } from './types';
import type { UserData } from './userData';

export type FitnessAgeReason = 'no-sex' | 'other-sex' | 'out-of-range';

export interface FitnessAgeView {
  day: string | null;
  vo2: Vo2Result;
  fitness: FitnessAge | null;
  reason: FitnessAgeReason | null;
  ageYears: number | null;
}

export function latestFitnessAge(days: readonly DayRecord[], profile: Profile, sex: UserData['sex']): FitnessAgeView {
  const { day, result } = latestVo2(days, profile, sex);
  const ageYears = day === null ? null : ageOnDay(profile, day);
  const base = { day, vo2: result, ageYears };
  if (!result.ok) return { ...base, fitness: null, reason: null };
  if (sex === null) return { ...base, fitness: null, reason: 'no-sex' };
  if (sex === 'other') return { ...base, fitness: null, reason: 'other-sex' };
  const fitness = fitnessAge(result.value.vo2max, result.value.seeMlKgMin, sex);
  return { ...base, fitness, reason: fitness === null ? 'out-of-range' : null };
}

export type FitnessBand =
  | { kind: 'range'; low: number; high: number }
  | { kind: 'below'; age: number }
  | { kind: 'above'; age: number }
  | { kind: 'wide'; low: number; high: number };

export function fitnessBand(fitness: FitnessAge): FitnessBand {
  const { younger, older } = fitness;
  if (younger.kind === 'age' && older.kind === 'age') return { kind: 'range', low: younger.age, high: older.age };
  if (younger.kind === 'younger-than' && older.kind === 'older-than') return { kind: 'wide', low: younger.age, high: older.age };
  if (younger.kind === 'younger-than') return { kind: 'below', age: older.age };
  return { kind: 'above', age: younger.age };
}

export const PHENO_WINDOW_DAYS = 90;

export type MarkerInput = Exclude<keyof PhenoAgeInputs, 'ageYears'>;

export const PHENO_MARKERS = [
  { id: 'albumin', unit: 'g/L', input: 'albuminGL' },
  { id: 'creatinine', unit: 'µmol/L', input: 'creatinineUmolL' },
  { id: 'glucose', unit: 'mmol/L', input: 'glucoseMmolL' },
  { id: 'crp', unit: 'mg/dL', input: 'crpMgDl' },
  { id: 'lymphocytePct', unit: '%', input: 'lymphocytePct' },
  { id: 'mcv', unit: 'fL', input: 'mcvFl' },
  { id: 'rdw', unit: '%', input: 'rdwPct' },
  { id: 'alp', unit: 'U/L', input: 'alpUL' },
  { id: 'wbc', unit: '10^9/L', input: 'wbc10e3PerUl' },
] as const satisfies ReadonlyArray<{ id: BiomarkerId; unit: string; input: MarkerInput }>;

export type PhenoMarkerStatus = 'ok' | 'missing' | 'stale' | 'unit';

export interface PhenoMarkerRow {
  id: BiomarkerId;
  input: MarkerInput;
  unit: string;
  latest: LabResult | null;
  value: number | null;
  status: PhenoMarkerStatus;
}

export type PhenoViewReason = 'incomplete' | 'no-age' | PhenoAgeReason;

export interface PhenoAgeView {
  newestDay: string | null;
  oldestDay: string | null;
  ageYears: number | null;
  markers: PhenoMarkerRow[];
  result: { ok: true; value: PhenoAgeEstimate } | { ok: false; reason: PhenoViewReason };
}

export function latestPhenoAge(labResults: readonly LabResult[], profile: Profile): PhenoAgeView {
  const latest = PHENO_MARKERS.map((marker) => {
    const history = resultsFor(labResults, marker.id);
    return { marker, result: history[history.length - 1] ?? null };
  });
  const days = latest.flatMap((l) => (l.result === null ? [] : [l.result.day]));
  const newestDay = days.reduce<string | null>((max, day) => (max === null || day > max ? day : max), null);
  const cutoff = newestDay === null ? null : addDays(newestDay, -PHENO_WINDOW_DAYS);

  const markers: PhenoMarkerRow[] = latest.map(({ marker, result }) => {
    const row = { id: marker.id, input: marker.input, unit: marker.unit };
    if (result === null) return { ...row, latest: null, value: null, status: 'missing' };
    const value = convertLabValue(result.value, result.unit, marker.unit, parseBiomarkerKey(marker.id));
    if (value === null) return { ...row, latest: result, value: null, status: 'unit' };
    const stale = cutoff !== null && result.day < cutoff;
    return { ...row, latest: result, value, status: stale ? 'stale' : 'ok' };
  });

  const used = markers.filter((m) => m.status === 'ok').map((m) => m.latest?.day ?? '');
  const oldestDay = used.length === 0 ? null : used.reduce((min, day) => (day < min ? day : min));
  const ageYears = newestDay === null ? null : ageOnDay(profile, newestDay);
  const view = { newestDay, oldestDay, ageYears, markers };

  if (markers.some((m) => m.status !== 'ok')) return { ...view, result: { ok: false, reason: 'incomplete' } };
  if (ageYears === null) return { ...view, result: { ok: false, reason: 'no-age' } };

  const valueOf = (input: MarkerInput): number => markers.find((m) => m.input === input)?.value ?? Number.NaN;
  const inputs: PhenoAgeInputs = {
    albuminGL: valueOf('albuminGL'),
    creatinineUmolL: valueOf('creatinineUmolL'),
    glucoseMmolL: valueOf('glucoseMmolL'),
    crpMgDl: valueOf('crpMgDl'),
    lymphocytePct: valueOf('lymphocytePct'),
    mcvFl: valueOf('mcvFl'),
    rdwPct: valueOf('rdwPct'),
    alpUL: valueOf('alpUL'),
    wbc10e3PerUl: valueOf('wbc10e3PerUl'),
    ageYears,
  };
  const result = phenotypicAge(inputs);
  return { ...view, result: result.ok ? result : { ok: false, reason: result.reason } };
}
