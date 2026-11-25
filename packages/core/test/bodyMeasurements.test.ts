import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteBodyMeasurement,
  exportCsv,
  insertBodyMeasurement,
  listBodyMeasurements,
  openStore,
  updateBodyMeasurement,
} from '../src/index';
import type { SqlDriver } from '../src/index';
import { openStrictDriver } from './strictDriver';

describe('body measurements', () => {
  let driver: SqlDriver;

  beforeEach(async () => {
    driver = openStrictDriver();
    await openStore(driver);
  });

  it('starts empty and lists entries oldest first', async () => {
    expect(await listBodyMeasurements(driver)).toEqual([]);
    await insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 80.5, bodyFatPct: null }, 10);
    await insertBodyMeasurement(driver, { day: '2026-11-10', weightKg: 82, bodyFatPct: 20.5 }, 11);
    const list = await listBodyMeasurements(driver);
    expect(list.map((m) => m.day)).toEqual(['2026-11-10', '2026-11-20']);
    expect(list[0]).toEqual({ id: 2, day: '2026-11-10', weightKg: 82, bodyFatPct: 20.5, createdAt: 11 });
    expect(list[1]?.bodyFatPct).toBeNull();
  });

  it('updates and deletes by id and reports a missing id', async () => {
    const created = await insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 80, bodyFatPct: null }, 10);
    expect(await updateBodyMeasurement(driver, created.id, { day: '2026-11-21', weightKg: 79.5, bodyFatPct: 18 })).toBe(true);
    expect(await listBodyMeasurements(driver)).toEqual([{ id: created.id, day: '2026-11-21', weightKg: 79.5, bodyFatPct: 18, createdAt: 10 }]);
    expect(await updateBodyMeasurement(driver, 999, { day: '2026-11-21', weightKg: 79.5, bodyFatPct: null })).toBe(false);
    expect(await deleteBodyMeasurement(driver, created.id)).toBe(true);
    expect(await deleteBodyMeasurement(driver, created.id)).toBe(false);
    expect(await listBodyMeasurements(driver)).toEqual([]);
  });

  it('rejects out-of-range values and malformed days at the database', async () => {
    await expect(insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 24, bodyFatPct: null }, 1)).rejects.toThrow();
    await expect(insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 301, bodyFatPct: null }, 1)).rejects.toThrow();
    await expect(insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 80, bodyFatPct: 1.9 }, 1)).rejects.toThrow();
    await expect(insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 80, bodyFatPct: 70.1 }, 1)).rejects.toThrow();
    await expect(insertBodyMeasurement(driver, { day: 'yesterday', weightKg: 80, bodyFatPct: null }, 1)).rejects.toThrow();
    expect(await listBodyMeasurements(driver)).toEqual([]);
  });

  it('is part of the CSV export', async () => {
    const store = await openStore(driver);
    expect(await exportCsv(store, 'body_measurements')).toBe('id,day,weight_kg,body_fat_pct,created_at\r\n');
    await insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 80.5, bodyFatPct: null }, 10);
    await insertBodyMeasurement(driver, { day: '2026-11-19', weightKg: 81, bodyFatPct: 19.2 }, 11);
    expect(await exportCsv(store, 'body_measurements')).toBe(
      'id,day,weight_kg,body_fat_pct,created_at\r\n2,2026-11-19,81,19.2,11\r\n1,2026-11-20,80.5,,10\r\n',
    );
  });
});
