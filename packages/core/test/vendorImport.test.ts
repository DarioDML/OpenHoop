import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearVendorData,
  emptyVendorData,
  exportCsv,
  listVendorData,
  openStore,
  upsertVendorData,
  type SqlDriver,
  type Store,
  type VendorData,
} from '../src/index';
import { openStrictDriver } from './strictDriver';

function sample(): VendorData {
  return {
    cycles: [
      {
        startT: 1_700_000_000,
        endT: 1_700_086_400,
        tzOffsetS: 3_600,
        day: '2023-11-14',
        recoveryPct: 62,
        restingHr: 51,
        hrvMs: 74.5,
        skinTempC: 33.4,
        spo2Pct: 96.5,
        respiratoryRate: 14.2,
        dayStrain: 11.3,
      },
      {
        startT: 1_700_086_400,
        endT: null,
        tzOffsetS: 3_600,
        day: '2023-11-15',
        recoveryPct: null,
        restingHr: null,
        hrvMs: null,
        skinTempC: null,
        spo2Pct: null,
        respiratoryRate: null,
        dayStrain: null,
      },
    ],
    sleeps: [
      {
        onset: 1_700_000_100,
        wake: 1_700_028_900,
        tzOffsetS: 3_600,
        day: '2023-11-14',
        nap: false,
        performancePct: 88,
        asleepMin: 440,
        inBedMin: 480,
        lightMin: 220,
        deepMin: 90,
        remMin: 130,
        awakeMin: 40,
        efficiencyPct: 91.5,
        consistencyPct: 80,
        respiratoryRate: 14.1,
      },
    ],
    workouts: [{ startT: 1_700_040_000, endT: 1_700_043_600, tzOffsetS: 3_600, day: '2023-11-15', activity: 'Running', strain: 9.4, avgHr: 142, maxHr: 171 }],
    journal: [{ cycleStart: 1_700_000_000, tzOffsetS: 3_600, day: '2023-11-14', question: 'Did you drink alcohol?', answeredYes: true, notes: 'one, with dinner' }],
  };
}

