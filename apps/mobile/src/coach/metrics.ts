import type { DayRecord } from '@openhoop/core';

import { metricValue } from '@/data/derived';
import type { ParityLevel } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { PARITY } from '@/ui/parity';

export const COACH_METRICS = ['readiness', 'sleepScore', 'load', 'hrv', 'restingHr'] as const;
export type CoachMetric = (typeof COACH_METRICS)[number];

export interface CoachMetricSpec {
  labelKey: TranslationKey;
  unitKey: TranslationKey | null;
  decimals: number;
  level: ParityLevel;
  range: string;
}

export const COACH_METRIC_SPECS: Readonly<Record<CoachMetric, CoachMetricSpec>> = {
  readiness: { labelKey: 'score.readiness', unitKey: null, decimals: 0, level: PARITY.readiness, range: '0-100' },
  sleepScore: { labelKey: 'metric.sleepScore', unitKey: null, decimals: 0, level: PARITY.sleepScore, range: '0-100' },
  load: { labelKey: 'score.load', unitKey: null, decimals: 1, level: PARITY.load, range: '0-21' },
  hrv: { labelKey: 'metric.hrv', unitKey: 'unit.ms', decimals: 0, level: PARITY.hrv, range: 'ms' },
  restingHr: { labelKey: 'metric.restingHr', unitKey: 'unit.bpm', decimals: 0, level: PARITY.restingHr, range: 'bpm' },
};

export function isCoachMetric(value: string): value is CoachMetric {
  return (COACH_METRICS as readonly string[]).includes(value);
}

export function coachMetricValue(day: DayRecord, metric: CoachMetric): number | null {
  const value = metricValue(day, metric);
  return value !== null && Number.isFinite(value) ? value : null;
}
