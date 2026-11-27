import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import { exportCsv, openStore } from '../src/index';
import type { DayRecord, Derived, DeviceRow, SampleRow, SleepEditInput, Store, SyncStateRow } from '../src/index';
import { MIGRATIONS } from '../src/store/migrations';
import { openStrictDriver } from './strictDriver';

const DEVICE: Omit<DeviceRow, 'id'> = {
  bleId: 'AA:BB',
  name: 'WHOOP 5',
  model: '5.0',
  firmware: '50.43.2.0',
  serial: 'SN1',
  ownerSince: 1_000,
  configSnapshot: null,
};

function sample(deviceId: number, t: number, over: Partial<SampleRow> = {}): SampleRow {
  return {
    deviceId,
    t,
    source: 'history',
    hr: 60 + (t % 10),
    rr: [800, 810],
    steps: 5,
    skinTempC: 33.5,
    spo2Raw: 97,
    state: 'SLEEP',
    motionG: 0.01,
    chunkId: null,
    ...over,
  };
}

function syncState(deviceId: number, over: Partial<SyncStateRow> = {}): SyncStateRow {
  return {
    deviceId,
    lastEndToken: new Uint8Array([1, 2, 3]),
    lastSyncAt: 5_000,
    newestSampleT: 2_000,
    readPage: 1,
    writePage: 2,
    trimPage: 3,
    totalPages: 4,
    ...over,
  };
}

function derived(value: number | null): Derived {
  return { value, reason: value === null ? 'no data' : null, coverage: 1, algo: 'test@1' };
}

function dayRecord(deviceId: number, day: string, over: Partial<DayRecord> = {}): DayRecord {
  return {
    deviceId,
    day,
    start: 0,
    end: 86_400,
    tzOffsetS: 3_600,
    flags: [],
    sleep: {
      periods: [
        { onset: 100, offset: 28_900, asleepS: 27_000, inBedS: 28_800, nap: false, source: 'detected', editId: null },
        { onset: 50_000, offset: 51_800, asleepS: 1_700, inBedS: 1_800, nap: true, source: 'detected', editId: null },
      ],
      asleepS: 28_700,
      inBedS: 30_600,
      need: derived(28_800),
      debt: derived(0),
      consistency: derived(90),
      score: derived(82),
    },
    hrv: derived(60),
    restingHr: derived(50),
    respiratoryRate: derived(14),
    spo2: derived(97),
    skinTempC: derived(33),
    skinTempDeviationC: derived(0.1),
    readiness: derived(71),
    readinessCalibrating: false,
    readinessContributions: { hrv: 1, sleep: 2, rhr: 3 },
    load: derived(8.5),
    zoneSeconds: [1, 2, 3, 4, 5],
    steps: 9_000,
    heartRate: { min: 45, avg: 70, max: 150 },
    workouts: [{ start: 60_000, end: 63_000, zoneSeconds: [0, 0, 600, 1_800, 600], avgHr: 140, maxHr: 170, source: 'auto', label: null }],
    ...over,
  };
}

