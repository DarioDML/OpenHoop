import type { DayRecord } from '@openhoop/core';

import type { DeviceStatus, SyncProgressView } from '@/data/types';

export type DeviceStateId = 'syncing' | 'dataAtRisk' | 'notConnected' | 'lowBattery' | 'firstDay';

export const LOW_BATTERY_PERCENT = 15;
export const DATA_AT_RISK_DAYS = 7;
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
  if (device.lastSyncAt === null && days.length === 0) return 'notConnected';
  if (device.batteryPercent !== null && device.batteryPercent <= LOW_BATTERY_PERCENT) return 'lowBattery';
  if (days.length === 1) return 'firstDay';
  return null;
}
