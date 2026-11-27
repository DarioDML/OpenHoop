import type { TranslationKey } from '@/i18n';
import { PARITY } from '@/ui/parity';

import type { ParityLevel } from './types';

export const TERM_IDS = [
  'readiness',
  'hrv',
  'restingHr',
  'respiratoryRate',
  'spo2',
  'skinTemp',
  'skinTempChange',
  'normalRange',
  'sleepScore',
  'asleep',
  'inBed',
  'sleepNeed',
  'sleepDebt',
  'hoursVsNeed',
  'consistency',
  'efficiency',
  'stages',
  'load',
  'zones',
  'stress',
  'calories',
  'steps',
  'wearTime',
] as const;
export type TermId = (typeof TERM_IDS)[number];
export type TermCategory = 'recovery' | 'sleep' | 'effort';

export interface TermList {
  title: TranslationKey;
  items: TranslationKey;
}

export interface TermSpec {
  id: TermId;
  category: TermCategory;
  window: 'night' | 'day';
  name: TranslationKey;
  short: TranslationKey | null;
  body: TranslationKey;
  method: TranslationKey;
  level: ParityLevel | null;
  lists: readonly [TermList, TermList] | null;
}

const HRV_LISTS: readonly [TermList, TermList] = [
  { title: 'explain.list.higherAfter', items: 'term.hrv.higher' },
  { title: 'explain.list.lowerAfter', items: 'term.hrv.lower' },
];
const RHR_LISTS: readonly [TermList, TermList] = [
  { title: 'explain.list.higherAfter', items: 'term.restingHr.higher' },
  { title: 'explain.list.lowerAfter', items: 'term.restingHr.lower' },
];
const RESP_LISTS: readonly [TermList, TermList] = [
  { title: 'explain.list.higherWith', items: 'term.respiratoryRate.higher' },
  { title: 'explain.list.lowerWith', items: 'term.respiratoryRate.lower' },
];
const SPO2_LISTS: readonly [TermList, TermList] = [
  { title: 'explain.list.readsLowerWith', items: 'term.spo2.lower' },
  { title: 'explain.list.readsBestWith', items: 'term.spo2.best' },
];
const TEMP_LISTS: readonly [TermList, TermList] = [
  { title: 'explain.list.warmerWith', items: 'term.skinTemp.warmer' },
  { title: 'explain.list.coolerWith', items: 'term.skinTemp.cooler' },
];

