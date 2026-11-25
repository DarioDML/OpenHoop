import type { DataSource, Language, Profile } from './types';

export const SETTING_KEYS = {
  language: 'ui.language',
  dataSource: 'ui.dataSource',
  birthYear: 'profile.birthYear',
  maxHeartRate: 'profile.maxHeartRate',
  bandBleId: 'band.bleId',
  demoSeeded: 'demo.seeded',
} as const;

export function parseLanguage(raw: string | null): Language | null {
  return raw === 'nl' || raw === 'en' ? raw : null;
}

export function parseDataSource(raw: string | null): DataSource {
  return raw === 'band' ? 'band' : 'demo';
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
