import type { DayRecord, SleepEditRow, SleepPeriodRecord, SleepSource, SleepSpan } from '@openhoop/core';

import { ownerSinceToUnix } from '@/lib/dates';
import { formatClock } from '@/lib/format';

const DAY_S = 86_400;
const MINUTE_S = 60;
const CLOCK = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;

export interface SleepEditRequest {
  id: number | null;
  targetOnset: number | null;
  targetOffset: number | null;
  onset: number;
  offset: number;
  replaces: SleepSpan | null;
}

export interface EditableSleep {
  key: string;
  kind: 'night' | 'nap';
  onset: number;
  offset: number;
  asleepS: number;
  source: SleepSource;
  editId: number | null;
  targetOnset: number | null;
  targetOffset: number | null;
}

export function parseClock(text: string): number | null {
  const match = CLOCK.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function nearestClockTime(minutes: number, referenceS: number, tzOffsetS: number): number {
  const local = referenceS + tzOffsetS;
  const midnight = Math.floor(local / DAY_S) * DAY_S;
  let best = midnight + minutes * MINUTE_S;
  for (const candidate of [best - DAY_S, best + DAY_S]) {
    if (Math.abs(candidate - local) < Math.abs(best - local)) best = candidate;
  }
  return best - tzOffsetS;
}

export function clockTimeOnDay(day: string, minutes: number, tzOffsetS: number): number | null {
  const midnight = ownerSinceToUnix(day, tzOffsetS);
  return midnight === null ? null : midnight + minutes * MINUTE_S;
}

function exclusiveEnd(period: SleepPeriodRecord): number {
  return period.source === 'detected' ? period.offset + 1 : period.offset;
}

function targetOf(period: SleepPeriodRecord, edits: readonly SleepEditRow[]): { targetOnset: number | null; targetOffset: number | null } {
  const edit = period.editId === null ? undefined : edits.find((e) => e.id === period.editId);
  if (edit !== undefined) return { targetOnset: edit.targetOnset, targetOffset: edit.targetOffset };
  if (period.source === 'manual') return { targetOnset: null, targetOffset: null };
  return { targetOnset: period.onset, targetOffset: period.offset };
}

export function editableSleeps(day: DayRecord, edits: readonly SleepEditRow[]): EditableSleep[] {
  const out: EditableSleep[] = [];
  const night = day.sleep.periods.filter((p) => !p.nap);
  const first = night[0];
  const last = night[night.length - 1];
  if (first !== undefined && last !== undefined) {
    const edited = night.find((p) => p.editId !== null);
    const target = edited === undefined ? { targetOnset: first.onset, targetOffset: last.offset } : targetOf(edited, edits);
    out.push({
      key: `night-${first.onset}`,
      kind: 'night',
      onset: first.onset,
      offset: exclusiveEnd(last),
      asleepS: night.reduce((sum, p) => sum + p.asleepS, 0),
      source: edited?.source ?? 'detected',
      editId: edited?.editId ?? null,
      ...target,
    });
  }
  for (const nap of day.sleep.periods.filter((p) => p.nap)) {
    out.push({
      key: `nap-${nap.onset}`,
      kind: 'nap',
      onset: nap.onset,
      offset: exclusiveEnd(nap),
      asleepS: nap.asleepS,
      source: nap.source,
      editId: nap.editId,
      ...targetOf(nap, edits),
    });
  }
  return out.sort((a, b) => a.onset - b.onset);
}

export type DraftResult = { ok: true; onset: number; offset: number } | { ok: false; problem: 'invalid-time' };

export function draftTimes(item: EditableSleep | null, day: string, tzOffsetS: number, startText: string, endText: string): DraftResult {
  const start = parseClock(startText);
  const end = parseClock(endText);
  if (start === null || end === null) return { ok: false, problem: 'invalid-time' };
  if (item === null) {
    const onset = clockTimeOnDay(day, start, tzOffsetS);
    const offset = clockTimeOnDay(day, end, tzOffsetS);
    return onset === null || offset === null ? { ok: false, problem: 'invalid-time' } : { ok: true, onset, offset };
  }
  const keep = (text: string, original: number, minutes: number): number =>
    text.trim() === formatClock(original, tzOffsetS) ? original : nearestClockTime(minutes, original, tzOffsetS);
  return { ok: true, onset: keep(startText, item.onset, start), offset: keep(endText, item.offset, end) };
}

function overlaps(a: SleepSpan, b: SleepSpan): boolean {
  return a.onset < b.offset && b.onset < a.offset;
}

export function otherSleepSpans(days: readonly DayRecord[], edits: readonly SleepEditRow[], request: Pick<SleepEditRequest, 'id' | 'replaces'>): SleepSpan[] {
  const replaced = (span: SleepSpan, manual: boolean): boolean => !manual && request.replaces !== null && overlaps(span, request.replaces);
  const out: SleepSpan[] = [];
  for (const day of days) {
    for (const p of day.sleep.periods) {
      const span = { onset: p.onset, offset: exclusiveEnd(p) };
      if ((request.id !== null && p.editId === request.id) || replaced(span, p.source === 'manual')) continue;
      out.push(span);
    }
  }
  for (const edit of edits) {
    if (edit.id === request.id || replaced(edit, edit.targetOnset === null)) continue;
    out.push({ onset: edit.onset, offset: edit.offset });
  }
  return out;
}

export function recomputeFrom(request: Pick<SleepEditRequest, 'onset' | 'targetOnset'>, previous: SleepEditRow | null): number {
  return Math.min(request.onset, request.targetOnset ?? request.onset, previous?.onset ?? request.onset, previous?.targetOnset ?? request.onset) - DAY_S;
}
