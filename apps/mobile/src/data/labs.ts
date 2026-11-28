import type { DayRecord, LabResult, LabResultInput } from '@openhoop/core';

import { parseIsoDate } from '@/lib/dates';

import { shiftIsoDay } from './bodyComposition';
import { metricValue } from './derived';
import type { Language } from './types';

export interface LabUnit {
  label: string;
  factor: number;
  offset: number;
}

export const BIOMARKER_IDS = [
  'glucose',
  'hba1c',
  'totalCholesterol',
  'ldl',
  'hdl',
  'triglycerides',
  'ferritin',
  'vitaminD',
  'tsh',
  'crp',
  'haemoglobin',
  'albumin',
  'creatinine',
  'lymphocytePct',
  'mcv',
  'rdw',
  'alp',
  'wbc',
] as const;

export type BiomarkerId = (typeof BIOMARKER_IDS)[number];

const unit = (label: string, factor = 1, offset = 0): LabUnit => ({ label, factor, offset });

export const BIOMARKER_UNITS: Readonly<Record<BiomarkerId, readonly LabUnit[]>> = {
  glucose: [unit('mmol/L'), unit('mg/dL', 1 / 18.016)],
  hba1c: [unit('%'), unit('mmol/mol', 1 / 10.929, 2.15)],
  totalCholesterol: [unit('mmol/L'), unit('mg/dL', 1 / 38.67)],
  ldl: [unit('mmol/L'), unit('mg/dL', 1 / 38.67)],
  hdl: [unit('mmol/L'), unit('mg/dL', 1 / 38.67)],
  triglycerides: [unit('mmol/L'), unit('mg/dL', 1 / 88.57)],
  ferritin: [unit('ng/mL'), unit('µg/L'), unit('pmol/L', 1 / 2.247)],
  vitaminD: [unit('ng/mL'), unit('nmol/L', 1 / 2.496)],
  tsh: [unit('mIU/L'), unit('µIU/mL')],
  crp: [unit('mg/L'), unit('mg/dL', 10)],
  haemoglobin: [unit('g/dL'), unit('g/L', 0.1)],
  albumin: [unit('g/L'), unit('g/dL', 10)],
  creatinine: [unit('µmol/L'), unit('mg/dL', 88.42)],
  lymphocytePct: [unit('%')],
  mcv: [unit('fL')],
  rdw: [unit('%')],
  alp: [unit('U/L'), unit('µkat/L', 60)],
  wbc: [unit('10^9/L'), unit('10^3/µL'), unit('/µL', 0.001)],
};

export function isBiomarkerId(value: string): value is BiomarkerId {
  return BIOMARKER_IDS.some((id) => id === value);
}

export const CUSTOM_PICK = 'custom';
export const CUSTOM_PREFIX = 'custom:';

export const LAB_LIMITS = {
  nameLength: 60,
  unitLength: 24,
  noteLength: 300,
  maxValue: 1_000_000,
} as const;

export type BiomarkerRef = { kind: 'catalogue'; id: BiomarkerId } | { kind: 'custom'; name: string };

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function customKey(name: string): string {
  return `${CUSTOM_PREFIX}${collapse(name)}`;
}

export function parseBiomarkerKey(key: string): BiomarkerRef {
  if (isBiomarkerId(key)) return { kind: 'catalogue', id: key };
  return { kind: 'custom', name: key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : key };
}

export function groupKey(key: string): string {
  const ref = parseBiomarkerKey(key);
  return ref.kind === 'catalogue' ? ref.id : `${CUSTOM_PREFIX}${ref.name.toLowerCase()}`;
}

export function unitsOf(ref: BiomarkerRef): readonly LabUnit[] {
  return ref.kind === 'catalogue' ? BIOMARKER_UNITS[ref.id] : [];
}

