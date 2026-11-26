import { describe, expect, it } from 'vitest';
import { AlarmError, Session, armAlarm, cancelAlarm, readAlarm, ringAlarm } from '@openhoop/core';
import { SimBand } from '../src/index';

const NOW_S = Date.UTC(2027, 0, 15, 22, 0, 0) / 1000;

const bandClock = { driftS: 0 };

async function openBand(clockOffsetS = 0): Promise<{ band: SimBand; session: Session }> {
  bandClock.driftS = 0;
  const band = new SimBand({ seed: 7, now: () => NOW_S + bandClock.driftS, historyDays: 1 / 24, clockOffsetS });
  const [found] = await band.scan(1000);
  if (found === undefined) throw new Error('simulated band not found');
  await band.connect(found.id);
  await band.bond();
  const session = new Session(band, {
    clock: {
      now: () => NOW_S * 1000,
      schedule: (ms, fn) => {
        const handle = setTimeout(fn, ms);
        return () => clearTimeout(handle);
      },
    },
  });
  await session.open();
  return { band, session };
}

describe('band alarm on the simulated band', () => {
  it('arms slot 1 and reads it back in phone time', async () => {
    const { band, session } = await openBand();
    const wakeAt = NOW_S + 8 * 3600;
    expect(await armAlarm(session, wakeAt, NOW_S)).toEqual({ active: true, wakeAt });
    expect(band.alarms.get(1)).toBe(wakeAt);
    expect(await readAlarm(session)).toEqual({ active: true, wakeAt });
    await session.close();
  });

  it('converts to the band clock when it runs ahead', async () => {
    const { band, session } = await openBand(90);
    const wakeAt = NOW_S + 3600;
    expect(await armAlarm(session, wakeAt, NOW_S)).toEqual({ active: true, wakeAt });
    expect(band.alarms.get(1)).toBe(wakeAt + 90);
    await session.close();
  });

  it('refuses an alarm less than a minute away without sending it', async () => {
    const { band, session } = await openBand();
    await expect(armAlarm(session, NOW_S + 30, NOW_S)).rejects.toMatchObject({ reason: 'too-soon' });
    expect(band.writesReceived).toBe(0);
    await session.close();
  });

  it('reports the band refusing a time in the past with its reason', async () => {
    const { session } = await openBand();
    bandClock.driftS = 7200;
    const error = await armAlarm(session, NOW_S + 3600, NOW_S).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlarmError);
    expect(error).toMatchObject({ reason: 'rejected', status: 'invalid-alarm-time' });
    await session.close();
  });

  it('cancels and rings the alarm', async () => {
    const { band, session } = await openBand();
    await armAlarm(session, NOW_S + 3600, NOW_S);
    expect(await ringAlarm(session)).toBe('played-successfully');
    expect(band.alarmsRun).toBe(1);
    await cancelAlarm(session);
    expect(await readAlarm(session)).toEqual({ active: false, wakeAt: 0 });
    await session.close();
  });
});
