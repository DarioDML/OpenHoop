import type { SqlDriver, SqlValue } from './store/types';

export interface BodyMeasurementInput {
  day: string;
  weightKg: number;
  bodyFatPct: number | null;
}

export interface BodyMeasurement extends BodyMeasurementInput {
  id: number;
  createdAt: number;
}

const COLUMNS = 'id, day, weight_kg, body_fat_pct, created_at';

function toMeasurement(row: Record<string, SqlValue>): BodyMeasurement {
  const { id, day, weight_kg: weightKg, body_fat_pct: bodyFatPct, created_at: createdAt } = row;
  if (typeof id !== 'number' || typeof day !== 'string' || typeof weightKg !== 'number' || typeof createdAt !== 'number') {
    throw new Error('Invalid body measurement row in database');
  }
  if (bodyFatPct !== null && typeof bodyFatPct !== 'number') throw new Error('Invalid body measurement row in database');
  return { id, day, weightKg, bodyFatPct, createdAt };
}

export async function listBodyMeasurements(driver: SqlDriver): Promise<BodyMeasurement[]> {
  const rows = await driver.all<Record<string, SqlValue>>(`SELECT ${COLUMNS} FROM body_measurements ORDER BY day, id`);
  return rows.map(toMeasurement);
}

export async function insertBodyMeasurement(driver: SqlDriver, input: BodyMeasurementInput, nowS: number): Promise<BodyMeasurement> {
  const result = await driver.run('INSERT INTO body_measurements (day, weight_kg, body_fat_pct, created_at) VALUES (?, ?, ?, ?)', [
    input.day,
    input.weightKg,
    input.bodyFatPct,
    nowS,
  ]);
  return { ...input, id: result.lastInsertRowid, createdAt: nowS };
}

export async function updateBodyMeasurement(driver: SqlDriver, id: number, input: BodyMeasurementInput): Promise<boolean> {
  const result = await driver.run('UPDATE body_measurements SET day = ?, weight_kg = ?, body_fat_pct = ? WHERE id = ?', [
    input.day,
    input.weightKg,
    input.bodyFatPct,
    id,
  ]);
  return result.changes > 0;
}

export async function deleteBodyMeasurement(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM body_measurements WHERE id = ?', [id]);
  return result.changes > 0;
}