export function convertLabValue(value: number, from: string, to: string, ref: BiomarkerRef): number | null {
  if (from === to) return value;
  const units = unitsOf(ref);
  const source = units.find((u) => u.label === from);
  const target = units.find((u) => u.label === to);
  if (source === undefined || target === undefined) return null;
  return (value * source.factor + source.offset - target.offset) / target.factor;
}

export type RangeStatus = 'inside' | 'outside';

export function rangeStatus(result: Pick<LabResult, 'value' | 'refLow' | 'refHigh'>): RangeStatus | null {
  if (result.refLow === null && result.refHigh === null) return null;
  const aboveLow = result.refLow === null || result.value >= result.refLow;
  const belowHigh = result.refHigh === null || result.value <= result.refHigh;
  return aboveLow && belowHigh ? 'inside' : 'outside';
}

export type LabField = 'biomarker' | 'unit' | 'value' | 'day' | 'refLow' | 'refHigh' | 'note';

export interface LabDraft {
  biomarker: string;
  customName: string;
  unit: string;
  value: string;
  day: string;
  refLow: string;
  refHigh: string;
  note: string;
}

export type LabValidation = { ok: true; value: LabResultInput } | { ok: false; invalid: LabField[] };

const MIN_YEAR = 2000;
const DECIMAL = /^\d{1,7}([.,]\d{1,4})?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) && parsed <= LAB_LIMITS.maxValue ? parsed : null;
}

function validDay(day: string, today: string): boolean {
  const parts = parseIsoDate(day);
  return parts !== null && parts.y >= MIN_YEAR && day <= today;
}

const NOTE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function plainText(text: string, maxLength: number, control: RegExp = CONTROL): boolean {
  return text.length >= 1 && text.length <= maxLength && !control.test(text);
}

export function emptyLabDraft(today: string, biomarker = ''): LabDraft {
  const units = isBiomarkerId(biomarker) ? BIOMARKER_UNITS[biomarker] : [];
  return { biomarker, customName: '', unit: units[0]?.label ?? '', value: '', day: today, refLow: '', refHigh: '', note: '' };
}

