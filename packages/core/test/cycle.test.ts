import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPregnancy,
  deleteAllCycleData,
  deletePeriod,
  deleteSymptom,
  exportCsv,
  getPregnancy,
  insertPeriod,
  listPeriods,
  listSymptoms,
  loadCycleData,
  openStore,
  setPregnancy,
  updatePeriod,
  upsertSymptom,
} from '../src/index';
import type { SqlDriver, Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

describe('cycle storage', () => {
  let driver: SqlDriver;
  let store: Store;

  beforeEach(async () => {
    driver = openStrictDriver();
    store = await openStore(driver);
  });

  it('starts empty and lists periods oldest first', async () => {
    expect(await loadCycleData(driver)).toEqual({ periods: [], symptoms: [], pregnancy: null });
    await insertPeriod(driver, { startDay: '2026-11-10', endDay: null, flow: 2 }, 10);
    await insertPeriod(driver, { startDay: '2026-10-12', endDay: '2026-10-16', flow: 3 }, 11);
    const list = await listPeriods(driver);
    expect(list.map((p) => p.startDay)).toEqual(['2026-10-12', '2026-11-10']);
    expect(list[0]).toEqual({ id: 2, startDay: '2026-10-12', endDay: '2026-10-16', flow: 3, createdAt: 11 });
    expect(list[1]?.endDay).toBeNull();
  });

  it('updates and deletes a period by id and reports a missing id', async () => {
    const created = await insertPeriod(driver, { startDay: '2026-11-10', endDay: null, flow: 1 }, 10);
    expect(await updatePeriod(driver, created.id, { startDay: '2026-11-10', endDay: '2026-11-14', flow: 2 })).toBe(true);
    expect(await listPeriods(driver)).toEqual([{ id: created.id, startDay: '2026-11-10', endDay: '2026-11-14', flow: 2, createdAt: 10 }]);
    expect(await updatePeriod(driver, 99, { startDay: '2026-11-10', endDay: null, flow: 1 })).toBe(false);
    expect(await deletePeriod(driver, created.id)).toBe(true);
    expect(await deletePeriod(driver, created.id)).toBe(false);
  });

  it('rejects rows the schema does not allow', async () => {
    await expect(insertPeriod(driver, { startDay: '2026-11-10', endDay: '2026-11-01', flow: 1 }, 1)).rejects.toThrow();
    await expect(insertPeriod(driver, { startDay: 'x', endDay: null, flow: 1 }, 1)).rejects.toThrow();
    await expect(driver.run('INSERT INTO cycle_periods (start_day, flow, created_at) VALUES (?, ?, ?)', ['2026-11-10', 4, 1])).rejects.toThrow();
    await expect(driver.run('INSERT INTO symptom_logs (day, symptom, intensity, created_at) VALUES (?, ?, ?, ?)', ['2026-11-10', 'cramps', 0, 1])).rejects.toThrow();
    await expect(driver.run('INSERT INTO symptom_logs (day, symptom, intensity, created_at) VALUES (?, ?, ?, ?)', ['2026-11-10', 'other', 1, 1])).rejects.toThrow();
    await expect(driver.run('INSERT INTO pregnancy (id, due_day, created_at) VALUES (2, ?, 1)', ['2027-01-01'])).rejects.toThrow();
  });

  it('keeps one intensity per symptom and day, and deletes entries', async () => {
    await upsertSymptom(driver, { day: '2026-11-20', symptom: 'cramps', intensity: 1 }, 5);
    await upsertSymptom(driver, { day: '2026-11-20', symptom: 'cramps', intensity: 3 }, 6);
    await upsertSymptom(driver, { day: '2026-11-20', symptom: 'mood', intensity: 2 }, 7);
    const list = await listSymptoms(driver);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ symptom: 'cramps', intensity: 3, createdAt: 5 });
    expect(await deleteSymptom(driver, list[0]?.id ?? 0)).toBe(true);
    expect(await deleteSymptom(driver, list[0]?.id ?? 0)).toBe(false);
    expect((await listSymptoms(driver)).map((s) => s.symptom)).toEqual(['mood']);
  });

  it('keeps a single pregnancy entry that can be replaced and cleared', async () => {
    expect(await getPregnancy(driver)).toBeNull();
    await setPregnancy(driver, '2027-03-01', 5);
    await setPregnancy(driver, '2027-03-08', 6);
    expect(await getPregnancy(driver)).toEqual({ dueDay: '2027-03-08', createdAt: 5 });
    expect(await clearPregnancy(driver)).toBe(true);
    expect(await clearPregnancy(driver)).toBe(false);
    expect(await getPregnancy(driver)).toBeNull();
  });

  it('deletes all cycle data at once and leaves other tables alone', async () => {
    await insertPeriod(driver, { startDay: '2026-11-10', endDay: null, flow: 2 }, 1);
    await upsertSymptom(driver, { day: '2026-11-11', symptom: 'headache', intensity: 2 }, 1);
    await setPregnancy(driver, '2027-03-01', 1);
    await driver.run('INSERT INTO body_measurements (day, weight_kg, body_fat_pct, created_at) VALUES (?, ?, ?, ?)', ['2026-11-11', 70, null, 1]);
    await deleteAllCycleData(driver);
    expect(await loadCycleData(driver)).toEqual({ periods: [], symptoms: [], pregnancy: null });
    const rows = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM body_measurements');
    expect(rows[0]?.c).toBe(1);
  });

  it('exports the cycle tables as CSV', async () => {
    await insertPeriod(driver, { startDay: '2026-11-10', endDay: null, flow: 2 }, 1);
    await upsertSymptom(driver, { day: '2026-11-11', symptom: 'breastTenderness', intensity: 3 }, 2);
    await setPregnancy(driver, '2027-03-01', 3);
    expect(await exportCsv(store, 'cycle_periods')).toBe('id,start_day,end_day,flow,created_at\r\n1,2026-11-10,,2,1\r\n');
    expect(await exportCsv(store, 'symptom_logs')).toBe('id,day,symptom,intensity,created_at\r\n1,2026-11-11,breastTenderness,3,2\r\n');
    expect(await exportCsv(store, 'pregnancy')).toBe('id,due_day,created_at\r\n1,2027-03-01,3\r\n');
  });
});
