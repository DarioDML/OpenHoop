import type { CuffReading, CuffReadingInput } from '@openhoop/core';

import { parseIsoDate, unixToIsoDate } from '@/lib/dates';

export const CUFF_RANGES = {
  systolic: { min: 60, max: 260 },
  diastolic: { min: 30, max: 160 },
  pulse: { min: 30, max: 220 },
} as const;

export type CuffField = 'systolic' | 'diastolic' | 'pulse' | 'day' | 'time' | 'order';

export interface CuffDraft {
  systolic: string;
  diastolic: string;
  pulse: string;
  day: string;
  time: string;
}

export type CuffValidation = { ok: true; value: CuffReadingInput } | { ok: false; invalid: CuffField[] };

const WHOLE = /^\d{1,3}$/;
const CLOCK = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;
const MIN_YEAR = 2000;
const FUTURE_SLACK_S = 300;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function clockText(unixS: number, tzOffsetS: number): string {
  const local = new Date((unixS + tzOffsetS) * 1000);
  return `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

export function emptyCuffDraft(nowS: number, tzOffsetS: number): CuffDraft {
  return { systolic: '', diastolic: '', pulse: '', day: unixToIsoDate(nowS, tzOffsetS), time: clockText(nowS, tzOffsetS) };
}

function whole(text: string, range: { readonly min: number; readonly max: number }): number | null {
  const trimmed = text.trim();
  if (!WHOLE.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= range.min && value <= range.max ? value : null;
}

export function localToUnix(day: string, time: string, tzOffsetS: number): number | null {
  const date = parseIsoDate(day.trim());
  const clock = CLOCK.exec(time.trim());
  if (date === null || clock === null || date.y < MIN_YEAR) return null;
  return Date.UTC(date.y, date.m - 1, date.d, Number(clock[1]), Number(clock[2])) / 1000 - tzOffsetS;
}

export function validateCuffDraft(draft: CuffDraft, nowS: number, tzOffsetS: number): CuffValidation {
  const invalid: CuffField[] = [];
  const systolic = whole(draft.systolic, CUFF_RANGES.systolic);
  const diastolic = whole(draft.diastolic, CUFF_RANGES.diastolic);
  if (systolic === null) invalid.push('systolic');
  if (diastolic === null) invalid.push('diastolic');
  if (systolic !== null && diastolic !== null && diastolic >= systolic) invalid.push('order');
  const pulseText = draft.pulse.trim();
  const pulse = pulseText === '' ? null : whole(pulseText, CUFF_RANGES.pulse);
  if (pulseText !== '' && pulse === null) invalid.push('pulse');
  if (parseIsoDate(draft.day.trim()) === null) invalid.push('day');
  if (!CLOCK.test(draft.time.trim())) invalid.push('time');
  const t = localToUnix(draft.day, draft.time, tzOffsetS);
  if (t !== null && t > nowS + FUTURE_SLACK_S) invalid.push('day', 'time');
  if (t === null && !invalid.includes('day') && !invalid.includes('time')) invalid.push('day');
  if (invalid.length > 0 || systolic === null || diastolic === null || t === null) return { ok: false, invalid: [...new Set(invalid)] };
  return { ok: true, value: { t, systolic, diastolic, pulse } };
}

export function cuffCsv(readings: readonly CuffReading[], tzOffsetOf: (unixS: number) => number): string {
  const lines = ['local_time,unix_s,systolic_mmhg,diastolic_mmhg,pulse_bpm,source'];
  for (const reading of [...readings].sort((a, b) => a.t - b.t || a.id - b.id)) {
    const tz = tzOffsetOf(reading.t);
    lines.push([`${unixToIsoDate(reading.t, tz)} ${clockText(reading.t, tz)}`, reading.t, reading.systolic, reading.diastolic, reading.pulse ?? '', 'own-cuff-entry'].join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function cuffFileName(nowS: number): string {
  return `openhoop-cuff-readings-${new Date(nowS * 1000).toISOString().slice(0, 10)}.csv`;
}
