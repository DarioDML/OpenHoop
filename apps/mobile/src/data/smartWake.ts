import type { AlarmMode } from './alarm';

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
