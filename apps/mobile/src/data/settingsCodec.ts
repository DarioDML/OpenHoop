import { analyticsChanged, mergeProfile, parseBirthDate, parseZoneFloors, parseZoneMode, RESTING_HR_LIMITS, serializeZoneFloors } from './profile';
import type { DataSource, Language, Profile, Units } from './types';

export const SETTING_KEYS = {
  language: 'ui.language',
  dataSource: 'ui.dataSource',
  units: 'ui.units',
  birthYear: 'profile.birthYear',
  maxHeartRate: 'profile.maxHeartRate',
  birthDate: 'profile.birthDate',
  restingHeartRate: 'profile.restingHeartRate',
  zoneMode: 'profile.zoneMode',
  zoneFloors: 'profile.zoneFloors',
  bandBleId: 'band.bleId',
  demoSeeded: 'demo.seeded',
} as const;

export function parseLanguage(raw: string | null): Language | null {
  return raw === 'nl' || raw === 'en' ? raw : null;
}

export function parseDataSource(raw: string | null): DataSource {
  return raw === 'band' ? 'band' : 'demo';
}

export function parseUnits(raw: string | null): Units {
  return raw === 'imperial' ? 'imperial' : 'metric';
}

export function parseOptionalInteger(raw: string | null, min: number, max: number): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

export function serializeOptionalInteger(value: number | null): string {
  return value === null ? '' : String(value);
}

export function parseProfile(birthYear: string | null, maxHeartRate: string | null, currentYear: number): Profile {
  return {
    birthYear: parseOptionalInteger(birthYear, 1900, currentYear),
    maxHeartRate: parseOptionalInteger(maxHeartRate, 120, 230),
  };
}

export interface ProfileDetailsRaw {
  birthDate: string | null;
  restingHeartRate: string | null;
  zoneMode: string | null;
  zoneFloors: string | null;
}

export function parseProfileDetails(raw: ProfileDetailsRaw, today: string): Required<Pick<Profile, 'birthDate' | 'restingHeartRate' | 'zoneMode' | 'zoneFloors'>> {
  return {
    birthDate: parseBirthDate(raw.birthDate, today),
    restingHeartRate: parseOptionalInteger(raw.restingHeartRate, RESTING_HR_LIMITS.min, RESTING_HR_LIMITS.max),
    zoneMode: parseZoneMode(raw.zoneMode),
    zoneFloors: parseZoneFloors(raw.zoneFloors),
  };
}

export interface SettingsWriter {
  setSetting(key: string, value: string): Promise<void>;
}

export async function storeProfile(store: SettingsWriter, before: Profile, patch: Partial<Profile>): Promise<{ profile: Required<Profile>; recompute: boolean }> {
  const profile = mergeProfile(before, patch);
  await store.setSetting(SETTING_KEYS.birthYear, serializeOptionalInteger(profile.birthYear));
  await store.setSetting(SETTING_KEYS.maxHeartRate, serializeOptionalInteger(profile.maxHeartRate));
  await store.setSetting(SETTING_KEYS.birthDate, profile.birthDate ?? '');
  await store.setSetting(SETTING_KEYS.restingHeartRate, serializeOptionalInteger(profile.restingHeartRate));
  await store.setSetting(SETTING_KEYS.zoneMode, profile.zoneMode);
  await store.setSetting(SETTING_KEYS.zoneFloors, serializeZoneFloors(profile.zoneFloors));
  return { profile, recompute: analyticsChanged(before, profile) };
}
