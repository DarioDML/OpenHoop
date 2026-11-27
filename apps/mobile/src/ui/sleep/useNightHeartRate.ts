import { useEffect, useState } from 'react';

import { useAppData } from '@/data/context';
import type { HeartRatePoint } from '@/data/types';

interface Span {
  onset: number;
  offset: number;
}

interface Loaded {
  key: string;
  points: HeartRatePoint[];
}

export function useNightHeartRate(span: Span | null, bucketS: number): { points: HeartRatePoint[]; loaded: boolean } {
  const { heartRateBetween } = useAppData();
  const onset = span?.onset ?? null;
  const offset = span?.offset ?? null;
  const key = onset === null || offset === null ? null : `${onset}:${offset}:${bucketS}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (key === null || onset === null || offset === null) return;
    let cancelled = false;
    void heartRateBetween(onset, offset + 1, bucketS).then(
      (points) => {
        if (!cancelled) setLoaded({ key, points });
      },
      () => {
        if (!cancelled) setLoaded({ key, points: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [heartRateBetween, key, onset, offset, bucketS]);

  const current = loaded !== null && loaded.key === key;
  return { points: current ? loaded.points : [], loaded: key === null || current };
}
