import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, exportJson, openStore, pruneRawBefore, rebuildFromRaw, storageStats, wipeAllData } from '../src/index';
import type { DeviceRow, SampleRow, Store, SyncStateRow } from '../src/index';
import { openStrictDriver } from './strictDriver';
import { decodeRow, simulateDays, toFrame } from './sampleFactory';

const DEVICE: Omit<DeviceRow, 'id'> = { bleId: 'AA:BB:CC', name: 'Band', model: '5.0', firmware: '50.43.2.0', serial: 'SN1', ownerSince: null, configSnapshot: null };
const CHUNK_S = 3_600;

function syncState(deviceId: number): SyncStateRow {
  return { deviceId, lastEndToken: null, lastSyncAt: 1, newestSampleT: null, readPage: null, writePage: null, trimPage: null, totalPages: null };
}

describe('raw data retention', () => {
  let store: Store;
  let deviceId: number;
  let rows: SampleRow[];

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (await store.upsertDevice(DEVICE)).id;
    rows = simulateDays(deviceId, { days: 1 }).slice(0, 4 * CHUNK_S);
    for (let from = 0; from < rows.length; from += CHUNK_S) {
      const frames = rows.slice(from, from + CHUNK_S).map((row, i) => toFrame(row, from + i));
      const stored = frames.map((frame) => decodeRow(deviceId, frame)).filter((row): row is SampleRow => row !== null);
      await store.commitChunk({ deviceId, endToken: null, frames, clockOffsetS: 0, receivedAt: 1_000 + from }, stored, {
        events: [],
        console: [],
        unknownFrames: 0,
        syncState: syncState(deviceId),
      });
    }
  });
  afterEach(async () => {
    await store.driver.close();
  });

  const at = (index: number): number => (rows[index] as SampleRow).t;

  it('counts the raw chunks and frames and reports a database size', async () => {
    const stats = await storageStats(store.driver);
    expect(stats.rawChunks).toBe(4);
    expect(stats.rawFrames).toBe(rows.length);
    expect(stats.oldestRawAt).toBe(1_000);
    expect(stats.databaseBytes).toBeGreaterThan(0);
  });

  it('removes only chunks whose frames are all older than the cut-off, and keeps every reading', async () => {
    const before = await store.sampleRange(deviceId);
    const pruned = await pruneRawBefore(store, deviceId, at(2 * CHUNK_S + 10));
    expect(pruned).toEqual({ chunks: 2, frames: 2 * CHUNK_S, signals: 0 });
    expect(await store.listChunkIds(deviceId)).toHaveLength(2);
    expect(await store.sampleRange(deviceId)).toEqual(before);
    const [orphan] = await store.samplesBetween(deviceId, at(0), at(0) + 1);
    expect(orphan?.chunkId).toBeNull();
    expect(await pruneRawBefore(store, deviceId, at(2 * CHUNK_S + 10))).toEqual({ chunks: 0, frames: 0, signals: 0 });
  });

  it('keeps history whose raw bytes were pruned when the rest is rebuilt from raw', async () => {
    const before = await store.sampleRange(deviceId);
    await pruneRawBefore(store, deviceId, at(CHUNK_S + 5));
    const rebuilt = await rebuildFromRaw(store, deviceId);
    expect(rebuilt.chunks).toBe(3);
    expect(await store.sampleRange(deviceId)).toEqual(before);
  });

  it('keeps every reading when a surviving chunk overlaps the time of a pruned one', async () => {
    const overlap = simulateDays(deviceId, { days: 1 }).slice(0, 200);
    const fresh = await openStore(openStrictDriver());
    const id = (await fresh.upsertDevice({ ...DEVICE, bleId: 'DD:EE:FF' })).id;
    const own = overlap.map((row) => ({ ...row, deviceId: id }));
    const commit = async (from: number, to: number, received: number): Promise<void> => {
      const frames = own.slice(from, to).map((row, i) => toFrame(row, from + i));
      const stored = frames.map((frame) => decodeRow(id, frame)).filter((row): row is SampleRow => row !== null);
      await fresh.commitChunk({ deviceId: id, endToken: null, frames, clockOffsetS: 0, receivedAt: received }, stored, {
        events: [],
        console: [],
        unknownFrames: 0,
        syncState: syncState(id),
      });
    };
    await commit(0, 100, 10);
    await commit(50, 200, 20);
    const before = await fresh.sampleRange(id);
    expect(await pruneRawBefore(fresh, id, (own[150] as SampleRow).t)).toEqual({ chunks: 1, frames: 100, signals: 0 });
    await rebuildFromRaw(fresh, id);
    expect(await fresh.sampleRange(id)).toEqual(before);
    await fresh.driver.close();
  });

  it('exports a table as JSON objects with the same columns as the CSV', async () => {
    const parsed: unknown = JSON.parse(await exportJson(store, 'devices'));
    expect(parsed).toEqual([{ id: deviceId, ble_id: 'AA:BB:CC', name: 'Band', model: '5.0', firmware: '50.43.2.0', serial: 'SN1', owner_since: null, config_snapshot: null }]);
  });

  it('empties every table and keeps the schema version', async () => {
    await store.setSetting('user.data', '{"name":"A"}');
    await store.insertSamples([{ ...(rows[0] as SampleRow), source: 'live', chunkId: null }]);
    const result = await wipeAllData(store.driver);
    const tables = await store.driver.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    expect(result.tables).toBe(tables.length);
    for (const { name } of tables) {
      const [count] = await store.driver.all<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name}"`);
      expect({ name, n: count?.n }).toEqual({ name, n: 0 });
    }
    const [version] = await store.driver.all<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(SCHEMA_VERSION);
    expect(await store.listDevices()).toEqual([]);
    expect(await store.getSetting('user.data')).toBeNull();
  });
});
