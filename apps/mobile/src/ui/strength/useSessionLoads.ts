import { loadReference, type LoadReference } from '@openhoop/analytics';
import type { StrengthSession } from '@openhoop/core';
import { useEffect, useRef, useState } from 'react';

import { useAppData } from '@/data/context';
import { analyticsProfileOf } from '@/data/profile';
import { LOAD_BUCKET_S, sessionLoad, type SessionLoad } from '@/data/strength';

export function useLoadReference(): (atS: number) => LoadReference {
  const { days, profile } = useAppData();
  return (atS) => loadReference(days, analyticsProfileOf(profile), atS, new Date(atS * 1000).getFullYear());
}

export function referenceKey(ref: LoadReference): string {
  return `${ref.rest}:${ref.max}:${(ref.zoneFloors ?? []).join('/')}`;
}

interface Wanted {
  id: number;
  start: number;
  end: number;
  key: string;
  ref: LoadReference;
}

export function useSessionLoads(sessions: readonly StrengthSession[]): ReadonlyMap<number, SessionLoad> {
  const { heartRateBetween } = useAppData();
  const referenceAt = useLoadReference();
  const [loads, setLoads] = useState<ReadonlyMap<number, SessionLoad>>(new Map());
  const cache = useRef(new Map<string, SessionLoad>());
  const wanted: Wanted[] = sessions
    .filter((session) => session.endedAt !== null)
    .map((session) => {
      const end = session.endedAt ?? session.startedAt;
      const ref = referenceAt(session.startedAt);
      return { id: session.id, start: session.startedAt, end, ref, key: `${session.id}:${session.startedAt}:${end}:${referenceKey(ref)}` };
    });
  const key = wanted.map((entry) => entry.key).join(',');
  const list = useRef(wanted);
  list.current = wanted;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = list.current;
      for (const entry of entries) {
        if (cache.current.has(entry.key)) continue;
        const points = await heartRateBetween(entry.start, entry.end, LOAD_BUCKET_S);
        if (cancelled) return;
        cache.current.set(entry.key, sessionLoad(points, { start: entry.start, end: entry.end }, entry.ref));
      }
      const next = new Map<number, SessionLoad>();
      for (const entry of entries) {
        const value = cache.current.get(entry.key);
        if (value !== undefined) next.set(entry.id, value);
      }
      if (!cancelled) setLoads(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, heartRateBetween]);

  return loads;
}