function formatPlain(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function draftFromResult(result: LabResult): LabDraft {
  const ref = parseBiomarkerKey(result.biomarker);
  return {
    biomarker: ref.kind === 'catalogue' ? ref.id : CUSTOM_PICK,
    customName: ref.kind === 'custom' ? ref.name : '',
    unit: result.unit,
    value: formatPlain(result.value),
    day: result.day,
    refLow: result.refLow === null ? '' : formatPlain(result.refLow),
    refHigh: result.refHigh === null ? '' : formatPlain(result.refHigh),
    note: result.note ?? '',
  };
}

export function validateLabDraft(draft: LabDraft, today: string): LabValidation {
  const invalid: LabField[] = [];
  let biomarker = '';
  let unitLabel = collapse(draft.unit);
  if (isBiomarkerId(draft.biomarker)) {
    biomarker = draft.biomarker;
    if (!BIOMARKER_UNITS[draft.biomarker].some((u) => u.label === draft.unit)) invalid.push('unit');
    unitLabel = draft.unit;
  } else if (draft.biomarker === CUSTOM_PICK) {
    const name = collapse(draft.customName);
    if (plainText(name, LAB_LIMITS.nameLength)) biomarker = customKey(name);
    else invalid.push('biomarker');
    if (!plainText(unitLabel, LAB_LIMITS.unitLength)) invalid.push('unit');
  } else {
    invalid.push('biomarker');
  }

  const value = parseDecimal(draft.value);
  if (value === null) invalid.push('value');

  const day = draft.day.trim();
  if (!validDay(day, today)) invalid.push('day');

  const refLow = draft.refLow.trim() === '' ? null : parseDecimal(draft.refLow);
  const refHigh = draft.refHigh.trim() === '' ? null : parseDecimal(draft.refHigh);
  if (draft.refLow.trim() !== '' && refLow === null) invalid.push('refLow');
  if (draft.refHigh.trim() !== '' && refHigh === null) invalid.push('refHigh');
  if (refLow !== null && refHigh !== null && refLow >= refHigh) invalid.push('refLow', 'refHigh');

  const noteText = draft.note.trim();
  if (noteText !== '' && !plainText(noteText, LAB_LIMITS.noteLength, NOTE_CONTROL)) invalid.push('note');

  if (invalid.length > 0 || value === null) return { ok: false, invalid };
  return {
    ok: true,
    value: { biomarker, unit: unitLabel, value, day, refLow, refHigh, note: noteText === '' ? null : noteText },
  };
}

function compare(a: LabResult, b: LabResult): number {
  if (a.day === b.day) return a.id - b.id;
  return a.day < b.day ? -1 : 1;
}

export function sortResults(results: readonly LabResult[]): LabResult[] {
  return [...results].sort(compare);
}

export function resultsFor(results: readonly LabResult[], key: string): LabResult[] {
  const wanted = groupKey(key);
  return sortResults(results.filter((r) => groupKey(r.biomarker) === wanted));
}

export interface BiomarkerSummary {
  group: string;
  key: string;
  ref: BiomarkerRef;
  latest: LabResult;
  count: number;
}

function order(summary: BiomarkerSummary): number {
  return summary.ref.kind === 'catalogue' ? BIOMARKER_IDS.indexOf(summary.ref.id) : BIOMARKER_IDS.length;
}

export function summarizeBiomarkers(results: readonly LabResult[]): BiomarkerSummary[] {
  const groups = new Map<string, LabResult[]>();
  for (const result of sortResults(results)) {
    const group = groupKey(result.biomarker);
    const list = groups.get(group);
    if (list === undefined) groups.set(group, [result]);
    else list.push(result);
  }
  const summaries: BiomarkerSummary[] = [];
  for (const [group, list] of groups) {
    const latest = list[list.length - 1];
    if (latest === undefined) continue;
    summaries.push({ group, key: latest.biomarker, ref: parseBiomarkerKey(latest.biomarker), latest, count: list.length });
  }
  return summaries.sort((a, b) => {
    const byOrder = order(a) - order(b);
    if (byOrder !== 0) return byOrder;
    return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
  });
}

export interface LabHistoryPoint {
  result: LabResult;
  value: number;
}

export interface LabHistory {
  ref: BiomarkerRef;
  units: string[];
  unit: string;
  points: LabHistoryPoint[];
  band: { low: number; high: number } | null;
  bandFrom: LabResult | null;
}

export function buildHistory(entries: readonly LabResult[], requestedUnit: string | null): LabHistory | null {
  const sorted = sortResults(entries);
  const latest = sorted[sorted.length - 1];
  if (latest === undefined) return null;
  const ref = parseBiomarkerKey(latest.biomarker);
  const units =
    ref.kind === 'catalogue'
      ? unitsOf(ref).map((u) => u.label)
      : [...new Set(sorted.map((r) => r.unit).reverse())];
  const chosen = requestedUnit !== null && units.includes(requestedUnit) ? requestedUnit : units.includes(latest.unit) ? latest.unit : (units[0] ?? latest.unit);
  const points: LabHistoryPoint[] = [];
  for (const result of sorted) {
    const value = convertLabValue(result.value, result.unit, chosen, ref);
    if (value !== null) points.push({ result, value });
  }
  let band: LabHistory['band'] = null;
  let bandFrom: LabResult | null = null;
  for (const result of [...sorted].reverse()) {
    if (result.refLow === null || result.refHigh === null) continue;
    const low = convertLabValue(result.refLow, result.unit, chosen, ref);
    const high = convertLabValue(result.refHigh, result.unit, chosen, ref);
    if (low !== null && high !== null) {
      band = { low, high };
      bandFrom = result;
      break;
    }
  }
  return { ref, units, unit: chosen, points, band, bandFrom };
}

export function formatEntered(value: number, language: Language): string {
  const text = formatPlain(value);
  return language === 'nl' ? text.replace('.', ',') : text;
}

export function formatConverted(value: number, language: Language): string {
  const text = Number(value.toPrecision(4)).toString();
  return language === 'nl' ? text.replace('.', ',') : text;
}

export type LabBand = 'mid' | 'edge' | 'low' | 'high' | 'none';

export const LAB_EDGE_SHARE = 0.1;

export function labBand(result: Pick<LabResult, 'value' | 'refLow' | 'refHigh'>): LabBand {
  const { value, refLow, refHigh } = result;
  if (refLow === null && refHigh === null) return 'none';
  if (refLow !== null && value < refLow) return 'low';
  if (refHigh !== null && value > refHigh) return 'high';
  if (refLow !== null && refHigh !== null) {
    const edge = (refHigh - refLow) * LAB_EDGE_SHARE;
    return value < refLow + edge || value > refHigh - edge ? 'edge' : 'mid';
  }
  if (refHigh !== null) return value > refHigh * (1 - LAB_EDGE_SHARE) ? 'edge' : 'mid';
  return refLow !== null && value < refLow * (1 + LAB_EDGE_SHARE) ? 'edge' : 'mid';
}

export interface LabTally {
  mid: number;
  edge: number;
  out: number;
  none: number;
}

export function tallyLabs(summaries: readonly BiomarkerSummary[]): LabTally {
  const tally: LabTally = { mid: 0, edge: 0, out: 0, none: 0 };
  for (const summary of summaries) {
    const band = labBand(summary.latest);
    if (band === 'low' || band === 'high') tally.out += 1;
    else tally[band] += 1;
  }
  return tally;
}

const BAND_ORDER: Readonly<Record<LabBand, number>> = { low: 0, high: 0, edge: 1, mid: 2, none: 3 };

export function outOfRangeFirst(summaries: readonly BiomarkerSummary[]): BiomarkerSummary[] {
  return summaries
    .map((summary, index) => ({ summary, index }))
    .sort((a, b) => BAND_ORDER[labBand(a.summary.latest)] - BAND_ORDER[labBand(b.summary.latest)] || a.index - b.index)
    .map(({ summary }) => summary);
}

export function latestLabDay(results: readonly LabResult[]): string | null {
  let latest: string | null = null;
  for (const result of results) if (latest === null || result.day > latest) latest = result.day;
  return latest;
}

export const LINK_WINDOW_DAYS = 30;
export const LINK_MIN_DAYS = 7;
export const LINK_METRICS = ['asleepH', 'load', 'steps', 'restingHr'] as const;
export type LinkMetric = (typeof LINK_METRICS)[number];

export interface LinkedRow {
  metric: LinkMetric;
  before: number;
  latest: number;
}

export interface LinkedBehaviours {
  previousDay: string;
  latestDay: string;
  rows: LinkedRow[];
}

function windowAverage(days: readonly DayRecord[], endDay: string, metric: LinkMetric): number | null {
  const from = shiftIsoDay(endDay, -LINK_WINDOW_DAYS);
  const values = days
    .filter((day) => day.day > from && day.day <= endDay)
    .map((day) => metricValue(day, metric))
    .filter((value): value is number => value !== null);
  return values.length < LINK_MIN_DAYS ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function linkedBehaviours(days: readonly DayRecord[], entries: readonly LabResult[]): LinkedBehaviours | null {
  const sorted = sortResults(entries);
  const latest = sorted[sorted.length - 1];
  if (latest === undefined) return null;
  const previous = [...sorted].reverse().find((entry) => entry.day < latest.day);
  if (previous === undefined) return null;
  const rows: LinkedRow[] = [];
  for (const metric of LINK_METRICS) {
    const before = windowAverage(days, previous.day, metric);
    const now = windowAverage(days, latest.day, metric);
    if (before !== null && now !== null) rows.push({ metric, before, latest: now });
  }
  return rows.length === 0 ? null : { previousDay: previous.day, latestDay: latest.day, rows };
}
