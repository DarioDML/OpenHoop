import { ACTIVITY_MAX_S, ACTIVITY_MIN_S, ACTIVITY_NOTE_MAX, sameSession, totalSeconds, type ActiveMinutes } from '@openhoop/analytics';
import type { ActivityRow, DayRecord, WorkoutRecord } from '@openhoop/core';

import { parseIsoDate, unixToIsoDate } from '@/lib/dates';

import { ACTIVITY_TYPES, type ActivityType } from './activityDerived';

export type EntryKind = 'detected' | 'edited' | 'manual' | 'live';

export interface EntryMetrics {
  activeS: number;
  load: number | null;
  loadReason: string | null;
  zoneSeconds: number[];
  avgHr: number | null;
  maxHr: number | null;
  activeMinutes: ActiveMinutes | null;
}

export interface ActivityEntry {
  key: string;
  kind: EntryKind;
  id: number | null;
  detectedStart: number | null;
  type: ActivityType | null;
  label: string | null;
  start: number;
  end: number;
  note: string | null;
  metrics: EntryMetrics;
  hasLoad: boolean;
}

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function toActivityType(value: string): ActivityType {
  return isActivityType(value) ? value : 'other';
}

function fromRow(row: ActivityRow, kind: EntryKind): ActivityEntry {
  return {
    key: `a:${row.id}`,
    kind,
    id: row.id,
    detectedStart: row.detectedStart,
    type: toActivityType(row.type),
    label: null,
    start: row.start,
    end: row.end,
    note: row.note,
    metrics: {
      activeS: row.metrics.activeS,
      load: row.metrics.load,
      loadReason: row.metrics.loadReason,
      zoneSeconds: row.metrics.zoneSeconds,
      avgHr: row.metrics.avgHr,
      maxHr: row.metrics.maxHr,
      activeMinutes: row.metrics.activeMinutes,
    },
    hasLoad: true,
  };
}

function fromWorkout(workout: WorkoutRecord): ActivityEntry {
  return {
    key: `w:${workout.start}`,
    kind: 'detected',
    id: null,
    detectedStart: workout.start,
    type: null,
    label: workout.label,
    start: workout.start,
    end: workout.end,
    note: null,
    metrics: {
      activeS: workout.end - workout.start,
      load: null,
      loadReason: null,
      zoneSeconds: workout.zoneSeconds,
      avgHr: workout.avgHr,
      maxHr: workout.maxHr,
      activeMinutes: null,
    },
    hasLoad: false,
  };
}

function isOwn(row: ActivityRow): boolean {
  return row.source === 'manual' || row.source === 'live';
}

export function dayOfActivity(days: readonly DayRecord[], t: number): DayRecord | null {
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (day === undefined) continue;
    const next = days[i + 1];
    const end = next === undefined ? day.end : next.start;
    if (t >= day.start && t < end) return day;
  }
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day !== undefined && unixToIsoDate(t, day.tzOffsetS) === day.day) return day;
  }
  return null;
}

