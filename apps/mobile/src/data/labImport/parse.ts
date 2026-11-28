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
  ambiguous?: boolean;
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
const RANGE_CONNECTOR = /^(-|tot|to)$/;
const FULL_RANGE = new RegExp(`^(?:${NUMBER}\\s*(?:-|tot|to)\\s*${NUMBER}|(?:<=?|>=?)\\s*${NUMBER})$`, 'i');
const LOWER = new RegExp(`(?:>=?|min\\.?|minimum|vanaf|from)\\s*(${NUMBER})`, 'i');
const LETTERS = /[A-Za-zÀ-ÿ]/;
const CONTROL = /[\u0000-\u001f\u007f]/g;
const ANNOTATION = new Set(['streefwaarde', 'streefwaarden', 'doelwaarde', 'doelwaarden', 'target', 'targets', 'goal', 'cible']);

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

function* valueHits(tokens: readonly string[]): Generator<ValueHit> {
  let sawLetters = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    if (sawLetters) {
      const hit = readValue(tokens, i);
      if (hit !== null) yield hit;
    }
    if (LETTERS.test(token) && !COMPARATOR.test(token)) sawLetters = true;
  }
}

function startsRange(tokens: readonly string[], hit: ValueHit): boolean {
  if (hit.censored !== null || hit.rest !== '') return false;
  const connector = (tokens[hit.next] ?? '').toLowerCase();
  return RANGE_CONNECTOR.test(connector) && parseNumber(fixOcrDigits(tokens[hit.next + 1] ?? '')) !== null;
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

function onlyFlagsOrRange(tokens: readonly string[]): boolean {
  const text = tokens.filter((token) => !FLAG.test(token)).join(' ');
  return text === '' || FULL_RANGE.test(text);
}

export function parseResultLine(line: string): Omit<LabCandidate, 'day'> | null {
  const tokens = cleanLine(line).split(' ').filter((token) => token !== '');
  for (const hit of valueHits(tokens)) {
    if (startsRange(tokens, hit)) return null;
    const tail = [hit.rest, ...tokens.slice(hit.next)].filter((token) => token !== '');
    const unit = findUnit(tail);
    if (unit === null) return null;
    if (!onlyFlagsOrRange(tail.slice(0, unit.start))) continue;
    const name = cleanName(tokens.slice(0, hit.index));
    if (name === null || ANNOTATION.has(nameKey(name).split(' ')[0] ?? '')) return null;
    const rangeText = [...tail.slice(0, unit.start), ...tail.slice(unit.start + unit.length)].filter((token) => !FLAG.test(token)).join(' ');
    const range = parseRange(rangeText);
    let biomarker = matchBiomarker(name);
    if (biomarker !== null && !(unit.known && unitFits(biomarker, unit.label))) biomarker = null;
    if (biomarker === null && nameKey(name).split(' ').length > IMPORT_LIMITS.maxNameTokens) return null;
    return { name, biomarker, value: hit.value, censored: hit.censored, unit: unit.label, ...range };
  }
  return null;
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

const DATE_PATTERNS: readonly RegExp[] = [
  /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g,
  /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2}|\d{2})\b/g,
  /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/g,
];

function dateFromMatch(pattern: number, match: RegExpExecArray, today: string): string | null {
  if (pattern === 0) return isoOf(Number(match[1]), Number(match[2]), Number(match[3]), today);
  if (pattern === 1) return isoOf(fullYear(match[3] ?? ''), Number(match[2]), Number(match[1]), today);
  const month = MONTHS[(match[2] ?? '').toLowerCase()];
  return month === undefined ? null : isoOf(Number(match[3]), month, Number(match[1]), today);
}

export function findDate(text: string, today: string): string | null {
  const found: Array<{ index: number; day: string }> = [];
  DATE_PATTERNS.forEach((pattern, kind) => {
    for (const match of text.matchAll(pattern)) {
      const day = dateFromMatch(kind, match, today);
      if (day !== null) found.push({ index: match.index, day });
    }
  });
  found.sort((a, b) => a.index - b.index);
  return found[0]?.day ?? null;
}

const COLLECTION = /(afname|staalname|monstername|prelevement|prélèvement|afgenomen|collect|sample|specimen|drawn)/i;
const DATE_WORD = /(datum|date)/i;
const NOT_COLLECTION = /(geboorte|geb\.|birth|born|dob|print|afdruk|ontvang|receiv|rapport|report|valid|aanvraag|request)/i;

function dateAfter(lines: readonly string[], index: number, keyword: RegExp, today: string): string | null {
  const line = lines[index] ?? '';
  const match = keyword.exec(line);
  const rest = match === null ? line : line.slice(match.index);
  const cut = NOT_COLLECTION.exec(rest.slice(1));
  const own = findDate(cut === null ? rest : rest.slice(0, cut.index + 1), today);
  if (own !== null) return own;
  const next = lines[index + 1] ?? '';
  return NOT_COLLECTION.test(next) ? null : findDate(next, today);
}

export function findReportDay(lines: readonly string[], today: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (COLLECTION.test(lines[i] ?? '')) {
      const day = dateAfter(lines, i, COLLECTION, today);
      if (day !== null) return day;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (DATE_WORD.test(line) && !NOT_COLLECTION.test(line)) {
      const day = dateAfter(lines, i, DATE_WORD, today);
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
