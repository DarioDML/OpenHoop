import type { DayRecord } from '@openhoop/core';

import { baselineAt } from '@/data/derived';

import type { CoachMetric } from './metrics';

export type ChipTone = 'better' | 'worse' | 'usual' | 'unknown';

export interface ChipDelta {
  kind: 'pct' | 'abs';
  value: number;
}

export interface ChipStatus {
  tone: ChipTone;
  delta: ChipDelta | null;
}

const HIGHER_IS_BETTER: Readonly<Record<CoachMetric, boolean | null>> = {
  readiness: true,
  sleepScore: true,
  hrv: true,
  restingHr: false,
  load: null,
};

const DELTA_KIND: Readonly<Record<CoachMetric, ChipDelta['kind'] | null>> = {
  readiness: 'abs',
  sleepScore: 'abs',
  hrv: 'pct',
  restingHr: 'abs',
  load: null,
};

const NOTABLE_SPREAD = 0.5;

/** How a value compares with the personal baseline of the 30 days before it. */
export function chipStatus(days: readonly DayRecord[], metric: CoachMetric, day: string, value: number): ChipStatus {
  const index = days.findIndex((d) => d.day === day);
  const baseline = index < 0 ? null : baselineAt(days, index, metric);
  const kind = DELTA_KIND[metric];
  if (baseline === null || kind === null) return { tone: 'unknown', delta: null };
  const diff = value - baseline.mean;
  const delta: ChipDelta = kind === 'pct' ? { kind, value: baseline.mean === 0 ? 0 : (diff / Math.abs(baseline.mean)) * 100 } : { kind, value: diff };
  const spread = (baseline.high - baseline.low) / 2;
  const higher = HIGHER_IS_BETTER[metric];
  if (higher === null || spread <= 0 || Math.abs(diff) <= NOTABLE_SPREAD * spread) return { tone: 'usual', delta };
  const better = higher ? diff > 0 : diff < 0;
  return { tone: better ? 'better' : 'worse', delta };
}
