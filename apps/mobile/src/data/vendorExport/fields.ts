export type Parsed<T> = { ok: true; value: T } | { ok: false };

export const VENDOR_LIMITS = {
  percent: { min: 0, max: 100 },
  restingHr: { min: 20, max: 220 },
  hrvMs: { min: 0, max: 500 },
  skinTempC: { min: 20, max: 45 },
  spo2Pct: { min: 50, max: 100 },
  respiratoryRate: { min: 3, max: 60 },
  strain: { min: 0, max: 21 },
  minutes: { min: 0, max: 1_440 },
  workoutHr: { min: 20, max: 250 },
  sleepMaxS: 24 * 3_600,
  workoutMaxS: 24 * 3_600,
  cycleMaxS: 72 * 3_600,
  firstYear: 2010,
  lastYear: 2100,
  questionChars: 200,
  activityChars: 80,
  notesChars: 1_000,
} as const;

const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const COMMA_DECIMAL = /^-?\d+,\d+$/;

export function parseNumber(text: string, min: number, max: number): Parsed<number | null> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const normalised = COMMA_DECIMAL.test(trimmed) ? trimmed.replace(',', '.') : trimmed;
  if (!DECIMAL.test(normalised)) return { ok: false };
  const value = Number(normalised);
  if (!Number.isFinite(value) || value < min || value > max) return { ok: false };
  return { ok: true, value };
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'ja']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'nee']);

export function parseBoolean(text: string): Parsed<boolean | null> {
  const word = text.trim().toLowerCase();
  if (word === '') return { ok: true, value: null };
  if (TRUE_WORDS.has(word)) return { ok: true, value: true };
  if (FALSE_WORDS.has(word)) return { ok: true, value: false };
  return { ok: false };
}

function isControl(code: number): boolean {
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
}

export function cleanText(text: string, maxChars: number): Parsed<string | null> {
  let cleaned = '';
  for (const ch of text) cleaned += isControl(ch.charCodeAt(0)) ? ' ' : ch;
  cleaned = cleaned.trim();
  if (cleaned === '') return { ok: true, value: null };
  if (cleaned.length > maxChars) return { ok: false };
  return { ok: true, value: cleaned };
}

const MAX_OFFSET_S = 14 * 3_600;
const ZONE = /^(?:(?:UTC|GMT)\s*)?(?:(Z)|([+-])(\d{1,2})(?::?(\d{2}))?)?$/i;

export function parseZone(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const match = ZONE.exec(trimmed);
  if (match === null) return null;
  const [, zulu, sign, hours, minutes] = match;
  if (sign === undefined || hours === undefined) return zulu !== undefined || /^(?:UTC|GMT)$/i.test(trimmed) ? 0 : null;
  const h = Number(hours);
  const m = minutes === undefined ? 0 : Number(minutes);
  if (m > 59) return null;
  const total = h * 3_600 + m * 60;
  if (total > MAX_OFFSET_S) return null;
  return sign === '-' ? -total : total;
}

export interface ParsedTime {
  unix: number;
  offsetS: number;
  day: string;
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?\s*(.*)$/;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function parseTime(text: string, zoneColumn: string): ParsedTime | null {
  const match = TIMESTAMP.exec(text.trim());
  if (match === null) return null;
  const [, y, mo, d, h, mi, s, inline] = match;
  const year = Number(y);
  const month = Number(mo);
  const date = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = s === undefined ? 0 : Number(s);
  if (year < VENDOR_LIMITS.firstYear || year > VENDOR_LIMITS.lastYear) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const utcMs = Date.UTC(year, month - 1, date, hour, minute, second);
  const check = new Date(utcMs);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;
  const inlineText = (inline ?? '').trim();
  const offsetS = inlineText === '' ? parseZone(zoneColumn) : parseZone(inlineText);
  if (offsetS === null) return null;
  return { unix: Math.floor(utcMs / 1000) - offsetS, offsetS, day: `${y}-${pad(month)}-${pad(date)}` };
}

export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}
