import type { BodyMeasurement, BodyMeasurementInput } from '@openhoop/core';

import { parseIsoDate } from '@/lib/dates';
import { weightToKg } from '@/lib/units';

import type { Units } from './types';

export const BODY_LIMITS = {
  weightKg: { min: 25, max: 300 },
  bodyFatPct: { min: 2, max: 70 },
} as const;

export const BODY_RANGES = [30, 90, 180, 365] as const;
export type BodyRange = (typeof BODY_RANGES)[number];

export function parseBodyRange(value: string): BodyRange {
  return BODY_RANGES.find((range) => `${range}` === value) ?? 90;
}

export type BodyField = 'day' | 'weight' | 'bodyFat';

export interface BodyDraft {
  day: string;
  weight: string;
  bodyFat: string;
}

export type BodyValidation = { ok: true; value: BodyMeasurementInput } | { ok: false; invalid: BodyField[] };

const MIN_YEAR = 2015;
const DECIMAL = /^\d{1,3}([.,]\d{1,2})?$/;

function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  return DECIMAL.test(trimmed) ? Number(trimmed.replace(',', '.')) : null;
}

function within(value: number, limits: { readonly min: number; readonly max: number }): boolean {
  return value >= limits.min && value <= limits.max;
}

function validDay(day: string, today: string): boolean {
  const parts = parseIsoDate(day);
  return parts !== null && parts.y >= MIN_YEAR && day <= today;
}

export function validateBodyDraft(draft: BodyDraft, today: string): BodyValidation {
  const invalid: BodyField[] = [];
  const day = draft.day.trim();
  if (!validDay(day, today)) invalid.push('day');
  const weightKg = parseDecimal(draft.weight);
  if (weightKg === null || !within(weightKg, BODY_LIMITS.weightKg)) invalid.push('weight');
  let bodyFatPct: number | null = null;
  if (draft.bodyFat.trim() !== '') {
    bodyFatPct = parseDecimal(draft.bodyFat);
    if (bodyFatPct === null || !within(bodyFatPct, BODY_LIMITS.bodyFatPct)) invalid.push('bodyFat');
  }
  if (invalid.length > 0 || weightKg === null) return { ok: false, invalid };
  return { ok: true, value: { day, weightKg, bodyFatPct } };
}

export function shiftIsoDay(day: string, deltaDays: number): string {
  const parts = parseIsoDate(day);
  if (parts === null) return day;
  const shifted = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + deltaDays));
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${shifted.getUTCFullYear().toString().padStart(4, '0')}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function compare(a: BodyMeasurement, b: BodyMeasurement): number {
  if (a.day === b.day) return a.id - b.id;
  return a.day < b.day ? -1 : 1;
}

export function sortMeasurements(entries: readonly BodyMeasurement[]): BodyMeasurement[] {
  return [...entries].sort(compare);
}

export function newestMeasurement(entries: readonly BodyMeasurement[]): BodyMeasurement | null {
  let newest: BodyMeasurement | null = null;
  for (const entry of entries) if (newest === null || compare(entry, newest) > 0) newest = entry;
  return newest;
}

export function newestChanged(before: readonly BodyMeasurement[], after: readonly BodyMeasurement[]): BodyMeasurement | null {
  const next = newestMeasurement(after);
  const previous = newestMeasurement(before);
  if (next === null) return null;
  if (previous !== null && previous.id === next.id && previous.day === next.day && previous.weightKg === next.weightKg) return null;
  return next;
}

export interface BodyPoint {
  day: string;
  weightKg: number;
  bodyFatPct: number | null;
}

export interface LeanMass {
  kg: number;
  day: string;
  fromNewest: boolean;
}

export interface BodyTrend {
  range: BodyRange;
  points: BodyPoint[];
  latest: BodyMeasurement | null;
  changeKg: number | null;
  changeBodyFatPct: number | null;
  changeLeanKg: number | null;
  firstDay: string | null;
  lastDay: string | null;
  leanMass: LeanMass | null;
}

function latestPerDay(entries: readonly BodyMeasurement[]): BodyPoint[] {
  const byDay = new Map<string, BodyMeasurement>();
  for (const entry of sortMeasurements(entries)) byDay.set(entry.day, entry);
  return [...byDay.values()].map((entry) => ({ day: entry.day, weightKg: entry.weightKg, bodyFatPct: entry.bodyFatPct }));
}

export function leanMassKg(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100);
}

export function computeTrend(entries: readonly BodyMeasurement[], range: BodyRange, today: string): BodyTrend {
  const from = shiftIsoDay(today, -range);
  const points = latestPerDay(entries.filter((entry) => entry.day >= from && entry.day <= today));
  const latest = newestMeasurement(entries);
  const first = points[0];
  const last = points[points.length - 1];
  const withFat = points.filter((point): point is BodyPoint & { bodyFatPct: number } => point.bodyFatPct !== null);
  const firstFat = withFat[0];
  const lastFat = withFat[withFat.length - 1];
  const newestWithFat = sortMeasurements(entries)
    .reverse()
    .find((entry) => entry.bodyFatPct !== null);
  return {
    range,
    points,
    latest,
    changeKg: first !== undefined && last !== undefined && points.length >= 2 ? last.weightKg - first.weightKg : null,
    changeBodyFatPct: firstFat !== undefined && lastFat !== undefined && withFat.length >= 2 ? lastFat.bodyFatPct - firstFat.bodyFatPct : null,
    changeLeanKg:
      firstFat !== undefined && lastFat !== undefined && withFat.length >= 2
        ? leanMassKg(lastFat.weightKg, lastFat.bodyFatPct) - leanMassKg(firstFat.weightKg, firstFat.bodyFatPct)
        : null,
    firstDay: first?.day ?? null,
    lastDay: last?.day ?? null,
    leanMass:
      newestWithFat !== undefined && newestWithFat.bodyFatPct !== null
        ? { kg: leanMassKg(newestWithFat.weightKg, newestWithFat.bodyFatPct), day: newestWithFat.day, fromNewest: newestWithFat.id === latest?.id }
        : null,
  };
}

export function towardGoal(firstKg: number, lastKg: number, goalKg: number | null): boolean | null {
  if (goalKg === null || firstKg === lastKg) return null;
  return Math.abs(lastKg - goalKg) < Math.abs(firstKg - goalKg);
}

export function weightDraftToKg(text: string, units: Units): string {
  const trimmed = text.trim();
  if (units === 'metric' || trimmed === '') return text;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && /^\d{1,3}([.,]\d{1,2})?$/.test(trimmed) ? (Math.round(weightToKg(value, units) * 100) / 100).toString() : text;
}
