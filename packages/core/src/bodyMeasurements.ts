import type { SqlDriver, SqlValue } from './store/types';

export type BodySource = 'manual' | 'health_connect';

export interface BodyMeasurementInput {
  day: string;
  weightKg: number;
  bodyFatPct: number | null;
}

export interface BodyMeasurement extends BodyMeasurementInput {
  id: number;
  createdAt: number;
  source: BodySource;
  origin: string | null;
}

export interface ImportedBodyMeasurement extends BodyMeasurementInput {
  externalId: string;
  origin: string | null;
}

export interface BodyImportResult {
  saved: number;
  skipped: number;
}

export const BODY_WEIGHT_RANGE_KG = { min: 25, max: 300 } as const;
export const BODY_FAT_RANGE_PCT = { min: 2, max: 70 } as const;

const COLUMNS = 'id, day, weight_kg, body_fat_pct, created_at, source, origin';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function toMeasurement(row: Record<string, SqlValue>): BodyMeasurement {
  const { id, day, weight_kg: weightKg, body_fat_pct: bodyFatPct, created_at: createdAt, source, origin } = row;
  if (typeof id !== 'number' || typeof day !== 'string' || typeof weightKg !== 'number' || typeof createdAt !== 'number') {
    throw new Error('Invalid body measurement row in database');
  }
  if (bodyFatPct !== null && typeof bodyFatPct !== 'number') throw new Error('Invalid body measurement row in database');
  if (source !== 'manual' && source !== 'health_connect') throw new Error('Invalid body measurement row in database');
  if (origin !== null && typeof origin !== 'string') throw new Error('Invalid body measurement row in database');
  return { id, day, weightKg, bodyFatPct, createdAt, source, origin };
}

export async function listBodyMeasurements(driver: SqlDriver): Promise<BodyMeasurement[]> {
  const rows = await driver.all<Record<string, SqlValue>>(
    `SELECT ${COLUMNS} FROM body_measurements WHERE deleted_at IS NULL ORDER BY day, id`,
  );
  return rows.map(toMeasurement);
}

export async function insertBodyMeasurement(driver: SqlDriver, input: BodyMeasurementInput, nowS: number): Promise<BodyMeasurement> {
  const result = await driver.run('INSERT INTO body_measurements (day, weight_kg, body_fat_pct, created_at) VALUES (?, ?, ?, ?)', [
    input.day,
    input.weightKg,
    input.bodyFatPct,
    nowS,
  ]);
  return { ...input, id: result.lastInsertRowid, createdAt: nowS, source: 'manual', origin: null };
}

export async function updateBodyMeasurement(driver: SqlDriver, id: number, input: BodyMeasurementInput): Promise<boolean> {
  const result = await driver.run(
    "UPDATE body_measurements SET day = ?, weight_kg = ?, body_fat_pct = ?, source = 'manual', origin = NULL WHERE id = ? AND deleted_at IS NULL",
    [input.day, input.weightKg, input.bodyFatPct, id],
  );
  return result.changes > 0;
}

export async function deleteBodyMeasurement(driver: SqlDriver, id: number, nowS: number): Promise<boolean> {
  return driver.transaction(async (tx) => {
    const hidden = await tx.run(
      'UPDATE body_measurements SET deleted_at = ? WHERE id = ? AND external_id IS NOT NULL AND deleted_at IS NULL',
      [nowS, id],
    );
    if (hidden.changes > 0) return true;
    const removed = await tx.run('DELETE FROM body_measurements WHERE id = ? AND external_id IS NULL', [id]);
    return removed.changes > 0;
  });
}

function isStorable(entry: ImportedBodyMeasurement, withBodyFat: boolean): boolean {
  if (!ISO_DAY.test(entry.day) || entry.externalId === '') return false;
  if (!Number.isFinite(entry.weightKg) || entry.weightKg < BODY_WEIGHT_RANGE_KG.min || entry.weightKg > BODY_WEIGHT_RANGE_KG.max) return false;
  if (!withBodyFat || entry.bodyFatPct === null) return true;
  return Number.isFinite(entry.bodyFatPct) && entry.bodyFatPct >= BODY_FAT_RANGE_PCT.min && entry.bodyFatPct <= BODY_FAT_RANGE_PCT.max;
}

function importSql(withBodyFat: boolean): string {
  const fat = withBodyFat ? 'excluded.body_fat_pct' : 'body_measurements.body_fat_pct';
  return `
INSERT INTO body_measurements (day, weight_kg, body_fat_pct, created_at, source, external_id, origin)
SELECT ?, ?, ?, ?, 'health_connect', ?, ?
WHERE NOT EXISTS (SELECT 1 FROM body_measurements WHERE day = ? AND source = 'manual' AND deleted_at IS NULL)
ON CONFLICT (external_id) DO UPDATE SET
  day = excluded.day,
  weight_kg = excluded.weight_kg,
  body_fat_pct = ${fat},
  origin = excluded.origin
WHERE body_measurements.source = 'health_connect'
  AND body_measurements.deleted_at IS NULL
  AND (body_measurements.day IS NOT excluded.day
    OR body_measurements.weight_kg IS NOT excluded.weight_kg
    OR body_measurements.body_fat_pct IS NOT ${fat}
    OR body_measurements.origin IS NOT excluded.origin)
`;
}

export async function importBodyMeasurements(
  driver: SqlDriver,
  entries: readonly ImportedBodyMeasurement[],
  nowS: number,
  options: { bodyFat: boolean },
): Promise<BodyImportResult> {
  const sql = importSql(options.bodyFat);
  return driver.transaction(async (tx) => {
    let saved = 0;
    let skipped = 0;
    for (const entry of entries) {
      if (!isStorable(entry, options.bodyFat)) {
        skipped++;
        continue;
      }
      const result = await tx.run(sql, [
        entry.day,
        entry.weightKg,
        options.bodyFat ? entry.bodyFatPct : null,
        nowS,
        entry.externalId,
        entry.origin,
        entry.day,
      ]);
      if (result.changes > 0) saved++;
      else skipped++;
    }
    return { saved, skipped };
  });
}
