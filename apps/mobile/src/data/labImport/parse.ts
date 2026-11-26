import { LAB_LIMITS, type BiomarkerId } from '@/data/labs';
import { parseIsoDate } from '@/lib/dates';

import { matchBiomarker, nameKey } from './aliases';
import { normalizeUnit, printedUnit, unitFits } from './units';

export type Censor = '<' | '>';

export interface LabCandidate {
  name: string;
  biomarker: BiomarkerId | null;
  value: number;
  censored: Censor | null;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  day: string | null;
}

export interface LabParseResult {
  candidates: LabCandidate[];
  day: string | null;
}

export const IMPORT_LIMITS = {
  maxLines: 5000,
  maxLineLength: 400,
  maxCandidates: 200,
  maxNameTokens: 6,
  minYear: 2000,
} as const;

const NUMBER = '\\d{1,7}(?:[.,]\\d{1,4})?';
const VALUE_TOKEN = new RegExp(`^(<=?|>=?)?(${NUMBER})(.*)$`);
const NUMBER_ONLY = new RegExp(`^${NUMBER}$`);
const COMPARATOR = /^(<=?|>=?)$/;
const FLAG = /^(\*{1,3}|\+{1,2}|!{1,2}|h{1,2}|l{1,2}|↑{1,2}|↓{1,2}|hoog|laag|high|low)$/i;
const OCR_DIGIT = /^(<=?|>=?)?[\dOoIl]+(?:[.,][\dOoIl]+)?$/;
const BETWEEN = new RegExp(`(${NUMBER})\\s*(?:-|tot|to)\\s*(${NUMBER})`, 'i');
const UPPER = new RegExp(`(?:<=?|max\\.?|maximum|tot|up to)\\s*(${NUMBER})`, 'i');
const LOWER = new RegExp(`(?:>=?|min\\.?|minimum|vanaf|from)\\s*(${NUMBER})`, 'i');
const LETTERS = /[A-Za-zÀ-ÿ]/;
const CONTROL = /[\u0000-\u001f\u007f]/g;

export function parseNumber(text: string): number | null {
  if (!NUMBER_ONLY.test(text)) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value <= LAB_LIMITS.maxValue ? value : null;
}

function fixOcrDigits(token: string): string {
  if (!/\d/.test(token) || !OCR_DIGIT.test(token)) return token;
  return token.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
}

export function cleanLine(line: string): string {
  return line
    .slice(0, IMPORT_LIMITS.maxLineLength)
    .replace(CONTROL, ' ')
    .replace(/[‐-―−]/g, '-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[()[\]{}:;|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ValueHit {
  index: number;
  next: number;
  value: number;
  censored: Censor | null;
  rest: string;
}

function censorOf(comparator: string | undefined): Censor | null {
  if (comparator === undefined || comparator === '') return null;
  return comparator.startsWith('<') ? '<' : '>';
}

function readValue(tokens: readonly string[], index: number): ValueHit | null {
  const token = fixOcrDigits(tokens[index] ?? '');
  const following = tokens[index + 1];
  if (COMPARATOR.test(token) && following !== undefined) {
    const value = parseNumber(fixOcrDigits(following));
    return value === null ? null : { index, next: index + 2, value, censored: censorOf(token), rest: '' };
  }
  const match = VALUE_TOKEN.exec(token);
  if (match === null) return null;
  const value = parseNumber(match[2] ?? '');
  if (value === null) return null;
  const rest = match[3] ?? '';
  if (rest !== '' && !FLAG.test(rest) && printedUnit(rest) === null) return null;
  return { index, next: index + 1, value, censored: censorOf(match[1]), rest: FLAG.test(rest) ? '' : rest };
}

function findValue(tokens: readonly string[]): ValueHit | null {
  let sawLetters = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    if (sawLetters) {
      const hit = readValue(tokens, i);
      if (hit !== null) return hit;
    }
    if (LETTERS.test(token) && !COMPARATOR.test(token)) sawLetters = true;
  }
  return null;
}

interface UnitHit {
  label: string;
  known: boolean;
  start: number;
  length: number;
}

function findUnit(tail: readonly string[]): UnitHit | null {
  for (let start = 0; start < tail.length; start++) {
    for (let length = 3; length >= 1; length--) {
      if (start + length > tail.length) continue;
      const label = normalizeUnit(tail.slice(start, start + length).join(''));
      if (label !== null) return { label, known: true, start, length };
    }
  }
  for (let start = 0; start < tail.length; start++) {
    const label = printedUnit(tail[start] ?? '');
    if (label !== null) return { label, known: false, start, length: 1 };
  }
  return null;
}

export interface ParsedRange {
  refLow: number | null;
  refHigh: number | null;
}

