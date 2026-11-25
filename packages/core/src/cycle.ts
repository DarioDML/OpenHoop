import type { SqlDriver, SqlValue } from './store/types';

export const SYMPTOMS = ['cramps', 'headache', 'bloating', 'mood', 'fatigue', 'breastTenderness', 'nausea', 'backPain'] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const FLOW_LEVELS = [1, 2, 3] as const;
export type FlowLevel = (typeof FLOW_LEVELS)[number];

export const INTENSITY_LEVELS = [1, 2, 3] as const;
export type Intensity = (typeof INTENSITY_LEVELS)[number];

export function isSymptom(value: unknown): value is Symptom {
  return typeof value === 'string' && (SYMPTOMS as readonly string[]).includes(value);
}

export function isFlowLevel(value: unknown): value is FlowLevel {
  return typeof value === 'number' && (FLOW_LEVELS as readonly number[]).includes(value);
}

export function isIntensity(value: unknown): value is Intensity {
  return typeof value === 'number' && (INTENSITY_LEVELS as readonly number[]).includes(value);
}

export interface PeriodInput {
  startDay: string;
  endDay: string | null;
  flow: FlowLevel;
}

export interface PeriodEntry extends PeriodInput {
  id: number;
  createdAt: number;
}

export interface SymptomInput {
  day: string;
  symptom: Symptom;
  intensity: Intensity;
}

export interface SymptomEntry extends SymptomInput {
  id: number;
  createdAt: number;
}

export interface PregnancyEntry {
  dueDay: string;
  createdAt: number;
}

export interface CycleData {
  periods: PeriodEntry[];
  symptoms: SymptomEntry[];
  pregnancy: PregnancyEntry | null;
}

export function emptyCycleData(): CycleData {
  return { periods: [], symptoms: [], pregnancy: null };
}

const INVALID = 'Invalid cycle row in database';

function toPeriod(row: Record<string, SqlValue>): PeriodEntry {
  const { id, start_day: startDay, end_day: endDay, flow, created_at: createdAt } = row;
  if (typeof id !== 'number' || typeof startDay !== 'string' || typeof createdAt !== 'number' || !isFlowLevel(flow)) throw new Error(INVALID);
  if (endDay !== null && typeof endDay !== 'string') throw new Error(INVALID);
  return { id, startDay, endDay, flow, createdAt };
}

function toSymptom(row: Record<string, SqlValue>): SymptomEntry {
  const { id, day, symptom, intensity, created_at: createdAt } = row;
  if (typeof id !== 'number' || typeof day !== 'string' || typeof createdAt !== 'number' || !isSymptom(symptom) || !isIntensity(intensity)) {
    throw new Error(INVALID);
  }
  return { id, day, symptom, intensity, createdAt };
}

function toPregnancy(row: Record<string, SqlValue>): PregnancyEntry {
  const { due_day: dueDay, created_at: createdAt } = row;
  if (typeof dueDay !== 'string' || typeof createdAt !== 'number') throw new Error(INVALID);
  return { dueDay, createdAt };
}

export async function listPeriods(driver: SqlDriver): Promise<PeriodEntry[]> {
  const rows = await driver.all<Record<string, SqlValue>>('SELECT id, start_day, end_day, flow, created_at FROM cycle_periods ORDER BY start_day, id');
  return rows.map(toPeriod);
}

export async function insertPeriod(driver: SqlDriver, input: PeriodInput, nowS: number): Promise<PeriodEntry> {
  const result = await driver.run('INSERT INTO cycle_periods (start_day, end_day, flow, created_at) VALUES (?, ?, ?, ?)', [
    input.startDay,
    input.endDay,
    input.flow,
    nowS,
  ]);
  return { ...input, id: result.lastInsertRowid, createdAt: nowS };
}

export async function updatePeriod(driver: SqlDriver, id: number, input: PeriodInput): Promise<boolean> {
  const result = await driver.run('UPDATE cycle_periods SET start_day = ?, end_day = ?, flow = ? WHERE id = ?', [
    input.startDay,
    input.endDay,
    input.flow,
    id,
  ]);
  return result.changes > 0;
}

export async function deletePeriod(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM cycle_periods WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function listSymptoms(driver: SqlDriver): Promise<SymptomEntry[]> {
  const rows = await driver.all<Record<string, SqlValue>>('SELECT id, day, symptom, intensity, created_at FROM symptom_logs ORDER BY day, id');
  return rows.map(toSymptom);
}

export async function upsertSymptom(driver: SqlDriver, input: SymptomInput, nowS: number): Promise<void> {
  await driver.run(
    'INSERT INTO symptom_logs (day, symptom, intensity, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (day, symptom) DO UPDATE SET intensity = excluded.intensity',
    [input.day, input.symptom, input.intensity, nowS],
  );
}

export async function deleteSymptom(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM symptom_logs WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function getPregnancy(driver: SqlDriver): Promise<PregnancyEntry | null> {
  const rows = await driver.all<Record<string, SqlValue>>('SELECT due_day, created_at FROM pregnancy WHERE id = 1');
  const row = rows[0];
  return row === undefined ? null : toPregnancy(row);
}

export async function setPregnancy(driver: SqlDriver, dueDay: string, nowS: number): Promise<void> {
  await driver.run(
    'INSERT INTO pregnancy (id, due_day, created_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET due_day = excluded.due_day',
    [dueDay, nowS],
  );
}

export async function clearPregnancy(driver: SqlDriver): Promise<boolean> {
  const result = await driver.run('DELETE FROM pregnancy');
  return result.changes > 0;
}

export async function loadCycleData(driver: SqlDriver): Promise<CycleData> {
  return { periods: await listPeriods(driver), symptoms: await listSymptoms(driver), pregnancy: await getPregnancy(driver) };
}

export async function deleteAllCycleData(driver: SqlDriver): Promise<void> {
  await driver.transaction(async (tx) => {
    await tx.run('DELETE FROM cycle_periods');
    await tx.run('DELETE FROM symptom_logs');
    await tx.run('DELETE FROM pregnancy');
  });
}
