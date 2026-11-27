import { Command, configReadBody, configWriteBody, hapticPatternBody, hrProfileBody, stopHapticsBody } from '@openhoop/protocol';
import type { CommandGrant, ConfigWriteValue } from '@openhoop/protocol';
import type { KeyKind } from './config';
import { valueFromReply } from './config';
import type { Session } from './session';
import { CommandFailedError } from './session';

export const TEST_BUZZ_LOOPS = 1;
export const FIND_BAND_LOOPS = 6;
export const WARN_BUZZ_LOOPS = 2;

const WRITE = { confirmWrite: true } as const;

const WRITE_COMMANDS: Readonly<Record<KeyKind, { set: number; get: number }>> = {
  featureFlags: { set: Command.SET_FF_VALUE, get: Command.GET_FF_VALUE },
  deviceConfig: { set: Command.SET_DEVICE_CONFIG_VALUE, get: Command.GET_DEVICE_CONFIG_VALUE },
};

export async function buzz(session: Session, loops: number): Promise<void> {
  await session.send(Command.RUN_HAPTIC_PATTERN_MAVERICK, hapticPatternBody(loops), WRITE);
}

export async function stopBuzz(session: Session): Promise<void> {
  try {
    await session.send(Command.STOP_HAPTICS, stopHapticsBody(), WRITE);
  } catch (error) {
    if (!(error instanceof CommandFailedError)) throw error;
  }
}

export async function setHeartRateProfile(session: Session, on: boolean): Promise<void> {
  await session.send(Command.TOGGLE_GENERIC_HR_PROFILE, hrProfileBody(on), WRITE);
}

export function isWritableValue(value: string | null): value is ConfigWriteValue {
  return value === '1' || value === '2';
}

export function oppositeValue(value: ConfigWriteValue): ConfigWriteValue {
  return value === '1' ? '2' : '1';
}

export async function readConfigValue(session: Session, kind: KeyKind, key: string): Promise<string | null> {
  const reply = await session.send(WRITE_COMMANDS[kind].get, configReadBody(key));
  return valueFromReply(reply.body, key);
}

export class ConfigWriteError extends Error {
  constructor(
    readonly reason: 'not-writable' | 'not-applied',
    readonly before: string | null,
    readonly after: string | null,
  ) {
    super(reason === 'not-writable' ? `value ${String(before)} cannot be restored, so it is not changed` : `the band kept ${String(after)}`);
    this.name = 'ConfigWriteError';
  }
}

export interface ConfigWriteResult {
  before: ConfigWriteValue;
  after: ConfigWriteValue;
}

export function configWriteCommand(kind: KeyKind): number {
  return WRITE_COMMANDS[kind].set;
}

export async function writeConfigValue(
  session: Session,
  kind: KeyKind,
  key: string,
  value: ConfigWriteValue,
  grant: CommandGrant,
  beforeWrite?: (before: ConfigWriteValue) => Promise<void>,
): Promise<ConfigWriteResult> {
  const command = WRITE_COMMANDS[kind].set;
  const before = await readConfigValue(session, kind, key);
  if (!isWritableValue(before)) throw new ConfigWriteError('not-writable', before, null);
  if (before === value) return { before, after: value };
  await beforeWrite?.(before);
  await session.send(command, configWriteBody(key, value), grant);
  const after = await readConfigValue(session, kind, key);
  if (after !== value) throw new ConfigWriteError('not-applied', before, after);
  return { before, after };
}
