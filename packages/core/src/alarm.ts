import {
  Command,
  alarmDisableBody,
  alarmGetBody,
  alarmRunBody,
  alarmSetBody,
  decodeAlarmReading,
  decodeAlarmStatus,
  decodeHapticsTermination,
  fromHex,
  isAlarmRejection,
  MIN_ALARM_LEAD_S,
} from '@openhoop/protocol';
import type { AlarmStatus, HapticsTermination } from '@openhoop/protocol';
import type { Session } from './session';
import { CommandFailedError } from './session';
import type { Store } from './store/types';

export const ALARM_SLOT = 1;
const READBACK_TOLERANCE_S = 1;
const WRITE = { confirmWrite: true } as const;

export const ALARM_EVENT = {
  set: 56,
  fired: 57,
  appFired: 58,
  disabled: 59,
  hapticsFired: 60,
  hapticsEnded: 100,
} as const;

export type AlarmFailure = 'clock-unknown' | 'too-soon' | 'rejected' | 'not-armed';

export class AlarmError extends Error {
  constructor(
    readonly reason: AlarmFailure,
    readonly status: AlarmStatus | null = null,
  ) {
    super(`alarm ${reason}${status === null ? '' : ` (${status})`}`);
    this.name = 'AlarmError';
  }
}

export interface AlarmReading {
  active: boolean;
  wakeAt: number;
}

function offsetOf(session: Session): number {
  const offset = session.clockOffsetS();
  if (offset === null) throw new AlarmError('clock-unknown');
  return offset;
}

async function sendWithStatus(session: Session, command: number, body: Uint8Array): Promise<AlarmStatus | null> {
  try {
    const reply = await session.send(command, body, WRITE);
    return decodeAlarmStatus(reply.body);
  } catch (error) {
    if (error instanceof CommandFailedError && error.command === command) {
      throw new AlarmError('rejected', decodeAlarmStatus(error.body));
    }
    throw error;
  }
}

export async function readAlarm(session: Session): Promise<AlarmReading | null> {
  const offset = offsetOf(session);
  const reply = await session.send(Command.GET_ALARM_TIME, alarmGetBody(ALARM_SLOT));
  const reading = decodeAlarmReading(reply.body);
  return reading === null ? null : { active: reading.active, wakeAt: reading.bandUnixS - offset };
}

export async function armAlarm(session: Session, wakeAt: number, nowS: number): Promise<AlarmReading> {
  const offset = offsetOf(session);
  if (wakeAt < nowS + MIN_ALARM_LEAD_S) throw new AlarmError('too-soon');
  const status = await sendWithStatus(session, Command.SET_ALARM_TIME, alarmSetBody(ALARM_SLOT, wakeAt + offset));
  if (isAlarmRejection(status)) throw new AlarmError('rejected', status);
  const reading = await readAlarm(session);
  if (reading === null || !reading.active || Math.abs(reading.wakeAt - wakeAt) > READBACK_TOLERANCE_S) throw new AlarmError('not-armed', status);
  return reading;
}

export async function cancelAlarm(session: Session): Promise<void> {
  await session.send(Command.DISABLE_ALARM, alarmDisableBody(ALARM_SLOT), WRITE);
}

export async function ringAlarm(session: Session): Promise<AlarmStatus | null> {
  const status = await sendWithStatus(session, Command.RUN_ALARM, alarmRunBody(ALARM_SLOT));
  if (isAlarmRejection(status)) throw new AlarmError('rejected', status);
  return status;
}

export type AlarmEventKind = 'set' | 'fired' | 'app-fired' | 'disabled' | 'haptics-fired' | 'haptics-ended';

export interface AlarmEvent {
  t: number;
  kind: AlarmEventKind;
  endedBy: HapticsTermination | null;
}

const KIND_BY_EVENT: ReadonlyMap<number, AlarmEventKind> = new Map([
  [ALARM_EVENT.set, 'set'],
  [ALARM_EVENT.fired, 'fired'],
  [ALARM_EVENT.appFired, 'app-fired'],
  [ALARM_EVENT.disabled, 'disabled'],
  [ALARM_EVENT.hapticsFired, 'haptics-fired'],
  [ALARM_EVENT.hapticsEnded, 'haptics-ended'],
]);

function payloadBytes(hex: string): Uint8Array {
  try {
    return fromHex(hex);
  } catch {
    return new Uint8Array(0);
  }
}

export async function recentAlarmEvents(store: Store, deviceId: number, limit = 20): Promise<AlarmEvent[]> {
  const numbers = [...KIND_BY_EVENT.keys()];
  const rows = await store.driver.all<{ t: number; event: number; payload_hex: string }>(
    `SELECT t, event, payload_hex FROM events WHERE device_id = ? AND event IN (${numbers.map(() => '?').join(', ')}) ORDER BY t DESC, id DESC LIMIT ?`,
    [deviceId, ...numbers, limit],
  );
  const out: AlarmEvent[] = [];
  for (const row of rows) {
    const kind = KIND_BY_EVENT.get(row.event);
    if (kind === undefined) continue;
    out.push({ t: row.t, kind, endedBy: kind === 'haptics-ended' ? decodeHapticsTermination(payloadBytes(row.payload_hex)) : null });
  }
  return out;
}
