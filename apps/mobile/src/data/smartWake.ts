import { rangForThisAlarm, type AlarmMode, type AlarmPlan, type ArmedAlarm } from './alarm';

export const CHECK_EVERY_S = 300;
export const LEAVE_TO_BAND_S = 120;
export const GOAL_WINDOW_S = 90 * 60;
export const LIGHT_THRESHOLD = 0.6;
export const LIGHT_EPOCHS = 2;
export const FRESH_S = 10 * 60;

export interface RecentEpoch {
  t: number;
  wake: number;
  light: number;
}

export interface SmartWakeInput {
  mode: Exclude<AlarmMode, 'exact'>;
  wakeAt: number;
  windowMin: number;
  nowS: number;
  recent: readonly RecentEpoch[] | null;
  awake: boolean;
  asleepS: number | null;
  needS: number | null;
}

export type SmartWakeDecision =
  | { kind: 'ring'; reason: 'light' | 'goal' | 'awake' }
  | { kind: 'check'; at: number }
  | { kind: 'band' };

export function windowStart(mode: Exclude<AlarmMode, 'exact'>, wakeAt: number, windowMin: number): number {
  return wakeAt - (mode === 'goal' ? GOAL_WINDOW_S : windowMin * 60);
}

function lightMoment(recent: readonly RecentEpoch[] | null, nowS: number): boolean {
  if (recent === null || recent.length < LIGHT_EPOCHS) return false;
  const last = recent.slice(-LIGHT_EPOCHS);
  const newest = last[last.length - 1];
  if (newest === undefined || newest.t < nowS - FRESH_S) return false;
  const score = last.reduce((sum, epoch) => sum + epoch.wake + epoch.light, 0) / last.length;
  return score >= LIGHT_THRESHOLD;
}

export function smartWakeDecision(input: SmartWakeInput): SmartWakeDecision {
  const { mode, wakeAt, nowS } = input;
  const lastChance = wakeAt - LEAVE_TO_BAND_S;
  if (nowS >= lastChance) return { kind: 'band' };
  const start = windowStart(mode, wakeAt, input.windowMin);
  if (nowS < start) return { kind: 'check', at: start };
  if (input.awake) return { kind: 'ring', reason: 'awake' };
  if (mode === 'window' && lightMoment(input.recent, nowS)) return { kind: 'ring', reason: 'light' };
  if (mode === 'goal' && input.asleepS !== null && input.needS !== null && input.asleepS >= input.needS) return { kind: 'ring', reason: 'goal' };
  return { kind: 'check', at: Math.min(nowS + CHECK_EVERY_S, lastChance) };
}

export const REARM_AFTER_S = 180;
export const MIN_DELAY_S = 60;

export type WakeJob = { kind: 'smart'; at: number } | { kind: 'rearm'; at: number };

/**
 * What the phone should wake up for next. A smart alarm checks the night from its window start. Every other alarm,
 * and a smart one the band will ring itself, gets a short wake after the ring, because the band holds one alarm and
 * only a sync can set the next one.
 */
export function wakeJob(plan: AlarmPlan, armed: ArmedAlarm | null, nowS: number, available: boolean): WakeJob | null {
  if (!available || !plan.enabled || armed === null || !armed.confirmed || armed.wakeAt <= nowS) return null;
  if (plan.mode !== 'exact' && !rangForThisAlarm(armed)) return { kind: 'smart', at: Math.max(nowS + MIN_DELAY_S, windowStart(plan.mode, armed.wakeAt, plan.windowMin)) };
  return { kind: 'rearm', at: armed.wakeAt + REARM_AFTER_S };
}

export function rearmDue(plan: AlarmPlan, armed: ArmedAlarm | null, nowS: number): boolean {
  return plan.enabled && armed !== null && armed.confirmed && armed.wakeAt <= nowS;
}
