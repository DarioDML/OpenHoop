import type { Interval } from '@openhoop/analytics';
import type { ActivityRow, ActivitySource, BandModel, BodyMeasurement, BodyMeasurementInput, DayRecord, LabResult, LabResultInput, SleepEditProblem, SleepEditRow, WorkoutRecord } from '@openhoop/core';

import type { TranslationKey, TranslationParams } from '@/i18n';
import type { InboxEntry } from '@/lib/notificationPlan';

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

export interface ActivityDraft {
  source: ActivitySource;
  detectedStart: number | null;
  type: string;
  start: number;
  end: number;
  paused: Interval[];
  note: string | null;
}

export type DeleteTarget = { kind: 'activity'; id: number } | { kind: 'detected'; workout: WorkoutRecord };

export interface PendingDelete {
  id: number;
  until: number;
}

export type SleepEditOutcome = 'saved' | SleepEditProblem | 'error';

export interface SleepEditLimits {
  napMaxS: number;
  sleepMaxS: number;
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
  labResults: LabResult[];
  syncProgress: SyncProgressView | null;
  notice: Notice | null;
  inbox: InboxEntry[];
  notificationPermission: PermissionState;
  activities: ActivityRow[];
  pendingDelete: PendingDelete | null;
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
  saveLabResult(id: number | null, input: LabResultInput): Promise<boolean>;
  removeLabResult(id: number): Promise<boolean>;
  heartRateBetween(fromS: number, toS: number, bucketS?: number): Promise<HeartRatePoint[]>;
  saveSleepEdit(request: SleepEditRequest): Promise<SleepEditOutcome>;
  deleteSleepEdit(id: number): Promise<boolean>;
  saveActivity(draft: ActivityDraft, id?: number): Promise<number | null>;
  deleteActivity(target: DeleteTarget): Promise<boolean>;
  undoDelete(): Promise<void>;
  clearNotice(): void;
  refreshNotifications(): Promise<void>;
  setNotificationsEnabled(enabled: boolean): Promise<PermissionState>;
  markInboxRead(): Promise<void>;
  clearInbox(): Promise<void>;
}

export type ParityLevel = 'A' | 'B' | 'C' | 'D';
