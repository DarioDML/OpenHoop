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

export type AgeAt = (day: string) => number | null;

export function latestPhenoAge(labResults: readonly LabResult[], profile: Profile, ageAt: AgeAt = (day) => ageOnDay(profile, day)): PhenoAgeView {
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
  const ageYears = newestDay === null ? null : ageAt(newestDay);
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

const DAYS_PER_YEAR = 365.25;

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000;
}

export type BodyAgeSource = 'pheno' | 'fitness';

export type BodyAgeHeadline =
  | { kind: 'age'; source: BodyAgeSource; age: number; ownAge: number | null; day: string | null }
  | { kind: 'bound'; source: 'fitness'; direction: 'younger-than' | 'older-than'; age: number; ownAge: number | null; day: string | null }
  | { kind: 'none'; reason: 'no-vo2' | FitnessAgeReason };

export function bodyAgeHeadline(fitness: FitnessAgeView, pheno: PhenoAgeView): BodyAgeHeadline {
  if (pheno.result.ok) return { kind: 'age', source: 'pheno', age: pheno.result.value.phenoAge, ownAge: pheno.ageYears, day: pheno.newestDay };
  if (!fitness.vo2.ok) return { kind: 'none', reason: 'no-vo2' };
  if (fitness.fitness === null) return { kind: 'none', reason: fitness.reason ?? 'out-of-range' };
  const { point } = fitness.fitness;
  if (point.kind === 'age') return { kind: 'age', source: 'fitness', age: point.age, ownAge: fitness.ageYears, day: fitness.day };
  return { kind: 'bound', source: 'fitness', direction: point.kind, age: point.age, ownAge: fitness.ageYears, day: fitness.day };
}

export function yearsDifference(headline: BodyAgeHeadline): number | null {
  if (headline.kind !== 'age' || headline.ownAge === null) return null;
  return headline.ownAge - headline.age;
}

export interface PhenoPoint {
  day: string;
  phenoAge: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function fractionalAge(profile: Profile, day: string): number | null {
  const born = profile.birthDate ?? null;
  if (born === null || !ISO_DAY.test(born) || ageOnDay(profile, day) === null) return null;
  const years = (dayNumber(day) - dayNumber(born)) / DAYS_PER_YEAR;
  return Number.isFinite(years) ? years : null;
}

export function phenoAgeHistory(labResults: readonly LabResult[], profile: Profile): PhenoPoint[] {
  const drawDays = [...new Set(labResults.map((r) => r.day))].sort();
  const points: PhenoPoint[] = [];
  for (const day of drawDays) {
    const view = latestPhenoAge(
      labResults.filter((r) => r.day <= day),
      profile,
      (at) => fractionalAge(profile, at),
    );
    if (view.result.ok && view.newestDay === day) points.push({ day, phenoAge: view.result.value.phenoAge });
  }
  return points;
}

export const PACE_MIN_DAYS = 180;
export const PACE_SCALE = { min: -1, max: 3 } as const;

export type PaceOfAging = { ok: true; pace: number; from: PhenoPoint; to: PhenoPoint } | { ok: false; reason: 'needs-birth-date' | 'needs-two-draws' | 'too-close'; draws: number };

export function paceOfAging(history: readonly PhenoPoint[]): PaceOfAging {
  const from = history[0];
  const to = history[history.length - 1];
  if (from === undefined || to === undefined || history.length < 2) return { ok: false, reason: 'needs-two-draws', draws: history.length };
  const span = dayNumber(to.day) - dayNumber(from.day);
  if (!(span >= PACE_MIN_DAYS)) return { ok: false, reason: 'too-close', draws: history.length };
  return { ok: true, pace: (to.phenoAge - from.phenoAge) / (span / DAYS_PER_YEAR), from, to };
}

export function paceFromLabs(labResults: readonly LabResult[], profile: Profile): PaceOfAging {
  const born = profile.birthDate ?? null;
  if (born === null || !ISO_DAY.test(born)) return { ok: false, reason: 'needs-birth-date', draws: 0 };
  return paceOfAging(phenoAgeHistory(labResults, profile));
}
