import { LAB_LIMITS } from '@/data/labs';

import { matchBiomarker, nameKey } from './aliases';
import { findDate, IMPORT_LIMITS, parseLabText, parseNumber, parseRange, type Censor, type LabCandidate, type LabParseResult } from './parse';
import { printedUnit, unitFits } from './units';

type Column = 'name' | 'value' | 'unit' | 'range' | 'low' | 'high' | 'date';

const HEADERS: Readonly<Record<Column, RegExp>> = {
  name: /^(test|test name|analyte|marker|biomarker|parameter|name|naam|bepaling|onderzoek|component|analyse)$/,
  value: /^(value|result|result value|uitslag|waarde|resultaat)$/,
  unit: /^(unit|units|eenheid|eenheden)$/,
  range: /^(range|reference|reference range|reference interval|ref|ref range|referentie|referentiewaarde|referentiewaarden|normaalwaarde|normaalwaarden|normal range)$/,
  low: /^(low|min|lower|lower limit|ondergrens|ref low|reference low)$/,
  high: /^(high|max|upper|upper limit|bovengrens|ref high|reference high)$/,
  date: /^(date|datum|collected|collection date|afname|afnamedatum|sample date)$/,
};

const COLUMNS = Object.keys(HEADERS) as Column[];
const DELIMITERS = [',', ';', '\t'] as const;
const VALUE = /^(<=?|>=?)?\s*(\d{1,7}(?:[.,]\d{1,4})?)\s*(.*)$/;
const THOUSANDS = /^\d{1,3},\d{3}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function csvRecords(text: string, delimiter: string, maxRecords: number): string[][] {
  const records: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  const endRecord = (): void => {
    cells.push(cell.replace(/\s+/g, ' ').trim());
    if (cells.some((value) => value !== '')) records.push(cells);
    cells = [];
    cell = '';
  };
  for (let i = 0; i < text.length && records.length < maxRecords; i++) {
    const char = text[i] ?? '';
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (char === delimiter) {
      cells.push(cell.replace(/\s+/g, ' ').trim());
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else cell += char;
  }
  if (records.length < maxRecords && (cell !== '' || cells.length > 0)) endRecord();
  return records;
}

export function splitCsvLine(line: string, delimiter: string): string[] {
  return csvRecords(line, delimiter, 1)[0] ?? [''];
}

export function detectDelimiter(line: string): string {
  let best: string = DELIMITERS[0];
  let most = 0;
  for (const delimiter of DELIMITERS) {
    const count = splitCsvLine(line, delimiter).length - 1;
    if (count > most) {
      most = count;
      best = delimiter;
    }
  }
  return best;
}

function headerKey(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function columnsOf(header: readonly string[]): Partial<Record<Column, number>> {
  const found: Partial<Record<Column, number>> = {};
  header.forEach((cell, index) => {
    const key = headerKey(cell);
    const column = COLUMNS.find((candidate) => HEADERS[candidate].test(key));
    if (column !== undefined && found[column] === undefined) found[column] = index;
  });
  return found;
}

function cleanName(text: string): string | null {
  const name = text.replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  const letters = name.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0;
  return letters < 2 || name.length > LAB_LIMITS.nameLength ? null : name;
}

function rowCandidate(cells: readonly string[], columns: Partial<Record<Column, number>>, today: string): Omit<LabCandidate, 'day'> & { day: string | null } | null {
  const cell = (column: Column): string => {
    const index = columns[column];
    return index === undefined ? '' : (cells[index] ?? '');
  };
  const name = cleanName(cell('name'));
  const match = VALUE.exec(cell('value').trim());
  if (name === null || match === null) return null;
  const value = parseNumber(match[2] ?? '');
  if (value === null) return null;
  const censored: Censor | null = match[1] === undefined ? null : match[1].startsWith('<') ? '<' : '>';
  const unit = printedUnit(cell('unit').trim() !== '' ? cell('unit') : (match[3] ?? '').trim());
  if (unit === null) return null;
  const low = cell('low').trim() === '' ? null : parseNumber(cell('low').trim());
  const high = cell('high').trim() === '' ? null : parseNumber(cell('high').trim());
  const range = low !== null || high !== null ? { refLow: low, refHigh: high } : parseRange(cell('range'));
  const validRange = range.refLow !== null && range.refHigh !== null && range.refLow >= range.refHigh ? { refLow: null, refHigh: null } : range;
  let biomarker = matchBiomarker(name);
  if (biomarker !== null && !unitFits(biomarker, unit)) biomarker = null;
  const ambiguous = THOUSANDS.test(match[2] ?? '');
  return { name, biomarker, value, censored, ambiguous, unit, ...validRange, day: findDate(cell('date'), today) };
}

export function parseLabCsv(text: string, today: string): LabParseResult {
  const body = text.replace(/^\uFEFF/, '');
  const first = body.split(/\r?\n/).find((line) => line.trim() !== '');
  if (first === undefined) return { candidates: [], day: null };
  const delimiter = detectDelimiter(first);
  const rows = csvRecords(body, delimiter, IMPORT_LIMITS.maxLines).map((cells) => cells.map((cell) => cell.slice(0, IMPORT_LIMITS.maxLineLength)));
  const columns = columnsOf(rows[0] ?? []);
  if (columns.name === undefined || columns.value === undefined) {
    return parseLabText(
      rows.map((cells) => cells.join(' ')),
      today,
    );
  }
  const seen = new Set<string>();
  const candidates: LabCandidate[] = [];
  for (const cells of rows.slice(1)) {
    const candidate = rowCandidate(cells, columns, today);
    if (candidate === null) continue;
    const key = `${candidate.biomarker ?? nameKey(candidate.name)}|${candidate.value}|${candidate.unit}|${candidate.day ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
    if (candidates.length >= IMPORT_LIMITS.maxCandidates) break;
  }
  const day = candidates.find((candidate) => candidate.day !== null)?.day ?? null;
  return { candidates: candidates.map((candidate) => ({ ...candidate, day: candidate.day ?? day })), day };
}
