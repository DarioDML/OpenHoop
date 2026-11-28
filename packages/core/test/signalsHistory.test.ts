import { encodeCompactOptical, encodeImu } from '@openhoop/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { imuBetween, insertEcgRecording, insertSignals, openStore, opticalBetween, pruneRawBefore, rebuildFromRaw } from '../src/index';
import type { DeviceRow, ImuSecond, Store, SyncStateRow } from '../src/index';
import { openStrictDriver } from './strictDriver';

const T0 = 1_795_878_769;
const DEVICE: Omit<DeviceRow, 'id'> = { bleId: 'AA', name: 'MG', model: 'MG', firmware: '50.43.2.0', serial: null, ownerSince: null, configSnapshot: null };
const STILL: [number[], number[], number[]] = [new Array<number>(100).fill(0), new Array<number>(100).fill(0), new Array<number>(100).fill(4096)];

function syncState(deviceId: number): SyncStateRow {
  return { deviceId, lastEndToken: null, lastSyncAt: 1, newestSampleT: null, readPage: null, writePage: null, trimPage: null, totalPages: null };
}

async function counts(store: Store): Promise<{ imu: number; optical: number }> {
  const imu = await store.driver.all<{ n: number }>('SELECT COUNT(*) AS n FROM imu_blocks');
  const optical = await store.driver.all<{ n: number }>('SELECT COUNT(*) AS n FROM optical_bursts');
  return { imu: imu[0]?.n ?? -1, optical: optical[0]?.n ?? -1 };
}

describe('optical and motion history', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (await store.upsertDevice(DEVICE)).id;
    const frames = [
      encodeImu({ recordIndex: 1, unixS: T0, accel: STILL, gyro: STILL }),
      encodeImu({ recordIndex: 2, unixS: T0 + 1, accel: STILL, gyro: STILL }),
      encodeCompactOptical({ recordIndex: 3, unixS: T0 + 2, samples: Array.from({ length: 25 }, (_, i) => 200_000 + i) }),
    ];
    await store.commitChunk({ deviceId, endToken: null, frames, clockOffsetS: 0, receivedAt: T0 + 100 }, [], {
      events: [],
      console: [],
      unknownFrames: 0,
      syncState: syncState(deviceId),
    });
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('rebuildFromRaw backfills signals from stored chunks', async () => {
    expect(await counts(store)).toEqual({ imu: 0, optical: 0 });
    const result = await rebuildFromRaw(store, deviceId);
    expect(result.signalRange).toEqual({ from: T0, to: T0 + 2 });
    expect((await imuBetween(store.driver, deviceId, T0, T0 + 5)).map((s) => s.t)).toEqual([T0, T0 + 1]);
    expect((await opticalBetween(store.driver, deviceId, T0, T0 + 5)).map((s) => s.layout)).toEqual([26]);
  });

  it('rebuild twice leaves the same rows', async () => {
    await rebuildFromRaw(store, deviceId);
    const once = await counts(store);
    await rebuildFromRaw(store, deviceId);
    expect(await counts(store)).toEqual(once);
    expect(once).toEqual({ imu: 2, optical: 1 });
  });

  it('rebuild replaces chunk-backed signal rows decoded by an older decoder', async () => {
    const [chunkId] = await store.listChunkIds(deviceId);
    const stale: ImuSecond = { deviceId, t: T0, rateHz: 100, accel: [[1], [1], [1]], gyro: [[], [], []] };
    await insertSignals(store.driver, { imu: [stale], optical: [] }, chunkId ?? null);
    await rebuildFromRaw(store, deviceId);
    const [row] = await imuBetween(store.driver, deviceId, T0, T0);
    expect(row?.accel[2]).toHaveLength(100);
  });

  it('rebuild keeps live rows that have no raw chunk', async () => {
    const live: ImuSecond = { deviceId, t: T0 + 500, rateHz: 100, accel: STILL, gyro: STILL };
    await insertSignals(store.driver, { imu: [live], optical: [] }, null);
    await rebuildFromRaw(store, deviceId);
    expect((await imuBetween(store.driver, deviceId, T0 + 500, T0 + 500)).map((s) => s.t)).toEqual([T0 + 500]);
  });

  it('pruneRawBefore prunes live rows by time and keeps derived values', async () => {
    await rebuildFromRaw(store, deviceId);
    const live: ImuSecond = { deviceId, t: T0 + 50, rateHz: 100, accel: STILL, gyro: STILL };
    const old: ImuSecond = { ...live, t: T0 - 50 };
    await insertSignals(store.driver, { imu: [live, old], optical: [] }, null);
    const ecg = await insertEcgRecording(store.driver, deviceId, { startedAt: T0 - 60, durationMs: 30_000, samples: [1, 2], rateHz: 128, wrist: 'left' });
    await store.driver.run('UPDATE ecg_recordings SET movement_g = 0.01 WHERE id = ?', [ecg]);
    await store.driver.run("INSERT INTO strength_sessions (id, name, day, started_at) VALUES (1, 'Push', '2026-11-28', ?)", [T0 - 100]);
    await store.driver.run(
      "INSERT INTO strength_sets (id, session_id, exercise_key, exercise_name, muscle, reps, weight_kg, done_at) VALUES (1, 1, 'bench', 'Bench', 'chest', 8, 60, ?)",
      [T0 - 40],
    );
    await store.driver.run("INSERT INTO strength_set_motion (set_id, status, reps_detected, coverage, factor, algo) VALUES (1, 'readable', 8, 1, 1, 'strength.motion@1')");

    const result = await pruneRawBefore(store, deviceId, T0 + 10);
    expect(result.signals).toBe(4);
    expect((await imuBetween(store.driver, deviceId, 0, T0 + 100)).map((s) => s.t)).toEqual([T0 + 50]);
    const motion = await store.driver.all<{ n: number }>('SELECT COUNT(*) AS n FROM strength_set_motion');
    expect(motion[0]?.n).toBe(1);
    const movement = await store.driver.all<{ movement_g: number | null }>('SELECT movement_g FROM ecg_recordings WHERE id = ?', [ecg]);
    expect(movement[0]?.movement_g).toBe(0.01);
  });
});
