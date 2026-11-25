export interface ZonedClock {
  date: string;
  minutes: number;
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(zone);
  if (cached !== undefined) return cached;
  let made: Intl.DateTimeFormat | null;
  try {
    made = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    made = null;
  }
  formatters.set(zone, made);
  return made;
}

export function isValidTimeZone(zone: string): boolean {
  return zone.length > 0 && zone.length <= 64 && formatterFor(zone) !== null;
}

function partsOf(zone: string, epochS: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
  const formatter = formatterFor(zone);
  if (formatter === null) return null;
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(epochS * 1000))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const { year, month, day, hour, minute, second } = values;
  if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined || second === undefined) return null;
  return { y: year, mo: month, d: day, h: hour % 24, mi: minute, s: second };
}

export function zoneOffsetS(zone: string, epochS: number): number | null {
  const parts = partsOf(zone, Math.floor(epochS));
  if (parts === null) return null;
  const asUtc = Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s) / 1000;
  return asUtc - Math.floor(epochS);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function isoDate(y: number, m: number, d: number): string {
  return `${y.toString().padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

export function zonedClock(zone: string, epochS: number): ZonedClock | null {
  const parts = partsOf(zone, Math.floor(epochS));
  if (parts === null) return null;
  return { date: isoDate(parts.y, parts.mo, parts.d), minutes: parts.h * 60 + parts.mi };
}

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days));
  return isoDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

const DAY_S = 86_400;

export function wallClockToEpoch(zone: string, date: string, minutes: number): number | null {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return null;
  const naive = Date.UTC(y, m - 1, d) / 1000 + Math.round(minutes) * 60;
  const before = zoneOffsetS(zone, naive - DAY_S);
  const after = zoneOffsetS(zone, naive + DAY_S);
  if (before === null || after === null) return null;
  const early = naive - before;
  const late = naive - after;
  const earlyValid = zoneOffsetS(zone, early) === before;
  const lateValid = zoneOffsetS(zone, late) === after;
  if (earlyValid && lateValid) return Math.min(early, late);
  if (earlyValid) return early;
  if (lateValid) return late;
  return early;
}

export const COMMON_TIME_ZONES: readonly string[] = [
  'Pacific/Pago_Pago',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/Mexico_City',
  'America/New_York',
  'America/Toronto',
  'America/Bogota',
  'America/Lima',
  'America/Halifax',
  'America/Caracas',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Atlantic/Azores',
  'Atlantic/Reykjavik',
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Brussels',
  'Europe/Amsterdam',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Casablanca',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Tehran',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Pacific/Guam',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Pacific/Apia',
  'Pacific/Tongatapu',
  'Pacific/Kiritimati',
];

export function deviceTimeZone(): string | null {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

export function zoneLabel(zone: string): string {
  const name = zone.split('/').slice(1).join(' / ') || zone;
  return name.replace(/_/g, ' ');
}

export function zoneTitle(zone: string): string {
  const label = zoneLabel(zone);
  return label === zone ? zone : `${label} · ${zone}`;
}
