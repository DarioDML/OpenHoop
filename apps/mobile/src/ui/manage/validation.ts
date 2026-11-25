export function parseInteger(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export function parseDecimal(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export const MIN_BIRTH_YEAR = 1900;
export const MIN_MAX_HR = 120;
export const MAX_MAX_HR = 230;
export const HEIGHT_RANGE = { min: 80, max: 250 } as const;
export const WEIGHT_RANGE = { min: 25, max: 300 } as const;

export function defaultMaxHr(birthYearText: string, currentYear: number): number | null {
  if (birthYearText.trim() === '') return null;
  const year = parseInteger(birthYearText);
  return Number.isNaN(year) ? null : Math.round(208 - 0.7 * (currentYear - year));
}

export type ProfileCheck = { ok: true; birthYear: number | null; maxHeartRate: number | null } | { ok: false };

export function checkProfile(birthYearText: string, maxHrText: string, currentYear: number): ProfileCheck {
  const year = birthYearText.trim() === '' ? null : parseInteger(birthYearText);
  const hr = maxHrText.trim() === '' ? null : parseInteger(maxHrText);
  const yearOk = year === null || (!Number.isNaN(year) && year >= MIN_BIRTH_YEAR && year <= currentYear);
  const hrOk = hr === null || (!Number.isNaN(hr) && hr >= MIN_MAX_HR && hr <= MAX_MAX_HR);
  if (!yearOk || !hrOk) return { ok: false };
  return { ok: true, birthYear: year, maxHeartRate: hr };
}

export type MeasureCheck = { ok: true; value: number | null } | { ok: false };

export function checkMeasure(text: string, range: { min: number; max: number }): MeasureCheck {
  if (text.trim() === '') return { ok: true, value: null };
  const value = parseDecimal(text);
  if (Number.isNaN(value) || value < range.min || value > range.max) return { ok: false };
  return { ok: true, value };
}
