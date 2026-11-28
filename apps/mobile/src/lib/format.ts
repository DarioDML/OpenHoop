import type { Language } from '@/data/types';
import type { TFunction } from '@/i18n/useT';

export function formatNumber(value: number, decimals: number, language: Language): string {
  const rounded = value.toFixed(decimals);
  const fixed = Number(rounded) === 0 ? (0).toFixed(decimals) : rounded;
  return language === 'nl' ? fixed.replace('.', ',') : fixed;
}

export function formatSigned(value: number, decimals: number, language: Language): string {
  const text = formatNumber(Math.abs(value), decimals, language);
  if (Number(Math.abs(value).toFixed(decimals)) === 0) return text;
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

export function formatDuration(t: TFunction, seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return t('format.min', { m });
  if (m === 0) return t('format.h', { h });
  return t('format.hm', { h, m });
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatClock(epochS: number, tzOffsetS: number): string {
  const d = new Date((epochS + tzOffsetS) * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatAgo(t: TFunction, nowS: number, thenS: number): string {
  const diff = Math.max(0, nowS - thenS);
  if (diff < 60) return t('time.justNow');
  if (diff < 3600) return t('time.minAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('time.hourAgo', { n: Math.floor(diff / 3600) });
  return t('time.dayAgo', { n: Math.floor(diff / 86400) });
}

export function formatShortDay(day: string, language: Language): string {
  const [, month, date] = day.split('-');
  if (!month || !date) return day;
  return language === 'nl' ? `${Number(date)}/${Number(month)}` : `${Number(month)}/${Number(date)}`;
}

export function isValidIsoDate(text: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  const exists = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return exists && text <= todayIso(now) && y >= 2015;
}

export function todayIso(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
