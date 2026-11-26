import type { DayRecord } from '@openhoop/core';

import type { DeviceStatus, SyncProgressView } from '@/data/types';

export type DeviceStateId = 'syncing' | 'dataAtRisk' | 'notConnected' | 'waitingForData' | 'charging' | 'lowBattery' | 'firstDay';

export const LOW_BATTERY_PERCENT = 15;
export const DATA_AT_RISK_DAYS = 7;
export const CHARGING_FRESH_S = 900;
// The band reports charging every 600 s, so a report older than that plus the sync window is no longer current.
export const CHARGING_REPORT_FRESH_S = 1_500;
const DAY_S = 86400;

export interface DeviceStateInput {
  device: DeviceStatus;
  days: readonly DayRecord[];
  syncProgress: SyncProgressView | null;
  nowS: number;
}

export function daysSinceSync(device: DeviceStatus, nowS: number): number | null {
  if (device.lastSyncAt === null) return null;
  return Math.floor(Math.max(0, nowS - device.lastSyncAt) / DAY_S);
}

export function pickDeviceState({ device, days, syncProgress, nowS }: DeviceStateInput): DeviceStateId | null {
  if (syncProgress !== null || device.connection === 'syncing') return 'syncing';
  const since = daysSinceSync(device, nowS);
  if (since !== null && since >= DATA_AT_RISK_DAYS) return 'dataAtRisk';
  if (days.length === 0 && device.name === null && device.lastSyncAt === null) return 'notConnected';
  if (days.length === 0) return 'waitingForData';
  const charging = device.band?.charging ?? null;
  const syncFresh = device.lastSyncAt !== null && nowS - device.lastSyncAt < CHARGING_FRESH_S;
  if (charging?.charging === true && syncFresh && nowS - charging.at < CHARGING_REPORT_FRESH_S) return 'charging';
  if (device.batteryPercent !== null && device.batteryPercent <= LOW_BATTERY_PERCENT) return 'lowBattery';
  if (days.length === 1) return 'firstDay';
  return null;
}
