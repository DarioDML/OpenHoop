import { useAppData } from '@/data/context';
import type { Language, Units } from '@/data/types';

import { formatNumber, formatSigned } from './format';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const M_PER_MI = 1609.344;

export interface Measure {
  value: string;
  unit: string;
}

export function weightIn(kg: number, units: Units): number {
  return units === 'imperial' ? kg / KG_PER_LB : kg;
}

export function weightToKg(value: number, units: Units): number {
  return units === 'imperial' ? value * KG_PER_LB : value;
}

export function weightUnit(units: Units): string {
  return units === 'imperial' ? 'lb' : 'kg';
}

export function formatWeight(kg: number, units: Units, language: Language, decimals = 1): Measure {
  return { value: formatNumber(weightIn(kg, units), decimals, language), unit: weightUnit(units) };
}

export function heightToCm(value: number, units: Units): number {
  return units === 'imperial' ? value * CM_PER_IN : value;
}

export function heightIn(cm: number, units: Units): number {
  return units === 'imperial' ? cm / CM_PER_IN : cm;
}

export function heightUnit(units: Units): string {
  return units === 'imperial' ? 'in' : 'cm';
}

export function formatHeight(cm: number, units: Units, language: Language): Measure {
  if (units === 'metric') return { value: formatNumber(cm, 0, language), unit: 'cm' };
  const totalInches = Math.round(cm / CM_PER_IN);
  const feet = Math.floor(totalInches / 12);
  return { value: `${feet}′ ${totalInches % 12}″`, unit: '' };
}

export function distanceIn(meters: number, units: Units): number {
  return units === 'imperial' ? meters / M_PER_MI : meters / 1000;
}

export function distanceUnit(units: Units): string {
  return units === 'imperial' ? 'mi' : 'km';
}

export function formatDistance(meters: number, units: Units, language: Language, decimals = 2): Measure {
  return { value: formatNumber(distanceIn(meters, units), decimals, language), unit: distanceUnit(units) };
}

export function formatPace(secondsPerKm: number, units: Units): Measure {
  const perUnit = units === 'imperial' ? secondsPerKm * (M_PER_MI / 1000) : secondsPerKm;
  const rounded = Math.round(perUnit);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return { value: `${minutes}:${seconds.toString().padStart(2, '0')}`, unit: units === 'imperial' ? '/mi' : '/km' };
}

export function temperatureUnit(units: Units): string {
  return units === 'imperial' ? '°F' : '°C';
}

export function formatTemperature(celsius: number, units: Units, language: Language, decimals = 1): Measure {
  const value = units === 'imperial' ? (celsius * 9) / 5 + 32 : celsius;
  return { value: formatNumber(value, decimals, language), unit: temperatureUnit(units) };
}

export function formatTemperatureDelta(deltaCelsius: number, units: Units, language: Language, decimals = 1): Measure {
  const value = units === 'imperial' ? (deltaCelsius * 9) / 5 : deltaCelsius;
  return { value: formatSigned(value, decimals, language), unit: units === 'imperial' ? '°F' : '°C' };
}

export function useUnits(): Units {
  return useAppData().settings.units;
}
