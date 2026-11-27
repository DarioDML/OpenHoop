import { unixToIsoDate } from '@/lib/dates';

import { addDays, weekStart } from './derived';

export const CHARGE_WINDOW_DAYS = 30;
const DAY_S = 86_400;

export interface WeekCharges {
  week: string;
  isoWeek: number;
  count: number;
}

export function isoWeekNumber(day: string): number {
  const thursday = addDays(weekStart(day), 3);
  const [year] = thursday.split('-');
  const firstThursdayWeek = weekStart(`${year}-01-04`);
  const diff = (Date.parse(`${weekStart(thursday)}T00:00:00Z`) - Date.parse(`${firstThursdayWeek}T00:00:00Z`)) / (7 * DAY_S * 1000);
  return Math.round(diff) + 1;
}

export function weeklyCharges(starts: readonly number[], nowS: number, tzOffsetS: number, windowDays: number = CHARGE_WINDOW_DAYS): WeekCharges[] {
  const today = unixToIsoDate(nowS, tzOffsetS);
  const first = weekStart(addDays(today, -(windowDays - 1)));
  const last = weekStart(today);
  const weeks: WeekCharges[] = [];
  for (let week = first; week <= last; week = addDays(week, 7)) weeks.push({ week, isoWeek: isoWeekNumber(week), count: 0 });
  const since = nowS - windowDays * DAY_S;
  for (const t of starts) {
    if (t < since || t > nowS) continue;
    const week = weekStart(unixToIsoDate(t, tzOffsetS));
    const slot = weeks.find((item) => item.week === week);
    if (slot !== undefined) slot.count += 1;
  }
  return weeks;
}
