import { csvText } from '../export';
import type { SqlDriver, SqlValue } from '../store/types';

export interface DonationWindow {
  day: string;
  start: number;
  end: number;
}

export const DONATION_TABLE_FILES = [
  'official/cycles.csv',
  'official/sleeps.csv',
  'official/workouts.csv',
  'openhoop/days.csv',
  'openhoop/sleeps.csv',
  'openhoop/activities.csv',
] as const;
export type DonationTableFile = (typeof DONATION_TABLE_FILES)[number];

interface OverlapSpec {
  kind: 'overlap';
  table: string;
  columns: readonly string[];
  select: string;
  overlap: string;
  deviceScoped: boolean;
  extra?: string;
  order: string;
}

interface DaySpec {
  kind: 'day';
  table: string;
  columns: readonly string[];
  select: string;
  order: string;
}

const OPEN_CYCLE_S = 86_400;

const SPECS: Record<DonationTableFile, OverlapSpec | DaySpec> = {
  'official/cycles.csv': {
    kind: 'overlap',
    table: 'vendor_cycles',
    columns: ['start_t', 'end_t', 'tz_offset_s', 'day', 'recovery_pct', 'resting_hr', 'hrv_ms', 'skin_temp_c', 'spo2_pct', 'respiratory_rate', 'day_strain'],
    select: 'start_t, end_t, tz_offset_s, day, recovery_pct, resting_hr, hrv_ms, skin_temp_c, spo2_pct, respiratory_rate, day_strain',
    overlap: `(start_t < ? AND COALESCE(end_t, start_t + ${OPEN_CYCLE_S}) > ?)`,
    deviceScoped: false,
    order: 'start_t',
  },
  'official/sleeps.csv': {
    kind: 'overlap',
    table: 'vendor_sleeps',
    columns: [
      'onset', 'wake', 'tz_offset_s', 'day', 'nap', 'performance_pct', 'asleep_min', 'in_bed_min', 'light_min', 'deep_min',
      'rem_min', 'awake_min', 'efficiency_pct', 'consistency_pct', 'respiratory_rate',
    ],
    select:
      'onset, wake, tz_offset_s, day, nap, performance_pct, asleep_min, in_bed_min, light_min, deep_min, rem_min, awake_min, efficiency_pct, consistency_pct, respiratory_rate',
    overlap: '(onset < ? AND wake > ?)',
    deviceScoped: false,
    order: 'onset',
  },
  'official/workouts.csv': {
    kind: 'overlap',
    table: 'vendor_workouts',
    columns: ['start_t', 'end_t', 'tz_offset_s', 'day', 'activity', 'strain', 'avg_hr', 'max_hr'],
    select: 'start_t, end_t, tz_offset_s, day, activity, strain, avg_hr, max_hr',
    overlap: '(start_t < ? AND end_t > ?)',
    deviceScoped: false,
    order: 'start_t',
  },
  'openhoop/days.csv': {
    kind: 'day',
    table: 'daily_metrics',
    columns: ['day', 'readiness', 'load', 'sleep_score'],
    select: 'day, readiness, load, sleep_score',
    order: 'day',
  },
  'openhoop/sleeps.csv': {
    kind: 'day',
    table: 'sleeps',
    columns: ['day', 'onset', 'offset', 'asleep_s', 'in_bed_s', 'nap', 'source'],
    select: 'day, onset, offset, asleep_s, in_bed_s, nap, source',
    order: 'onset, id',
  },
  'openhoop/activities.csv': {
    kind: 'overlap',
    table: 'activities',
    columns: ['start', 'end', 'type', 'active_s', 'load', 'zone_seconds', 'avg_hr', 'max_hr', 'active_minutes'],
    select: 'start, "end", type, active_s, load, zone_seconds, avg_hr, max_hr, active_minutes',
    overlap: '(start < ? AND "end" > ?)',
    deviceScoped: true,
    extra: 'deleted_at IS NULL',
    order: 'start, id',
  },
};

async function rowsFor(
  driver: SqlDriver,
  spec: OverlapSpec | DaySpec,
  deviceId: number,
  windows: readonly DonationWindow[],
): Promise<Record<string, SqlValue>[]> {
  if (spec.kind === 'day') {
    const days = [...new Set(windows.map((w) => w.day))];
    return driver.all<Record<string, SqlValue>>(
      `SELECT ${spec.select} FROM ${spec.table} WHERE device_id = ? AND day IN (${days.map(() => '?').join(', ')}) ORDER BY ${spec.order}`,
      [deviceId, ...days],
    );
  }
  const conditions: string[] = [`(${windows.map(() => spec.overlap).join(' OR ')})`];
  const params: SqlValue[] = windows.flatMap((w) => [w.end, w.start]);
  if (spec.deviceScoped) {
    conditions.unshift('device_id = ?');
    params.unshift(deviceId);
  }
  if (spec.extra !== undefined) conditions.push(spec.extra);
  return driver.all<Record<string, SqlValue>>(
    `SELECT ${spec.select} FROM ${spec.table} WHERE ${conditions.join(' AND ')} ORDER BY ${spec.order}`,
    params,
  );
}

export async function donationTables(
  driver: SqlDriver,
  deviceId: number,
  windows: readonly DonationWindow[],
): Promise<Record<DonationTableFile, string>> {
  const out = {} as Record<DonationTableFile, string>;
  for (const file of DONATION_TABLE_FILES) {
    const spec = SPECS[file];
    const rows = windows.length === 0 ? [] : await rowsFor(driver, spec, deviceId, windows);
    out[file] = csvText(spec.columns, rows);
  }
  return out;
}
