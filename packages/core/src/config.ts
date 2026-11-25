import { Command, concat, toHex } from '@stoop/protocol';
import { printableAscii } from './deviceInfo';
import type { Session } from './session';
import { DisconnectedError } from './session';

export type KeyKind = 'featureFlags' | 'deviceConfig';

export interface ConfigKey {
  index: number;
  key: string;
  valueText: string | null;
  valueHex: string | null;
}

const COMMANDS: Readonly<Record<KeyKind, { start: number; next: number; get: number }>> = {
  featureFlags: { start: Command.START_FF_KEY_EXCHANGE, next: Command.SEND_NEXT_FF, get: Command.GET_FF_VALUE },
  deviceConfig: {
    start: Command.START_DEVICE_CONFIG_KEY_EXCHANGE,
    next: Command.SEND_NEXT_DEVICE_CONFIG,
    get: Command.GET_DEVICE_CONFIG_VALUE,
  },
};

const KEY_FIELD = 32;
const MAX_KEYS = 256;
const REVISION = Uint8Array.of(1);

function keyField(key: string): Uint8Array {
  const out = new Uint8Array(KEY_FIELD);
  for (let i = 0; i < key.length && i < KEY_FIELD; i++) out[i] = key.charCodeAt(i);
  return out;
}

function rethrowDisconnect(error: unknown): void {
  if (error instanceof DisconnectedError) throw error;
}

export async function readKeys(session: Session, kind: KeyKind): Promise<ConfigKey[]> {
  const commands = COMMANDS[kind];
  const start = await session.send(commands.start, REVISION);
  if (start.body.length < 3) return [];
  const count = Math.min(new DataView(start.body.buffer, start.body.byteOffset, start.body.byteLength).getUint16(1, true), MAX_KEYS);

  const keys: { index: number; key: string }[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const next = await session.send(commands.next, REVISION);
      const index = next.body[1];
      const valid = next.body[2];
      const key = printableAscii(next.body.subarray(3));
      if (index === undefined || valid === 0 || key === null || key.length > KEY_FIELD) continue;
      keys.push({ index, key });
    } catch (error) {
      rethrowDisconnect(error);
    }
  }

  const out: ConfigKey[] = [];
  for (const { index, key } of keys) {
    // The value reply shape [rev][value, NUL-padded ASCII] is a guess not yet seen on a band: keep the raw hex.
    try {
      const reply = await session.send(commands.get, concat(REVISION, keyField(key)));
      out.push({ index, key, valueText: printableAscii(reply.body.subarray(1)), valueHex: toHex(reply.body) });
    } catch (error) {
      rethrowDisconnect(error);
      out.push({ index, key, valueText: null, valueHex: null });
    }
  }
  return out;
}