export function dayEntries(days: readonly DayRecord[], day: DayRecord, rows: readonly ActivityRow[]): ActivityEntry[] {
  const own = rows.filter((r) => isOwn(r) && r.deletedAt === null && dayOfActivity(days, r.start)?.day === day.day);
  const ownWindows = own.map((r) => ({ start: r.start, end: r.end }));
  const out: ActivityEntry[] = own.map((r) => fromRow(r, r.source === 'live' ? 'live' : 'manual'));
  for (const workout of day.workouts) {
    const override = workout.source === 'auto' ? rows.find((r) => r.source === 'auto' && r.detectedStart === workout.start) : undefined;
    if (override !== undefined) {
      if (override.deletedAt === null) out.push(fromRow(override, 'edited'));
      continue;
    }
    if (sameSession({ start: workout.start, end: workout.end }, ownWindows)) continue;
    out.push(fromWorkout(workout));
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface DayTotals {
  count: number;
  seconds: number;
}

export function dayTotals(entries: readonly ActivityEntry[]): DayTotals {
  return { count: entries.length, seconds: totalSeconds(entries.map((e) => ({ start: e.start, end: e.end }))) };
}

export function entryById(rows: readonly ActivityRow[], id: number): ActivityEntry | null {
  const row = rows.find((r) => r.id === id && r.deletedAt === null);
  if (row === undefined) return null;
  return fromRow(row, row.source === 'auto' ? 'edited' : row.source);
}

export function entryForWorkout(rows: readonly ActivityRow[], workout: WorkoutRecord): ActivityEntry | null {
  const override = rows.find((r) => r.source === 'auto' && r.detectedStart === workout.start);
  if (override === undefined) return fromWorkout(workout);
  return override.deletedAt === null ? fromRow(override, 'edited') : null;
}

export function parseIdParam(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

export type FormError = 'type' | 'date' | 'start' | 'end' | 'endBeforeStart' | 'future' | 'tooShort' | 'tooLong' | 'note';

export interface ActivityForm {
  type: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
}

export interface ValidActivity {
  type: ActivityType;
  start: number;
  end: number;
  note: string | null;
}

export type FormResult = { ok: true; value: ValidActivity } | { ok: false; error: FormError };

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const OVERNIGHT_MAX_S = 12 * 3600;

export function parseClock(text: string): number | null {
  const match = TIME.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}

export function localUnix(date: string, secondsOfDay: number, tzOffsetS: number): number | null {
  const parts = parseIsoDate(date.trim());
  if (parts === null) return null;
  return Math.floor(Date.UTC(parts.y, parts.m - 1, parts.d) / 1000) + secondsOfDay - tzOffsetS;
}

export function validateActivityForm(form: ActivityForm, nowS: number, tzOffsetS: number): FormResult {
  if (!isActivityType(form.type)) return { ok: false, error: 'type' };
  const startOfDay = parseClock(form.startTime);
  if (startOfDay === null) return { ok: false, error: 'start' };
  const endOfDay = parseClock(form.endTime);
  if (endOfDay === null) return { ok: false, error: 'end' };
  const start = localUnix(form.date, startOfDay, tzOffsetS);
  if (start === null) return { ok: false, error: 'date' };
  const sameDay = endOfDay - startOfDay;
  const span = sameDay > 0 ? sameDay : sameDay + 86_400;
  if (sameDay === 0 || (sameDay < 0 && span > OVERNIGHT_MAX_S)) return { ok: false, error: 'endBeforeStart' };
  const end = start + span;
  if (end > nowS) return { ok: false, error: 'future' };
  if (end - start < ACTIVITY_MIN_S) return { ok: false, error: 'tooShort' };
  if (end - start > ACTIVITY_MAX_S) return { ok: false, error: 'tooLong' };
  const note = form.note.trim();
  if (note.length > ACTIVITY_NOTE_MAX) return { ok: false, error: 'note' };
  return { ok: true, value: { type: form.type, start, end, note: note === '' ? null : note } };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function clockText(unixS: number, tzOffsetS: number): string {
  const d = new Date((unixS + tzOffsetS) * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formFor(type: ActivityType, start: number, end: number, note: string | null, tzOffsetS: number): ActivityForm {
  return { type, date: unixToIsoDate(start, tzOffsetS), startTime: clockText(start, tzOffsetS), endTime: clockText(end, tzOffsetS), note: note ?? '' };
}

export function keepSeconds(original: { start: number; end: number }, edited: { start: number; end: number }): { start: number; end: number } {
  const sameMinute = (a: number, b: number): boolean => Math.floor(a / 60) * 60 === b;
  const start = sameMinute(original.start, edited.start) ? original.start : edited.start;
  const end = sameMinute(original.end, edited.end) ? original.end : edited.end;
  return end > start ? { start, end } : edited;
}

export const RECENT_TYPES_MAX = 5;

export function recentActivityTypes(rows: readonly ActivityRow[], limit: number = RECENT_TYPES_MAX): ActivityType[] {
  const out: ActivityType[] = [];
  const newestFirst = rows.filter((r) => r.deletedAt === null && isActivityType(r.type)).sort((a, b) => b.start - a.start);
  for (const row of newestFirst) {
    if (out.length >= limit) break;
    const type = toActivityType(row.type);
    if (!out.includes(type)) out.push(type);
  }
  return out;
}

export function matchesActivitySearch(label: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || label.toLowerCase().includes(needle);
}

export function defaultForm(type: ActivityType, nowS: number, tzOffsetS: number): ActivityForm {
  const end = Math.floor(nowS / 300) * 300;
  return formFor(type, end - 3600, end, null, tzOffsetS);
}
