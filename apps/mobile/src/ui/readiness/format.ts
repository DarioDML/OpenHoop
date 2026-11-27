import { formatWeekday } from '@/data/activityDerived';
import type { Language } from '@/data/types';

export function weekdayShort(day: string, language: Language): string {
  const name = formatWeekday(day, language, 'short').replace('.', '').slice(0, 2);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function monthShort(day: string, language: Language): string {
  const [y, m] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  return date.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', timeZone: 'UTC' }).replace('.', '');
}
