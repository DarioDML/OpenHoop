import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GYRO_INVALID, decodeFrame, encodeImu, encodeOptical } from '@openhoop/protocol';
import type { OpticalBlockInput, Packet } from '@openhoop/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emptySignals,
  imuBetween,
  insertSignals,
  openStore,
  opticalBetween,
  packImu,
  packOptical,
  pruneSignalsBefore,
  signalsFromPacket,
  unpackImu,
  unpackOptical,
} from '../src/index';
import type { ImuSecond, OpticalSecond, Store } from '../src/index';
import { openNodeDriver } from '../src/node/index';
import { MIGRATIONS } from '../src/store/migrations';
import { openStrictDriver } from './strictDriver';

const T0 = 1_795_878_769;

function axes(n: number, values: [number, number, number]): [number[], number[], number[]] {
  return [new Array<number>(n).fill(values[0]), new Array<number>(n).fill(values[1]), new Array<number>(n).fill(values[2])];
}

function imuSecond(deviceId: number, t: number): ImuSecond {
  const gyro = axes(100, [3, -2, 1]);
  gyro[0][0] = GYRO_INVALID;
  return { deviceId, t, rateHz: 100, accel: axes(100, [-263, -679, 4096]), gyro };
}

function opticalBlock(count: number, sourceA: number, driveA: number): OpticalBlockInput {
  return {
    sourceA,
    driveA,
    sourceB: 4,
    driveB: 0,
    detectorA: 3,
    rangeA: 32,
    offsetA: 0,
    detectorB: 4,
    rangeB: 32,
    offsetB: 0,
    slotA: Array.from({ length: count }, (_, i) => (i === 0 ? -524_288 : 524_287 - i)),
    slotB: Array.from({ length: count }, (_, i) => 190 + i),
  };
}

function decode(frame: Uint8Array): Packet {
  return decodeFrame(frame);
}

const NOOP_R26 =
  'aa015000010035412f1a80ad418401f0a3266aae470100c3c5050068faccfa8dfb46fc8bfd4cfebafedafe6dff56ffd5fffbff37ff6afce5f9d7f8dffa5efc98fddbfe5afe84fe15ff5cff405fb33c50080101006cb67c17';

describe('signal packing', () => {
  it('packImu/unpackImu round-trip keeps -32768', () => {
    const s = imuSecond(1, T0);
    const back = unpackImu(1, T0, packImu(s));
    expect(back).toEqual(s);
    expect(back.gyro[0][0]).toBe(GYRO_INVALID);
  });

  it('packOptical/unpackOptical round-trip keeps i32 extremes', () => {
    const s: OpticalSecond = {
      deviceId: 1,
      t: T0,
      layout: 20,
      rateHz: 25,
      blocks: [opticalBlock(25, 1, 2750), opticalBlock(0, 3, 12_750), opticalBlock(25, 2, 0)].map(({ rangeA: _a, offsetA: _b, rangeB: _c, offsetB: _d, ...rest }) => rest),
    };
    const back = unpackOptical(1, T0, packOptical(s));
    expect(back).toEqual(s);
    expect(back.blocks[0]?.slotA[0]).toBe(-524_288);
    expect(back.blocks[0]?.slotA[1]).toBe(524_286);
  });
});

