import { getRandomBytesAsync } from 'expo-crypto';
import { openAuthSessionAsync } from 'expo-web-browser';
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import { openAppStore } from '@/data/appStore';
import { currentNetworkPrefs, netFetch } from '@/net';
import { checkRequest } from '@/net/gate';

import { AutoShareRunner } from './AutoShareRunner';
import { StravaContext } from './context';
import { StravaController, type AuthSessionResult } from './controller';
import { STRAVA_UPLOADS_KEY, parseLedger, serializeLedger, type LedgerStore } from './ledger';
import { secureStravaVault } from './vault';

const settingsLedger: LedgerStore = {
  async load() {
    return parseLedger(await (await openAppStore()).store.getSetting(STRAVA_UPLOADS_KEY));
  },
  async save(ledger) {
    await (await openAppStore()).store.setSetting(STRAVA_UPLOADS_KEY, serializeLedger(ledger));
  },
};

async function openAuth(url: string, redirect: string): Promise<AuthSessionResult> {
  const result = await openAuthSessionAsync(url, redirect);
  return result.type === 'success' && 'url' in result && typeof result.url === 'string' ? { type: 'success', url: result.url } : { type: 'cancel' };
}

async function randomState(): Promise<string> {
  const bytes = await getRandomBytesAsync(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function StravaProvider({ children }: { children: ReactNode }) {
  const instance = useMemo(
    () =>
      new StravaController({
        vault: secureStravaVault,
        ledger: settingsLedger,
        send: netFetch,
        now: () => Math.floor(Date.now() / 1000),
        allowed: (url) => checkRequest(currentNetworkPrefs(), 'strava', url).allowed,
        openAuth,
        randomState,
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      }),
    [],
  );
  const state = useSyncExternalStore(instance.subscribe, instance.getState);

  useEffect(() => {
    void instance.load();
  }, [instance]);

  const value = useMemo(() => ({ state, controller: instance }), [state, instance]);
  return (
    <StravaContext.Provider value={value}>
      {children}
      <AutoShareRunner controller={instance} state={state} />
    </StravaContext.Provider>
  );
}
