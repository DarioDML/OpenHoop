import {
  CONSISTENCY_MIN_NIGHTS,
  CONSISTENCY_NIGHTS,
  READINESS_CALIBRATING_NIGHTS,
  STRESS_BASELINE_MIN_DAYS,
  STRESS_MIN_DAY_WINDOWS,
  parseStressDay,
} from '@openhoop/analytics';
import { SKIN_BASELINE_MIN_DAYS } from '@openhoop/core/thresholds';
import type { DayRecord } from '@openhoop/core';

import type { TermId } from './terms';
import { MIN_BASELINE_NIGHTS, addDays, metricValue } from './derived';
import { VITAL_KEYS, mainNightSpan } from './dailyDerived';
import { unixToIsoDate } from '@/lib/dates';

export interface Progress {
  have: number;
  need: number;
  unit: 'nights' | 'days';
}

export const BUILDING_TERMS = ['readiness', 'consistency', 'normalRange', 'skinTempChange', 'stress'] as const;
export type BuildingTerm = (typeof BUILDING_TERMS)[number];

const STRESS_LOOKBACK_DAYS = 28;

export function isBuildingTerm(term: TermId): term is BuildingTerm {
  return (BUILDING_TERMS as readonly string[]).includes(term);
}

function earlier(days: readonly DayRecord[], index: number): DayRecord[] {
  return days.slice(0, Math.max(0, index));
}

function hasReadinessInputs(day: DayRecord): boolean {
  return day.hrv.value !== null && day.sleep.score.value !== null && day.restingHr.value !== null;
}

function hasVital(day: DayRecord): boolean {
  return VITAL_KEYS.some((key) => metricValue(day, key) !== null);
}

function count(days: readonly DayRecord[], test: (day: DayRecord) => boolean): number {
  return days.filter(test).length;
}

function progressFor(term: BuildingTerm, days: readonly DayRecord[], index: number, shown: DayRecord): Progress | null {
  const before = earlier(days, index);
  switch (term) {
    case 'readiness':
      if (!shown.readinessCalibrating) return null;
      return {
        have: count(before, hasReadinessInputs) + (hasReadinessInputs(shown) ? 1 : 0),
        need: READINESS_CALIBRATING_NIGHTS + 1,
        unit: 'nights',
      };
    case 'consistency': {
      if (shown.sleep.consistency.reason !== 'needs-history') return null;
      const nights = count(before, (d) => mainNightSpan(d) !== null);
      return {
        have: Math.min(CONSISTENCY_NIGHTS - 1, nights) + (mainNightSpan(shown) !== null ? 1 : 0),
        need: CONSISTENCY_MIN_NIGHTS,
        unit: 'nights',
      };
    }
    case 'normalRange': {
      const perVital = VITAL_KEYS.map((key) => count(before, (d) => metricValue(d, key) !== null));
      const most = Math.max(...perVital);
      if (perVital.every((n) => n >= MIN_BASELINE_NIGHTS)) return null;
      return { have: most + (hasVital(shown) ? 1 : 0), need: MIN_BASELINE_NIGHTS + 1, unit: 'nights' };
    }
    case 'skinTempChange':
      if (shown.skinTempDeviationC.reason !== 'needs-history') return null;
      return {
        have: count(before, (d) => d.skinTempC.value !== null) + (shown.skinTempC.value !== null ? 1 : 0),
        need: SKIN_BASELINE_MIN_DAYS + 1,
        unit: 'nights',
      };
    case 'stress': {
      const stored = parseStressDay(shown.stress);
      if (stored === null) return null;
      const building = stored.reason === 'needs-history' || (stored.reason === 'low-coverage' && stored.baselineDays < STRESS_BASELINE_MIN_DAYS);
      if (!building) return null;
      const recent = before.slice(-STRESS_LOOKBACK_DAYS);
      return {
        have: count(recent, (d) => (parseStressDay(d.stress)?.windows.length ?? 0) >= STRESS_MIN_DAY_WINDOWS),
        need: STRESS_BASELINE_MIN_DAYS,
        unit: 'days',
      };
    }
  }
}

export function buildingProgress(term: BuildingTerm, days: readonly DayRecord[], index: number): Progress | null {
  const shown = days[index];
  return shown === undefined ? null : progressFor(term, days, index, shown);
}

export function remaining(progress: Progress): number {
  return Math.max(1, progress.need - progress.have);
}

export function firstWeekItems(days: readonly DayRecord[], index: number): Array<{ term: BuildingTerm; progress: Progress }> {
  const items: Array<{ term: BuildingTerm; progress: Progress }> = [];
  for (const term of BUILDING_TERMS) {
    const progress = buildingProgress(term, days, index);
    if (progress !== null) items.push({ term, progress });
  }
  return items;
}

export function readinessNightsLeft(days: readonly DayRecord[], index: number): number | null {
  const progress = buildingProgress('readiness', days, index);
  return progress === null ? null : remaining(progress);
}

export function expectedDay(day: string, nowS: number, tzOffsetS: number, more: number): string {
  const today = unixToIsoDate(nowS, tzOffsetS);
  return addDays(day > today ? day : today, more);
}
