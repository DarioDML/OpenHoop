import type { DayRecord, Derived } from '@openhoop/core';

import type { MetricKey } from '@/data/derived';
import type { ParityLevel } from '@/data/types';
import type { DashboardTile } from '@/data/userData';
import type { TranslationKey } from '@/i18n';
import { PARITY } from '@/ui/parity';

export const METRIC_SLUGS = ['hrv', 'rhr', 'resp', 'spo2', 'temp'] as const;
export type MetricSlug = (typeof METRIC_SLUGS)[number];

export interface MetricSpec {
  slug: MetricSlug;
  key: MetricKey;
  label: TranslationKey;
  unit: TranslationKey;
  decimals: number;
  level: ParityLevel;
  minSpan: number;
  meaning: TranslationKey;
  method: TranslationKey;
  tile: DashboardTile;
  pick: (day: DayRecord) => Derived;
}

export const METRIC_SPECS: Readonly<Record<MetricSlug, MetricSpec>> = {
  hrv: { slug: 'hrv', key: 'hrv', label: 'metric.hrv', unit: 'unit.ms', decimals: 0, level: PARITY.hrv, minSpan: 10, meaning: 'metricDetail.meaning.hrv', method: 'metricDetail.method.hrv', tile: 'hrv', pick: (d) => d.hrv },
  rhr: { slug: 'rhr', key: 'restingHr', label: 'metric.restingHr', unit: 'unit.bpm', decimals: 0, level: PARITY.restingHr, minSpan: 6, meaning: 'metricDetail.meaning.rhr', method: 'metricDetail.method.rhr', tile: 'restingHr', pick: (d) => d.restingHr },
  resp: { slug: 'resp', key: 'respiratoryRate', label: 'metric.respiratoryRate', unit: 'unit.perMin', decimals: 1, level: PARITY.respiratoryRate, minSpan: 2, meaning: 'metricDetail.meaning.resp', method: 'metricDetail.method.resp', tile: 'respiratoryRate', pick: (d) => d.respiratoryRate },
  spo2: { slug: 'spo2', key: 'spo2', label: 'metric.spo2', unit: 'unit.percent', decimals: 1, level: PARITY.spo2, minSpan: 3, meaning: 'metricDetail.meaning.spo2', method: 'metricDetail.method.spo2', tile: 'spo2', pick: (d) => d.spo2 },
  temp: { slug: 'temp', key: 'skinTemp', label: 'metric.skinTemp', unit: 'unit.celsius', decimals: 1, level: PARITY.skinTemp, minSpan: 1, meaning: 'metricDetail.meaning.temp', method: 'metricDetail.method.temp', tile: 'skinTemp', pick: (d) => d.skinTempC },
};

export function isMetricSlug(value: string | null): value is MetricSlug {
  return value !== null && (METRIC_SLUGS as readonly string[]).includes(value);
}

export const TILE_LABEL: Readonly<Record<DashboardTile, TranslationKey>> = {
  hrv: 'metric.hrv',
  restingHr: 'metric.restingHr',
  steps: 'metric.steps',
  respiratoryRate: 'metric.respiratoryRate',
  spo2: 'metric.spo2',
  skinTemp: 'metric.skinTemp',
  sleepDebt: 'metric.debt',
  calories: 'daily.tile.calories',
};

export function slugForTile(tile: DashboardTile): MetricSlug | null {
  for (const slug of METRIC_SLUGS) if (METRIC_SPECS[slug].tile === tile) return slug;
  return null;
}
