import { describe, expect, it } from 'vitest';
import { GATT, encodeBiometric, encodeRealtimeHr } from '@stoop/protocol';
import { Session, probeLock } from '../src/index';
import type { BandScript } from './fakeTransport';
import { FakeTransport, VirtualClock, reply, scriptBand } from './fakeTransport';

async function band(script: Omit<BandScript, 'clock'>): Promise<{ transport: FakeTransport; session: Session }> {
  const clock = new VirtualClock();
  const transport = new FakeTransport();
  scriptBand(transport, { clock, ...script });
  const session = new Session(transport, { clock });
  await session.open();
  return { transport, session };
}

function expectSafeWire(transport: FakeTransport): void {
  expect(transport.commandsSent()).toContain(20);
  expect(transport.commandsSent()).not.toContain(23);
  for (const cls of transport.classesSent()) expect(['read', 'session']).toContain(cls);
}

describe('probeLock', () => {
  it('reports locked for 50.43.2.0 when history stays silent', async () => {
    const { transport, session } = await band({ firmware: '50.43.2.0', pagesBehind: 120 });
    const result = await probeLock(session);
    expect(result).toMatchObject({ state: 'locked', pagesBehind: 120, sawHistory: false, sawRealtime: false });
    expect(result.firmware).toEqual({ major: 50, minor: 43, patch: 2, build: 0 });
    expect(result.waitedMs).toBeGreaterThanOrEqual(8_000);
    expectSafeWire(transport);
  });

  it('reports no-data for 50.38.1.0 when history stays silent', async () => {
    const { transport, session } = await band({ firmware: '50.38.1.0', pagesBehind: 120 });
    const result = await probeLock(session);
    expect(result.state).toBe('no-data');
    expectSafeWire(transport);
  });

  it('reports open as soon as a record arrives and never acknowledges it', async () => {
    const { transport, session } = await band({
      firmware: '50.43.2.0',
      onCommand: (out, emit) => {
        if (out.command !== 22) return false;
        emit(GATT.cmdFromStrap, reply(out));
        emit(GATT.dataFromStrap, encodeBiometric({ recordIndex: 1, unixS: 1_800_000_000, heartRate: 60 }));
        return true;
      },
    });
    const result = await probeLock(session);
    expect(result).toMatchObject({ state: 'open', sawHistory: true });
    expect(result.waitedMs).toBeLessThan(8_000);
    expectSafeWire(transport);
  });

  it('uses realtime heart rate when nothing is behind', async () => {
    const { transport, session } = await band({
      firmware: '50.43.2.0',
      pagesBehind: 0,
      onCommand: (out, emit) => {
        if (out.command !== 3) return false;
        emit(GATT.cmdFromStrap, reply(out));
        if (out.args[0] === 1) emit(GATT.dataFromStrap, encodeRealtimeHr({ unixS: 1_800_000_000, heartRate: 58, rrMs: [1000] }));
        return true;
      },
    });
    const result = await probeLock(session);
    expect(result).toMatchObject({ state: 'open', sawRealtime: true, sawHistory: false, pagesBehind: 0 });
    const toggles = transport.writes.filter((w) => w.command === 3).map((w) => w.args[0]);
    expect(toggles).toEqual([1, 0]);
    expectSafeWire(transport);
  });

  it('reports locked when realtime stays silent on a locked band with nothing behind', async () => {
    const { transport, session } = await band({ firmware: '50.43.2.0', pagesBehind: 0 });
    const result = await probeLock(session);
    expect(result).toMatchObject({ state: 'locked', sawRealtime: false });
    expect(result.waitedMs).toBeGreaterThanOrEqual(6_000);
    expectSafeWire(transport);
  });
});
