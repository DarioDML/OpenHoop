import { test } from 'vitest';
import type { Profile } from '@openhoop/analytics';
import { openStore, recomputeDays } from '../src/index';
import type { DeviceRow, SampleRow } from '../src/index';
import { openStrictDriver } from '../test/strictDriver';
import { TZ_S, simulateDays } from '../test/sampleFactory';

const PROFILE: Profile = { maxHr: 190, birthYear: null, restingHr: null };
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
const rows: SampleRow[] = simulateDays(deviceId, { days: 3, workoutDays: [1] });
await store.insertSamples(rows);
const first = rows[0];
const last = rows[rows.length - 1];
if (first === undefined || last === undefined) throw new Error('no rows');

test('pipeline', async ({ bench }) => {
  await bench('recomputeDays, 3 simulated days', async () => {
    await recomputeDays(store, { deviceId, from: first.t, to: last.t + 1, profile: PROFILE, tzOffsetS: TZ_S });
  }).run({ time: 0, iterations: 10, warmupTime: 0, warmupIterations: 2 });
});
