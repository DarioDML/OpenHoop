const DAY_S = 86_400;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function deviceTzOffsetS(now: Date): number {
  return -now.getTimezoneOffset() * 60;
}

export function parseIsoDate(text: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function ownerSinceToUnix(iso: string, tzOffsetS: number): number | null {
  const parts = parseIsoDate(iso);
  if (!parts) return null;
  return Math.floor(Date.UTC(parts.y, parts.m - 1, parts.d) / 1000) - tzOffsetS;
}

export function unixToIsoDate(unixS: number, tzOffsetS: number): string {
  const date = new Date((unixS + tzOffsetS) * 1000);
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isoDaysAgo(nowS: number, days: number, tzOffsetS: number): string {
  return unixToIsoDate(nowS - days * DAY_S, tzOffsetS);
}
