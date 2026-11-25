import type { BandModel, BodyMeasurement, BodyMeasurementInput, DayRecord, SleepEditProblem, SleepEditRow } from '@openhoop/core';

import type { TranslationKey, TranslationParams } from '@/i18n';
import type { HcDataType } from '@/lib/healthConnectMapping';
import type { InboxEntry } from '@/lib/notificationPlan';

import type { HcAvailability } from './healthConnectApi';
import type { HealthConnectState } from './healthConnectState';
import type { PermissionState } from './notifier';

import type { SleepEditRequest } from './sleepEditForm';
import type { UserData } from './userData';

export type Language = 'nl' | 'en';
export type DataSource = 'demo' | 'band';
export type LockState = 'open' | 'locked' | 'no-data' | 'unknown';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'syncing';

export interface DeviceStatus {
  name: string | null;
  model: BandModel | null;
  firmware: string | null;
  batteryPercent: number | null;
  lastSyncAt: number | null;
  backlogPages: number | null;
  lockState: LockState;
  connection: ConnectionState;
}

export interface LiveState {
  active: boolean;
  heartRate: number | null;
  lastRrMs: number | null;
  updatedAt: number | null;
}

export interface Profile {
  birthYear: number | null;
  maxHeartRate: number | null;
}

export interface Settings {
  language: Language;
  dataSource: DataSource;
  ownerSince: string | null;
}

export interface DiscoveredBand {
  id: string;
  name: string;
  rssi: number;
}

export type SyncPhase = 'connecting' | 'probing' | 'transfer' | 'compute';

export interface SyncProgressView {
  phase: SyncPhase;
  chunks: number;
  percent: number | null;
  daysDone: number;
  daysTotal: number;
}

export interface Notice {
  key: TranslationKey;
  params?: TranslationParams;
}

export interface HeartRatePoint {
  t: number;
  hr: number;
}

export type SleepEditOutcome = 'saved' | SleepEditProblem | 'error';

export interface SleepEditLimits {
  napMaxS: number;
  sleepMaxS: number;
}

export interface HealthConnectView {
  availability: HcAvailability | 'checking';
  granted: string[];
  state: HealthConnectState;
  syncing: boolean;
}

export interface AppData {
  ready: boolean;
  days: DayRecord[];
  sleepEdits: SleepEditRow[];
  sleepEditLimits: SleepEditLimits;
  device: DeviceStatus;
  live: LiveState;
  profile: Profile;
  settings: Settings;
  userData: UserData;
  bodyMeasurements: BodyMeasurement[];
  syncProgress: SyncProgressView | null;
  notice: Notice | null;
  inbox: InboxEntry[];
  notificationPermission: PermissionState;
  healthConnect: HealthConnectView;
  scan(): Promise<DiscoveredBand[]>;
  pair(bandId: string, ownerSince: string): Promise<void>;
  sync(): Promise<void>;
  startLive(): Promise<void>;
  stopLive(): Promise<void>;
  exportData(): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  updateUserData(patch: Partial<UserData>): Promise<boolean>;
  saveBodyMeasurement(id: number | null, input: BodyMeasurementInput): Promise<boolean>;
  removeBodyMeasurement(id: number): Promise<boolean>;
  heartRateBetween(fromS: number, toS: number, bucketS?: number): Promise<HeartRatePoint[]>;
  saveSleepEdit(request: SleepEditRequest): Promise<SleepEditOutcome>;
  deleteSleepEdit(id: number): Promise<boolean>;
  clearNotice(): void;
  refreshNotifications(): Promise<void>;
  setNotificationsEnabled(enabled: boolean): Promise<PermissionState>;
  markInboxRead(): Promise<void>;
  clearInbox(): Promise<void>;
  refreshHealthConnect(): Promise<void>;
  setHealthConnectType(type: HcDataType, enabled: boolean): Promise<boolean>;
  setHealthConnectAfterSync(enabled: boolean): Promise<void>;
  requestHealthConnectAccess(): Promise<void>;
  syncHealthConnect(): Promise<void>;
  openHealthConnectSettings(): void;
  installHealthConnect(): Promise<void>;
}

export type ParityLevel = 'A' | 'B' | 'C' | 'D';
