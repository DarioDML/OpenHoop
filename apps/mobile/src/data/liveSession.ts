import { activeSegments, activityMetrics, projectDayLoad, zoneIndex, type ActiveMinutes, type HrPoint, type Interval, type LoadReference } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import { loadTargetBand } from './activityDerived';
import { visibleReadiness } from './derived';
import { loadAimRange } from './readinessDerived';

export type LivePhase = 'ready' | 'running' | 'paused' | 'stopped';

export interface LiveSession {
  phase: LivePhase;
  startedAt: number | null;
  endedAt: number | null;
  pausedAt: number | null;
  paused: Interval[];
  points: HrPoint[];
}

export type LiveEvent =
  | { kind: 'start'; at: number }
  | { kind: 'pause'; at: number }
  | { kind: 'resume'; at: number }
  | { kind: 'stop'; at: number }
  | { kind: 'beat'; at: number; hr: number };

export const IDLE_SESSION: LiveSession = { phase: 'ready', startedAt: null, endedAt: null, pausedAt: null, paused: [], points: [] };

export function liveReducer(state: LiveSession, event: LiveEvent): LiveSession {
  const at = Math.floor(event.at);
  switch (event.kind) {
    case 'start':
      return state.phase === 'ready' ? { ...IDLE_SESSION, phase: 'running', startedAt: at } : state;
    case 'pause':
      return state.phase === 'running' ? { ...state, phase: 'paused', pausedAt: at } : state;
    case 'resume':
      if (state.phase !== 'paused' || state.pausedAt === null) return state;
      return { ...state, phase: 'running', pausedAt: null, paused: closePause(state.paused, state.pausedAt, at) };
    case 'stop':
      if (state.phase !== 'running' && state.phase !== 'paused') return state;
      return {
        ...state,
        phase: 'stopped',
        endedAt: at,
        pausedAt: null,
        paused: state.pausedAt === null ? state.paused : closePause(state.paused, state.pausedAt, at),
      };
    case 'beat': {
      if (state.phase !== 'running' || state.startedAt === null || at < state.startedAt) return state;
      if (!Number.isFinite(event.hr) || event.hr <= 0) return state;
      const last = state.points[state.points.length - 1];
      if (last !== undefined && last.t === at) return { ...state, points: [...state.points.slice(0, -1), { t: at, hr: event.hr }] };
      return { ...state, points: [...state.points, { t: at, hr: event.hr }] };
    }
  }
}

function closePause(paused: readonly Interval[], from: number, to: number): Interval[] {
  return to > from ? [...paused, { start: from, end: to }] : [...paused];
}

export function sessionWindow(state: LiveSession, nowS: number): { window: Interval; paused: Interval[] } | null {
  if (state.startedAt === null) return null;
  const end = state.endedAt ?? Math.max(state.startedAt, Math.floor(nowS));
  const paused = state.pausedAt === null ? state.paused : closePause(state.paused, state.pausedAt, end);
  return { window: { start: state.startedAt, end }, paused };
}

export function activeSeconds(state: LiveSession, nowS: number): number {
  const span = sessionWindow(state, nowS);
  if (span === null) return 0;
  return activeSegments(span.window, span.paused).reduce((sum, s) => sum + (s.end - s.start), 0);
}

export interface Hud {
  activeS: number;
  load: number | null;
  loadReason: string | null;
  avgHr: number | null;
  maxHr: number | null;
  zone: number | null;
  projectedDayLoad: number | null;
  activeMinutes: ActiveMinutes | null;
}

export function hudFor(state: LiveSession, nowS: number, heartRate: number | null, ref: LoadReference, today: DayRecord | null): Hud {
  const span = sessionWindow(state, nowS);
  const floors = ref.zoneFloors ?? null;
  const zone = heartRate !== null && heartRate > 0 && (floors !== null || ref.max > ref.rest) ? zoneIndex(heartRate, ref.rest, ref.max, floors) : null;
  if (span === null) return { activeS: 0, load: null, loadReason: null, avgHr: null, maxHr: null, zone, projectedDayLoad: today?.load.value ?? null, activeMinutes: null };
  const m = activityMetrics(state.points, span.window, span.paused, ref.rest, ref.max, undefined, floors);
  const dayLoad = today === null ? null : (today.load.value ?? today.loadSoFar ?? null);
  const projected =
    today === null || dayLoad === null
      ? null
      : projectDayLoad(dayLoad, today.end, state.points, activeSegments(span.window, span.paused), ref.rest, ref.max);
  return {
    activeS: m.activeS,
    load: m.load.ok ? m.load.value : null,
    loadReason: m.load.ok ? null : m.load.reason,
    avgHr: m.avgHr,
    maxHr: m.maxHr,
    zone,
    projectedDayLoad: projected,
    activeMinutes: m.activeMinutes,
  };
}

export function loadTargetBuzzAt(days: readonly DayRecord[]): number | null {
  const day = days[days.length - 1];
  if (day === undefined) return null;
  const aim = loadAimRange(loadTargetBand(days), visibleReadiness(day).value);
  return aim === null ? null : Math.round(aim.low * 10) / 10;
}

export function loadTargetBuzzDue(previous: number | null, current: number | null, target: number | null): boolean {
  if (target === null || previous === null || current === null) return false;
  return previous < target && current >= target;
}
