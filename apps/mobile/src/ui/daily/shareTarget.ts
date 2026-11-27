import type { ActivityRow, DayRecord } from '@openhoop/core';
import type { Href } from 'expo-router';

import { dayEntries } from '@/data/activities';

export function latestShareHref(days: readonly DayRecord[], activities: readonly ActivityRow[]): Href | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day === undefined) continue;
    const entry = dayEntries(days, day, activities).at(-1);
    if (entry === undefined) continue;
    if (entry.id !== null) return { pathname: '/activity/share', params: { id: String(entry.id) } };
    const index = day.workouts.findIndex((workout) => workout.start === entry.detectedStart);
    if (index >= 0) return { pathname: '/activity/share', params: { day: day.day, index: String(index) } };
  }
  return null;
}
