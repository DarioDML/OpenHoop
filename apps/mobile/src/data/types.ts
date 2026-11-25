import type { BandModel, BodyMeasurement, BodyMeasurementInput, DayRecord } from '@openhoop/core';

import type { TranslationKey, TranslationParams } from '@/i18n';

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

export interface AppData {
  ready: boolean;
  days: DayRecord[];
  device: DeviceStatus;
  live: LiveState;
  profile: Profile;
  settings: Settings;
  userData: UserData;
  bodyMeasurements: BodyMeasurement[];
  syncProgress: SyncProgressView | null;
  notice: Notice | null;
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
  clearNotice(): void;
}

export type ParityLevel = 'A' | 'B' | 'C' | 'D';
