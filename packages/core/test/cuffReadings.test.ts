import { beforeEach, describe, expect, it } from 'vitest';
import { deleteCuffReading, exportCsv, insertCuffReading, listCuffReadings, openStore } from '../src/index';
import type { CuffReadingInput, Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

const BASE: CuffReadingInput = { t: 1_795_700_000, systolic: 118, diastolic: 76, pulse: 62 };

describe('cuff readings', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
  });

  it('lists newest first and deletes by id', async () => {
    const older = await insertCuffReading(store.driver, { ...BASE, t: BASE.t - 86_400, pulse: null }, 5);
    const newer = await insertCuffReading(store.driver, BASE, 6);
    expect(await listCuffReadings(store.driver)).toEqual([
      { ...BASE, id: newer.id, createdAt: 6 },
      { ...BASE, t: BASE.t - 86_400, pulse: null, id: older.id, createdAt: 5 },
    ]);
    expect(await deleteCuffReading(store.driver, older.id)).toBe(true);
    expect(await deleteCuffReading(store.driver, older.id)).toBe(false);
    expect((await listCuffReadings(store.driver)).map((r) => r.id)).toEqual([newer.id]);
  });

  it('rejects readings outside what a cuff can show', async () => {
    await expect(insertCuffReading(store.driver, { ...BASE, systolic: 300 }, 1)).rejects.toThrow();
    await expect(insertCuffReading(store.driver, { ...BASE, diastolic: 20 }, 1)).rejects.toThrow();
    await expect(insertCuffReading(store.driver, { ...BASE, systolic: 80, diastolic: 80 }, 1)).rejects.toThrow();
    await expect(insertCuffReading(store.driver, { ...BASE, pulse: 10 }, 1)).rejects.toThrow();
    expect(await listCuffReadings(store.driver)).toEqual([]);
  });

  it('exports every reading as CSV', async () => {
    await insertCuffReading(store.driver, BASE, 7);
    const csv = await exportCsv(store, 'cuff_readings');
    expect(csv).toBe(`id,t,systolic,diastolic,pulse,created_at\r\n1,${BASE.t},118,76,62,7\r\n`);
  });
});
