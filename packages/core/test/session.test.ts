import { describe, expect, it, vi } from 'vitest';
import { ConfirmationRequiredError, ForbiddenCommandError, GATT, encodeBiometric, toHex, wrapFrame } from '@stoop/protocol';
import type { Packet } from '@stoop/protocol';
import type * as Protocol from '@stoop/protocol';
import { CommandFailedError, CommandTimeoutError, DisconnectedError, Session, readDeviceInformation } from '../src/index';
import { FakeTransport, VirtualClock, reply, scriptBand } from './fakeTransport';

const UNDECODABLE_TYPE = 0x77;

vi.mock('@stoop/protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof Protocol>();
  return {
    ...actual,
    decodeFrame: (raw: Uint8Array): Packet => {
      if (raw[8] === UNDECODABLE_TYPE) throw new RangeError('read past the end of the body');
      return actual.decodeFrame(raw);
    },
  };
});

function setup(opts: { helloUnixS?: number; firmware?: string } = {}): {
  transport: FakeTransport;
  clock: VirtualClock;
  session: Session;
} {
  const clock = new VirtualClock();
  const transport = new FakeTransport();
  scriptBand(transport, { clock, ...opts });
  return { transport, clock, session: new Session(transport, { clock }) };
}

describe('Session', () => {
  it('round-trips hello, data range and battery', async () => {
    const { transport, session } = setup({ firmware: '50.38.1.0' });
    const hello = await session.open();
    const first = transport.writes[0];
    expect(first && toHex(first.frame)).toBe('aa0108000001e67123019101363e5c8d');
    expect(hello.firmware).toEqual({ major: 50, minor: 38, patch: 1, build: 0 });
    expect(hello.batteryPercent).toBe(77.5);
    const range = await session.dataRange();
    expect(range.pagesBehind).toBe(40);
    expect(await session.battery()).toBe(64);
    expect(transport.writes.map((w) => w.sequence)).toEqual([1, 2, 3]);
    expect(transport.classesSent().every((c) => c === 'read' || c === 'session')).toBe(true);
  });

  it('resolves a PENDING then SUCCESS pair once with the final response', async () => {
    const { transport, session } = setup();
    await session.open();
    let resolved = 0;
    const range = await session.dataRange().then((r) => {
      resolved += 1;
      return r;
    });
    expect(resolved).toBe(1);
    expect(range.writePage).toBe(1_040);
    expect(transport.commandsSent()).toEqual([145, 34]);
  });

  it('throws CommandTimeoutError when no response arrives', async () => {
    const { transport, clock, session } = setup();
    await session.open();
    const before = clock.now();
    const original = transport.handler;
    transport.handler = (out, emit) => {
      if (out.command !== 26) original(out, emit);
    };
    await expect(session.battery()).rejects.toBeInstanceOf(CommandTimeoutError);
    expect(clock.now() - before).toBe(5_000);
  });

  it('throws CommandFailedError on result 0 and 3', async () => {
    const { transport, session } = setup();
    await session.open();
    for (const result of [0, 3]) {
      transport.handler = (out, emit) => emit(GATT.cmdFromStrap, reply(out, result));
      await expect(session.battery()).rejects.toBeInstanceOf(CommandFailedError);
    }
  });

  it('reports a sentinel clock as null and a 3-hour offset as 10800', async () => {
    const sentinel = setup({ helloUnixS: 0 });
    await sentinel.session.open();
    expect(sentinel.session.clockOffsetS()).toBeNull();

    const clock = new VirtualClock();
    const transport = new FakeTransport();
    scriptBand(transport, { clock, helloUnixS: Math.floor(clock.now() / 1000) + 10_800 });
    const session = new Session(transport, { clock });
    await session.open();
    expect(session.clockOffsetS()).toBe(10_800);
  });

  it('rejects every pending send with DisconnectedError when the link drops', async () => {
    const { transport, session } = setup();
    await session.open();
    transport.handler = () => undefined;
    const a = session.battery();
    const b = session.dataRange();
    await Promise.resolve();
    transport.dropLink();
    await expect(a).rejects.toBeInstanceOf(DisconnectedError);
    await expect(b).rejects.toBeInstanceOf(DisconnectedError);
    await expect(session.battery()).rejects.toBeInstanceOf(DisconnectedError);
  });

  it('counts discarded bytes and undecodable frames as integrity errors and still delivers the frame raw', async () => {
    const { transport, session } = setup();
    await session.open();
    expect(session.integrityErrors).toBe(0);
    const received: Packet[] = [];
    session.onPacket((packet) => received.push(packet));

    const good = encodeBiometric({ recordIndex: 1, unixS: 1_800_000_000, heartRate: 60 });
    transport.notify(GATT.dataFromStrap, good.subarray(0, 10));
    transport.notify(GATT.dataFromStrap, good.subarray(10));
    expect(session.integrityErrors).toBe(0);

    const broken = good.slice();
    broken[broken.length - 1] = (broken[broken.length - 1] ?? 0) ^ 0xff;
    transport.notify(GATT.eventsFromStrap, broken);
    expect(session.integrityErrors).toBe(broken.length);

    const undecodable = wrapFrame(Uint8Array.of(UNDECODABLE_TYPE, 1, 2, 3));
    transport.notify(GATT.dataFromStrap, undecodable);
    expect(session.integrityErrors).toBe(broken.length + 1);
    expect(received.map((p) => p.kind)).toEqual(['record', 'unknown']);
    expect(received[1]).toEqual({ kind: 'unknown', packetType: UNDECODABLE_TYPE });
  });

  it('never builds a forbidden, write or dangerous frame without its grant', async () => {
    const { transport, session } = setup();
    await session.open();
    const sent = transport.writes.length;
    expect(() => session.send(156)).toThrow(ForbiddenCommandError);
    expect(() => session.send(146)).toThrow(ConfirmationRequiredError);
    expect(() => session.send(29)).toThrow(ConfirmationRequiredError);
    expect(transport.writes.length).toBe(sent);
  });
});

describe('readDeviceInformation', () => {
  it('reads each characteristic independently and returns null for failures', async () => {
    const transport = new FakeTransport();
    const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
    transport.reads.set(`${GATT.deviceInformationService}/${GATT.firmwareRevision}`, ascii('50.38.1.0\0'));
    transport.reads.set(`${GATT.deviceInformationService}/${GATT.serialNumber}`, new Error('gatt error'));
    transport.reads.set(`${GATT.deviceInformationService}/${GATT.modelNumber}`, ascii('WHOOP 5.0'));
    transport.reads.set(`${GATT.batteryService}/${GATT.batteryLevel}`, Uint8Array.of(81));
    expect(await readDeviceInformation(transport)).toEqual({
      firmware: '50.38.1.0',
      serial: null,
      model: 'WHOOP 5.0',
      battery: 81,
    });
  });
});
