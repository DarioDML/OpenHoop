import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GATT } from '@stoop/protocol';
import { openStore, recordHeartRate } from '../src/index';
import type { SampleRow, Store } from '../src/index';
import { openNodeDriver } from '../src/node/index';
import { FakeTransport, VirtualClock } from './fakeTransport';

function hrm(heartRate: number, rrRaw: number[]): Uint8Array {
  const out = new Uint8Array(2 + rrRaw.length * 2);
  out[0] = rrRaw.length > 0 ? 0x10 : 0;
  out[1] = heartRate;
  const view = new DataView(out.buffer);
  rrRaw.forEach((rr, k) => view.setUint16(2 + 2 * k, rr, true));
  return out;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};

let store: Store;
let deviceId: number;

beforeEach(async () => {
  store = await openStore(openNodeDriver(':memory:'));
  const device = await store.upsertDevice({
    bleId: 'AA:CC',
    name: null,
    model: null,
    firmware: null,
    serial: null,
    ownerSince: null,
    configSnapshot: null,
  });
  deviceId = device.id;
});

afterEach(async () => {
  await store.driver.close();
});

describe('recordHeartRate', () => {
  it('writes one hrm row per second in batches and flushes on abort', async () => {
    const clock = new VirtualClock(1_800_000_000_000, true);
    const transport = new FakeTransport();
    const controller = new AbortController();
    const batches: number[] = [];
    const original = store.insertSamples.bind(store);
    store.insertSamples = async (rows: SampleRow[]) => {
      batches.push(rows.length);
      return original(rows);
    };
    const beats: number[] = [];
    const running = recordHeartRate(transport, store, {
      deviceId,
      signal: controller.signal,
      clock,
      onBeat: (hr) => beats.push(hr),
    });
    await flush();
    const notify = (hr: number, rr: number[]): void => transport.notify(GATT.heartRateMeasurement, hrm(hr, rr));

    notify(60, [1000]);
    clock.advance(400);
    notify(62, [980]);
    clock.advance(700);
    notify(64, []);
    for (let s = 0; s < 12; s++) {
      clock.advance(1_000);
      notify(70 + s, [850]);
    }
    await flush();
    expect(batches.length).toBeGreaterThanOrEqual(1);
    expect(batches.every((n) => n <= 11)).toBe(true);

    clock.advance(300);
    controller.abort();
    expect(await running).toEqual({ seconds: 14 });
    expect(transport.writes).toHaveLength(0);

    const rows = await store.samplesBetween(deviceId, 0, 2_000_000_000);
    expect(rows).toHaveLength(14);
    expect(rows.every((r) => r.source === 'hrm')).toBe(true);
    const first = rows[0];
    expect(first?.t).toBe(1_800_000_000);
    expect(first?.hr).toBe(62);
    expect(first?.rr).toEqual([1000, 980]);
    expect(rows[1]?.hr).toBe(64);
    expect(rows.at(-1)?.hr).toBe(81);
    expect(beats).toHaveLength(15);
  });

  it('returns at once when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await recordHeartRate(new FakeTransport(), store, { deviceId, signal: controller.signal });
    expect(result).toEqual({ seconds: 0 });
  });
});
