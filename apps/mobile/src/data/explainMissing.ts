import type { DayRecord } from '@openhoop/core';

import { STALE_AFTER_S } from '@/lib/widgetSnapshot';

import type { ProfileField } from './energyDerived';
import { buildingProgress, expectedDay, isBuildingTerm, remaining, type Progress } from './progress';
import { TERMS, type TermId } from './terms';

export type MissingKind = 'needs-nights' | 'day-running' | 'not-recorded' | 'thin-signal' | 'needs-profile' | 'signal-missing' | 'other';
export type BandState = 'read' | 'stale' | 'no-window';

export interface MissingInput {
  term: TermId;
  reason: string | null;
  days: readonly DayRecord[];
  index: number;
  nowS: number;
  lastSyncAt: number | null;
  profileGaps: readonly ProfileField[];
}

export interface MissingExplanation {
  term: TermId;
  kind: MissingKind;
  reason: string | null;
  window: 'night' | 'day';
  current: boolean;
  band: { state: BandState; lastSyncAt: number | null; tzOffsetS: number; nowS: number };
  progress: Progress | null;
  expectedDay: string | null;
  wornMinutes: number | null;
  profileGaps: readonly ProfileField[];
}

function hasSamples(day: DayRecord, window: 'night' | 'day'): boolean {
  return window === 'night' ? day.sleep.periods.some((p) => !p.nap) : day.heartRate.avg !== null;
}

function bandState(day: DayRecord | undefined, window: 'night' | 'day', nowS: number, lastSyncAt: number | null): BandState {
  if (day === undefined) return 'no-window';
  if (lastSyncAt === null || nowS - lastSyncAt >= STALE_AFTER_S) return 'stale';
  return hasSamples(day, window) ? 'read' : 'no-window';
}

function classify(input: MissingInput, progress: Progress | null): MissingKind {
  const { term, reason } = input;
  const window = TERMS[term].window;
  if (reason === 'no-data' || reason === 'no-sleep') return 'not-recorded';
  if (reason === 'low-coverage' && window === 'night') return 'thin-signal';
  if (progress !== null) return 'needs-nights';
  if (reason === 'needs-history') return 'needs-nights';
  if (reason === 'low-coverage' && term === 'load') return 'day-running';
  if (reason === 'no-profile') return 'needs-profile';
  if (reason === 'missing-signal') return 'signal-missing';
  return 'other';
}

export function explainMissing(input: MissingInput): MissingExplanation {
  const { term, reason, days, index, nowS, lastSyncAt, profileGaps } = input;
  const day = days[index];
  const window = TERMS[term].window;
  const progress = isBuildingTerm(term) ? buildingProgress(term, days, index) : null;
  const kind = classify(input, progress);
  const current = index === days.length - 1;
  const tzOffsetS = day?.tzOffsetS ?? 0;
  const needsNightsProgress = kind === 'needs-nights' ? progress : null;
  return {
    term,
    kind,
    reason,
    window,
    current,
    band: { state: bandState(day, window, nowS, lastSyncAt), lastSyncAt, tzOffsetS, nowS },
    progress: needsNightsProgress,
    expectedDay:
      needsNightsProgress !== null && current && day !== undefined ? expectedDay(day.day, day.end, nowS, tzOffsetS, remaining(needsNightsProgress)) : null,
    wornMinutes: kind === 'day-running' ? (day?.loadValidMinutes ?? null) : null,
    profileGaps,
  };
}
