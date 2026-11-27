import { useEffect, useRef, useState } from 'react';

import { useAppData } from '@/data/context';
import type { HeartRatePoint } from '@/data/types';
import type { RoutePoint } from '@/data/route';
import { useT } from '@/i18n/useT';
import { featureEnabled } from '@/net/features';
import { entryTitle } from '@/ui/activity/entries';

import { autoShareCandidates } from './autoShare';
import type { StravaController, StravaState } from './controller';
import { HR_BUCKET_S, stravaKey } from './tcx';

const systemNow = (): number => Math.floor(Date.now() / 1000);

interface Props {
  controller: Pick<StravaController, 'upload'>;
  state: StravaState;
  now?: () => number;
}

export function AutoShareRunner({ controller, state, now = systemNow }: Props): null {
  const { t } = useT();
  const { userData, settings, days, activities, heartRateBetween, routeFor } = useAppData();
  const attempted = useRef(new Set<string>());
  const running = useRef(false);
  const [round, setRound] = useState(0);
  const prefs = userData.stravaAutoShare;
  const ready = settings.dataSource === 'band' && state.ready && state.connection === 'connected' && featureEnabled(userData.network, 'strava');

  useEffect(() => {
    if (!ready || prefs.mode === 'manual' || running.current || state.uploading !== null) return;
    const failed = new Set([...attempted.current, ...Object.keys(state.uploadErrors)]);
    const [next] = autoShareCandidates({ days, activities, prefs, ledger: state.ledger, failed, nowS: now() });
    if (next === undefined) return;
    const { entry, tzOffsetS } = next;
    const key = stravaKey(entry);
    attempted.current.add(key);
    running.current = true;
    void (async () => {
      try {
        const [heartRate, route] = await Promise.all([
          heartRateBetween(entry.start, entry.end, HR_BUCKET_S).catch((): HeartRatePoint[] => []),
          entry.id === null ? Promise.resolve<RoutePoint[]>([]) : routeFor(entry.id).catch((): RoutePoint[] => []),
        ]);
        await controller.upload({
          key,
          type: entry.type,
          name: entryTitle(t, entry),
          startS: entry.start,
          endS: entry.end,
          tzOffsetS,
          heartRate,
          route,
          hideEnds: userData.hideRouteEnds,
        });
      } catch {
        // a failed upload is shown on the activity and is not retried automatically
      } finally {
        running.current = false;
        setRound((value) => value + 1);
      }
    })();
  }, [ready, prefs, state.uploading, state.ledger, state.uploadErrors, days, activities, heartRateBetween, routeFor, controller, t, userData.hideRouteEnds, now, round]);

  return null;
}
