import type { BodyMeasurement, CuffReading, CycleData, EcgSummary, JournalNote, LabResult, StrengthData, VendorData } from '@openhoop/core';

import type { InboxEntry } from '@/lib/notificationPlan';

import { DEFAULT_ALARM_PLAN } from './alarm';
import { defaultHealthConnectState } from './healthConnectState';
import type { AlarmView, HealthConnectView, Notice, Profile, Settings } from './types';
import { defaultUserData, type UserData } from './userData';

export interface WipedState {
  userData: UserData;
  settings: Settings;
  profile: Profile;
  bodyMeasurements: BodyMeasurement[];
  journalNotes: JournalNote[];
  labResults: LabResult[];
  cuffReadings: CuffReading[];
  vendorData: VendorData;
  cycle: CycleData;
  strength: StrengthData;
  inbox: InboxEntry[];
  healthConnect: HealthConnectView;
  alarm: AlarmView;
  ecgRecordings: EcgSummary[];
  notice: Notice | null;
}

export interface WipeBase {
  settings: Settings;
  healthConnect: HealthConnectView;
  alarm: AlarmView;
}

export function wipedState(current: WipeBase): WipedState {
  return {
    userData: defaultUserData(),
    settings: { ...current.settings, dataSource: 'demo', ownerSince: null, units: 'metric' },
    profile: { birthYear: null, maxHeartRate: null },
    bodyMeasurements: [],
    journalNotes: [],
    labResults: [],
    cuffReadings: [],
    vendorData: { cycles: [], sleeps: [], workouts: [], journal: [] },
    cycle: { periods: [], symptoms: [], pregnancy: null },
    strength: { customExercises: [], templates: [], sessions: [] },
    inbox: [],
    healthConnect: { ...current.healthConnect, state: defaultHealthConnectState() },
    alarm: { ...current.alarm, plan: DEFAULT_ALARM_PLAN, armed: null, events: [], problem: null },
    ecgRecordings: [],
    notice: null,
  };
}
