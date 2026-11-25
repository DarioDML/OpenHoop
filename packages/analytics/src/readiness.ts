import { DEFAULT_CALIBRATION } from './calibration';
import type { Calibration } from './calibration';
import { ALGO, fail, succeed } from './types';
import type { Outcome } from './types';

export const READINESS_CALIBRATING_NIGHTS = 3;
export const READINESS_OWN_RHR_NIGHTS = 4;

export interface ReadinessNight {
  hrv: number;
  sleepScore: number;
  rhr: number;
}

export interface ReadinessResult {
  score: number;
  calibrating: boolean;
  contributions: { hrv: number; sleep: number; rhr: number };
}

function usable(n: ReadinessNight): boolean {
  return Number.isFinite(n.hrv) && n.hrv > 0 && Number.isFinite(n.sleepScore) && Number.isFinite(n.rhr);
}

export function readiness(
  i: { history: ReadinessNight[]; hrv: number; sleepScore: number; rhr: number },
  c: Calibration = DEFAULT_CALIBRATION,
): Outcome<ReadinessResult> {
  if (!usable(i)) return fail('missing-signal', ALGO.readiness);
  const history = i.history.filter(usable);
  const n = history.length;

  let logSum = 0;
  let sleepSum = 0;
  let rhrSum = 0;
  for (const h of history) {
    logSum += Math.log(h.hrv);
    sleepSum += h.sleepScore;
    rhrSum += h.rhr;
  }
  const base = Math.exp((c.hrvPriorWeight * Math.log(c.hrvPriorMs) + logSum) / (c.hrvPriorWeight + n));
  const sleepRef = n > 0 ? sleepSum / n : i.sleepScore;
  const ownRhr = n >= READINESS_OWN_RHR_NIGHTS;
  const rhrRef = ownRhr ? rhrSum / n : c.rhrReferenceBpm;
  const rhrIn = ownRhr ? i.rhr : i.rhr + c.rhrOffsetBpm;

  const zHrv = c.hrvWeight * Math.log(i.hrv / base);
  const zSleep = (c.sleepWeight * (i.sleepScore - sleepRef)) / 10;
  const zRhr = -c.rhrWeight * (rhrIn - rhrRef);
  const z = zHrv + zSleep + zRhr;
  const raw = 100 * Math.exp(z);
  const share = (zi: number): number => (z === 0 ? 0 : ((raw - 100) * zi) / z);

  return succeed(
    {
      score: Math.min(100, Math.max(0, raw)),
      calibrating: n < READINESS_CALIBRATING_NIGHTS,
      contributions: { hrv: share(zHrv), sleep: share(zSleep), rhr: share(zRhr) },
    },
    1,
    ALGO.readiness,
  );
}
