import type { SqlDriver, SqlValue } from './store/types';

export const VENDOR_SOURCE = 'vendor-export';
export type VendorSource = typeof VENDOR_SOURCE;

export interface VendorCycle {
  startT: number;
  endT: number | null;
  tzOffsetS: number;
  day: string;
  recoveryPct: number | null;
  restingHr: number | null;
  hrvMs: number | null;
  skinTempC: number | null;
  spo2Pct: number | null;
  respiratoryRate: number | null;
  dayStrain: number | null;
}

export interface VendorSleep {
  onset: number;
  wake: number;
  tzOffsetS: number;
  day: string;
  nap: boolean;
  performancePct: number | null;
  asleepMin: number | null;
  inBedMin: number | null;
  lightMin: number | null;
  deepMin: number | null;
  remMin: number | null;
  awakeMin: number | null;
  efficiencyPct: number | null;
  consistencyPct: number | null;
  respiratoryRate: number | null;
}

export interface VendorWorkout {
  startT: number;
  endT: number;
  tzOffsetS: number;
  day: string;
  activity: string | null;
  strain: number | null;
  avgHr: number | null;
  maxHr: number | null;
}

export interface VendorJournalEntry {
  cycleStart: number;
  tzOffsetS: number;
  day: string;
  question: string;
  answeredYes: boolean;
  notes: string | null;
}

export interface VendorData {
  cycles: VendorCycle[];
  sleeps: VendorSleep[];
  workouts: VendorWorkout[];
  journal: VendorJournalEntry[];
}

export type VendorKind = keyof VendorData;

export const VENDOR_KINDS: readonly VendorKind[] = ['cycles', 'sleeps', 'workouts', 'journal'];

export interface VendorWriteCounts {
  imported: number;
  skipped: number;
}

export type VendorWriteResult = Record<VendorKind, VendorWriteCounts>;

type Row = Record<string, SqlValue>;

interface TableSpec<T> {
  table: string;
  keyColumns: readonly string[];
  valueColumns: readonly string[];
  order: string;
  keyOf(item: T): string;
  params(item: T): SqlValue[];
  fromRow(row: Row): T;
}

function invalid(table: string): Error {
  return new Error(`Invalid ${table} row in database`);
}

function int(row: Row, key: string, table: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(table);
  return value;
}

function intOrNull(row: Row, key: string, table: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(table);
  return value;
}

function text(row: Row, key: string, table: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw invalid(table);
  return value;
}

function textOrNull(row: Row, key: string, table: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw invalid(table);
  return value;
}

const CYCLES: TableSpec<VendorCycle> = {
  table: 'vendor_cycles',
  keyColumns: ['start_t'],
  valueColumns: ['end_t', 'tz_offset_s', 'day', 'recovery_pct', 'resting_hr', 'hrv_ms', 'skin_temp_c', 'spo2_pct', 'respiratory_rate', 'day_strain'],
  order: 'start_t',
  keyOf: (c) => String(c.startT),
  params: (c) => [c.startT, c.endT, c.tzOffsetS, c.day, c.recoveryPct, c.restingHr, c.hrvMs, c.skinTempC, c.spo2Pct, c.respiratoryRate, c.dayStrain],
  fromRow: (r) => ({
    startT: int(r, 'start_t', 'vendor_cycles'),
    endT: intOrNull(r, 'end_t', 'vendor_cycles'),
    tzOffsetS: int(r, 'tz_offset_s', 'vendor_cycles'),
    day: text(r, 'day', 'vendor_cycles'),
    recoveryPct: intOrNull(r, 'recovery_pct', 'vendor_cycles'),
    restingHr: intOrNull(r, 'resting_hr', 'vendor_cycles'),
    hrvMs: intOrNull(r, 'hrv_ms', 'vendor_cycles'),
    skinTempC: intOrNull(r, 'skin_temp_c', 'vendor_cycles'),
    spo2Pct: intOrNull(r, 'spo2_pct', 'vendor_cycles'),
    respiratoryRate: intOrNull(r, 'respiratory_rate', 'vendor_cycles'),
    dayStrain: intOrNull(r, 'day_strain', 'vendor_cycles'),
  }),
};

const SLEEPS: TableSpec<VendorSleep> = {
  table: 'vendor_sleeps',
  keyColumns: ['onset'],
  valueColumns: [
    'wake',
    'tz_offset_s',
    'day',
    'nap',
    'performance_pct',
    'asleep_min',
    'in_bed_min',
    'light_min',
    'deep_min',
    'rem_min',
    'awake_min',
    'efficiency_pct',
    'consistency_pct',
    'respiratory_rate',
  ],
  order: 'onset',
  keyOf: (s) => String(s.onset),
  params: (s) => [
    s.onset,
    s.wake,
    s.tzOffsetS,
    s.day,
    s.nap ? 1 : 0,
    s.performancePct,
    s.asleepMin,
    s.inBedMin,
    s.lightMin,
    s.deepMin,
    s.remMin,
    s.awakeMin,
    s.efficiencyPct,
    s.consistencyPct,
    s.respiratoryRate,
  ],
  fromRow: (r) => ({
    onset: int(r, 'onset', 'vendor_sleeps'),
    wake: int(r, 'wake', 'vendor_sleeps'),
    tzOffsetS: int(r, 'tz_offset_s', 'vendor_sleeps'),
    day: text(r, 'day', 'vendor_sleeps'),
    nap: int(r, 'nap', 'vendor_sleeps') === 1,
    performancePct: intOrNull(r, 'performance_pct', 'vendor_sleeps'),
    asleepMin: intOrNull(r, 'asleep_min', 'vendor_sleeps'),
    inBedMin: intOrNull(r, 'in_bed_min', 'vendor_sleeps'),
    lightMin: intOrNull(r, 'light_min', 'vendor_sleeps'),
    deepMin: intOrNull(r, 'deep_min', 'vendor_sleeps'),
    remMin: intOrNull(r, 'rem_min', 'vendor_sleeps'),
    awakeMin: intOrNull(r, 'awake_min', 'vendor_sleeps'),
    efficiencyPct: intOrNull(r, 'efficiency_pct', 'vendor_sleeps'),
    consistencyPct: intOrNull(r, 'consistency_pct', 'vendor_sleeps'),
    respiratoryRate: intOrNull(r, 'respiratory_rate', 'vendor_sleeps'),
  }),
};

