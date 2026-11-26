import { describe, expect, it } from 'vitest';
import {
  ConfigWriteError,
  FIND_BAND_LOOPS,
  Session,
  buzz,
  readConfigValue,
  readKeys,
  setHeartRateProfile,
  stopBuzz,
  writeConfigValue,
} from '@openhoop/core';
import { ConfirmationRequiredError } from '@openhoop/protocol';
import { SimBand } from '../src/index';

const NOW_S = Date.UTC(2027, 0, 15, 12, 0, 0) / 1000;

async function openBand(): Promise<{ band: SimBand; session: Session }> {
  const band = new SimBand({ seed: 7, now: () => NOW_S, historyDays: 1 / 24 });
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

describe('band actions on the simulated band', () => {
  it('buzzes, stops and switches the heart rate profile with write grants only', async () => {
    const { band, session } = await openBand();
    await buzz(session, 1);
    await buzz(session, FIND_BAND_LOOPS);
    await stopBuzz(session);
    await setHeartRateProfile(session, false);
    expect(band.hapticsPlayed).toBe(2);
    expect(band.hrProfileOn).toBe(false);
    expect(band.writesReceived).toBe(4);
    expect(band.dangerousReceived).toBe(0);
    await session.close();
  });

  it('writes a flag, reads it back and restores it', async () => {
    const { band, session } = await openBand();
    const grant = { confirmDangerous: 'SET_DEVICE_CONFIG_VALUE' };
    const changed = await writeConfigValue(session, 'deviceConfig', 'whoop_live_2_hrm_devices', '1', grant);
    expect(changed).toEqual({ before: '2', after: '1' });
    expect(await readConfigValue(session, 'deviceConfig', 'whoop_live_2_hrm_devices')).toBe('1');
    const restored = await writeConfigValue(session, 'deviceConfig', 'whoop_live_2_hrm_devices', changed.before, grant);
    expect(restored).toEqual({ before: '1', after: '2' });
    const config = await readKeys(session, 'deviceConfig');
    expect(config.find((entry) => entry.key === 'whoop_live_2_hrm_devices')?.valueText).toBe('2');
    expect(band.dangerousReceived).toBe(2);
    await session.close();
  });

  it('sends nothing when the value is already set', async () => {
    const { band, session } = await openBand();
    const result = await writeConfigValue(session, 'featureFlags', 'enable_sig12', '2', { confirmDangerous: 'SET_FF_VALUE' });
    expect(result).toEqual({ before: '2', after: '2' });
    expect(band.dangerousReceived).toBe(0);
    await session.close();
  });

  it('refuses to change a value it could not restore', async () => {
    const { band, session } = await openBand();
    const flag = band.flags.find(([key]) => key === 'enable_sig12');
    if (flag === undefined) throw new Error('flag missing');
    flag[1] = '0';
    await expect(writeConfigValue(session, 'featureFlags', 'enable_sig12', '1', { confirmDangerous: 'SET_FF_VALUE' })).rejects.toBeInstanceOf(
      ConfigWriteError,
    );
    expect(band.dangerousReceived).toBe(0);
    await session.close();
  });

  it('reports a write the band did not keep', async () => {
    const { session } = await openBand();
    await expect(writeConfigValue(session, 'featureFlags', 'no_such_flag', '1', { confirmDangerous: 'SET_FF_VALUE' })).rejects.toBeInstanceOf(
      ConfigWriteError,
    );
    await session.close();
  });

  it('never writes without the typed confirmation', async () => {
    const { band, session } = await openBand();
    await expect(writeConfigValue(session, 'featureFlags', 'enable_sig12', '1', { confirmWrite: true })).rejects.toBeInstanceOf(
      ConfirmationRequiredError,
    );
    expect(band.dangerousReceived).toBe(0);
    await session.close();
  });
});
