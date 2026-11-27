import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chargeStartTimes, chargeStartsSince, latestBandStatus, openStore } from '../src/index';
import type { DeviceRow, EventRow, Store, SyncStateRow } from '../src/index';
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

const T0 = 1_795_700_000;
const OFF_TO_ON = '01030118ffff462f0002288bfc663d00050b003a040000000000010000000000';
const ON_TO_CONFIRMED = '010102092f024c2601023c1cb6363b0103000000100000000000030000004a00';
const CONFIRMED_AGAIN = '01020200201c4c26010238d3db3b3c000099030013005acc2905010000003100';
const FAKE_ID = `${'35414d39393939393939'}0102030405060708`;
const BOOT_INFO = `02${FAKE_ID}0101${'00'.repeat(5)}322b02${'00'.repeat(4)}0c00069f140000`;
const BOOT_COUNT = `02${FAKE_ID}011f00000031030000`;

function syncState(deviceId: number): SyncStateRow {
  return { deviceId, lastEndToken: null, lastSyncAt: 1, newestSampleT: null, readPage: null, writePage: null, trimPage: null, totalPages: null };
}

describe('latestBandStatus', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (await store.upsertDevice(DEVICE)).id;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  async function events(list: { t: number; event: number; payloadHex?: string }[]): Promise<void> {
    const rows: EventRow[] = list.map((e) => ({ deviceId, t: e.t, event: e.event, name: `E${e.event}`, payloadHex: e.payloadHex ?? '' }));
    await store.commitChunk({ deviceId, endToken: null, frames: [Uint8Array.of(list.length)], clockOffsetS: 0, receivedAt: 1 }, [], {
      events: rows,
      console: [],
      unknownFrames: 0,
      syncState: syncState(deviceId),
    });
  }

  it('reports nothing it has not seen', async () => {
    expect(await latestBandStatus(store, deviceId)).toEqual({
      wear: null,
      charging: null,
      boot: { lastBootAt: null, bootCount: null, rebootReason: null, signalProcessingVersion: null },
    });
  });

  it('reports the newest wear change and when the phase began, not the latest repeat', async () => {
    await events([
      { t: T0, event: 10 },
      { t: T0 + 100, event: 120, payloadHex: OFF_TO_ON },
      { t: T0 + 700, event: 120, payloadHex: ON_TO_CONFIRMED },
      { t: T0 + 7_900, event: 120, payloadHex: CONFIRMED_AGAIN },
    ]);
    expect((await latestBandStatus(store, deviceId)).wear).toEqual({ phase: 'on', since: T0 + 100 });
  });

  it('reports charging from the newest charger event, CHARGING_OFF included', async () => {
    await events([
      { t: T0, event: 7 },
      { t: T0 + 1, event: 117, payloadHex: '01020000' },
      { t: T0 + 600, event: 110, payloadHex: '0101010200030000' },
    ]);
    expect((await latestBandStatus(store, deviceId)).charging).toEqual({ charging: true, at: T0 + 600 });
    await events([{ t: T0 + 900, event: 8 }]);
    expect((await latestBandStatus(store, deviceId)).charging).toEqual({ charging: false, at: T0 + 900 });
  });

  it('skips a charger event it cannot read', async () => {
    await events([
      { t: T0, event: 8 },
      { t: T0 + 5, event: 117, payloadHex: '0102' },
    ]);
    expect((await latestBandStatus(store, deviceId)).charging).toEqual({ charging: false, at: T0 });
  });

  it('reports the last boot with its count, reason and signal processing version', async () => {
    await events([
      { t: T0, event: 15 },
      { t: T0 + 2, event: 112, payloadHex: '017003010754017b110f0ec6011000ad37c8ce00' },
      { t: T0 + 3, event: 61, payloadHex: BOOT_INFO },
      { t: T0 + 3, event: 62, payloadHex: BOOT_COUNT },
    ]);
    expect((await latestBandStatus(store, deviceId)).boot).toEqual({
      lastBootAt: T0,
      bootCount: 31,
      rebootReason: 0x1001,
      signalProcessingVersion: '12.0.6',
    });
  });

  it('counts one charge each time charging starts, and only from a given time', async () => {
    await events([
      { t: T0, event: 7 },
      { t: T0 + 600, event: 110, payloadHex: '0101010200030000' },
      { t: T0 + 1_200, event: 8 },
      { t: T0 + 90_000, event: 7 },
      { t: T0 + 95_000, event: 8 },
      { t: T0 + 95_100, event: 8 },
    ]);
    expect(await chargeStartsSince(store, deviceId, 0)).toEqual([T0, T0 + 90_000]);
    expect(await chargeStartsSince(store, deviceId, T0 + 1)).toEqual([T0 + 90_000]);
    expect(chargeStartTimes([])).toEqual([]);
  });

  it('does not count a charge start when the first report it sees is already charging', async () => {
    await events([
      { t: T0, event: 110, payloadHex: '0101010200030000' },
      { t: T0 + 1_200, event: 8 },
      { t: T0 + 5_000, event: 110, payloadHex: '0101010200030000' },
    ]);
    expect(await chargeStartsSince(store, deviceId, 0)).toEqual([T0 + 5_000]);
  });
});
