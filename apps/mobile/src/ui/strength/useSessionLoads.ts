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

export function useSessionLoads(sessions: readonly StrengthSession[]): ReadonlyMap<number, SessionLoad> {
  const { heartRateBetween } = useAppData();
  const referenceAt = useLoadReference();
  const [loads, setLoads] = useState<ReadonlyMap<number, SessionLoad>>(new Map());
  const wanted = sessions.filter((session) => session.endedAt !== null).map((session) => ({ id: session.id, start: session.startedAt, end: session.endedAt ?? session.startedAt }));
  const key = wanted.map((entry) => `${entry.id}:${entry.start}:${entry.end}`).join(',');
  const refFor = useRef(referenceAt);
  refFor.current = referenceAt;
  const list = useRef(wanted);
  list.current = wanted;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = new Map<number, SessionLoad>();
      for (const entry of list.current) {
        const points = await heartRateBetween(entry.start, entry.end, LOAD_BUCKET_S);
        if (cancelled) return;
        next.set(entry.id, sessionLoad(points, { start: entry.start, end: entry.end }, refFor.current(entry.start)));
      }
      if (!cancelled) setLoads(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, heartRateBetween, list, refFor]);

  return loads;
}

