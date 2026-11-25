import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import { openAppStore } from '@/data/appStore';
import { currentNetworkPrefs, netFetch } from '@/net';
import { featureEnabled } from '@/net/features';

import { CoachContext } from './CoachContext';
import { CoachController } from './controller';
import { secureKeyStore } from './keyStore';
import { sqlCoachRepo } from './repo';

export function CoachProvider({ children }: { children: ReactNode }) {
  const instance = useMemo(
    () =>
      new CoachController({
        repo: sqlCoachRepo(async () => (await openAppStore()).driver),
        keys: secureKeyStore,
        send: netFetch,
        now: () => Math.floor(Date.now() / 1000),
        allowed: () => featureEnabled(currentNetworkPrefs(), 'coach'),
      }),
    [],
  );
  const state = useSyncExternalStore(instance.subscribe, instance.getState);

  useEffect(() => {
    void instance.load();
  }, [instance]);

  const value = useMemo(() => ({ state, controller: instance }), [state, instance]);
  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}
