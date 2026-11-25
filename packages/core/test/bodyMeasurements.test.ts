import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteBodyMeasurement,
  exportCsv,
  importBodyMeasurements,
  insertBodyMeasurement,
  listBodyMeasurements,
  openStore,
  updateBodyMeasurement,
} from '../src/index';
import type { SqlDriver } from '../src/index';
import { openStrictDriver } from './strictDriver';

const FAT = { bodyFat: true };

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
    expect(list[0]).toEqual({ id: 2, day: '2026-11-10', weightKg: 82, bodyFatPct: 20.5, createdAt: 11, source: 'manual', origin: null });
    expect(list[1]?.bodyFatPct).toBeNull();
  });

  it('updates and deletes by id and reports a missing id', async () => {
    const created = await insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 80, bodyFatPct: null }, 10);
    expect(await updateBodyMeasurement(driver, created.id, { day: '2026-11-21', weightKg: 79.5, bodyFatPct: 18 })).toBe(true);
    expect(await listBodyMeasurements(driver)).toEqual([
      { id: created.id, day: '2026-11-21', weightKg: 79.5, bodyFatPct: 18, createdAt: 10, source: 'manual', origin: null },
    ]);
    expect(await updateBodyMeasurement(driver, 999, { day: '2026-11-21', weightKg: 79.5, bodyFatPct: null })).toBe(false);
    expect(await deleteBodyMeasurement(driver, created.id, 20)).toBe(true);
    expect(await deleteBodyMeasurement(driver, created.id, 20)).toBe(false);
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
    const header = 'id,day,weight_kg,body_fat_pct,created_at,source,origin,external_id,deleted_at\r\n';
    expect(await exportCsv(store, 'body_measurements')).toBe(header);
    await insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 80.5, bodyFatPct: null }, 10);
    await insertBodyMeasurement(driver, { day: '2026-11-19', weightKg: 81, bodyFatPct: 19.2 }, 11);
    expect(await exportCsv(store, 'body_measurements')).toBe(`${header}2,2026-11-19,81,19.2,11,manual,,,\r\n1,2026-11-20,80.5,,10,manual,,,\r\n`);
    await importBodyMeasurements(driver, [{ day: '2026-11-21', weightKg: 79, bodyFatPct: null, externalId: 'hc-1', origin: 'com.scale' }], 12, FAT);
    expect(await exportCsv(store, 'body_measurements')).toContain('3,2026-11-21,79,,12,health_connect,com.scale,hc-1,\r\n');
  });
});

describe('imported body measurements', () => {
  let driver: SqlDriver;
  const scale = (day: string, weightKg: number, externalId: string, bodyFatPct: number | null = null) => ({
    day,
    weightKg,
    bodyFatPct,
    externalId,
    origin: 'com.example.scale',
  });

  beforeEach(async () => {
    driver = openStrictDriver();
    await openStore(driver);
  });

  it('stores imports with their source and updates them in place on a later import', async () => {
    expect(await importBodyMeasurements(driver, [scale('2026-11-20', 80, 'a'), scale('2026-11-21', 79.5, 'b', 18)], 10, FAT)).toEqual({
      saved: 2,
      skipped: 0,
    });
    expect(await importBodyMeasurements(driver, [scale('2026-11-20', 80, 'a'), scale('2026-11-21', 79.4, 'b', 18)], 11, FAT)).toEqual({
      saved: 1,
      skipped: 1,
    });
    const list = await listBodyMeasurements(driver);
    expect(list).toHaveLength(2);
    expect(list[1]).toEqual({
      id: 2,
      day: '2026-11-21',
      weightKg: 79.4,
      bodyFatPct: 18,
      createdAt: 10,
      source: 'health_connect',
      origin: 'com.example.scale',
    });
  });

  it('never overwrites or competes with a manual entry', async () => {
    await insertBodyMeasurement(driver, { day: '2026-11-20', weightKg: 81, bodyFatPct: null }, 5);
    expect(await importBodyMeasurements(driver, [scale('2026-11-20', 80, 'a')], 10, FAT)).toEqual({ saved: 0, skipped: 1 });
    expect((await importBodyMeasurements(driver, [scale('2026-11-21', 80, 'b')], 10, FAT)).saved).toBe(1);
    const importedId = (await listBodyMeasurements(driver)).find((m) => m.source === 'health_connect')?.id ?? -1;
    expect(await updateBodyMeasurement(driver, importedId, { day: '2026-11-21', weightKg: 78, bodyFatPct: null })).toBe(true);
    await importBodyMeasurements(driver, [scale('2026-11-21', 80, 'b')], 11, FAT);
    expect((await listBodyMeasurements(driver)).map((m) => [m.day, m.weightKg, m.source])).toEqual([
      ['2026-11-20', 81, 'manual'],
      ['2026-11-21', 78, 'manual'],
    ]);
  });

  it('does not bring back an import the user deleted', async () => {
    await importBodyMeasurements(driver, [scale('2026-11-20', 80, 'a')], 10, FAT);
    const [entry] = await listBodyMeasurements(driver);
    expect(await deleteBodyMeasurement(driver, entry?.id ?? -1, 12)).toBe(true);
    expect(await deleteBodyMeasurement(driver, entry?.id ?? -1, 13)).toBe(false);
    expect(await importBodyMeasurements(driver, [scale('2026-11-20', 80, 'a')], 14, FAT)).toEqual({ saved: 0, skipped: 1 });
    expect(await listBodyMeasurements(driver)).toEqual([]);
  });

  it('leaves stored body fat alone when this import did not read body fat', async () => {
    await importBodyMeasurements(driver, [scale('2026-11-20', 80, 'a', 20)], 10, FAT);
    expect(await importBodyMeasurements(driver, [scale('2026-11-20', 80, 'a')], 11, { bodyFat: false })).toEqual({ saved: 0, skipped: 1 });
    expect((await importBodyMeasurements(driver, [scale('2026-11-20', 79.8, 'a')], 12, { bodyFat: false })).saved).toBe(1);
    expect(await importBodyMeasurements(driver, [scale('2026-11-21', 79, 'b', 19)], 13, { bodyFat: false })).toEqual({ saved: 1, skipped: 0 });
    expect((await listBodyMeasurements(driver)).map((m) => [m.weightKg, m.bodyFatPct])).toEqual([
      [79.8, 20],
      [79, null],
    ]);
  });

  it('skips values the log cannot hold instead of failing the whole import', async () => {
    const result = await importBodyMeasurements(
      driver,
      [
        scale('2026-11-20', 400, 'a'),
        scale('2026-11-20', 80, 'b', 90),
        scale('not-a-day', 80, 'c'),
        scale('2026-11-20', 80, ''),
        scale('2026-11-22', 80, 'd'),
      ],
      10,
      FAT,
    );
    expect(result).toEqual({ saved: 1, skipped: 4 });
  });
});
