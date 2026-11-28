import { describe, expect, it } from 'vitest';
import { GATT, encodeBiometric, encodeMetadata, encodeRealtimeHr } from '@openhoop/protocol';
import { CHUNK_END_WAIT_MS, HISTORY_WAIT_MS, LINK_QUIET_MAX_MS, LINK_QUIET_MS, Session, needsLockProbe, probeLock } from '../src/index';
import type { BandScript, Emit, Outgoing } from './fakeTransport';
import { FakeTransport, VirtualClock, reply, scriptBand } from './fakeTransport';

async function band(
  script: Omit<BandScript, 'clock'>,
  clock = new VirtualClock(),
): Promise<{ transport: FakeTransport; session: Session; clock: VirtualClock }> {
  const transport = new FakeTransport();
  scriptBand(transport, { clock, ...script });
  const session = new Session(transport, { clock });
  await session.open();
  return { transport, session, clock };
}

function servesOneRecordThen(onAbort: (emit: Emit) => void): (out: Outgoing, emit: Emit) => boolean {
  return (out, emit) => {
    if (out.command === 22) {
      emit(GATT.cmdFromStrap, reply(out));
      emit(GATT.dataFromStrap, encodeBiometric({ recordIndex: 1, unixS: 1_800_000_000, heartRate: 60 }));
      emit(GATT.dataFromStrap, encodeMetadata({ meta: 'HISTORY_END', unixS: 1_800_000_000 }));
      return true;
    }
    if (out.command !== 20) return false;
    onAbort(emit);
    return true;
  };
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

  it('reports open once a chunk arrives and never acknowledges it', async () => {
    const { transport, session } = await band({
      firmware: '50.43.2.0',
      onCommand: servesOneRecordThen(() => undefined),
    });
    const result = await probeLock(session);
    expect(result).toMatchObject({ state: 'open', sawHistory: true });
    expect(result.waitedMs).toBeLessThan(8_000);
    expectSafeWire(transport);
  });

  it('lets the chunk reach its HISTORY_END before aborting, so the band does not resume a cut-off chunk', async () => {
    const clock = new VirtualClock();
    let endSentAt: number | null = null;
    const { transport, session } = await band(
      {
        firmware: '50.43.2.0',
        onCommand: (out, emit) => {
          if (out.command !== 22) return false;
          emit(GATT.cmdFromStrap, reply(out));
          emit(GATT.dataFromStrap, encodeMetadata({ meta: 'HISTORY_START', unixS: 1_800_000_000 }));
          emit(GATT.dataFromStrap, encodeBiometric({ recordIndex: 1, unixS: 1_800_000_000, heartRate: 60 }));
          clock.schedule(3_000, () => {
            endSentAt = clock.now();
            emit(GATT.dataFromStrap, encodeMetadata({ meta: 'HISTORY_END', unixS: 1_800_000_001 }));
          });
          return true;
        },
      },
      clock,
    );
    let abortAt: number | null = null;
    transport.onWrite = (out) => {
      if (out.command === 20) abortAt = clock.now();
    };
    const result = await probeLock(session);
    expect(result.state).toBe('open');
    expect(endSentAt).not.toBeNull();
    expect(abortAt).not.toBeNull();
    expect(abortAt ?? 0).toBeGreaterThanOrEqual(endSentAt ?? Infinity);
    expectSafeWire(transport);
  });

  it('aborts after 10 s when a started chunk never ends', async () => {
    const clock = new VirtualClock();
    const { transport, session } = await band(
      {
        firmware: '50.43.2.0',
        onCommand: (out, emit) => {
          if (out.command !== 22) return false;
          emit(GATT.cmdFromStrap, reply(out));
          emit(GATT.dataFromStrap, encodeMetadata({ meta: 'HISTORY_START', unixS: 1_800_000_000 }));
          return true;
        },
      },
      clock,
    );
    const result = await probeLock(session);
    expect(result.state).toBe('open');
    expect(result.waitedMs).toBeGreaterThanOrEqual(HISTORY_WAIT_MS + CHUNK_END_WAIT_MS);
    expect(result.waitedMs).toBeLessThan(HISTORY_WAIT_MS + CHUNK_END_WAIT_MS + LINK_QUIET_MAX_MS);
    expect(transport.commandsSent()).toContain(20);
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

  it('reports no-data, not locked, when a 50.43.2.0 band with nothing behind sends no realtime heart rate', async () => {
    const { transport, session } = await band({ firmware: '50.43.2.0', pagesBehind: 0 });
    const result = await probeLock(session);
    expect(result).toMatchObject({ state: 'no-data', sawRealtime: false, sawHistory: false, pagesBehind: 0 });
    expect(result.waitedMs).toBeGreaterThanOrEqual(6_000);
    expect(transport.commandsSent()).not.toContain(22);
    expectSafeWire(transport);
  });

  it('returns only after the link has been quiet for 2 s once the transfer is aborted', async () => {
    const clock = new VirtualClock();
    const tail = [0, 1, 2].map((k) => encodeBiometric({ recordIndex: 10 + k, unixS: 1_800_000_010 + k, heartRate: 60 }));
    const { transport, session } = await band(
      {
        firmware: '50.38.1.0',
        onCommand: servesOneRecordThen((emit) => {
          tail.forEach((frame, k) => clock.schedule(500 * (k + 1), () => emit(GATT.dataFromStrap, frame)));
        }),
      },
      clock,
    );
    let lastTailAt = 0;
    session.onPacket((packet) => {
      if (packet.kind === 'record' && packet.recordIndex >= 10) lastTailAt = clock.now();
    });
    const result = await probeLock(session);
    expect(result.state).toBe('open');
    expect(lastTailAt).toBeGreaterThan(0);
    expect(clock.now() - lastTailAt).toBeGreaterThanOrEqual(LINK_QUIET_MS);
    expectSafeWire(transport);
  });

  it('stops waiting for quiet after 10 s even when the band keeps talking', async () => {
    const clock = new VirtualClock();
    let talking = true;
    const { session } = await band(
      {
        firmware: '50.38.1.0',
        onCommand: servesOneRecordThen((emit) => {
          const chatter = (): void => {
            if (!talking) return;
            emit(GATT.eventsFromStrap, encodeBiometric({ recordIndex: 2, unixS: 1_800_000_001, heartRate: 60 }));
            clock.schedule(1_000, chatter);
          };
          chatter();
        }),
      },
      clock,
    );
    const result = await probeLock(session);
    talking = false;
    expect(result.state).toBe('open');
    expect(result.waitedMs).toBeGreaterThanOrEqual(LINK_QUIET_MAX_MS);
    expect(result.waitedMs).toBeLessThan(LINK_QUIET_MAX_MS + 1_000);
  });
});

describe('needsLockProbe', () => {
  it('skips the probe for a band already found open on the same firmware', () => {
    expect(needsLockProbe('open', '50.43.2.0', '50.43.2.0')).toBe(false);
  });

  it('probes again after a firmware change, since new firmware may lock the data', () => {
    expect(needsLockProbe('open', '50.43.2.0', '50.44.0.0')).toBe(true);
  });

  it('probes when the firmware before or now is unknown', () => {
    expect(needsLockProbe('open', null, '50.43.2.0')).toBe(true);
    expect(needsLockProbe('open', '50.43.2.0', null)).toBe(true);
  });

  it('probes whenever the band was not found open', () => {
    for (const state of ['locked', 'no-data', 'unknown'] as const) expect(needsLockProbe(state, '50.43.2.0', '50.43.2.0')).toBe(true);
  });
});
