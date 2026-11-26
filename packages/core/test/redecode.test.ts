import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { encodeBiometric, toHex } from '@openhoop/protocol';
import { SAMPLE_DECODER_VERSION, SAMPLE_DECODER_VERSION_KEY, openStore, rebuildStaleSamples } from '../src/index';
import type { DeviceRow, SampleRow, Store, SyncStateRow } from '../src/index';
import { openStrictDriver } from './strictDriver';
import { decodeRow, simulateDays, toFrame } from './sampleFactory';

const DEVICE: Omit<DeviceRow, 'id'> = {
  bleId: 'AA:BB:CC',
  name: 'MG',
  model: 'MG',
  firmware: '50.43.2.0',
  serial: null,
  ownerSince: null,
  configSnapshot: null,
};

function syncState(deviceId: number): SyncStateRow {
  return {
    deviceId,
    lastEndToken: null,
    lastSyncAt: 1,
    newestSampleT: null,
    readPage: null,
    writePage: null,
    trimPage: null,
    totalPages: null,
  };
}

describe('rebuildStaleSamples', () => {
  let store: Store;
  let deviceId: number;
  let rows: SampleRow[];

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (await store.upsertDevice(DEVICE)).id;
    rows = simulateDays(deviceId, { days: 1 })
      .slice(0, 20)
      .map((row) => ({ ...row, skinTempC: 7.5 }));
    await store.commitChunk(
      { deviceId, endToken: null, frames: rows.map((row, i) => toFrame(row, i)), clockOffsetS: 0, receivedAt: 1 },
      rows,
      { events: [], console: [], unknownFrames: 0, syncState: syncState(deviceId) },
    );
  });
  afterEach(async () => {
    await store.driver.close();
  });

  async function storedTemps(): Promise<(number | null)[]> {
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (first === undefined || last === undefined) throw new Error('no rows');
    return (await store.samplesBetween(deviceId, first.t, last.t + 1)).map((s) => s.skinTempC);
  }

  it('re-decodes samples stored before the current decoder version', async () => {
    expect(await rebuildStaleSamples(store)).toEqual([deviceId]);
    expect(await storedTemps()).toEqual(rows.map(() => null));
    expect(await store.getSetting(SAMPLE_DECODER_VERSION_KEY)).toBe(String(SAMPLE_DECODER_VERSION));
  });

  it('leaves samples alone once they match the current decoder version', async () => {
    await store.setSetting(SAMPLE_DECODER_VERSION_KEY, String(SAMPLE_DECODER_VERSION));
    expect(await rebuildStaleSamples(store)).toEqual([]);
    expect(await storedTemps()).toEqual(rows.map(() => 7.5));
  });

  it('treats an unreadable stored version as stale', async () => {
    await store.setSetting(SAMPLE_DECODER_VERSION_KEY, 'garbage');
    expect(await rebuildStaleSamples(store)).toEqual([deviceId]);
    expect(await storedTemps()).toEqual(rows.map(() => null));
  });

  it('skips a device without raw chunks and keeps its samples', async () => {
    const other = (await store.upsertDevice({ ...DEVICE, bleId: 'DD:EE:FF' })).id;
    const hrm: SampleRow = { ...(rows[0] as SampleRow), deviceId: other, source: 'hrm', hr: 70, rr: [], chunkId: null };
    await store.insertSamples([hrm]);
    expect(await rebuildStaleSamples(store)).toEqual([deviceId]);
    expect(await store.sampleRange(other)).toMatchObject({ count: 1 });
  });
});

describe('SAMPLE_DECODER_VERSION', () => {
  it('changes whenever the samples decoded from a frame change', () => {
    const frames = [
      ...simulateDays(1, { days: 1 })
        .filter((_, i) => i % 3_600 === 0)
        .map((row, i) => toFrame(row, i)),
      encodeBiometric({ recordIndex: 1, unixS: 1_795_700_000, packetType: 47, heartRate: 178, rrMs: [337, 340], stepCounter: 3, skinTempC: 7.6, spo2Byte82: 160, bandState: 'SLEEP', dynamicAccelG: 1.5 }),
      encodeBiometric({ recordIndex: 2, unixS: 1_795_700_001, packetType: 47, heartRate: 0, rrMs: [], stepCounter: 0, skinTempC: 33.25, spo2Byte82: 95, bandState: 'UP', dynamicAccelG: 0 }),
    ];
    const decoded = JSON.stringify(frames.map((frame) => decodeRow(1, frame)));
    expect({ version: SAMPLE_DECODER_VERSION, digest: toHex(sha256(new TextEncoder().encode(decoded))) }).toEqual({
      version: 1,
      digest: 'f13fb44a73830f563164425c6dcc4f06779d58dd6c035ff2764553970c5b0c73',
    });
  });
});
