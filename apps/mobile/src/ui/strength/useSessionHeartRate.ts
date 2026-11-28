import type { StrengthSession } from '@openhoop/core';
import { useEffect, useMemo, useState } from 'react';

import { useAppData } from '@/data/context';
import { LOAD_BUCKET_S } from '@/data/strength';
import type { HeartRatePoint } from '@/data/types';

const HR_REFRESH_MS = 30_000;
const MAX_BEATS = 6 * 3_600;

export function useSessionHeartRate(session: StrengthSession | null, liveHr: number | null, liveAt: number | null): HeartRatePoint[] {
  const { heartRateBetween } = useAppData();
  const [stored, setStored] = useState<HeartRatePoint[]>([]);
  const [beats, setBeats] = useState<HeartRatePoint[]>([]);
  const sessionId = session?.id ?? null;
  const startedAt = session?.startedAt ?? 0;

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      const points = await heartRateBetween(startedAt, Math.floor(Date.now() / 1000) + 1, LOAD_BUCKET_S);
      if (!cancelled) setStored(points);
    };
    void load();
    const id = setInterval(() => void load(), HR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, startedAt, heartRateBetween]);

  useEffect(() => {
    if (liveHr === null || !(liveHr > 0)) return;
    const t = Math.floor(Date.now() / 1000);
    setBeats((list) => {
      const beat = { t, hr: liveHr };
      const next = list[list.length - 1]?.t === t ? [...list.slice(0, -1), beat] : [...list, beat];
      return next.length > MAX_BEATS ? next.slice(next.length - MAX_BEATS) : next;
    });
  }, [liveHr, liveAt]);

  return useMemo(() => {
    const merged = new Map<number, number>();
    for (const point of beats) merged.set(point.t, point.hr);
    for (const point of stored) merged.set(point.t, point.hr);
    return [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([t, hr]) => ({ t, hr }));
  }, [stored, beats]);
}
