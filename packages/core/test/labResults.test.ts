import { beforeEach, describe, expect, it } from 'vitest';
import { deleteLabResult, exportCsv, insertLabResult, listLabResults, openStore, updateLabResult } from '../src/index';
import type { LabResultInput, SqlDriver } from '../src/index';
import { openStrictDriver } from './strictDriver';

const BASE: LabResultInput = {
  biomarker: 'glucose',
  unit: 'mmol/L',
  value: 5.2,
  day: '2026-11-20',
  refLow: 3.9,
  refHigh: 5.6,
  note: null,
};

describe('lab results', () => {
  let driver: SqlDriver;

  beforeEach(async () => {
    driver = openStrictDriver();
    await openStore(driver);
  });

  it('starts empty and lists entries oldest first', async () => {
    expect(await listLabResults(driver)).toEqual([]);
    await insertLabResult(driver, BASE, 10);
    await insertLabResult(driver, { ...BASE, day: '2026-10-01', value: 5.9, refLow: null, refHigh: null, note: 'fasting' }, 11);
    const list = await listLabResults(driver);
    expect(list.map((r) => r.day)).toEqual(['2026-10-01', '2026-11-20']);
    expect(list[0]).toEqual({ ...BASE, id: 2, day: '2026-10-01', value: 5.9, refLow: null, refHigh: null, note: 'fasting', createdAt: 11 });
  });

  it('updates and deletes by id and reports a missing id', async () => {
    const created = await insertLabResult(driver, BASE, 10);
    expect(await updateLabResult(driver, created.id, { ...BASE, value: 6, refHigh: null })).toBe(true);
    expect(await listLabResults(driver)).toEqual([{ ...BASE, value: 6, refHigh: null, id: created.id, createdAt: 10 }]);
    expect(await updateLabResult(driver, 999, BASE)).toBe(false);
    expect(await deleteLabResult(driver, created.id)).toBe(true);
    expect(await deleteLabResult(driver, created.id)).toBe(false);
    expect(await listLabResults(driver)).toEqual([]);
  });

  it('rejects invalid rows at the database', async () => {
    await expect(insertLabResult(driver, { ...BASE, value: -1 }, 1)).rejects.toThrow();
    await expect(insertLabResult(driver, { ...BASE, day: 'yesterday' }, 1)).rejects.toThrow();
    await expect(insertLabResult(driver, { ...BASE, refLow: 6, refHigh: 5 }, 1)).rejects.toThrow();
    await expect(insertLabResult(driver, { ...BASE, refLow: 5, refHigh: 5 }, 1)).rejects.toThrow();
    await expect(insertLabResult(driver, { ...BASE, biomarker: '' }, 1)).rejects.toThrow();
    await expect(insertLabResult(driver, { ...BASE, unit: '' }, 1)).rejects.toThrow();
    await expect(insertLabResult(driver, { ...BASE, note: 'x'.repeat(301) }, 1)).rejects.toThrow();
    expect(await listLabResults(driver)).toEqual([]);
  });

  it('accepts the largest values the app validator allows', async () => {
    const largest: LabResultInput = {
      biomarker: `custom:${'n'.repeat(60)}`,
      unit: 'u'.repeat(24),
      value: 1_000_000,
      day: '2000-01-01',
      refLow: 0,
      refHigh: 1_000_000,
      note: `${'x'.repeat(299)}\n`,
    };
    await insertLabResult(driver, largest, 1);
    expect((await listLabResults(driver))[0]).toMatchObject(largest);
  });

  it('is part of the CSV export', async () => {
    const store = await openStore(driver);
    expect(await exportCsv(store, 'lab_results')).toBe('id,biomarker,unit,value,day,ref_low,ref_high,note,created_at\r\n');
    await insertLabResult(driver, { ...BASE, note: 'a, "b"', refLow: null, refHigh: null }, 10);
    expect(await exportCsv(store, 'lab_results')).toBe(
      'id,biomarker,unit,value,day,ref_low,ref_high,note,created_at\r\n1,glucose,mmol/L,5.2,2026-11-20,,,"a, ""b""",10\r\n',
    );
  });
});
