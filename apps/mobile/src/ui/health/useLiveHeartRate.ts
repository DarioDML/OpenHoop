import { useEffect, useState } from 'react';

import { useLive } from '@/data/context';

export const LIVE_POINTS = 60;

export interface LiveHeartRate {
  active: boolean;
  current: number | null;
  series: number[];
}

export function appendLive(series: readonly number[], value: number, max = LIVE_POINTS): number[] {
  const next = [...series, value];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function useLiveHeartRate(): LiveHeartRate {
  const live = useLive();
  const [series, setSeries] = useState<number[]>([]);
  const value = live.active ? live.heartRate : null;

  useEffect(() => {
    if (!live.active) {
      setSeries([]);
      return;
    }
    if (value !== null && Number.isFinite(value) && value > 0) setSeries((current) => appendLive(current, value));
  }, [live.active, live.updatedAt, value]);

  return { active: live.active && value !== null, current: value, series };
}
