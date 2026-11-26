import { test } from 'vitest';
import { openStore } from '../src/index';
import type { DeviceRow, SampleRow, Store } from '../src/index';
import { openStrictDriver } from '../test/strictDriver';

const DAY_S = 86_400;
const START = 1_764_000_000;
const DEVICE: Omit<DeviceRow, 'id'> = {
  bleId: 'AA:BB:CC',
  name: 'WHOOP 5',
  model: '5.0',
  firmware: '50.43.2.0',
  serial: 'SN1',
  ownerSince: null,
  configSnapshot: null,
};

const store = await openStore(openStrictDriver());
const deviceId = (await store.upsertDevice(DEVICE)).id;
const rows: SampleRow[] = Array.from({ length: DAY_S }, (_, i) => ({
  deviceId,
  t: START + i,
  source: 'history',
  hr: 55 + (i % 50),
  rr: [900, 910],
  steps: 0,
  skinTempC: 33.5,
  spo2Raw: 97,
  state: 'WAKE',
  motionG: 0.01,
  chunkId: null,
}));
await store.insertSamples(rows);

async function inJs(s: Store, from: number, to: number, bucketS: number): Promise<{ t: number; hr: number }[]> {
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const sample of await s.samplesBetween(deviceId, from, to)) {
    if (sample.hr === null || sample.hr <= 0) continue;
    const key = Math.floor(sample.t / bucketS) * bucketS;
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += sample.hr;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, hr: b.sum / b.count }));
}

const RUN = { time: 2_000, warmupTime: 300 };

test('heart rate per bucket', async ({ bench }) => {
  await bench.compare(
    bench('one day, 5 min buckets, samplesBetween + JS', async () => {
      await inJs(store, START, START + DAY_S, 300);
    }),
    bench('one day, 5 min buckets, heartRateBuckets (SQL)', async () => {
      await store.heartRateBuckets(deviceId, START, START + DAY_S, 300);
    }),
    RUN,
  );
});
