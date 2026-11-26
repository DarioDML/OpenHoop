import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openStore, recentAlarmEvents } from '../src/index';
import type { Store } from '../src/index';
import { openStrictDriver } from './strictDriver';

const T0 = 1_795_700_000;

describe('recentAlarmEvents', () => {
  let store: Store;
  let deviceId: number;

  beforeEach(async () => {
    store = await openStore(openStrictDriver());
    deviceId = (
      await store.upsertDevice({ bleId: 'AA', name: 'MG', model: 'MG', firmware: '50.43.2.0', serial: null, ownerSince: null, configSnapshot: null })
    ).id;
  });
  afterEach(async () => {
    await store.driver.close();
  });

  async function event(t: number, number: number, payloadHex = ''): Promise<void> {
    await store.driver.run('INSERT INTO events (device_id, t, event, name, payload_hex) VALUES (?, ?, ?, ?, ?)', [deviceId, t, number, `E${number}`, payloadHex]);
  }

  it('lists alarm events newest first and names how the buzz ended', async () => {
    await event(T0, 56);
    await event(T0 + 100, 60);
    await event(T0 + 100, 57);
    await event(T0 + 120, 100, '0102');
    await event(T0 + 130, 59);
    await event(T0 + 140, 9);
    const events = await recentAlarmEvents(store, deviceId);
    expect(events.map((e) => e.kind)).toEqual(['disabled', 'haptics-ended', 'fired', 'haptics-fired', 'set']);
    expect(events[1]).toEqual({ t: T0 + 120, kind: 'haptics-ended', endedBy: 'double-tap' });
    expect(events.every((e) => e.kind === 'haptics-ended' || e.endedBy === null)).toBe(true);
  });

  it('keeps an end event with a damaged payload without a reason', async () => {
    await event(T0, 100, 'zz');
    expect(await recentAlarmEvents(store, deviceId)).toEqual([{ t: T0, kind: 'haptics-ended', endedBy: null }]);
  });
});
