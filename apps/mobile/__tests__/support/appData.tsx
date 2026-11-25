import type { ReactElement, ReactNode } from 'react';

import { AppDataContext } from '@/data/context';
import { createFixtureDays, createFixtureDevice, createFixtureSettings } from '@/data/fixtureSource';
import type { AppData, Language } from '@/data/types';
import { defaultUserData } from '@/data/userData';

export const FIXTURE_NOW = new Date('2026-11-25T12:00:00Z');

export function fixtureAppData(language: Language = 'en', overrides: Partial<AppData> = {}): AppData {
  const noop = async (): Promise<void> => undefined;
  return {
    ready: true,
    syncProgress: null,
    notice: null,
    clearNotice: () => undefined,
    days: createFixtureDays(FIXTURE_NOW),
    device: createFixtureDevice(FIXTURE_NOW),
    live: { active: false, heartRate: null, lastRrMs: null, updatedAt: null },
    profile: { birthYear: null, maxHeartRate: null },
    settings: createFixtureSettings(language, FIXTURE_NOW),
    userData: { ...defaultUserData(), onboardingDone: true },
    scan: async () => [],
    pair: noop,
    sync: noop,
    startLive: noop,
    stopLive: noop,
    exportData: noop,
    updateProfile: noop,
    updateSettings: noop,
    updateUserData: async () => true,
    heartRateBetween: async () => [],
    inbox: [],
    notificationPermission: 'undetermined',
    refreshNotifications: noop,
    setNotificationsEnabled: async () => 'granted',
    markInboxRead: noop,
    clearInbox: noop,
    ...overrides,
  };
}

export function withAppData(children: ReactNode, language: Language = 'en', overrides: Partial<AppData> = {}): ReactElement {
  return <AppDataContext.Provider value={fixtureAppData(language, overrides)}>{children}</AppDataContext.Provider>;
}
