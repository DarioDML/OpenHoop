import type { SqlDriver, SqlValue } from './store/types';

export interface LabResultInput {
  biomarker: string;
  unit: string;
  value: number;
  day: string;
  refLow: number | null;
  refHigh: number | null;
  note: string | null;
}

export interface LabResult extends LabResultInput {
  id: number;
  createdAt: number;
}

const COLUMNS = 'id, biomarker, unit, value, day, ref_low, ref_high, note, created_at';

function nullableNumber(value: SqlValue | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number') throw new Error('Invalid lab result row in database');
  return value;
}

function toLabResult(row: Record<string, SqlValue>): LabResult {
  const { id, biomarker, unit, value, day, note, created_at: createdAt } = row;
  if (
    typeof id !== 'number' ||
    typeof biomarker !== 'string' ||
    typeof unit !== 'string' ||
    typeof value !== 'number' ||
    typeof day !== 'string' ||
    typeof createdAt !== 'number'
  ) {
    throw new Error('Invalid lab result row in database');
  }
  if (note !== null && typeof note !== 'string') throw new Error('Invalid lab result row in database');
  return { id, biomarker, unit, value, day, refLow: nullableNumber(row.ref_low), refHigh: nullableNumber(row.ref_high), note, createdAt };
}

export async function listLabResults(driver: SqlDriver): Promise<LabResult[]> {
  const rows = await driver.all<Record<string, SqlValue>>(`SELECT ${COLUMNS} FROM lab_results ORDER BY day, id`);
  return rows.map(toLabResult);
}

export async function insertLabResult(driver: SqlDriver, input: LabResultInput, nowS: number): Promise<LabResult> {
  const result = await driver.run(
    'INSERT INTO lab_results (biomarker, unit, value, day, ref_low, ref_high, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [input.biomarker, input.unit, input.value, input.day, input.refLow, input.refHigh, input.note, nowS],
  );
  return { ...input, id: result.lastInsertRowid, createdAt: nowS };
}

export async function updateLabResult(driver: SqlDriver, id: number, input: LabResultInput): Promise<boolean> {
  const result = await driver.run(
    'UPDATE lab_results SET biomarker = ?, unit = ?, value = ?, day = ?, ref_low = ?, ref_high = ?, note = ? WHERE id = ?',
    [input.biomarker, input.unit, input.value, input.day, input.refLow, input.refHigh, input.note, id],
  );
  return result.changes > 0;
}

export async function deleteLabResult(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM lab_results WHERE id = ?', [id]);
  return result.changes > 0;
}
