import type { DayRecord } from '@openhoop/core';
import { useLocalSearchParams, type Href } from 'expo-router';

import { indexOfDay, isDayString, singleParam } from '@/data/dailyDerived';

export function dayIndexFor(days: readonly DayRecord[], requested: string | null): number {
  if (requested === null) return days.length - 1;
  return isDayString(requested) ? indexOfDay(days, requested) : -1;
}

export function useDayIndex(days: readonly DayRecord[]): number {
  const params = useLocalSearchParams<{ day?: string | string[] }>();
  return dayIndexFor(days, singleParam(params.day));
}

export function pastDayOf(days: readonly DayRecord[], index: number): string | null {
  if (index === days.length - 1) return null;
  return days[index]?.day ?? null;
}

export function withDay(path: string, pastDay: string | null): Href {
  if (pastDay === null) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}day=${encodeURIComponent(pastDay)}`;
}
