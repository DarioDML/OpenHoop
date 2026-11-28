import { useEffect, useState } from 'react';

import { useAppData } from '@/data/context';
import type { RoutePoint } from '@/data/route';

export function useActivityRoute(activityId: number | null): RoutePoint[] | null {
  const { routeFor } = useAppData();
  const [route, setRoute] = useState<RoutePoint[] | null>(activityId === null ? [] : null);

  useEffect(() => {
    if (activityId === null) {
      setRoute([]);
      return undefined;
    }
    let alive = true;
    routeFor(activityId).then(
      (points) => {
        if (alive) setRoute(points);
      },
      () => {
        if (alive) setRoute([]);
      },
    );
    return () => {
      alive = false;
    };
  }, [activityId, routeFor]);

  return route;
}
