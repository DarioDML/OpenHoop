import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStore, phaseAt, wearChanges, wornSeconds } from '../src/index';
import type { DeviceRow, EventRow, Store, SyncStateRow, WearChange } from '../src/index';
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
const ON_TO_OFF = '0101030c3c00462f02020000000000000047003a040030a54708030000002600';
const ON_TO_CONFIRMED = '010102092f024c2601023c1cb6363b0103000000100000000000030000004a00';
const CONFIRMED_AGAIN = '01020200201c4c26010238d3db3b3c000099030013005acc2905010000003100';
const BOOT_TO_OFF = '010003030500010400000000000000010101001a00000000000000009200c700';

function syncState(deviceId: number): SyncStateRow {
  return { deviceId, lastEndToken: null, lastSyncAt: 1, newestSampleT: null, readPage: null, writePage: null, trimPage: null, totalPages: null };
}

function row(t: number, event: number, payloadHex = ''): EventRow {
  return { deviceId: 1, t, event, name: `E${event}`, payloadHex };
}

describe('event queries', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (await store.upsertDevice(DEVICE)).id;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  it('lists the events of the given numbers, oldest first, and newest first with a limit', async () => {
    const events: EventRow[] = [
      { ...row(T0 + 1, 9), deviceId },
      { ...row(T0 + 2, 120, OFF_TO_ON), deviceId },
      { ...row(T0 + 3, 3, '01'), deviceId },
      { ...row(T0 + 4, 10), deviceId },
    ];
    await store.commitChunk({ deviceId, endToken: null, frames: [Uint8Array.of(1)], clockOffsetS: 0, receivedAt: 1 }, [], {
      events,
      console: [],
      unknownFrames: 0,
      syncState: syncState(deviceId),
    });
    expect((await store.eventsOf(deviceId, [9, 10, 120])).map((e) => e.event)).toEqual([9, 120, 10]);
    expect((await store.latestEventsOf(deviceId, [9, 10], 1)).map((e) => e.t)).toEqual([T0 + 4]);
    expect(await store.eventsOf(deviceId, [])).toEqual([]);
  });
});

describe('wear timeline', () => {
  it('turns wear-detect, WRIST_ON and WRIST_OFF events into on and off changes', () => {
    const changes = wearChanges([
      row(100, 120, OFF_TO_ON),
      row(100, 9),
      row(400, 120, ON_TO_OFF),
      row(500, 120, OFF_TO_ON),
      row(800, 120, ON_TO_CONFIRMED),
      row(9000, 120, CONFIRMED_AGAIN),
    ]);
    expect(changes).toEqual<WearChange[]>([
      { t: 100, phase: 'on' },
      { t: 400, phase: 'off' },
      { t: 500, phase: 'on' },
    ]);
  });

  it('ignores a wear-detect payload of the wrong length and the boot state', () => {
    expect(wearChanges([row(100, 120, '0103'), row(200, 120, BOOT_TO_OFF)])).toEqual([{ t: 200, phase: 'off' }]);
    expect(wearChanges([row(100, 120, 'zz')])).toEqual([]);
  });

  it('counts worn seconds inside a window, and only what is known', () => {
    const changes: WearChange[] = [
      { t: 100, phase: 'on' },
      { t: 400, phase: 'off' },
    ];
    expect(wornSeconds(changes, 0, 1000)).toEqual({ wornS: 300, knownS: 900 });
    expect(wornSeconds(changes, 200, 300)).toEqual({ wornS: 100, knownS: 100 });
    expect(wornSeconds(changes, 500, 700)).toEqual({ wornS: 0, knownS: 200 });
  });

  it('knows nothing about a window before the first change', () => {
    expect(wornSeconds([{ t: 100, phase: 'on' }], 0, 50)).toBeNull();
    expect(wornSeconds([], 0, 50)).toBeNull();
  });

  it('uses WRIST_ON and WRIST_OFF alone for a band without wear-detect events', () => {
    const changes = wearChanges([row(10, 9), row(70, 10), row(90, 10)]);
    expect(changes).toEqual([
      { t: 10, phase: 'on' },
      { t: 70, phase: 'off' },
    ]);
    expect(wornSeconds(changes, 0, 100)).toEqual({ wornS: 60, knownS: 90 });
  });

  it('looks up the phase at increasing times', () => {
    const lookup = phaseAt([
      { t: 100, phase: 'on' },
      { t: 400, phase: 'off' },
    ]);
    expect([50, 100, 399, 400, 1000].map(lookup)).toEqual([null, 'on', 'on', 'off', 'off']);
  });
});
