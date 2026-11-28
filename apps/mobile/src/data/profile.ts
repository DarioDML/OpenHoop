import { effectiveMaxHr, hrrZoneFloors, isZoneFloors, loadReference, type Profile as AnalyticsProfile, type ZoneFloors } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import { parseWholeNumber } from './activityDerived';
import type { Profile, ZoneMode } from './types';

export const ZONE_MODES = ['auto', 'custom'] as const satisfies readonly ZoneMode[];
export const RESTING_HR_LIMITS = { min: 30, max: 120 } as const;
export const MAX_HR_LIMITS = { min: 120, max: 230 } as const;
export const BIRTH_YEAR_MIN = 1900;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function emptyProfile(): Required<Profile> {
  return { birthYear: null, maxHeartRate: null, birthDate: null, restingHeartRate: null, zoneMode: 'auto', zoneFloors: null };
}

export function birthDateOf(year: number, month: number, day: number, today: string): string | null {
  if (![year, month, day].every(Number.isInteger) || year < BIRTH_YEAR_MIN) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return iso <= today ? iso : null;
}

export type BirthFields = { ok: true; birthYear: number | null; birthDate: string | null } | { ok: false };

export function parseBirthFields(dayText: string, monthText: string, yearText: string, today: string): BirthFields {
  const filled = (text: string): boolean => text.trim() !== '';
  if (!filled(dayText) && !filled(monthText) && !filled(yearText)) return { ok: true, birthYear: null, birthDate: null };
  const year = parseWholeNumber(yearText);
  const currentYear = Number(today.slice(0, 4));
  if (year === null || year < BIRTH_YEAR_MIN || year > currentYear) return { ok: false };
  if (!filled(dayText) && !filled(monthText)) return { ok: true, birthYear: year, birthDate: null };
  const day = parseWholeNumber(dayText);
  const month = parseWholeNumber(monthText);
  if (day === null || month === null) return { ok: false };
  const date = birthDateOf(year, month, day, today);
  return date === null ? { ok: false } : { ok: true, birthYear: year, birthDate: date };
}

export function parseBirthDate(raw: string | null | undefined, today: string): string | null {
  if (typeof raw !== 'string') return null;
  const match = ISO_DAY.exec(raw);
  if (match === null) return null;
  return birthDateOf(Number(match[1]), Number(match[2]), Number(match[3]), today);
}

export function birthDateParts(birthDate: string | null | undefined): { year: number; month: number; day: number } | null {
  if (typeof birthDate !== 'string') return null;
  const match = ISO_DAY.exec(birthDate);
  if (match === null) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function ageOn(profile: Pick<Profile, 'birthYear' | 'birthDate'>, day: string): number | null {
  const on = birthDateParts(day);
  if (on === null) return null;
  const born = birthDateParts(profile.birthDate);
  if (born !== null) {
    const beforeBirthday = on.month < born.month || (on.month === born.month && on.day < born.day);
    const age = on.year - born.year - (beforeBirthday ? 1 : 0);
    return age >= 0 ? age : null;
  }
  if (profile.birthYear === null) return null;
  const age = on.year - profile.birthYear;
  return age >= 0 ? age : null;
}

export function parseZoneFloors(raw: string | null | undefined): ZoneFloors | null {
  if (typeof raw !== 'string' || !/^\d{2,3}(,\d{2,3}){4}$/.test(raw)) return null;
  const values = raw.split(',').map(Number);
  return isZoneFloors(values) ? values : null;
}

export function serializeZoneFloors(floors: ZoneFloors | null | undefined): string {
  return floors ? floors.map((f) => String(Math.round(f))).join(',') : '';
}

export function parseZoneMode(raw: string | null | undefined): ZoneMode {
  return raw === 'custom' ? 'custom' : 'auto';
}

export function customFloors(profile: Profile): ZoneFloors | null {
  return profile.zoneMode === 'custom' && isZoneFloors(profile.zoneFloors) ? profile.zoneFloors : null;
}

export function analyticsProfileOf(profile: Profile): AnalyticsProfile {
  const floors = customFloors(profile);
  return {
    maxHr: profile.maxHeartRate,
    birthYear: profile.birthYear,
    restingHr: profile.restingHeartRate ?? null,
    ...(floors === null ? {} : { zoneFloors: floors }),
  };
}

export function mergeProfile(before: Profile, patch: Partial<Profile>): Required<Profile> {
  const next: Required<Profile> = { ...emptyProfile(), ...before, ...patch };
  const born = birthDateParts(next.birthDate);
  if (born !== null) {
    if (patch.birthYear !== undefined && patch.birthDate === undefined && patch.birthYear !== born.year) next.birthDate = null;
    else next.birthYear = born.year;
  }
  return next;
}

export function analyticsChanged(a: Profile, b: Profile): boolean {
  const x = analyticsProfileOf(a);
  const y = analyticsProfileOf(b);
  return x.maxHr !== y.maxHr || x.birthYear !== y.birthYear || x.restingHr !== y.restingHr || serializeZoneFloors(x.zoneFloors) !== serializeZoneFloors(y.zoneFloors);
}

export type RestSource = 'profile' | 'measured' | 'fallback';
export type MaxSource = 'profile' | 'age' | 'fallback';

export interface ZoneReference {
  rest: number;
  max: number;
  restSource: RestSource;
  maxSource: MaxSource;
  measuredRest: number | null;
}

export function zoneReference(days: readonly DayRecord[], profile: Profile, nowS: number): ZoneReference {
  const year = new Date(nowS * 1000).getUTCFullYear();
  const measured = loadReference(days, { maxHr: null, birthYear: null, restingHr: null }, nowS, year);
  const hasMeasured = days.some((d) => d.start <= nowS && d.restingHr.value !== null);
  const own = profile.restingHeartRate ?? null;
  const rest = own !== null && own > 0 ? own : measured.rest;
  const maxSource: MaxSource = profile.maxHeartRate !== null ? 'profile' : profile.birthYear !== null ? 'age' : 'fallback';
  return {
    rest,
    max: effectiveMaxHr(analyticsProfileOf(profile), year),
    restSource: own !== null && own > 0 ? 'profile' : hasMeasured ? 'measured' : 'fallback',
    maxSource,
    measuredRest: hasMeasured ? measured.rest : null,
  };
}

export interface ZoneRange {
  zone: 1 | 2 | 3 | 4 | 5;
  low: number;
  high: number | null;
}

export function zoneRanges(floors: ZoneFloors, max: number): ZoneRange[] {
  const lows = floors.map((f) => Math.ceil(f - 1e-9));
  const top = Math.round(max);
  return ([1, 2, 3, 4, 5] as const).map((zone, i) => {
    const low = lows[i] ?? 0;
    const next = lows[i + 1];
    const high = next !== undefined ? next - 1 : top > low ? top : null;
    return { zone, low, high };
  });
}

export function autoFloors(reference: Pick<ZoneReference, 'rest' | 'max'>): ZoneFloors | null {
  if (!(reference.max > reference.rest)) return null;
  const floors = hrrZoneFloors(reference.rest, reference.max);
  return isZoneFloors(floors) ? floors : null;
}

export function roundedFloors(floors: ZoneFloors): ZoneFloors {
  const [a, b, c, d, e] = floors.map((f) => Math.ceil(f - 1e-9));
  return [a ?? 0, b ?? 0, c ?? 0, d ?? 0, e ?? 0];
}
