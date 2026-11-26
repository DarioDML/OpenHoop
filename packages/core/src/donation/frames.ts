import { FrameError, decodeFrame, type Packet } from '@openhoop/protocol';

import type { DeviceRow } from '../store/types';

export const REMOVAL_REASONS = [
  'identityCommand',
  'identityEvent',
  'serialText',
  'addressText',
  'knownText',
  'beforeOwner',
  'invalid',
  'duplicate',
  'untimed',
  'corruptChunk',
] as const;
export type RemovalReason = (typeof REMOVAL_REASONS)[number];
export type RemovalCounts = Record<RemovalReason, number>;

const COMMAND_PACKET = 35;
const COMMAND_RESPONSE_PACKET = 36;
const PACKET_TYPE_OFFSET = 8;
const COMMAND_OFFSET = 10;
const IDENTITY_RESPONSE_COMMANDS: ReadonlySet<number> = new Set([35, 145, 76, 77, 140, 141, 151]);
const IDENTITY_OUTGOING_COMMANDS: ReadonlySet<number> = new Set([77, 140]);
const IDENTITY_EVENTS: ReadonlySet<number> = new Set([61, 62, 109]);
const SERIAL_TEXT = /(?:5A[GM]|MGB)[0-9]{6,}/;
const ADDRESS_TEXT = /(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/;
const KNOWN_MIN_LENGTH = 6;
const TEXT_SLICE = 4_096;

export function emptyRemovalCounts(): RemovalCounts {
  const counts = {} as RemovalCounts;
  for (const reason of REMOVAL_REASONS) counts[reason] = 0;
  return counts;
}

const MAC_ADDRESS = /^[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}$/;

function addressBytes(bleId: string | undefined): string[] {
  if (bleId === undefined || !MAC_ADDRESS.test(bleId.trim())) return [];
  const bytes = bleId
    .trim()
    .split(/[:-]/)
    .map((pair) => Number.parseInt(pair, 16));
  return [String.fromCharCode(...bytes), String.fromCharCode(...[...bytes].reverse())];
}

export function knownIdentityValues(devices: readonly (Pick<DeviceRow, 'serial' | 'name'> & { bleId?: string })[]): string[] {
  const values = new Set<string>();
  for (const device of devices) {
    for (const value of [device.serial, device.name]) {
      const trimmed = value?.trim() ?? '';
      if (trimmed.length >= KNOWN_MIN_LENGTH) values.add(trimmed);
    }
    for (const bytes of addressBytes(device.bleId)) values.add(bytes);
  }
  return [...values];
}

function latin1(frame: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < frame.length; offset += TEXT_SLICE) {
    text += String.fromCharCode(...frame.subarray(offset, offset + TEXT_SLICE));
  }
  return text;
}

export function identityReason(frame: Uint8Array, packet: Packet, known: readonly string[]): RemovalReason | null {
  const packetType = frame[PACKET_TYPE_OFFSET];
  const command = frame[COMMAND_OFFSET] ?? -1;
  if (packetType === COMMAND_RESPONSE_PACKET && IDENTITY_RESPONSE_COMMANDS.has(command)) return 'identityCommand';
  if (packetType === COMMAND_PACKET && IDENTITY_OUTGOING_COMMANDS.has(command)) return 'identityCommand';
  if (packet.kind === 'event' && IDENTITY_EVENTS.has(packet.event)) return 'identityEvent';
  const text = latin1(frame);
  if (SERIAL_TEXT.test(text)) return 'serialText';
  if (ADDRESS_TEXT.test(text)) return 'addressText';
  if (known.some((value) => text.includes(value))) return 'knownText';
  return null;
}

export interface DayFrame {
  frame: Uint8Array;
  t: number;
}

export interface TimedFrame extends DayFrame {
  packet: Packet;
}

function bandTime(packet: Packet): number | null {
  return 'unixS' in packet && packet.unixS > 0 ? packet.unixS : null;
}

function decodeOrNull(frame: Uint8Array): Packet | null {
  try {
    return decodeFrame(frame);
  } catch (error) {
    if (error instanceof FrameError) return null;
    throw error;
  }
}

export function timeChunkFrames(frames: readonly Uint8Array[], removed: RemovalCounts): TimedFrame[] {
  const decoded: { frame: Uint8Array; packet: Packet; t: number | null }[] = [];
  for (const frame of frames) {
    const packet = decodeOrNull(frame);
    if (packet === null) {
      removed.invalid += 1;
      continue;
    }
    decoded.push({ frame, packet, t: bandTime(packet) });
  }
  const firstTime = decoded.find((entry) => entry.t !== null)?.t ?? null;
  if (firstTime === null) {
    removed.untimed += decoded.length;
    return [];
  }
  let previous = firstTime;
  return decoded.map((entry) => {
    if (entry.t !== null) previous = entry.t;
    return { frame: entry.frame, packet: entry.packet, t: entry.t ?? previous };
  });
}

export function frameHex(frame: Uint8Array): string {
  let hex = '';
  for (const byte of frame) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
