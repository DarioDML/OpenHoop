import { Linking, Platform } from 'react-native';
import {
  SdkAvailabilityStatus,
  aggregateGroupByPeriod,
  deleteRecordsByTimeRange,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  type HealthConnectRecord,
  type Permission,
  type RecordType,
} from 'react-native-health-connect';

import { isoTime } from '@/lib/healthConnectMapping';

export type HcAvailability = 'unsupported' | 'not-installed' | 'update-required' | 'available';
export type HcReadType = 'Weight' | 'BodyFat';

export interface HealthConnectApi {
  availability(): Promise<HcAvailability>;
  grantedPermissions(): Promise<Set<string>>;
  requestPermissions(permissions: Permission[]): Promise<Set<string>>;
  insert(records: HealthConnectRecord[]): Promise<number>;
  deleteOwn(recordType: RecordType, fromS: number, toS: number): Promise<void>;
  readAll(recordType: HcReadType, fromS: number, toS: number): Promise<unknown[]>;
  stepsByDay(fromS: number, toS: number): Promise<unknown[]>;
  openSettings(): void;
  openStore(): Promise<void>;
}

export const OPENHOOP_PACKAGE = 'app.openhoop.mobile';
const PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';
const STORE_URL = `market://details?id=${PROVIDER_PACKAGE}&url=healthconnect%3A%2F%2Fonboarding`;
const STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PROVIDER_PACKAGE}`;
const MIN_ANDROID_API = 28;
const INSERT_CHUNK = 500;
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

function isPermissionLike(value: unknown): value is { accessType: string; recordType: string } {
  if (typeof value !== 'object' || value === null) return false;
  const accessType: unknown = Reflect.get(value, 'accessType');
  const recordType: unknown = Reflect.get(value, 'recordType');
  return (accessType === 'read' || accessType === 'write') && typeof recordType === 'string';
}

export function toPermissionKeys(values: readonly unknown[]): Set<string> {
  const keys = new Set<string>();
  for (const value of values) {
    if (isPermissionLike(value)) keys.add(`${value.accessType}:${value.recordType}`);
  }
  return keys;
}

export function statusToAvailability(status: number): HcAvailability {
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update-required';
  return 'not-installed';
}

function androidApiLevel(): number {
  return typeof Platform.Version === 'number' ? Platform.Version : Number.parseInt(Platform.Version, 10);
}

export const nativeHealthConnect: HealthConnectApi = {
  async availability() {
    if (Platform.OS !== 'android' || androidApiLevel() < MIN_ANDROID_API) return 'unsupported';
    const availability = statusToAvailability(await getSdkStatus());
    if (availability !== 'available') return availability;
    return (await initialize()) ? 'available' : 'not-installed';
  },
  async grantedPermissions() {
    return toPermissionKeys(await getGrantedPermissions());
  },
  async requestPermissions(permissions) {
    if (permissions.length > 0) await requestPermission(permissions);
    return toPermissionKeys(await getGrantedPermissions());
  },
  async insert(records) {
    let written = 0;
    for (let i = 0; i < records.length; i += INSERT_CHUNK) {
      const chunk = records.slice(i, i + INSERT_CHUNK);
      await insertRecords(chunk);
      written += chunk.length;
    }
    return written;
  },
  async deleteOwn(recordType, fromS, toS) {
    await deleteRecordsByTimeRange(recordType, { operator: 'between', startTime: isoTime(fromS), endTime: isoTime(toS) });
  },
  async readAll(recordType, fromS, toS) {
    const out: unknown[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await readRecords(recordType, {
        timeRangeFilter: { operator: 'between', startTime: isoTime(fromS), endTime: isoTime(toS) },
        pageSize: PAGE_SIZE,
        ...(pageToken === undefined ? {} : { pageToken }),
      });
      out.push(...result.records);
      pageToken = typeof result.pageToken === 'string' && result.pageToken !== '' ? result.pageToken : undefined;
      if (pageToken === undefined) break;
    }
    return out;
  },
  async stepsByDay(fromS, toS) {
    const groups: unknown = await aggregateGroupByPeriod({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime: isoTime(fromS), endTime: isoTime(toS) },
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    });
    return Array.isArray(groups) ? groups : [];
  },
  openSettings() {
    openHealthConnectSettings();
  },
  async openStore() {
    try {
      await Linking.openURL(STORE_URL);
    } catch {
      await Linking.openURL(STORE_WEB_URL);
    }
  },
};
