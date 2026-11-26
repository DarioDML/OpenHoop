import type { ReactElement, ReactNode } from 'react';

import { AppDataContext, LiveDataContext } from '@/data/context';
import { createFixtureDays, createFixtureDevice, createFixtureSettings } from '@/data/fixtureSource';
import { DEFAULT_ALARM_PLAN } from '@/data/alarm';
import type { AlarmActions, AppData, BandActions, EcgActions, Language, LiveData, LiveDataStore, StrengthActions } from '@/data/types';
import { defaultHealthConnectState } from '@/data/healthConnectState';
import { defaultUserData } from '@/data/userData';

export const FIXTURE_NOW = new Date('2026-11-25T12:00:00Z');

export function fixtureStrengthActions(): StrengthActions {
  return {
    saveExercise: async () => true,
    removeExercise: async () => true,
    saveTemplate: async () => 1,
    removeTemplate: async () => true,
    startSession: async () => 1,
    addSessionExercise: async () => true,
    removeSessionExercise: async () => true,
    logSet: async () => true,
    removeSet: async () => true,
    finishSession: async () => true,
    removeSession: async () => true,
  };
}

export function fixtureBandActions(): BandActions {
  return {
    buzz: async () => true,
    stopBuzz: async () => true,
    setHeartRateBroadcast: async () => true,
    writeConfig: async () => true,
    restoreConfig: async () => true,
  };
}

export function fixtureAlarmActions(): AlarmActions {
  return { save: async () => 'on-band', ring: async () => true };
}

export function fixtureEcgActions(): EcgActions {
  return { start: async () => 1, stop: () => undefined, samples: async () => [], remove: async () => true };
}

export type AppDataOverrides = Partial<AppData & LiveData>;

export function fixtureLiveData(overrides: AppDataOverrides = {}): LiveData {
  return {
    live: overrides.live ?? { active: false, heartRate: null, lastRrMs: null, updatedAt: null },
    syncProgress: overrides.syncProgress ?? null,
    pendingDelete: overrides.pendingDelete ?? null,
    ecgLive: overrides.ecgLive ?? { active: false, elapsedMs: 0, samples: 0, tail: [] },
  };
}

export function staticLiveStore(data: LiveData): LiveDataStore {
  return { subscribe: () => () => undefined, getSnapshot: () => data };
}

export function fixtureAppData(language: Language = 'en', overrides: AppDataOverrides = {}): AppData {
  const { live: _live, syncProgress: _syncProgress, pendingDelete: _pendingDelete, ecgLive: _ecgLive, ...appOverrides } = overrides;
  const noop = async (): Promise<void> => undefined;
  return {
    ready: true,
    notice: null,
    clearNotice: () => undefined,
    days: createFixtureDays(FIXTURE_NOW),
    sleepEdits: [],
    sleepEditLimits: { napMaxS: 4 * 3_600, sleepMaxS: 16 * 3_600 },
    device: createFixtureDevice(FIXTURE_NOW),
    profile: { birthYear: null, maxHeartRate: null },
    settings: createFixtureSettings(language, FIXTURE_NOW),
    userData: { ...defaultUserData(), onboardingDone: true },
    bodyMeasurements: [],
    labResults: [],
    cycle: { periods: [], symptoms: [], pregnancy: null },
    strength: { customExercises: [], templates: [], sessions: [] },
    strengthActions: fixtureStrengthActions(),
    journalNotes: [],
    vendorData: { cycles: [], sleeps: [], workouts: [], journal: [] },
    scan: async () => [],
    pair: noop,
    sync: noop,
    startLive: noop,
    readBandConfig: noop,
    bandActions: fixtureBandActions(),
    alarm: { plan: DEFAULT_ALARM_PLAN, armed: null, events: [], problem: null },
    alarmActions: fixtureAlarmActions(),
    ecgRecordings: [],
    ecgActions: fixtureEcgActions(),
    stopLive: noop,
    exportData: noop,
    listDonationDays: async () => [],
    buildDonation: async () => {
      throw new Error('buildDonation is not stubbed in this test');
    },
    saveDonation: async () => ({ kind: 'cancelled' }),
    shareDonationPart: noop,
    discardDonation: () => undefined,
    updateProfile: noop,
    updateSettings: noop,
    updateUserData: async () => true,
    saveBodyMeasurement: async () => true,
    removeBodyMeasurement: async () => true,
    saveLabResult: async () => true,
    removeLabResult: async () => true,
    savePeriod: async () => true,
    removePeriod: async () => true,
    saveSymptom: async () => true,
    removeSymptom: async () => true,
    savePregnancy: async () => true,
    removePregnancy: async () => true,
    removeAllCycleData: async () => true,
    saveJournalNote: async () => true,
    removeJournalNote: async () => true,
    importVendorFiles: async () => null,
    removeVendorData: async () => true,
    heartRateBetween: async () => [],
    routeFor: async () => [],
    inbox: [],
    notificationPermission: 'undetermined',
    refreshNotifications: noop,
    setNotificationsEnabled: async () => 'granted',
    refreshWidgets: noop,
    refreshWidgetsAfterPin: noop,
    markInboxRead: noop,
    clearInbox: noop,
    saveSleepEdit: async () => 'saved',
    deleteSleepEdit: async () => true,
    healthConnect: { availability: 'available', granted: [], state: defaultHealthConnectState(), syncing: false },
    refreshHealthConnect: noop,
    setHealthConnectType: async () => true,
    setHealthConnectAfterSync: noop,
    requestHealthConnectAccess: noop,
    syncHealthConnect: noop,
    openHealthConnectSettings: () => undefined,
    installHealthConnect: noop,
    activities: [],
    saveActivity: async () => 1,
    deleteActivity: async () => true,
    undoDelete: noop,
    ...appOverrides,
  };
}

export function withAppData(children: ReactNode, language: Language = 'en', overrides: AppDataOverrides = {}): ReactElement {
  return (
    <LiveDataContext.Provider value={staticLiveStore(fixtureLiveData(overrides))}>
      <AppDataContext.Provider value={fixtureAppData(language, overrides)}>{children}</AppDataContext.Provider>
    </LiveDataContext.Provider>
  );
}