describe('vendor import storage', () => {
  let driver: SqlDriver;
  let store: Store;

  beforeEach(async () => {
    driver = openStrictDriver();
    store = await openStore(driver);
  });

  it('starts empty', async () => {
    expect(await listVendorData(driver)).toEqual(emptyVendorData());
  });

  it('stores every field and reads it back', async () => {
    const result = await upsertVendorData(driver, sample(), 5_000);
    expect(result).toEqual({
      cycles: { imported: 2, skipped: 0 },
      sleeps: { imported: 1, skipped: 0 },
      workouts: { imported: 1, skipped: 0 },
      journal: { imported: 1, skipped: 0 },
    });
    expect(await listVendorData(driver)).toEqual(sample());
  });

  it('tags every row with the vendor-export source', async () => {
    await upsertVendorData(driver, sample(), 5_000);
    for (const table of ['vendor_cycles', 'vendor_sleeps', 'vendor_workouts', 'vendor_journal']) {
      const rows = await driver.all<{ source: string; imported_at: number }>(`SELECT source, imported_at FROM ${table}`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.source === 'vendor-export' && r.imported_at === 5_000)).toBe(true);
    }
    await expect(driver.run("UPDATE vendor_cycles SET source = 'band'")).rejects.toThrow();
  });

  it('is idempotent: importing the same data twice adds nothing', async () => {
    await upsertVendorData(driver, sample(), 5_000);
    const again = await upsertVendorData(driver, sample(), 9_000);
    expect(again).toEqual({
      cycles: { imported: 0, skipped: 2 },
      sleeps: { imported: 0, skipped: 1 },
      workouts: { imported: 0, skipped: 1 },
      journal: { imported: 0, skipped: 1 },
    });
    expect(await listVendorData(driver)).toEqual(sample());
    const stamps = await driver.all<{ imported_at: number }>('SELECT imported_at FROM vendor_cycles');
    expect(stamps.every((s) => s.imported_at === 5_000)).toBe(true);
  });

  it('updates a row whose values changed in a newer export', async () => {
    await upsertVendorData(driver, sample(), 5_000);
    const next = sample();
    const first = next.cycles[0];
    if (first === undefined) throw new Error('fixture');
    first.recoveryPct = 70;
    const result = await upsertVendorData(driver, next, 9_000);
    expect(result.cycles).toEqual({ imported: 1, skipped: 1 });
    const stored = (await listVendorData(driver)).cycles;
    expect(stored).toHaveLength(2);
    expect(stored[0]?.recoveryPct).toBe(70);
  });

  it('keeps journal answers apart per question and cycle', async () => {
    const data = emptyVendorData();
    const base = { cycleStart: 100, tzOffsetS: 0, day: '2023-11-14', answeredYes: false, notes: null };
    data.journal = [
      { ...base, question: 'A' },
      { ...base, question: 'B' },
      { ...base, cycleStart: 200, question: 'A' },
    ];
    expect((await upsertVendorData(driver, data, 1)).journal.imported).toBe(3);
    expect((await listVendorData(driver)).journal).toHaveLength(3);
  });

  it('rolls the whole import back when one row is rejected by the database', async () => {
    const data = sample();
    const sleep = data.sleeps[0];
    if (sleep === undefined) throw new Error('fixture');
    sleep.day = 'not-a-day';
    await expect(upsertVendorData(driver, data, 1)).rejects.toThrow();
    expect(await listVendorData(driver)).toEqual(emptyVendorData());
  });

  it('removes everything and reports how many rows went', async () => {
    await upsertVendorData(driver, sample(), 5_000);
    expect(await clearVendorData(driver)).toBe(5);
    expect(await listVendorData(driver)).toEqual(emptyVendorData());
    expect(await clearVendorData(driver)).toBe(0);
  });

  it('never touches band tables or body measurements', async () => {
    await upsertVendorData(driver, sample(), 5_000);
    for (const table of ['samples_1hz', 'daily_metrics', 'sleeps', 'workouts', 'oracle_values', 'journal', 'body_measurements']) {
      const rows = await driver.all<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`);
      expect(rows[0]?.c).toBe(0);
    }
  });

  it('is part of the CSV export, with the source column', async () => {
    await upsertVendorData(driver, sample(), 5_000);
    const cycles = (await exportCsv(store, 'vendor_cycles')).split('\r\n');
    expect(cycles[0]).toBe(
      'start_t,end_t,tz_offset_s,day,recovery_pct,resting_hr,hrv_ms,skin_temp_c,spo2_pct,respiratory_rate,day_strain,source,imported_at',
    );
    expect(cycles[1]).toBe('1700000000,1700086400,3600,2023-11-14,62,51,74.5,33.4,96.5,14.2,11.3,vendor-export,5000');
    expect(cycles[2]).toBe('1700086400,,3600,2023-11-15,,,,,,,,vendor-export,5000');
    for (const table of ['vendor_sleeps', 'vendor_workouts', 'vendor_journal'] as const) {
      const lines = (await exportCsv(store, table)).split('\r\n');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain('vendor-export');
    }
  });

  it('neutralises spreadsheet formulas in exported free text', async () => {
    const data = emptyVendorData();
    data.workouts = [{ startT: 10, endT: 20, tzOffsetS: 0, day: '2023-11-14', activity: '=HYPERLINK("x")', strain: null, avgHr: null, maxHr: null }];
    data.journal = [{ cycleStart: 10, tzOffsetS: 0, day: '2023-11-14', question: '+cmd', answeredYes: true, notes: '@note' }];
    await upsertVendorData(driver, data, 1);
    expect(await exportCsv(store, 'vendor_workouts')).toContain(`"'=HYPERLINK(""x"")"`);
    const journal = await exportCsv(store, 'vendor_journal');
    expect(journal).toContain("'+cmd");
    expect(journal).toContain("'@note");
  });
});
