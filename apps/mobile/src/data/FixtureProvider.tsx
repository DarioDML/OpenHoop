import { getLocales } from 'expo-localization';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { detectLanguage } from '@/i18n';

import { AppDataContext } from './context';
import {
  FIXTURE_BANDS,
  FIXTURE_PROFILE,
  createFixtureDays,
  createFixtureDevice,
  createFixtureSettings,
} from './fixtureSource';
import type { AppData, DeviceStatus, DiscoveredBand, LiveState, Profile, Settings } from './types';

const IDLE_LIVE: LiveState = { active: false, heartRate: null, lastRrMs: null, updatedAt: null };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Props {
  children: ReactNode;
}

export function FixtureProvider({ children }: Props) {
  const now = useRef(new Date()).current;
  const days = useMemo(() => createFixtureDays(now), [now]);
  const [device, setDevice] = useState<DeviceStatus>(() => createFixtureDevice(now));
  const [live, setLive] = useState<LiveState>(IDLE_LIVE);
  const [profile, setProfile] = useState<Profile>(FIXTURE_PROFILE);
  const [settings, setSettings] = useState<Settings>(() =>
    createFixtureSettings(detectLanguage(getLocales()[0]?.languageCode), now),
  );
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (tick.current !== null) {
      clearInterval(tick.current);
      tick.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const startLive = useCallback(async () => {
    stopTimer();
    let n = 0;
    const emit = (): void => {
      n += 1;
      const hr = Math.round(68 + 6 * Math.sin(n / 4) + (n % 3));
      setLive({ active: true, heartRate: hr, lastRrMs: Math.round(60000 / hr + (n % 5) * 6 - 12), updatedAt: Date.now() });
    };
    emit();
    tick.current = setInterval(emit, 1000);
  }, [stopTimer]);

  const stopLive = useCallback(async () => {
    stopTimer();
    setLive(IDLE_LIVE);
  }, [stopTimer]);

  const sync = useCallback(async () => {
    setDevice((d) => ({ ...d, connection: 'syncing' }));
    await delay(1400);
    setDevice((d) => ({ ...d, connection: 'connected', lastSyncAt: Math.floor(Date.now() / 1000), backlogPages: 0 }));
  }, []);

  const scan = useCallback(async (): Promise<DiscoveredBand[]> => {
    await delay(900);
    return FIXTURE_BANDS;
  }, []);

  const pair = useCallback(async (_bandId: string, ownerSince: string) => {
    await delay(1200);
    setSettings((s) => ({ ...s, ownerSince }));
  }, []);

  const exportData = useCallback(async () => {
    await delay(600);
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    setProfile((p) => ({ ...p, ...patch }));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const value = useMemo<AppData>(
    () => ({ days, device, live, profile, settings, scan, pair, sync, startLive, stopLive, exportData, updateProfile, updateSettings }),
    [days, device, live, profile, settings, scan, pair, sync, startLive, stopLive, exportData, updateProfile, updateSettings],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
