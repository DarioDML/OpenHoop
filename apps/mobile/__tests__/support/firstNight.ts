import { ALGO } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import { createFixtureDays } from '@/data/fixtureSource';

export const FIRST_NIGHT_NOW_S = Date.UTC(2026, 10, 27, 9, 30) / 1000;
export const FIRST_NIGHT_SYNC_S = Date.UTC(2026, 10, 27, 9, 21) / 1000;

export function firstNightDay(over: Partial<DayRecord> = {}): DayRecord {
  const base = createFixtureDays(new Date(FIRST_NIGHT_NOW_S * 1000)).at(-1);
  if (base === undefined) throw new Error('fixture has no days');
  return {
    ...base,
    day: '2026-11-27',
    hrv: { ...base.hrv, value: 46.4, reason: null },
    restingHr: { ...base.restingHr, value: 53.2, reason: null },
    respiratoryRate: { ...base.respiratoryRate, value: 15.0, reason: null },
    spo2: { ...base.spo2, value: 95.95, reason: null },
    skinTempC: { ...base.skinTempC, value: 34.32, reason: null },
    skinTempDeviationC: { ...base.skinTempDeviationC, value: null, reason: 'needs-history' },
    sleep: { ...base.sleep, consistency: { ...base.sleep.consistency, value: null, reason: 'needs-history' } },
    readiness: { ...base.readiness, value: 45.6, reason: null },
    readinessCalibrating: true,
    load: { ...base.load, value: null, reason: 'low-coverage' },
    loadSoFar: 4.6,
    loadValidMinutes: 482,
    stress: { algo: ALGO.stress, reason: 'low-coverage', baselineDays: 0, windows: [] },
    ...over,
  };
}
