import { FrameError, PACK_SOC_EVENT, decodeFrame, type Packet } from '@openhoop/protocol';

import { consoleSpans, type ConsolePiece, type ConsoleSpan } from '../consoleLines';
import type { DeviceRow } from '../store/types';

export const REMOVAL_REASONS = [
  'identityCommand',
  'identityEvent',
  'serialText',
  'addressText',
  'knownText',
  'consoleIdentity',
  'consolePartial',
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
const CRC_BYTES = 4;
const CONSOLE_LINE_START = /^\d+,\s/;
const CONSOLE_IDENTITY_TEXT: readonly RegExp[] = [
  new RegExp(SERIAL_TEXT.source, 'i'),
  /[A-Z]{3}[0-9][A-Z]{2}[0-9]{7}/i,
  /(?:[0-9A-F]{2}[:-]){2,}[0-9A-F]{2}/i,
  /(?:\b|0x)[0-9A-F]{12,}\b/i,
  /(?:addr(?:ess)?|mac|\b(?:uu)?id|\bs\/?n)\s*[:=]/i,
  /advertising name|name\s*[:=]/i,
  /serial/i,
  /whoop\s+\w/i,
];

export function emptyRemovalCounts(): RemovalCounts {
  const counts = {} as RemovalCounts;
  for (const reason of REMOVAL_REASONS) counts[reason] = 0;
  return counts;
}

const MAC_ADDRESS = /^[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}$/;

function addressForms(bleId: string | undefined): string[] {
  if (bleId === undefined || !MAC_ADDRESS.test(bleId.trim())) return [];
  const bytes = bleId
    .trim()
    .split(/[:-]/)
    .map((pair) => Number.parseInt(pair, 16));
  return [bytes, [...bytes].reverse()].flatMap((order) => {
    const hex = order.map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return [String.fromCharCode(...order), hex, hex.toUpperCase()];
  });
}

export function knownIdentityValues(devices: readonly (Pick<DeviceRow, 'serial' | 'name'> & { bleId?: string })[]): string[] {
  const values = new Set<string>();
  for (const device of devices) {
    for (const value of [device.serial, device.name]) {
      const trimmed = value?.trim() ?? '';
      if (trimmed.length >= KNOWN_MIN_LENGTH) values.add(trimmed);
    }
    for (const form of addressForms(device.bleId)) values.add(form);
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
  if (packet.kind === 'packEvent' && (packet.event !== PACK_SOC_EVENT || packet.pack === undefined)) return 'identityEvent';
  const text = latin1(frame);
  if (SERIAL_TEXT.test(text)) return 'serialText';
  if (ADDRESS_TEXT.test(text)) return 'addressText';
  if (known.some((value) => text.includes(value))) return 'knownText';
  return null;
}

export function duplicateKey(frame: Uint8Array, t: number): string {
  return `${t}:${frame.length}:${frameHex(frame.subarray(frame.length - CRC_BYTES))}`;
}

interface ConsoleEntry extends ConsolePiece {
  copies: TimedFrame[];
}

function spanReason(span: ConsoleSpan<ConsoleEntry>, known: readonly string[]): RemovalReason | null {
  const lower = span.text.toLowerCase();
  if (CONSOLE_IDENTITY_TEXT.some((pattern) => pattern.test(span.text)) || known.some((value) => lower.includes(value))) {
    return 'consoleIdentity';
  }
  if (span.end !== 'newline' || (!span.startSeen && !CONSOLE_LINE_START.test(span.text))) return 'consolePartial';
  return null;
}

export function consoleLineReasons(frames: readonly TimedFrame[], known: readonly string[]): Map<TimedFrame, RemovalReason> {
  const byKey = new Map<string, ConsoleEntry>();
  const stream: ConsoleEntry[] = [];
  for (const entry of frames) {
    if (entry.packet.kind !== 'console') continue;
    const key = duplicateKey(entry.frame, entry.t);
    const first = byKey.get(key);
    if (first !== undefined) {
      first.copies.push(entry);
      continue;
    }
    const piece: ConsoleEntry = { t: entry.t, sequence: entry.packet.consoleSequence, text: entry.packet.text, copies: [entry] };
    byKey.set(key, piece);
    stream.push(piece);
  }
  const lowered = known.map((value) => value.toLowerCase());
  const reasons = new Map<TimedFrame, RemovalReason>();
  for (const span of consoleSpans(stream)) {
    const reason = spanReason(span, lowered);
    if (reason === null) continue;
    for (const piece of span.fragments) {
      for (const copy of piece.copies) {
        if (reasons.get(copy) !== 'consoleIdentity') reasons.set(copy, reason);
      }
    }
  }
  return reasons;
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
