import type { BandModel, DayRecord } from '@stoop/core';

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

export interface AppData {
  days: DayRecord[];
  device: DeviceStatus;
  live: LiveState;
  profile: Profile;
  settings: Settings;
  scan(): Promise<DiscoveredBand[]>;
  pair(bandId: string, ownerSince: string): Promise<void>;
  sync(): Promise<void>;
  startLive(): Promise<void>;
  stopLive(): Promise<void>;
  exportData(): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
}

export type ParityLevel = 'A' | 'B' | 'C' | 'D';
