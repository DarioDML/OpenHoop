import { describe, expect, it } from 'vitest';
import { Session, readKeys } from '@openhoop/core';
import { SimBand } from '../src/index';

const NOW_S = Date.UTC(2027, 0, 15, 12, 0, 0) / 1000;

async function openBand(): Promise<{ band: SimBand; session: Session }> {
  const band = new SimBand({ seed: 7, now: () => NOW_S, historyDays: 1 / 24 });
  const [found] = await band.scan(1000);
  if (found === undefined) throw new Error('simulated band not found');
  await band.connect(found.id);
  await band.bond();
  const session = new Session(band, { clock: { now: () => NOW_S * 1000, schedule: (ms, fn) => {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  } } });
  await session.open();
  return { band, session };
}

describe('simulated band configuration', () => {
  it('answers a feature flag and device config read with values and never counts a write', async () => {
    const { band, session } = await openBand();
    const flags = await readKeys(session, 'featureFlags');
    const config = await readKeys(session, 'deviceConfig');
    expect(flags).toHaveLength(16);
    expect(config).toHaveLength(7);
    expect(flags.every((flag) => flag.valueText === '1' || flag.valueText === '2')).toBe(true);
    expect(flags.find((flag) => flag.key === 'enable_r22_v4_packets')?.valueText).toBe('1');
    expect(config.find((entry) => entry.key === 'enable_rfid')?.valueText).toBe('2');
    expect(band.writesReceived).toBe(0);
    expect(band.dangerousReceived).toBe(0);
    expect(band.forbiddenReceived).toBe(0);
    await session.close();
  });
});
