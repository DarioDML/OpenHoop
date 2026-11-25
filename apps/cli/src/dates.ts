import { UsageError } from './args';

const DAY_S = 86_400;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function utcMidnight(text: string, label: string): number {
  const match = DATE_ONLY.exec(text);
  if (match === null) throw new UsageError(`${label} must look like 2027-01-31, got "${text}"`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new UsageError(`${label} is not a real calendar date: "${text}"`);
  }
  return ms / 1000;
}

export function localDateToUnix(text: string, tzOffsetS: number, label: string): number {
  return utcMidnight(text, label) - tzOffsetS;
}

export function localDateEndToUnix(text: string, tzOffsetS: number, label: string): number {
  return localDateToUnix(text, tzOffsetS, label) + DAY_S;
}

export function parseOwnerSince(text: string, tzOffsetS: number, nowS: number): number {
  let unixS: number;
  if (DATE_ONLY.test(text)) {
    unixS = localDateToUnix(text, tzOffsetS, '--owner-since');
  } else if (WITH_ZONE.test(text)) {
    const ms = Date.parse(text);
    if (Number.isNaN(ms)) throw new UsageError(`--owner-since is not a real date and time: "${text}"`);
    unixS = Math.floor(ms / 1000);
  } else {
    throw new UsageError(`--owner-since must look like 2027-01-31 or 2027-01-31T08:00:00Z, got "${text}"`);
  }
  if (unixS > nowS + DAY_S) throw new UsageError('--owner-since is in the future');
  if (unixS < Date.UTC(2015, 0, 1) / 1000) throw new UsageError('--owner-since is before 2015, which cannot be right');
  return unixS;
}
