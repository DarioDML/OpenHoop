import type { SqlDriver, SqlValue } from './store/types';

export const CUFF_LIMITS = {
  systolic: { min: 60, max: 260 },
  diastolic: { min: 30, max: 160 },
  pulse: { min: 30, max: 220 },
} as const;

export interface CuffReadingInput {
  t: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
}

export interface CuffReading extends CuffReadingInput {
  id: number;
  createdAt: number;
}

const COLUMNS = 'id, t, systolic, diastolic, pulse, created_at';
const INVALID = 'Invalid cuff reading row in database';

function toReading(row: Record<string, SqlValue>): CuffReading {
  const { id, t, systolic, diastolic, pulse, created_at: createdAt } = row;
  if (typeof id !== 'number' || typeof t !== 'number' || typeof systolic !== 'number' || typeof diastolic !== 'number' || typeof createdAt !== 'number') {
    throw new Error(INVALID);
  }
  if (pulse !== null && typeof pulse !== 'number') throw new Error(INVALID);
  return { id, t, systolic, diastolic, pulse, createdAt };
}

export async function listCuffReadings(driver: SqlDriver): Promise<CuffReading[]> {
  const rows = await driver.all<Record<string, SqlValue>>(`SELECT ${COLUMNS} FROM cuff_readings ORDER BY t DESC, id DESC`);
  return rows.map(toReading);
}

export async function insertCuffReading(driver: SqlDriver, input: CuffReadingInput, nowS: number): Promise<CuffReading> {
  const result = await driver.run('INSERT INTO cuff_readings (t, systolic, diastolic, pulse, created_at) VALUES (?, ?, ?, ?, ?)', [
    input.t,
    input.systolic,
    input.diastolic,
    input.pulse,
    nowS,
  ]);
  return { ...input, id: result.lastInsertRowid, createdAt: nowS };
}

export async function deleteCuffReading(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM cuff_readings WHERE id = ?', [id]);
  return result.changes > 0;
}