export const TERMS: Readonly<Record<TermId, TermSpec>> = {
  readiness: { id: 'readiness', category: 'recovery', window: 'night', name: 'score.readiness', short: null, body: 'term.readiness.body', method: 'explain.method.calibrated', level: PARITY.readiness, lists: null },
  hrv: { id: 'hrv', category: 'recovery', window: 'night', name: 'metric.hrv', short: 'term.hrv.short', body: 'metricDetail.meaning.hrv', method: 'metricDetail.method.hrv', level: PARITY.hrv, lists: HRV_LISTS },
  restingHr: { id: 'restingHr', category: 'recovery', window: 'night', name: 'metric.restingHr', short: 'term.restingHr.short', body: 'metricDetail.meaning.rhr', method: 'metricDetail.method.rhr', level: PARITY.restingHr, lists: RHR_LISTS },
  respiratoryRate: { id: 'respiratoryRate', category: 'recovery', window: 'night', name: 'metric.respiratoryRate', short: 'term.respiratoryRate.short', body: 'metricDetail.meaning.resp', method: 'metricDetail.method.resp', level: PARITY.respiratoryRate, lists: RESP_LISTS },
  spo2: { id: 'spo2', category: 'recovery', window: 'night', name: 'metric.spo2', short: 'term.spo2.short', body: 'metricDetail.meaning.spo2', method: 'metricDetail.method.spo2', level: PARITY.spo2, lists: SPO2_LISTS },
  skinTemp: { id: 'skinTemp', category: 'recovery', window: 'night', name: 'metric.skinTemp', short: 'term.skinTemp.short', body: 'metricDetail.meaning.temp', method: 'metricDetail.method.temp', level: PARITY.skinTemp, lists: TEMP_LISTS },
  skinTempChange: { id: 'skinTempChange', category: 'recovery', window: 'night', name: 'metric.skinTempDeviation', short: null, body: 'term.skinTempChange.body', method: 'metricDetail.method.temp', level: PARITY.skinTemp, lists: TEMP_LISTS },
  normalRange: { id: 'normalRange', category: 'recovery', window: 'night', name: 'term.normalRange.name', short: null, body: 'term.normalRange.body', method: 'explain.method.range', level: null, lists: null },
  sleepScore: { id: 'sleepScore', category: 'sleep', window: 'night', name: 'metric.sleepScore', short: null, body: 'term.sleepScore.body', method: 'explain.method.calibrated', level: PARITY.sleepScore, lists: null },
  asleep: { id: 'asleep', category: 'sleep', window: 'night', name: 'metric.asleep', short: null, body: 'term.asleep.body', method: 'term.asleep.method', level: PARITY.sleep, lists: null },
  inBed: { id: 'inBed', category: 'sleep', window: 'night', name: 'metric.inBed', short: null, body: 'term.inBed.body', method: 'term.asleep.method', level: PARITY.sleep, lists: null },
  sleepNeed: { id: 'sleepNeed', category: 'sleep', window: 'night', name: 'metric.need', short: null, body: 'term.sleepNeed.body', method: 'explain.method.calibrated', level: PARITY.sleepNeed, lists: null },
  sleepDebt: { id: 'sleepDebt', category: 'sleep', window: 'night', name: 'metric.debt', short: null, body: 'term.sleepDebt.body', method: 'explain.method.calibrated', level: PARITY.sleepNeed, lists: null },
  hoursVsNeed: { id: 'hoursVsNeed', category: 'sleep', window: 'night', name: 'sleepx.hoursVsNeed', short: null, body: 'term.hoursVsNeed.body', method: 'explain.method.calibrated', level: PARITY.sleepNeed, lists: null },
  consistency: { id: 'consistency', category: 'sleep', window: 'night', name: 'metric.consistency', short: null, body: 'term.consistency.body', method: 'explain.method.own', level: PARITY.consistency, lists: null },
  efficiency: { id: 'efficiency', category: 'sleep', window: 'night', name: 'sleepx.efficiency', short: null, body: 'term.efficiency.body', method: 'term.asleep.method', level: PARITY.sleep, lists: null },
  stages: { id: 'stages', category: 'sleep', window: 'night', name: 'term.stages.name', short: null, body: 'term.stages.body', method: 'explain.method.own', level: PARITY.stages, lists: null },
  load: { id: 'load', category: 'effort', window: 'day', name: 'score.load', short: null, body: 'term.load.body', method: 'explain.method.calibrated', level: PARITY.load, lists: null },
  zones: { id: 'zones', category: 'effort', window: 'day', name: 'term.zones.name', short: null, body: 'term.zones.body', method: 'explain.method.calibrated', level: PARITY.zones, lists: null },
  stress: { id: 'stress', category: 'effort', window: 'day', name: 'home.stress', short: null, body: 'term.stress.body', method: 'explain.method.own', level: PARITY.stress, lists: null },
  calories: { id: 'calories', category: 'effort', window: 'day', name: 'daily.tile.calories', short: null, body: 'term.calories.body', method: 'explain.method.own', level: PARITY.calories, lists: null },
  steps: { id: 'steps', category: 'effort', window: 'day', name: 'metric.steps', short: null, body: 'term.steps.body', method: 'metricDetail.method.spo2', level: PARITY.steps, lists: null },
  wearTime: { id: 'wearTime', category: 'effort', window: 'day', name: 'metric.wearTime', short: null, body: 'term.wearTime.body', method: 'metricDetail.method.spo2', level: PARITY.wearTime, lists: null },
};

export function isTermId(value: string | null | undefined): value is TermId {
  return value !== null && value !== undefined && (TERM_IDS as readonly string[]).includes(value);
}

export function termFull(id: TermId): TranslationKey {
  return `term.${id}.full`;
}

export function termLine(id: TermId): TranslationKey {
  return `term.${id}.line`;
}