export function parseRange(text: string): ParsedRange {
  const between = BETWEEN.exec(text);
  if (between !== null) {
    const low = parseNumber(between[1] ?? '');
    const high = parseNumber(between[2] ?? '');
    if (low !== null && high !== null && low < high) return { refLow: low, refHigh: high };
    return { refLow: null, refHigh: null };
  }
  const upper = UPPER.exec(text);
  if (upper !== null) return { refLow: null, refHigh: parseNumber(upper[1] ?? '') };
  const lower = LOWER.exec(text);
  if (lower !== null) return { refLow: parseNumber(lower[1] ?? ''), refHigh: null };
  return { refLow: null, refHigh: null };
}

function cleanName(tokens: readonly string[]): string | null {
  const name = tokens
    .join(' ')
    .replace(/^[\s*•·\-.,]+/, '')
    .replace(/[\s.,\-=*•]+$/, '')
    .trim();
  const letters = name.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0;
  if (letters < 2 || name.length > LAB_LIMITS.nameLength) return null;
  return name;
}

export function parseResultLine(line: string): Omit<LabCandidate, 'day'> | null {
  const tokens = cleanLine(line).split(' ').filter((token) => token !== '');
  const hit = findValue(tokens);
  if (hit === null) return null;
  const name = cleanName(tokens.slice(0, hit.index));
  if (name === null) return null;
  const tail = [hit.rest, ...tokens.slice(hit.next)].filter((token) => token !== '');
  const unit = findUnit(tail);
  if (unit === null) return null;
  const rangeText = [...tail.slice(0, unit.start), ...tail.slice(unit.start + unit.length)].filter((token) => !FLAG.test(token)).join(' ');
  const range = parseRange(rangeText);
  let biomarker = matchBiomarker(name);
  if (biomarker !== null && !(unit.known && unitFits(biomarker, unit.label))) biomarker = null;
  if (biomarker === null && nameKey(name).split(' ').length > IMPORT_LIMITS.maxNameTokens) return null;
  return { name, biomarker, value: hit.value, censored: hit.censored, unit: unit.label, ...range };
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, febr: 2, februari: 2, february: 2,
  mrt: 3, mar: 3, maart: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, augustus: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function isoOf(y: number, m: number, d: number, today: string): string | null {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const parts = parseIsoDate(iso);
  if (parts === null || parts.y < IMPORT_LIMITS.minYear || iso > today) return null;
  return iso;
}

function fullYear(text: string): number {
  const year = Number(text);
  return text.length === 2 ? 2000 + year : year;
}

export function findDate(text: string, today: string): string | null {
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (iso !== null) {
    const day = isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]), today);
    if (day !== null) return day;
  }
  const dmy = /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2}|\d{2})\b/.exec(text);
  if (dmy !== null) {
    const day = isoOf(fullYear(dmy[3] ?? ''), Number(dmy[2]), Number(dmy[1]), today);
    if (day !== null) return day;
  }
  const named = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/.exec(text);
  if (named !== null) {
    const month = MONTHS[(named[2] ?? '').toLowerCase()];
    if (month !== undefined) return isoOf(Number(named[3]), month, Number(named[1]), today);
  }
  return null;
}

const COLLECTION = /(afname|staalname|monstername|prelevement|prélèvement|afgenomen|collect|sample|specimen|drawn)/i;
const DATE_WORD = /(datum|date)/i;
const NOT_COLLECTION = /(geboorte|birth|born|dob|print|afdruk|ontvang|receiv|rapport|report|valid|aanvraag|request)/i;

function dateNear(lines: readonly string[], index: number, today: string): string | null {
  return findDate(lines[index] ?? '', today) ?? findDate(lines[index + 1] ?? '', today);
}

export function findReportDay(lines: readonly string[], today: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (COLLECTION.test(lines[i] ?? '')) {
      const day = dateNear(lines, i, today);
      if (day !== null) return day;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (DATE_WORD.test(line) && !NOT_COLLECTION.test(line)) {
      const day = dateNear(lines, i, today);
      if (day !== null) return day;
    }
  }
  return null;
}

function identity(candidate: Omit<LabCandidate, 'day'>): string {
  return `${candidate.biomarker ?? nameKey(candidate.name)}|${candidate.value}|${candidate.unit}`;
}

export function parseLabText(lines: readonly string[], today: string): LabParseResult {
  const bounded = lines.slice(0, IMPORT_LIMITS.maxLines);
  const day = findReportDay(bounded, today);
  const seen = new Set<string>();
  const candidates: LabCandidate[] = [];
  for (const line of bounded) {
    const parsed = parseResultLine(line);
    if (parsed === null) continue;
    const key = identity(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ ...parsed, day });
    if (candidates.length >= IMPORT_LIMITS.maxCandidates) break;
  }
  return { candidates, day };
}
