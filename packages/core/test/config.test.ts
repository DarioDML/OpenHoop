import { describe, expect, it } from 'vitest';
import { GATT, concat, toHex } from '@openhoop/protocol';
import { DisconnectedError, Session, readKeys } from '../src/index';
import { FakeTransport, VirtualClock, reply, scriptBand } from './fakeTransport';

function ascii(text: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

const FLAGS: [number, string][] = [
  [1, 'enable_r22_packets'],
  [4, 'enable_r22_v4_packets'],
  [8, 'make_hrfm_visible'],
];

async function band(failKey: string | null): Promise<{ transport: FakeTransport; session: Session }> {
  const clock = new VirtualClock();
  const transport = new FakeTransport();
  let cursor = 0;
  scriptBand(transport, {
    clock,
    onCommand: (out, emit) => {
      if (out.command === 117) {
        emit(GATT.cmdFromStrap, reply(out, 1, Uint8Array.of(1, FLAGS.length, 0)));
        return true;
      }
      if (out.command === 118) {
        const flag = FLAGS[cursor++];
        if (flag === undefined) return false;
        emit(GATT.cmdFromStrap, reply(out, 1, concat(Uint8Array.of(1, flag[0], 1), ascii(flag[1], 32))));
        return true;
      }
      if (out.command === 128) {
        const key = String.fromCharCode(...out.args.subarray(1, 33)).replace(/\0+$/, '');
        if (key === failKey) emit(GATT.cmdFromStrap, reply(out, 3));
        else emit(GATT.cmdFromStrap, reply(out, 1, concat(Uint8Array.of(1), ascii(key.endsWith('v4_packets') ? '1' : '2', 32))));
        return true;
      }
      return false;
    },
  });
  const session = new Session(transport, { clock });
  await session.open();
  return { transport, session };
}

describe('readKeys', () => {
  it('enumerates feature flags and reads their values with read-class commands only', async () => {
    const { transport, session } = await band(null);
    const keys = await readKeys(session, 'featureFlags');
    expect(keys.map((k) => [k.index, k.key, k.valueText])).toEqual([
      [1, 'enable_r22_packets', '2'],
      [4, 'enable_r22_v4_packets', '1'],
      [8, 'make_hrfm_visible', '2'],
    ]);
    expect(keys[1]?.valueHex?.startsWith(toHex(concat(Uint8Array.of(1), ascii('1', 32))))).toBe(true);
    const valueRead = transport.writes.find((w) => w.command === 128);
    expect(valueRead?.args.subarray(0, 33)).toEqual(concat(Uint8Array.of(1), ascii('enable_r22_packets', 32)));
    expect(transport.classesSent().every((c) => c === 'read')).toBe(true);
  });

  it('survives a failing value read', async () => {
    const { session } = await band('enable_r22_v4_packets');
    const keys = await readKeys(session, 'featureFlags');
    expect(keys).toHaveLength(3);
    expect(keys[1]).toEqual({ index: 4, key: 'enable_r22_v4_packets', valueText: null, valueHex: null });
    expect(keys[2]?.valueText).toBe('2');
  });

  it('rethrows a disconnect', async () => {
    const { transport, session } = await band(null);
    transport.handler = () => queueMicrotask(() => transport.dropLink());
    await expect(readKeys(session, 'deviceConfig')).rejects.toBeInstanceOf(DisconnectedError);
  });
});