const WORKOUTS: TableSpec<VendorWorkout> = {
  table: 'vendor_workouts',
  keyColumns: ['start_t'],
  valueColumns: ['end_t', 'tz_offset_s', 'day', 'activity', 'strain', 'avg_hr', 'max_hr'],
  order: 'start_t',
  keyOf: (w) => String(w.startT),
  params: (w) => [w.startT, w.endT, w.tzOffsetS, w.day, w.activity, w.strain, w.avgHr, w.maxHr],
  fromRow: (r) => ({
    startT: int(r, 'start_t', 'vendor_workouts'),
    endT: int(r, 'end_t', 'vendor_workouts'),
    tzOffsetS: int(r, 'tz_offset_s', 'vendor_workouts'),
    day: text(r, 'day', 'vendor_workouts'),
    activity: textOrNull(r, 'activity', 'vendor_workouts'),
    strain: intOrNull(r, 'strain', 'vendor_workouts'),
    avgHr: intOrNull(r, 'avg_hr', 'vendor_workouts'),
    maxHr: intOrNull(r, 'max_hr', 'vendor_workouts'),
  }),
};

const JOURNAL: TableSpec<VendorJournalEntry> = {
  table: 'vendor_journal',
  keyColumns: ['cycle_start', 'question'],
  valueColumns: ['tz_offset_s', 'day', 'answered_yes', 'notes'],
  order: 'cycle_start, question',
  keyOf: (j) => `${j.cycleStart}\u0000${j.question}`,
  params: (j) => [j.cycleStart, j.question, j.tzOffsetS, j.day, j.answeredYes ? 1 : 0, j.notes],
  fromRow: (r) => ({
    cycleStart: int(r, 'cycle_start', 'vendor_journal'),
    question: text(r, 'question', 'vendor_journal'),
    tzOffsetS: int(r, 'tz_offset_s', 'vendor_journal'),
    day: text(r, 'day', 'vendor_journal'),
    answeredYes: int(r, 'answered_yes', 'vendor_journal') === 1,
    notes: textOrNull(r, 'notes', 'vendor_journal'),
  }),
};

function columnsOf(spec: { keyColumns: readonly string[]; valueColumns: readonly string[] }): string[] {
  return [...spec.keyColumns, ...spec.valueColumns];
}

async function readAll<T>(driver: SqlDriver, spec: TableSpec<T>): Promise<T[]> {
  const rows = await driver.all<Row>(`SELECT ${columnsOf(spec).join(', ')} FROM ${spec.table} ORDER BY ${spec.order}`);
  return rows.map(spec.fromRow);
}

async function writeAll<T>(driver: SqlDriver, spec: TableSpec<T>, items: readonly T[], nowS: number): Promise<VendorWriteCounts> {
  const existing = new Map<string, string>();
  for (const row of await readAll(driver, spec)) existing.set(spec.keyOf(row), JSON.stringify(spec.params(row)));
  const columns = [...columnsOf(spec), 'source', 'imported_at'];
  const updates = [...spec.valueColumns, 'imported_at'].map((c) => `${c} = excluded.${c}`).join(', ');
  const sql =
    `INSERT INTO ${spec.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ` +
    `ON CONFLICT (${spec.keyColumns.join(', ')}) DO UPDATE SET ${updates}`;
  const counts: VendorWriteCounts = { imported: 0, skipped: 0 };
  for (const item of items) {
    const params = spec.params(item);
    const key = spec.keyOf(item);
    if (existing.get(key) === JSON.stringify(params)) {
      counts.skipped += 1;
      continue;
    }
    await driver.run(sql, [...params, VENDOR_SOURCE, nowS]);
    existing.set(key, JSON.stringify(params));
    counts.imported += 1;
  }
  return counts;
}

export async function listVendorData(driver: SqlDriver): Promise<VendorData> {
  return {
    cycles: await readAll(driver, CYCLES),
    sleeps: await readAll(driver, SLEEPS),
    workouts: await readAll(driver, WORKOUTS),
    journal: await readAll(driver, JOURNAL),
  };
}

export function emptyVendorData(): VendorData {
  return { cycles: [], sleeps: [], workouts: [], journal: [] };
}

export async function upsertVendorData(driver: SqlDriver, data: VendorData, nowS: number): Promise<VendorWriteResult> {
  return driver.transaction(async (tx) => ({
    cycles: await writeAll(tx, CYCLES, data.cycles, nowS),
    sleeps: await writeAll(tx, SLEEPS, data.sleeps, nowS),
    workouts: await writeAll(tx, WORKOUTS, data.workouts, nowS),
    journal: await writeAll(tx, JOURNAL, data.journal, nowS),
  }));
}

export async function clearVendorData(driver: SqlDriver): Promise<number> {
  return driver.transaction(async (tx) => {
    let removed = 0;
    for (const table of [CYCLES.table, SLEEPS.table, WORKOUTS.table, JOURNAL.table]) {
      removed += (await tx.run(`DELETE FROM ${table}`)).changes;
    }
    return removed;
  });
}