describe('signalsFromPacket', () => {
  it('maps R21, R20 and R26', () => {
    const imu = signalsFromPacket(7, decode(encodeImu({ recordIndex: 1, unixS: T0, packetType: 47, accel: axes(100, [0, 0, 4096]), gyro: axes(100, [1, 2, 3]) })));
    expect(imu.imu).toHaveLength(1);
    expect(imu.imu[0]?.t).toBe(T0);
    expect(imu.imu[0]?.rateHz).toBe(100);
    expect(imu.optical).toEqual([]);

    const optical = signalsFromPacket(7, decode(encodeOptical({ recordIndex: 2, unixS: T0, packetType: 43, blocks: [opticalBlock(25, 1, 2750), opticalBlock(0, 3, 12_750)] })));
    expect(optical.optical[0]?.layout).toBe(20);
    expect(optical.optical[0]?.rateHz).toBe(25);
    expect(optical.optical[0]?.blocks[0]?.slotA).toHaveLength(25);

    const compact = signalsFromPacket(7, decode(Uint8Array.from(Buffer.from(NOOP_R26, 'hex'))));
    expect(compact.optical).toHaveLength(1);
    expect(compact.optical[0]?.layout).toBe(26);
    expect(compact.optical[0]?.rateHz).toBe(25);
    expect(compact.optical[0]?.blocks).toHaveLength(1);
    expect(compact.optical[0]?.blocks[0]?.slotA).toHaveLength(25);
    expect(compact.optical[0]?.blocks[0]?.slotB).toEqual([]);
  });

  it('ignores other packets', () => {
    expect(signalsFromPacket(7, { kind: 'unknown', packetType: 99 })).toEqual(emptySignals());
  });
});

describe('signal storage', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (await store.upsertDevice({ bleId: 'AA', name: 'MG', model: 'MG', firmware: '50.43.2.0', serial: null, ownerSince: null, configSnapshot: null })).id;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('insertSignals ignores duplicates', async () => {
    const rows = { imu: [imuSecond(deviceId, T0)], optical: [] };
    expect(await insertSignals(store.driver, rows, null)).toBe(1);
    expect(await insertSignals(store.driver, rows, null)).toBe(0);
    const stored = await imuBetween(store.driver, deviceId, T0, T0);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(imuSecond(deviceId, T0));
  });

  it('R20 and R26 at the same second both stay', async () => {
    const r20: OpticalSecond = { deviceId, t: T0, layout: 20, rateHz: 25, blocks: [] };
    const r26: OpticalSecond = { deviceId, t: T0, layout: 26, rateHz: 25, blocks: [] };
    expect(await insertSignals(store.driver, { imu: [], optical: [r20, r26] }, null)).toBe(2);
    expect((await opticalBetween(store.driver, deviceId, T0 - 1, T0 + 1)).map((s) => s.layout)).toEqual([20, 26]);
  });

  it('pruneSignalsBefore deletes by t whatever chunk_id', async () => {
    await insertSignals(store.driver, { imu: [imuSecond(deviceId, T0), imuSecond(deviceId, T0 + 10)], optical: [{ deviceId, t: T0, layout: 26, rateHz: 25, blocks: [] }] }, null);
    expect(await pruneSignalsBefore(store.driver, deviceId, T0 + 5)).toBe(2);
    expect((await imuBetween(store.driver, deviceId, 0, T0 + 100)).map((s) => s.t)).toEqual([T0 + 10]);
    expect(await opticalBetween(store.driver, deviceId, 0, T0 + 100)).toEqual([]);
  });
});

describe('migration 18', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openhoop-signals-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('V18 removes duplicate signal rows before the unique index', async () => {
    const path = join(dir, 'v17.db');
    const raw = openNodeDriver(path);
    for (let version = 1; version <= 17; version++) {
      const script = MIGRATIONS[version - 1];
      if (script === undefined) throw new Error(`missing migration ${version}`);
      await raw.exec(script);
    }
    await raw.exec('PRAGMA user_version = 17');
    await raw.run("INSERT INTO devices (ble_id, name, model) VALUES ('AA', 'MG', 'MG')");
    for (let i = 0; i < 2; i++) await raw.run('INSERT INTO imu_blocks (device_id, t, data) VALUES (1, 100, ?)', [new Uint8Array([1])]);
    await raw.close();
    const migrated = await openStore(openNodeDriver(path));
    const rows = await migrated.driver.all<{ n: number }>('SELECT COUNT(*) AS n FROM imu_blocks');
    expect(rows[0]?.n).toBe(1);
    const columns = await migrated.driver.all<{ name: string }>('PRAGMA table_info(ecg_recordings)');
    expect(columns.map((c) => c.name)).toContain('movement_g');
    await migrated.driver.close();
  });
});
