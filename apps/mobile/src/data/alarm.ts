import { MIN_ALARM_LEAD_S } from '@openhoop/protocol';

export type AlarmMode = 'exact' | 'goal' | 'window';

export const ALARM_MODES: readonly AlarmMode[] = ['exact', 'goal', 'window'];
export const WINDOW_CHOICES_MIN: readonly number[] = [15, 30, 45];

export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
export const MONDAY_FIRST: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export interface AlarmPlan {
  enabled: boolean;
  minutes: number;
  mode: AlarmMode;
  windowMin: number;
  days: readonly number[];
}

export interface WakeOverride {
  date: string;
  minutes: number;
}

export interface ArmedAlarm {
  wakeAt: number;
  armedAt: number;
  confirmed: boolean;
  rangEarlyAt: number | null;
}

export const ALARM_PLAN_KEY = 'alarm.plan';
export const DEFAULT_ALARM_PLAN: AlarmPlan = { enabled: false, minutes: 7 * 60, mode: 'exact', windowMin: 30, days: EVERY_DAY };
const DAY_MIN = 1440;

export function armedAlarmKey(deviceId: number): string {
  return `alarm.armed.${deviceId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isMode(value: unknown): value is AlarmMode {
  return typeof value === 'string' && (ALARM_MODES as readonly string[]).includes(value);
}

function parseDays(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return EVERY_DAY;
  const days = EVERY_DAY.filter((day) => value.includes(day));
  return days.length === 0 || value.some((day) => !EVERY_DAY.includes(day)) ? EVERY_DAY : days;
}

export function parseAlarmPlan(raw: string | null): AlarmPlan {
  const value = parseJson(raw);
  if (!isRecord(value)) return DEFAULT_ALARM_PLAN;
  const { enabled, minutes, mode, windowMin, days } = value;
  if (typeof enabled !== 'boolean' || typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 0 || minutes >= DAY_MIN) return DEFAULT_ALARM_PLAN;
  if (!isMode(mode) || typeof windowMin !== 'number' || !WINDOW_CHOICES_MIN.includes(windowMin)) return DEFAULT_ALARM_PLAN;
  return { enabled, minutes, mode, windowMin, days: parseDays(days) };
}

export function serializeAlarmPlan(plan: AlarmPlan): string {
  return JSON.stringify({ enabled: plan.enabled, minutes: plan.minutes, mode: plan.mode, windowMin: plan.windowMin, days: plan.days });
}

export function toggleDay(days: readonly number[], day: number): readonly number[] {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
  return next.length === 0 ? days : EVERY_DAY.filter((d) => next.includes(d));
}

export function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((day) => b.includes(day));
}

export function parseArmedAlarm(raw: string | null): ArmedAlarm | null {
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const { wakeAt, armedAt, confirmed, rangEarlyAt } = value;
  if (typeof wakeAt !== 'number' || typeof armedAt !== 'number' || !Number.isFinite(wakeAt) || !Number.isFinite(armedAt) || wakeAt <= 0 || armedAt <= 0) return null;
  if (confirmed !== undefined && typeof confirmed !== 'boolean') return null;
  if (rangEarlyAt !== undefined && rangEarlyAt !== null && (typeof rangEarlyAt !== 'number' || !Number.isFinite(rangEarlyAt))) return null;
  return { wakeAt, armedAt, confirmed: confirmed ?? true, rangEarlyAt: rangEarlyAt ?? null };
}

export function serializeArmedAlarm(armed: ArmedAlarm): string {
  return JSON.stringify({ wakeAt: armed.wakeAt, armedAt: armed.armedAt, confirmed: armed.confirmed, rangEarlyAt: armed.rangEarlyAt });
}

const SAME_MORNING_S = 12 * 3600;
const SHOW_RANG_S = 18 * 3600;

export function confirmedAlarm(armed: ArmedAlarm | null, nowS: number): ArmedAlarm | null {
  return armed !== null && armed.confirmed && armed.wakeAt > nowS ? armed : null;
}

export function rangForThisAlarm(armed: ArmedAlarm): boolean {
  return armed.rangEarlyAt !== null && armed.rangEarlyAt <= armed.wakeAt && armed.wakeAt - armed.rangEarlyAt < SAME_MORNING_S;
}

export function rangEarly(armed: ArmedAlarm | null, nowS: number): number | null {
  return armed !== null && armed.rangEarlyAt !== null && nowS - armed.rangEarlyAt < SHOW_RANG_S ? armed.rangEarlyAt : null;
}

export function followingWakeAt(minutes: number, wakeAt: number, days: readonly number[] = EVERY_DAY, overrides: readonly WakeOverride[] = []): number {
  return nextWakeAt(minutes, new Date((wakeAt + MIN_ALARM_LEAD_S) * 1000), days, overrides);
}

export function shiftMinutes(minutes: number, delta: number): number {
  return (((minutes + delta) % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

const DAYS_AHEAD = 8;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function minutesOn(day: Date, minutes: number, days: readonly number[], overrides: readonly WakeOverride[]): number | null {
  if (!days.includes(day.getDay())) return null;
  const date = localDate(day);
  return overrides.find((o) => o.date === date)?.minutes ?? minutes;
}

export function nextWakeAt(minutes: number, now: Date, days: readonly number[] = EVERY_DAY, overrides: readonly WakeOverride[] = []): number {
  const earliest = now.getTime() / 1000 + MIN_ALARM_LEAD_S;
  const ringDays = days.length === 0 ? EVERY_DAY : days;
  for (let add = 0; add <= DAYS_AHEAD; add++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, 12, 0, 0, 0);
    const at = minutesOn(day, minutes, ringDays, overrides);
    if (at === null) continue;
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, Math.floor(at / 60), at % 60, 0, 0);
    if (target.getTime() / 1000 >= earliest) return Math.floor(target.getTime() / 1000);
  }
  const fallback = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, Math.floor(minutes / 60), minutes % 60, 0, 0);
  return Math.floor(fallback.getTime() / 1000);
}

export function scheduledAt(wakeAt: number, minutes: number, days: readonly number[] = EVERY_DAY, overrides: readonly WakeOverride[] = []): boolean {
  const date = new Date(wakeAt * 1000);
  return minutesOn(date, minutes, days.length === 0 ? EVERY_DAY : days, overrides) === localMinutes(wakeAt);
}

export type AlarmTask = { kind: 'arm'; wakeAt: number } | { kind: 'cancel' } | { kind: 'none' };

export function alarmTask(plan: AlarmPlan, armed: ArmedAlarm | null, now: Date, overrides: readonly WakeOverride[] = []): AlarmTask {
  const nowS = now.getTime() / 1000;
  const live = armed !== null && armed.wakeAt > nowS ? armed : null;
  if (!plan.enabled) return live === null ? { kind: 'none' } : { kind: 'cancel' };
  const wakeAt = nextWakeAt(plan.minutes, now, plan.days, overrides);
  if (live !== null && live.confirmed && scheduledAt(live.wakeAt, plan.minutes, plan.days, overrides)) {
    if (live.wakeAt <= wakeAt) return { kind: 'none' };
    if (live.rangEarlyAt !== null && live.wakeAt === followingWakeAt(plan.minutes, wakeAt, plan.days, overrides)) return { kind: 'none' };
  }
  return { kind: 'arm', wakeAt };
}

function localMinutes(unixS: number): number {
  const date = new Date(unixS * 1000);
  return date.getHours() * 60 + date.getMinutes();
}
