import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encodeEvent, encodeMetadata, encodePackInfoPayload, encodePackSocPayload, toHex } from '@openhoop/protocol';
import type { PackInfo } from '@openhoop/protocol';
import { exportCsv, latestBatteryPack, newestFrameTime, openStore, rebuildFromRaw } from '../src/index';
import type { DeviceRow, PackEventRow, Store, SyncStateRow } from '../src/index';
import { openStrictDriver } from './strictDriver';

const DEVICE: Omit<DeviceRow, 'id'> = {
  bleId: 'AA:BB:CC',
  name: 'MG',
  model: 'MG',
  firmware: '50.43.2.0',
  serial: null,
  ownerSince: null,
  configSnapshot: null,
};

const INFO: PackInfo = {
  serial: 'TESTPACK0000001',
  hwFamily: 12,
  hwVersion: 13,
  firmware: { major: 3, minor: 30, patch: 5, build: 0 },
  colourway: 1,
};

const T0 = 1_795_700_000;

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

function soc(deviceId: number, t: number, percent: number): PackEventRow {
  return { deviceId, t, event: 2, name: 'BPK_SOC', payloadHex: toHex(encodePackSocPayload(percent)) };
}

function info(deviceId: number, t: number, percent: number): PackEventRow {
  return { deviceId, t, event: 20, name: 'BPK_HW_INFORMATION', payloadHex: toHex(encodePackInfoPayload(INFO, percent)) };
}

describe('battery pack events', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (await store.upsertDevice(DEVICE)).id;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('reports nothing before the band has passed on a pack report', async () => {
    expect(await latestBatteryPack(store, deviceId)).toBeNull();
  });

  it('takes the newest charge and the newest identity from the reports that carry them', async () => {
    await store.insertPackEvents(
      [
        info(deviceId, T0, 15.6),
        soc(deviceId, T0 + 20, 22.9),
        { deviceId, t: T0 + 40, event: 2, name: 'BPK_SOC', payloadHex: '01e500' },
        { deviceId, t: T0 + 50, event: 7, name: 'UNKNOWN_7', payloadHex: '01' },
      ],
      null,
    );
    expect(await latestBatteryPack(store, deviceId)).toEqual({ socPercent: 22.9, socAt: T0 + 20, info: INFO, infoAt: T0 });
  });

  it('keeps each device to its own pack', async () => {
    const other = (await store.upsertDevice({ ...DEVICE, bleId: 'DD:EE:FF' })).id;
    await store.insertPackEvents([soc(other, T0, 50)], null);
    expect(await latestBatteryPack(store, deviceId)).toBeNull();
    expect(await latestBatteryPack(store, other)).toEqual({ socPercent: 50, socAt: T0, info: null, infoAt: null });
  });

  it('ignores a repeated report', async () => {
    await store.insertPackEvents([soc(deviceId, T0, 30)], null);
    expect(await store.insertPackEvents([soc(deviceId, T0, 30)], null)).toBe(0);
    expect(await store.listPackEvents(deviceId, 10)).toHaveLength(1);
  });

  it('rebuilds pack reports from raw chunks synced before they were decoded', async () => {
    const frames = [
      encodeMetadata({ meta: 'HISTORY_START', unixS: T0 }),
      encodeEvent({ packetType: 54, event: 2, unixS: T0 + 1, payload: encodePackSocPayload(64.7) }),
      encodeMetadata({ meta: 'HISTORY_END', unixS: T0 + 2, endToken: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8) }),
    ];
    await store.commitChunk({ deviceId, endToken: null, frames, clockOffsetS: 0, receivedAt: 1 }, [], {
      events: [],
      console: [],
      unknownFrames: 1,
      syncState: syncState(deviceId),
    });
    expect(await latestBatteryPack(store, deviceId)).toBeNull();
    await rebuildFromRaw(store, deviceId);
    await rebuildFromRaw(store, deviceId);
    expect(await store.listPackEvents(deviceId, 10)).toHaveLength(1);
    expect(await latestBatteryPack(store, deviceId)).toMatchObject({ socPercent: 64.7, socAt: T0 + 1 });
  });

  it('dates a raw chunk by its pack frames when deleting older data', () => {
    const frame = encodeEvent({ packetType: 54, event: 2, unixS: T0 + 9, payload: encodePackSocPayload(10) });
    expect(newestFrameTime([frame])).toBe(T0 + 9);
  });

  it('removes pack reports with the device recordings and with data before a date', async () => {
    await store.insertPackEvents([soc(deviceId, T0, 30), soc(deviceId, T0 + 100, 31)], null);
    await store.deleteBefore(deviceId, T0 + 50, newestFrameTime);
    expect((await store.listPackEvents(deviceId, 10)).map((e) => e.t)).toEqual([T0 + 100]);
    await store.deleteRecordings(deviceId);
    expect(await store.listPackEvents(deviceId, 10)).toEqual([]);
  });

  it('exports pack reports as their own table', async () => {
    await store.insertPackEvents([soc(deviceId, T0, 22.9)], null);
    const csv = await exportCsv(store, 'battery_pack_events');
    expect(csv.split('\r\n').slice(0, 2)).toEqual([
      'id,device_id,t,event,name,payload_hex,chunk_id',
      `1,${deviceId},${T0},2,BPK_SOC,01e50000,`,
    ]);
  });
});