async function count(store: Store, table: string): Promise<number> {
  const rows = await store.driver.all<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`);
  return rows[0]?.c ?? -1;
}

describe('store', () => {
  let store: Store;
  let device: DeviceRow;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    device = await store.upsertDevice(DEVICE);
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('migration 16 keeps existing sleep edits and marks them as not removed', async () => {
    const raw = openStrictDriver();
    for (const script of MIGRATIONS.slice(0, 15)) await raw.exec(script);
    await raw.exec('PRAGMA user_version = 15');
    await raw.exec("INSERT INTO devices (id, ble_id) VALUES (1, 'AA:BB')");
    await raw.exec('INSERT INTO sleep_edits (device_id, target_onset, target_offset, onset, offset, created_at) VALUES (1, 100, 200, 90, 210, 3)');
    const migrated = await openStore(raw);
    expect(await migrated.listSleepEdits(1)).toEqual([{ id: 1, deviceId: 1, targetOnset: 100, targetOffset: 200, onset: 90, offset: 210, createdAt: 3, removed: false }]);
    await expect(raw.exec('UPDATE sleep_edits SET removed = 2')).rejects.toThrow();
    await raw.close();
  });

  it('migrations are idempotent and record the version', async () => {
    const before = await store.driver.all<{ user_version: number }>('PRAGMA user_version');
    const again = await openStore(store.driver);
    const after = await again.driver.all<{ user_version: number }>('PRAGMA user_version');
    expect(before[0]?.user_version).toBeGreaterThan(0);
    expect(after).toEqual(before);
    expect((await again.listDevices()).length).toBe(1);
  });

  it('creates every table of the spec', async () => {
    const rows = await store.driver.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    const names = rows.map((r) => r.name);
    for (const t of [
      'devices', 'raw_chunks', 'samples_1hz', 'events', 'console_log', 'sync_state', 'daily_metrics', 'sleeps',
      'workouts', 'baselines', 'calibration', 'settings', 'sleep_stages', 'journal', 'oracle_values', 'optical_bursts',
      'imu_blocks', 'ecg_recordings', 'sleep_edits', 'activities',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('commitChunk then readChunkFrames returns identical frames', async () => {
    const frames = [new Uint8Array([0xaa, 1, 2]), new Uint8Array(0), new Uint8Array(3_000).fill(7)];
    const id = await store.commitChunk(
      { deviceId: device.id, endToken: new Uint8Array([9, 9]), frames, clockOffsetS: 10_800, receivedAt: 123 },
      [sample(device.id, 1_000), sample(device.id, 1_001)],
      {
        events: [{ deviceId: device.id, t: 1_000, event: 3, name: 'BATTERY', payloadHex: '0a' }],
        console: [{ deviceId: device.id, t: 1_000, sequence: 1, text: 'boot' }],
        unknownFrames: 2,
        syncState: syncState(device.id),
      },
    );
    expect(await store.readChunkFrames(id)).toEqual(frames);
    expect(await store.listChunkIds(device.id)).toEqual([id]);
    expect(await store.getChunkMeta(id)).toEqual({ deviceId: device.id, clockOffsetS: 10_800, receivedAt: 123 });
    expect(await store.getChunkMeta(id + 1)).toBeNull();
    const stored = await store.samplesBetween(device.id, 0, 5_000);
    expect(stored.map((s) => s.chunkId)).toEqual([id, id]);
    expect(await count(store, 'events')).toBe(1);
    expect(await count(store, 'console_log')).toBe(1);
    expect(await store.getSyncState(device.id)).toEqual(syncState(device.id));
  });

  it('commitChunk archives an identical chunk once and still applies the new sync state', async () => {
    const frames = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
    const chunk = { deviceId: device.id, endToken: new Uint8Array([7]), frames, clockOffsetS: 0, receivedAt: 10 };
    const first = await store.commitChunk(chunk, [sample(device.id, 1_000)], {
      events: [],
      console: [],
      unknownFrames: 0,
      syncState: syncState(device.id, { readPage: 1 }),
    });
    const second = await store.commitChunk({ ...chunk, receivedAt: 20 }, [sample(device.id, 1_000), sample(device.id, 1_001)], {
      events: [{ deviceId: device.id, t: 1_001, event: 3, name: 'BATTERY', payloadHex: '0a' }],
      console: [],
      unknownFrames: 0,
      syncState: syncState(device.id, { readPage: 2 }),
    });
    expect(second).toBe(first);
    expect(await count(store, 'raw_chunks')).toBe(1);
    expect((await store.samplesBetween(device.id, 0, 5_000)).map((s) => s.chunkId)).toEqual([first, first]);
    expect(await store.getSyncState(device.id)).toEqual(syncState(device.id, { readPage: 2 }));
    const other = await store.upsertDevice({ ...DEVICE, bleId: 'CC:DD' });
    const elsewhere = await store.commitChunk({ ...chunk, deviceId: other.id }, [], {
      events: [],
      console: [],
      unknownFrames: 0,
      syncState: syncState(other.id),
    });
    expect(elsewhere).not.toBe(first);
    const changed = await store.commitChunk({ ...chunk, frames: [new Uint8Array([1, 2, 3])] }, [], {
      events: [],
      console: [],
      unknownFrames: 0,
      syncState: syncState(device.id),
    });
    expect(changed).not.toBe(first);
    expect(await count(store, 'raw_chunks')).toBe(3);
  });

  it('deleteBefore removes older rows and wholly older chunks for one device in one transaction', async () => {
    const newest = (frames: Uint8Array[]): number | null => {
      let out: number | null = null;
      for (const frame of frames) {
        const t = frame[0];
        if (t !== undefined && (out === null || t > out)) out = t;
      }
      return out;
    };
    const commit = (frames: number[], samples: number[], extras: { event?: number; line?: number } = {}): Promise<number> =>
      store.commitChunk(
        { deviceId: device.id, endToken: null, frames: frames.map((t) => new Uint8Array([t, 0])), clockOffsetS: null, receivedAt: 1 },
        samples.map((t) => sample(device.id, t)),
        {
          events: extras.event === undefined ? [] : [{ deviceId: device.id, t: extras.event, event: 1, name: 'x', payloadHex: '' }],
          console: extras.line === undefined ? [] : [{ deviceId: device.id, t: extras.line, sequence: 1, text: 'line' }],
          unknownFrames: 0,
          syncState: syncState(device.id),
        },
      );
    const old = await commit([10, 20], [10, 20], { event: 15 });
    const straddling = await commit([40, 60], [40, 60]);
    const newer = await commit([70], [70], { line: 75 });
    const undated = await commit([], []);
    await store.insertSamples([sample(device.id, 30, { source: 'live' })]);
    await store.replaceDay(dayRecord(device.id, '2026-11-25'));
    const other = await store.upsertDevice({ ...DEVICE, bleId: 'CC:DD' });
    await store.insertSamples([sample(other.id, 5)]);

    const result = await store.deleteBefore(device.id, 50, newest);

    expect(result).toEqual({ samples: 4, events: 1, console: 0, chunks: 1 });
    expect(await store.listChunkIds(device.id)).toEqual([straddling, newer, undated]);
    expect(old).toBeLessThan(straddling);
    expect((await store.samplesBetween(device.id, 0, 1_000)).map((s) => s.t)).toEqual([60, 70]);
    expect(await count(store, 'console_log')).toBe(1);
    expect(await count(store, 'daily_metrics')).toBe(0);
    expect(await store.sampleRange(other.id)).toEqual({ first: 5, last: 5, count: 1 });
  });

  it('deleteRecordings empties one device and keeps the device row and the other device', async () => {
    await store.commitChunk(
      { deviceId: device.id, endToken: null, frames: [new Uint8Array([10])], clockOffsetS: null, receivedAt: 1 },
      [sample(device.id, 10), sample(device.id, 11)],
      {
        events: [{ deviceId: device.id, t: 10, event: 1, name: 'x', payloadHex: '' }],
        console: [{ deviceId: device.id, t: 10, sequence: 1, text: 'line' }],
        unknownFrames: 0,
        syncState: syncState(device.id),
      },
    );
    await store.replaceDay(dayRecord(device.id, '2026-11-25'));
    const other = await store.upsertDevice({ ...DEVICE, bleId: 'CC:DD' });
    await store.insertSamples([sample(other.id, 5)]);

    expect(await store.deleteRecordings(device.id)).toBe(2);

    for (const table of ['samples_1hz', 'raw_chunks', 'events', 'console_log', 'daily_metrics']) {
      expect(await count(store, table)).toBe(table === 'samples_1hz' ? 1 : 0);
    }
    expect(await store.getSyncState(device.id)).toBeNull();
    expect(await store.getDevice(device.id)).not.toBeNull();
    expect(await store.sampleRange(other.id)).toEqual({ first: 5, last: 5, count: 1 });
  });

  it('deleteBefore rolls back completely when it fails', async () => {
    await store.commitChunk(
      { deviceId: device.id, endToken: null, frames: [new Uint8Array([10])], clockOffsetS: null, receivedAt: 1 },
      [sample(device.id, 10)],
      { events: [], console: [], unknownFrames: 0, syncState: syncState(device.id) },
    );
    await expect(
      store.deleteBefore(device.id, 50, () => {
        throw new Error('decoder failed');
      }),
    ).rejects.toThrow('decoder failed');
    expect(await count(store, 'samples_1hz')).toBe(1);
    expect(await count(store, 'raw_chunks')).toBe(1);
  });

  it('a throw inside commitChunk leaves no chunk, no samples and the old sync state', async () => {
    const old = syncState(device.id, { readPage: 99 });
    await store.setSyncState(old);
    const badSample = sample(device.id + 1_000, 2_000);
    await expect(
      store.commitChunk(
        { deviceId: device.id, endToken: null, frames: [new Uint8Array([1])], clockOffsetS: null, receivedAt: 1 },
        [sample(device.id, 1_500), badSample],
        {
          events: [{ deviceId: device.id, t: 1, event: 1, name: 'x', payloadHex: '' }],
          console: [],
          unknownFrames: 0,
          syncState: syncState(device.id, { readPage: 1 }),
        },
      ),
    ).rejects.toThrow();
    expect(await count(store, 'raw_chunks')).toBe(0);
    expect(await count(store, 'samples_1hz')).toBe(0);
    expect(await count(store, 'events')).toBe(0);
    expect(await store.getSyncState(device.id)).toEqual(old);
  });

  it('inserting the same samples twice inserts 0 the second time', async () => {
    const samples = [sample(device.id, 1_000), sample(device.id, 1_001), sample(device.id, 1_001, { source: 'live' })];
    expect(await store.insertSamples(samples)).toBe(3);
    expect(await store.insertSamples(samples)).toBe(0);
    expect(await count(store, 'samples_1hz')).toBe(3);
  });

  it('samplesBetween is ordered, from inclusive and to exclusive', async () => {
    await store.insertSamples([3, 1, 5, 2, 4].map((t) => sample(device.id, 1_000 + t)));
    const rows = await store.samplesBetween(device.id, 1_002, 1_005);
    expect(rows.map((r) => r.t)).toEqual([1_002, 1_003, 1_004]);
  });

  it('round-trips sample fields including rr, nulls and sources', async () => {
    const a = sample(device.id, 2_000, { rr: [], hr: null, state: null, steps: null, skinTempC: null, spo2Raw: null, motionG: null });
    const b = sample(device.id, 2_000, { source: 'hrm', rr: [1_000, 950, 1_020] });
    await store.insertSamples([a, b]);
    const rows = await store.samplesBetween(device.id, 2_000, 2_001);
    expect(rows).toEqual([a, b]);
  });

  it('sampleRange and deleteSamples', async () => {
    expect(await store.sampleRange(device.id)).toBeNull();
    await store.insertSamples([sample(device.id, 10), sample(device.id, 20), sample(device.id, 30, { source: 'live' })]);
    expect(await store.sampleRange(device.id)).toEqual({ first: 10, last: 30, count: 3 });
    await store.deleteSamples(device.id, 'live');
    expect(await store.sampleRange(device.id)).toEqual({ first: 10, last: 20, count: 2 });
    await store.deleteSamples(device.id);
    expect(await store.sampleRange(device.id)).toBeNull();
  });

  it('heartRateBuckets averages heart rate per bucket like a JS pass over samplesBetween', async () => {
    const rows: SampleRow[] = [];
    for (let t = -125; t < 3_700; t++) {
      rows.push(sample(device.id, t, { hr: t % 17 === 0 ? null : t % 23 === 0 ? 0 : 50 + ((t * 7) % 61) }));
      if (t % 5 === 0) rows.push(sample(device.id, t, { source: 'live', hr: 120 + (t % 9) }));
    }
    await store.insertSamples(rows);
    for (const bucketS of [1, 60, 300, 7]) {
      const expected = new Map<number, { sum: number; count: number }>();
      for (const s of await store.samplesBetween(device.id, -100, 3_650)) {
        if (s.hr === null || s.hr <= 0) continue;
        const key = Math.floor(s.t / bucketS) * bucketS;
        const b = expected.get(key) ?? { sum: 0, count: 0 };
        b.sum += s.hr;
        b.count += 1;
        expected.set(key, b);
      }
      const want = [...expected.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, hr: b.sum / b.count }));
      expect(await store.heartRateBuckets(device.id, -100, 3_650, bucketS)).toEqual(want);
    }
    expect(await store.heartRateBuckets(device.id, 10_000, 20_000, 60)).toEqual([]);
    await expect(store.heartRateBuckets(device.id, 0, 60, 0)).rejects.toThrow(RangeError);
    await expect(store.heartRateBuckets(device.id, 0, 60, 1.5)).rejects.toThrow(RangeError);
  });

  it('inserts a full day of samples quickly', async () => {
    const day = Array.from({ length: 86_400 }, (_, i) => sample(device.id, 100_000 + i));
    const started = performance.now();
    expect(await store.insertSamples(day)).toBe(86_400);
    const ms = performance.now() - started;
    console.log(`insert 86400 samples: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2_000);
  });

  it('a corrupted chunk blob fails its checksum with a clear error', async () => {
    const id = await store.commitChunk(
      { deviceId: device.id, endToken: null, frames: [new Uint8Array([1, 2, 3, 4])], clockOffsetS: null, receivedAt: 1 },
      [],
      { events: [], console: [], unknownFrames: 0, syncState: syncState(device.id) },
    );
    const tampered = deflateSync(new Uint8Array([4, 0, 0, 0, 1, 2, 3, 5]));
    await store.driver.run('UPDATE raw_chunks SET frames = ? WHERE id = ?', [tampered, id]);
    await expect(store.readChunkFrames(id)).rejects.toThrow(/checksum/i);
    await store.driver.run('UPDATE raw_chunks SET frames = ? WHERE id = ?', [new Uint8Array([1, 2, 3]), id]);
    await expect(store.readChunkFrames(id)).rejects.toThrow(/corrupted/i);
    await expect(store.readChunkFrames(id + 5)).rejects.toThrow(/does not exist/);
  });

  it('upsertDevice matches on bleId and keeps non-null ownerSince, serial and model', async () => {
    const again = await store.upsertDevice({ ...DEVICE, ownerSince: null, serial: null, model: null, name: 'Renamed' });
    expect(again.id).toBe(device.id);
    expect(again.ownerSince).toBe(1_000);
    expect(again.serial).toBe('SN1');
    expect(again.model).toBe('5.0');
    expect(again.name).toBe('Renamed');
    const updated = await store.upsertDevice({ ...DEVICE, ownerSince: 2_000 });
    expect(updated.ownerSince).toBe(2_000);
    expect(await store.listDevices()).toHaveLength(1);
    expect(await store.getDevice(device.id)).toEqual(updated);
    expect(await store.getDevice(999)).toBeNull();
  });

  it('sync state upserts', async () => {
    expect(await store.getSyncState(device.id)).toBeNull();
    await store.setSyncState(syncState(device.id));
    await store.setSyncState(syncState(device.id, { lastEndToken: null, readPage: null }));
    expect(await store.getSyncState(device.id)).toEqual(syncState(device.id, { lastEndToken: null, readPage: null }));
  });

  it('reads a day stored before load so far existed', async () => {
    const old = dayRecord(device.id, '2026-11-26');
    await store.replaceDay(old);
    const read = await store.getDay(device.id, '2026-11-26');
    expect(read).toEqual(old);
    expect(read?.loadSoFar).toBeUndefined();
  });

  it('round-trips load so far and valid minutes', async () => {
    const day = dayRecord(device.id, '2026-11-27', { loadSoFar: 4.6, loadValidMinutes: 482 });
    await store.replaceDay(day);
    expect(await store.getDay(device.id, '2026-11-27')).toEqual(day);
  });

  it('replaceDay stores the record, indexed columns, sleeps and workouts, and replaces them', async () => {
    await store.replaceDay(dayRecord(device.id, '2026-11-24'));
    const first = dayRecord(device.id, '2026-11-25');
    await store.replaceDay(first);
    expect(await store.getDay(device.id, '2026-11-25')).toEqual(first);
    expect(await store.getDay(device.id, '2026-01-01')).toBeNull();
    const indexed = await store.driver.all<{ readiness: number; load: number; sleep_score: number }>(
      "SELECT readiness, load, sleep_score FROM daily_metrics WHERE day = '2026-11-25'",
    );
    expect(indexed).toEqual([{ readiness: 71, load: 8.5, sleep_score: 82 }]);
    expect(await count(store, 'sleeps')).toBe(4);
    expect(await count(store, 'workouts')).toBe(2);

    const second = dayRecord(device.id, '2026-11-25', {
      readiness: derived(null),
      sleep: { ...first.sleep, periods: [], score: derived(null) },
      workouts: [],
    });
    await store.replaceDay(second);
    expect(await store.getDay(device.id, '2026-11-25')).toEqual(second);
    expect(await count(store, 'sleeps')).toBe(2);
    expect(await count(store, 'workouts')).toBe(1);
    expect(await count(store, 'daily_metrics')).toBe(2);
    const nulls = await store.driver.all<{ readiness: number | null; sleep_score: number | null }>(
      "SELECT readiness, sleep_score FROM daily_metrics WHERE day = '2026-11-25'",
    );
    expect(nulls).toEqual([{ readiness: null, sleep_score: null }]);
  });

  it('listDays is ordered and inclusive', async () => {
    for (const d of ['2026-11-23', '2026-11-21', '2026-11-22', '2026-11-24']) await store.replaceDay(dayRecord(device.id, d));
    const days = await store.listDays(device.id, '2026-11-22', '2026-11-23');
    expect(days.map((d) => d.day)).toEqual(['2026-11-22', '2026-11-23']);
  });

  it('clearDerived removes derived rows but keeps samples and raw chunks', async () => {
    await store.replaceDay(dayRecord(device.id, '2026-11-25'));
    await store.driver.run('INSERT INTO baselines (device_id, name, value) VALUES (?, ?, ?)', [device.id, 'hrv', '{}']);
    await store.replaceSleepStages(device.id, 0, 100, [{ t: 30, stage: 'deep' }]);
    await store.insertSamples([sample(device.id, 1_000)]);
    await store.commitChunk(
      { deviceId: device.id, endToken: null, frames: [new Uint8Array([1])], clockOffsetS: null, receivedAt: 1 },
      [],
      { events: [], console: [], unknownFrames: 0, syncState: syncState(device.id) },
    );
    await store.clearDerived(device.id);
    for (const t of ['daily_metrics', 'sleeps', 'workouts', 'baselines', 'sleep_stages']) expect(await count(store, t)).toBe(0);
    expect(await count(store, 'samples_1hz')).toBe(1);
    expect(await count(store, 'raw_chunks')).toBe(1);
  });

  it('replaces sleep stages only inside the given window', async () => {
    await store.replaceSleepStages(device.id, 0, 100, [{ t: 0, stage: 'wake' }, { t: 30, stage: 'light' }, { t: 120, stage: 'rem' }]);
    await store.replaceSleepStages(device.id, 100, 200, [{ t: 150, stage: 'deep' }]);
    await store.replaceSleepStages(device.id, 0, 100, [{ t: 60, stage: 'rem' }]);
    expect(await store.sleepStagesBetween(device.id, 0, 1_000)).toEqual([{ t: 60, stage: 'rem' }, { t: 150, stage: 'deep' }]);
    await store.driver.run('INSERT INTO sleep_stages (device_id, t, stage) VALUES (?, ?, ?)', [device.id, 300, 'n3']);
    expect(await store.sleepStagesBetween(device.id, 200, 1_000)).toEqual([]);
  });

  it('settings round trip', async () => {
    expect(await store.getSetting('k')).toBeNull();
    await store.setSetting('k', 'v1');
    await store.setSetting('k', 'v2');
    expect(await store.getSetting('k')).toBe('v2');
  });

  it('exportCsv quotes commas, quotes and newlines and keeps the header when empty', async () => {
    expect(await exportCsv(store, 'events')).toBe('id,device_id,t,event,name,payload_hex,chunk_id\r\n');
    await store.upsertDevice({ ...DEVICE, bleId: 'X', name: 'a,b "c"\nd', serial: null, model: null, ownerSince: null, firmware: null });
    const csv = await exportCsv(store, 'devices');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('id,ble_id,name,model,firmware,serial,owner_since,config_snapshot');
    expect(lines[1]).toBe('1,AA:BB,WHOOP 5,5.0,50.43.2.0,SN1,1000,');
    expect(csv).toContain('2,X,"a,b ""c""\nd",,,,,\r\n');
  });

  it('exportCsv covers every table, including raw chunks and exported sleeps/workouts', async () => {
    await store.replaceDay(dayRecord(device.id, '2026-11-25'));
    await store.commitChunk(
      { deviceId: device.id, endToken: new Uint8Array([0xab]), frames: [new Uint8Array([1])], clockOffsetS: null, receivedAt: 1 },
      [sample(device.id, 1_000)],
      { events: [], console: [{ deviceId: device.id, t: 1, sequence: 1, text: 'a,b' }], unknownFrames: 0, syncState: syncState(device.id) },
    );
    await store.saveSleepEdit({ id: null, deviceId: device.id, targetOnset: 100, targetOffset: 28_900, onset: 50, offset: 28_000, createdAt: 9, removed: false });
    const tables = ['devices', 'samples_1hz', 'daily_metrics', 'sleeps', 'sleep_edits', 'workouts', 'events', 'console_log', 'raw_chunks', 'body_measurements', 'lab_results', 'activities', 'cycle_periods', 'symptom_logs', 'pregnancy', 'strength_exercises', 'strength_templates', 'strength_template_items', 'strength_sessions', 'strength_session_exercises', 'strength_sets', 'journal_notes'] as const;
    for (const table of tables) {
      const csv = await exportCsv(store, table);
      expect(csv.endsWith('\r\n')).toBe(true);
    }
    expect((await exportCsv(store, 'sleeps')).split('\r\n')).toHaveLength(4);
    expect(await exportCsv(store, 'sleeps')).toContain(',detected\r\n');
    expect(await exportCsv(store, 'sleep_edits')).toBe(
      'id,device_id,target_onset,target_offset,onset,offset,created_at,removed\r\n1,1,100,28900,50,28000,9,0\r\n',
    );
    expect(await exportCsv(store, 'console_log')).toContain('"a,b"');
    expect(await exportCsv(store, 'raw_chunks')).toContain(',AB,');
    await expect(exportCsv(store, 'settings' as 'devices')).rejects.toThrow();
  });
  describe('sleep edits', () => {
    const edit = (overrides: Partial<SleepEditInput> = {}): SleepEditInput => ({
      id: null,
      deviceId: device.id,
      targetOnset: 1_000,
      targetOffset: 2_000,
      onset: 900,
      offset: 2_100,
      createdAt: 5,
      removed: false,
      ...overrides,
    });

    it('stores a removed night and can turn it back into a plain edit', async () => {
      const id = await store.saveSleepEdit(edit({ removed: true }));
      expect((await store.listSleepEdits(device.id))[0]).toMatchObject({ id, removed: true });
      await store.saveSleepEdit(edit({ id, removed: false }));
      expect((await store.listSleepEdits(device.id))[0]).toMatchObject({ id, removed: false });
      expect(await exportCsv(store, 'sleep_edits')).toContain(',0\r\n');
    });

    it('saves, updates, lists per device and deletes', async () => {
      const other = await store.upsertDevice({ ...DEVICE, bleId: 'CC:DD' });
      const first = await store.saveSleepEdit(edit());
      const nap = await store.saveSleepEdit(edit({ targetOnset: null, targetOffset: null, onset: 5_000, offset: 6_000 }));
      await store.saveSleepEdit(edit({ deviceId: other.id }));
      expect(await store.listSleepEdits(device.id)).toEqual([
        { id: first, deviceId: device.id, targetOnset: 1_000, targetOffset: 2_000, onset: 900, offset: 2_100, createdAt: 5, removed: false },
        { id: nap, deviceId: device.id, targetOnset: null, targetOffset: null, onset: 5_000, offset: 6_000, createdAt: 5, removed: false },
      ]);

      expect(await store.saveSleepEdit(edit({ id: first, onset: 950, createdAt: 6 }))).toBe(first);
      expect((await store.listSleepEdits(device.id))[0]).toMatchObject({ id: first, onset: 950, createdAt: 6 });
      await expect(store.saveSleepEdit(edit({ id: first, deviceId: other.id }))).rejects.toThrow();
      await expect(store.saveSleepEdit(edit({ id: 999 }))).rejects.toThrow();

      expect(await store.deleteSleepEdit(other.id, first)).toBe(false);
      expect(await store.deleteSleepEdit(device.id, first)).toBe(true);
      expect((await store.listSleepEdits(device.id)).map((e) => e.id)).toEqual([nap]);
      expect(await store.listSleepEdits(other.id)).toHaveLength(1);
    });

    it('the schema rejects an end before the start and a half-set target', async () => {
      await expect(store.saveSleepEdit(edit({ onset: 2_000, offset: 2_000 }))).rejects.toThrow();
      await expect(store.saveSleepEdit(edit({ targetOffset: null }))).rejects.toThrow();
      expect(await store.listSleepEdits(device.id)).toEqual([]);
    });

    it('clearDerived keeps the edits and deleteBefore drops the older ones', async () => {
      await store.saveSleepEdit(edit({ onset: 10, offset: 40 }));
      const kept = await store.saveSleepEdit(edit({ onset: 60, offset: 90 }));
      await store.clearDerived(device.id);
      expect(await store.listSleepEdits(device.id)).toHaveLength(2);
      await store.deleteBefore(device.id, 50, () => null);
      expect((await store.listSleepEdits(device.id)).map((e) => e.id)).toEqual([kept]);
    });

    it('reads a stored record written before sleep sources existed as detected sleep', async () => {
      const record = dayRecord(device.id, '2026-11-25');
      const legacy = { ...record, sleep: { ...record.sleep, periods: record.sleep.periods.map(({ onset, offset, asleepS, inBedS, nap }) => ({ onset, offset, asleepS, inBedS, nap })) } };
      await store.replaceDay(record);
      await store.driver.run('UPDATE daily_metrics SET record = ? WHERE device_id = ?', [JSON.stringify(legacy), device.id]);
      expect(await store.getDay(device.id, '2026-11-25')).toEqual(record);
    });
  });
});
