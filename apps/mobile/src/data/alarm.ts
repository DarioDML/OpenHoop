import { MIN_ALARM_LEAD_S } from '@openhoop/protocol';

export type AlarmMode = 'exact' | 'goal' | 'window';

export const ALARM_MODES: readonly AlarmMode[] = ['exact', 'goal', 'window'];
export const WINDOW_CHOICES_MIN: readonly number[] = [15, 30, 45];

export interface AlarmPlan {
  enabled: boolean;
  minutes: number;
  mode: AlarmMode;
  windowMin: number;
}

export interface ArmedAlarm {
  wakeAt: number;
  armedAt: number;
  confirmed: boolean;
}

export const ALARM_PLAN_KEY = 'alarm.plan';
export const DEFAULT_ALARM_PLAN: AlarmPlan = { enabled: false, minutes: 7 * 60, mode: 'exact', windowMin: 30 };
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

export function parseAlarmPlan(raw: string | null): AlarmPlan {
  const value = parseJson(raw);
  if (!isRecord(value)) return DEFAULT_ALARM_PLAN;
  const { enabled, minutes, mode, windowMin } = value;
  if (typeof enabled !== 'boolean' || typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 0 || minutes >= DAY_MIN) return DEFAULT_ALARM_PLAN;
  if (!isMode(mode) || typeof windowMin !== 'number' || !WINDOW_CHOICES_MIN.includes(windowMin)) return DEFAULT_ALARM_PLAN;
  return { enabled, minutes, mode, windowMin };
}

export function serializeAlarmPlan(plan: AlarmPlan): string {
  return JSON.stringify({ enabled: plan.enabled, minutes: plan.minutes, mode: plan.mode, windowMin: plan.windowMin });
}

export function parseArmedAlarm(raw: string | null): ArmedAlarm | null {
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const { wakeAt, armedAt, confirmed } = value;
  if (typeof wakeAt !== 'number' || typeof armedAt !== 'number' || !Number.isFinite(wakeAt) || !Number.isFinite(armedAt) || wakeAt <= 0 || armedAt <= 0) return null;
  if (confirmed !== undefined && typeof confirmed !== 'boolean') return null;
  return { wakeAt, armedAt, confirmed: confirmed ?? true };
}

export function serializeArmedAlarm(armed: ArmedAlarm): string {
  return JSON.stringify({ wakeAt: armed.wakeAt, armedAt: armed.armedAt, confirmed: armed.confirmed });
}

export function confirmedAlarm(armed: ArmedAlarm | null, nowS: number): ArmedAlarm | null {
  return armed !== null && armed.confirmed && armed.wakeAt > nowS ? armed : null;
}

export function shiftMinutes(minutes: number, delta: number): number {
  return (((minutes + delta) % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

const DAYS_AHEAD = 3;

export function nextWakeAt(minutes: number, now: Date): number {
  const earliest = now.getTime() / 1000 + MIN_ALARM_LEAD_S;
  let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
  for (let add = 1; add <= DAYS_AHEAD && target.getTime() / 1000 < earliest; add++) {
    target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, Math.floor(minutes / 60), minutes % 60, 0, 0);
  }
  return Math.floor(target.getTime() / 1000);
}

export type AlarmTask = { kind: 'arm'; wakeAt: number } | { kind: 'cancel' } | { kind: 'none' };

export function alarmTask(plan: AlarmPlan, armed: ArmedAlarm | null, now: Date): AlarmTask {
  const nowS = now.getTime() / 1000;
  const live = armed !== null && armed.wakeAt > nowS ? armed : null;
  if (!plan.enabled) return live === null ? { kind: 'none' } : { kind: 'cancel' };
  const wakeAt = nextWakeAt(plan.minutes, now);
  if (live !== null && live.confirmed && live.wakeAt <= wakeAt && localMinutes(live.wakeAt) === plan.minutes) return { kind: 'none' };
  return { kind: 'arm', wakeAt };
}

function localMinutes(unixS: number): number {
  const date = new Date(unixS * 1000);
  return date.getHours() * 60 + date.getMinutes();
}
