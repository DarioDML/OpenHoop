import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ActivityInputError,
  bindActivityStore,
  checkActivityInput,
  computeActivityMetrics,
  exportCsv,
  heartRatePoints,
  loadReference,
  openStore,
  parsePaused,
} from '../src/index';
import type { ActivityInput, ActivityMetricsRecord, ActivityStore, DayRecord, DeviceRow, SampleRow, Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

const T0 = 1_800_000_000;

const EMPTY: ActivityMetricsRecord = { activeS: 0, load: null, loadReason: 'no-data', zoneSeconds: [0, 0, 0, 0, 0, 0], avgHr: null, maxHr: null, hrSeconds: 0 };

function input(deviceId: number, over: Partial<ActivityInput> = {}): ActivityInput {
  return { deviceId, source: 'manual', detectedStart: null, type: 'running', start: T0, end: T0 + 1800, paused: [], note: null, ...over };
}

function row(deviceId: number, t: number, hr: number | null, source: SampleRow['source'] = 'history'): SampleRow {
  return { deviceId, t, source, hr, rr: [], steps: null, skinTempC: null, spo2Raw: null, state: null, motionG: null, chunkId: null };
}

describe('activity store', () => {
  let store: Store;
  let activities: ActivityStore;
  let device: DeviceRow;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    activities = bindActivityStore(store.driver);
    device = await store.upsertDevice({ bleId: 'AA', name: null, model: null, firmware: null, serial: null, ownerSince: null, configSnapshot: null });
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('saves, lists, edits and exports an activity', async () => {
    const saved = await activities.save(input(device.id, { note: '  easy run  ', paused: [{ start: T0 + 600, end: T0 + 700 }] }), EMPTY, 10);
    expect(saved).toMatchObject({ source: 'manual', type: 'running', note: 'easy run', deletedAt: null, createdAt: 10, updatedAt: 10 });
    expect(saved.paused).toEqual([{ start: T0 + 600, end: T0 + 700 }]);
    const edited = await activities.save(input(device.id, { type: 'cycling', end: T0 + 3600 }), { ...EMPTY, load: 5.5, loadReason: null }, 20, saved.id);
    expect(edited).toMatchObject({ id: saved.id, type: 'cycling', end: T0 + 3600, createdAt: 10, updatedAt: 20 });
    expect(edited.metrics.load).toBe(5.5);
    expect(await activities.list(device.id)).toHaveLength(1);
    const csv = await exportCsv(store, 'activities');
    expect(csv.split('\r\n')[0]).toContain('id,device_id,source,detected_start,type,start,end,paused');
    expect(csv).toContain(',cycling,');
  });

  it('rejects invalid input', async () => {
    await expect(activities.save(input(device.id, { end: T0 }), EMPTY, 1)).rejects.toBeInstanceOf(ActivityInputError);
    await expect(activities.save(input(device.id, { end: T0 + 25 * 3600 }), EMPTY, 1)).rejects.toThrow('too long');
    await expect(activities.save(input(device.id, { type: 'DROP TABLE' }), EMPTY, 1)).rejects.toThrow('bad type');
    await expect(activities.save(input(device.id, { source: 'auto' }), EMPTY, 1)).rejects.toThrow('detected start');
    await expect(activities.save(input(device.id), EMPTY, 1, 999)).rejects.toThrow('does not exist');
    expect(checkActivityInput(input(device.id, { paused: [{ start: T0 - 100, end: T0 + 10 }, { start: T0 + 5, end: T0 + 20 }] })).paused).toEqual([
      { start: T0, end: T0 + 20 },
    ]);
    expect(checkActivityInput(input(device.id, { note: 'x'.repeat(900) })).note).toHaveLength(500);
  });

  it('keeps a deleted detected workout as a stored override but purges deleted own activities', async () => {
    const own = await activities.save(input(device.id), EMPTY, 1);
    const override = await activities.save(input(device.id, { source: 'auto', detectedStart: T0 + 5000, start: T0 + 5000, end: T0 + 6000 }), EMPTY, 1);
    await activities.setDeleted(own.id, 50, 50);
    await activities.setDeleted(override.id, 50, 50);
    expect((await activities.get(own.id))?.deletedAt).toBe(50);
    await activities.setDeleted(own.id, null, 51);
    expect((await activities.get(own.id))?.deletedAt).toBeNull();
    await activities.setDeleted(own.id, 52, 52);
    expect(await activities.purgeDeleted(device.id)).toBe(1);
    expect(await activities.get(own.id)).toBeNull();
    expect((await activities.findDetected(device.id, T0 + 5000))?.deletedAt).toBe(50);
    await expect(activities.save(input(device.id, { source: 'auto', detectedStart: T0 + 5000 }), EMPTY, 2)).rejects.toThrow();
    await activities.remove(override.id);
    expect(await activities.findDetected(device.id, T0 + 5000)).toBeNull();
  });

  it('computes metrics from stored samples, one source per second', async () => {
    const rows: SampleRow[] = [];
    for (let t = T0; t < T0 + 1800; t++) rows.push(row(device.id, t, 150));
    for (let t = T0; t < T0 + 600; t++) rows.push(row(device.id, t, 199, 'hrm'));
    await store.insertSamples(rows);
    const m = await computeActivityMetrics(store, device.id, { start: T0, end: T0 + 1800 }, [], { rest: 60, max: 190 });
    expect(m.hrSeconds).toBe(1800);
    expect(m.avgHr).toBe(150);
    expect(m.load).toBeGreaterThan(0);
    expect(m.loadReason).toBeNull();
    const empty = await computeActivityMetrics(store, device.id, { start: T0 + 9000, end: T0 + 9600 }, [], { rest: 60, max: 190 });
    expect(empty).toMatchObject({ load: null, loadReason: 'no-data', hrSeconds: 0 });
  });
});

describe('activity helpers', () => {
  it('drops broken pause data when reading', () => {
    expect(parsePaused('not json')).toEqual([]);
    expect(parsePaused('[{"start":1,"end":5},{"start":"x"},{"start":9,"end":3}]')).toEqual([{ start: 1, end: 5 }]);
  });

  it('prefers band history over live heart rate and drops impossible values', () => {
    const points = heartRatePoints([row(1, 2, 300, 'history'), row(1, 1, 80, 'hrm'), row(1, 1, 70, 'history')]);
    expect(points).toEqual([
      { t: 1, hr: 70 },
      { t: 2, hr: null },
    ]);
  });

  it('takes rest from recent nights before the activity', () => {
    const day = (start: number, rhr: number | null): DayRecord => ({ start, restingHr: { value: rhr, reason: null, coverage: null, algo: 'x' } }) as DayRecord;
    const days = [day(0, 50), day(100, 54), day(200, 70)];
    expect(loadReference(days, { maxHr: 180, birthYear: null, restingHr: null }, 150, 2026)).toEqual({ rest: 52, max: 180 });
    expect(loadReference([], { maxHr: null, birthYear: null, restingHr: null }, 150, 2026)).toEqual({ rest: 60, max: 190 });
    expect(loadReference(days, { maxHr: null, birthYear: null, restingHr: 48 }, 150, 2026).rest).toBe(48);
  });
});
