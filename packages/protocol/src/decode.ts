import { ByteReader, attempt } from './bytes';
import { commandName } from './commands';
import type { FirmwareVersion } from './firmware';
import { validateFrame } from './framing';
import type { EventDetail } from './bandEvents';
import { decodeEventDetail } from './bandEvents';
import type { PackReading } from './batteryPack';
import { decodePackPayload } from './batteryPack';
import type { RecordBody } from './records';
import { decodeRecord, rrList } from './records';
import type { FieldIndex } from './schema';
import { readValue, schema, spec } from './schema';

export interface HelloInfo {
  revision: number;
  batteryPercent: number;
  unixS: number;
  firmware: FirmwareVersion;
}

export interface DataRange {
  readPage: number;
  writePage: number;
  trimPage: number;
  writeWrap: number;
  totalPages: number;
  pagesBehind: number | null;
  newestUnix: number | null;
}

export type Packet =
  | {
      kind: 'commandResponse';
      sequence: number;
      command: number;
      commandName: string;
      originSequence: number;
      result: number;
      resultName: string;
      body: Uint8Array;
      hello?: HelloInfo;
      dataRange?: DataRange;
      clockUnixS?: number;
      batteryPercent?: number;
    }
  | { kind: 'realtimeHr'; unixS: number; heartRate: number; rrMs: number[] }
  | {
      kind: 'event';
      event: number;
      eventName: string;
      unixS: number;
      payload: Uint8Array;
      battery?: { socPercent: number; millivolts: number };
      detail?: EventDetail;
    }
  | {
      kind: 'packEvent';
      event: number;
      eventName: string;
      unixS: number;
      payload: Uint8Array;
      pack?: PackReading;
    }
  | { kind: 'console'; consoleSequence: number; unixS: number; text: string }
  | {
      kind: 'metadata';
      metaName: 'HISTORY_START' | 'HISTORY_END' | 'HISTORY_COMPLETE' | string;
      unixS: number;
      endToken?: Uint8Array;
    }
  | {
      kind: 'record';
      packetType: 43 | 47;
      layout: number;
      recordIndex: number;
      unixS: number;
      subsec: number;
      record: RecordBody;
    }
  | { kind: 'unknown'; packetType: number };

const SENTINEL_CLOCKS: readonly number[] = [0, 0xffffffff];
const RT_RR_LIMIT = 64;
const SUCCESS = 1;

function latin1(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

function unknownPacket(packetType: number): Packet {
  return { kind: 'unknown', packetType };
}

function numberOr(r: ByteReader, index: FieldIndex, name: string, fallback: number): number {
  return attempt(() => readValue(r, spec(index, name))) ?? fallback;
}

function pagesBehind(write: number, trim: number, total: number): number | null {
  if (total === 0 || write >= total || trim >= total) return null;
  return write >= trim ? write - trim : total - trim + write;
}

function decodeDataRange(body: Uint8Array): DataRange | undefined {
  if (body.length < schema.dataRange.bodyLength) return undefined;
  const r = new ByteReader(body);
  const f = schema.dataRange.fields;
  const get = (name: string): number => r.u32(spec(f, name).offset ?? 0);
  const writePage = get('write_page');
  const trimPage = get('trim_page');
  const totalPages = get('total_pages');
  const newest = get('newest_clock_s');
  return {
    readPage: get('read_page'),
    writePage,
    trimPage,
    writeWrap: get('write_wrap'),
    totalPages,
    pagesBehind: pagesBehind(writePage, trimPage, totalPages),
    newestUnix: SENTINEL_CLOCKS.includes(newest) ? null : newest,
  };
}

function decodeHello(body: Uint8Array): HelloInfo | undefined {
  const r = new ByteReader(body);
  const f = schema.hello;
  const read = (name: string): number | null => attempt(() => readValue(r, spec(f, name)));
  const revision = read('revision');
  const tenths = read('battery_tenths');
  const unixS = read('unix_s');
  const major = read('fw_major');
  const minor = read('fw_minor');
  const patch = read('fw_patch');
  const build = read('fw_build');
  if (
    revision === null ||
    tenths === null ||
    unixS === null ||
    major === null ||
    minor === null ||
    patch === null ||
    build === null
  ) {
    return undefined;
  }
  return { revision, batteryPercent: tenths / 10, unixS, firmware: { major, minor, patch, build } };
}

function decodeCommandResponse(r: ByteReader): Packet {
  const f = schema.commandResponse.fields;
  const read = (name: string): number | null => attempt(() => readValue(r, spec(f, name)));
  const sequence = read('sequence');
  const command = read('command');
  const originSequence = read('origin_sequence');
  const result = read('result');
  if (sequence === null || command === null || originSequence === null || result === null) {
    return unknownPacket(36);
  }
  const bodyOffset = schema.commandResponse.bodyOffset;
  const body = r.length > bodyOffset ? r.bytes(bodyOffset, r.length - bodyOffset) : new Uint8Array(0);
  const packet: Extract<Packet, { kind: 'commandResponse' }> = {
    kind: 'commandResponse',
    sequence,
    command,
    commandName: commandName(command),
    originSequence,
    result,
    resultName: schema.resultCodes.get(result) ?? `UNKNOWN_${result}`,
    body,
  };
  if (result !== SUCCESS) return packet;
  const bodyReader = new ByteReader(body);
  switch (commandName(command)) {
    case 'GET_HELLO': {
      const hello = decodeHello(body);
      if (hello) packet.hello = hello;
      break;
    }
    case 'GET_DATA_RANGE': {
      const range = decodeDataRange(body);
      if (range) packet.dataRange = range;
      break;
    }
    case 'GET_CLOCK': {
      const v = attempt(() => readValue(bodyReader, spec(schema.clock, 'unix_s')));
      if (v !== null) packet.clockUnixS = v;
      break;
    }
    case 'GET_CLOCK_DEPRECATED': {
      const v = attempt(() => readValue(bodyReader, spec(schema.clockDeprecated, 'unix_s')));
      if (v !== null) packet.clockUnixS = v;
      break;
    }
    case 'GET_BATTERY_LEVEL': {
      const v = attempt(() => readValue(bodyReader, spec(schema.batteryLevel, 'percent')));
      if (v !== null) packet.batteryPercent = v;
      break;
    }
    default:
      break;
  }
  return packet;
}

function decodeRealtime(r: ByteReader): Packet {
  const f = schema.realtime.fields;
  const unixS = attempt(() => readValue(r, spec(f, 'unix_s')));
  const heartRate = attempt(() => readValue(r, spec(f, 'heart_rate')));
  const count = attempt(() => readValue(r, spec(f, 'rr_count')));
  if (unixS === null || heartRate === null || count === null) return unknownPacket(40);
  return { kind: 'realtimeHr', unixS, heartRate, rrMs: rrList(r, schema.realtime.rrOffset, count, RT_RR_LIMIT) };
}

function sliceEnvelopePayload(r: ByteReader, offset: number, length: number | null): Uint8Array {
  if (length === null || offset >= r.length) return new Uint8Array(0);
  return r.bytes(offset, Math.min(offset + length, r.length) - offset);
}

function readEventEnvelope(r: ByteReader): { event: number; unixS: number; payload: Uint8Array } | null {
  const f = schema.event.fields;
  const event = attempt(() => readValue(r, spec(f, 'event')));
  if (event === null) return null;
  const payload = sliceEnvelopePayload(
    r,
    schema.event.payloadOffset,
    attempt(() => readValue(r, spec(f, 'payload_length'))),
  );
  return { event, unixS: numberOr(r, f, 'unix_s', 0), payload };
}

function decodePackEvent(r: ByteReader): Packet {
  const envelope = readEventEnvelope(r);
  if (envelope === null) return unknownPacket(54);
  const { event, unixS, payload } = envelope;
  const packet: Extract<Packet, { kind: 'packEvent' }> = {
    kind: 'packEvent',
    event,
    eventName: schema.pack.events.get(event) ?? `UNKNOWN_${event}`,
    unixS,
    payload,
  };
  const pack = decodePackPayload(event, payload);
  if (pack !== null) packet.pack = pack;
  return packet;
}

function decodeEvent(r: ByteReader): Packet {
  const envelope = readEventEnvelope(r);
  if (envelope === null) return unknownPacket(48);
  const { event, unixS, payload } = envelope;
  const packet: Extract<Packet, { kind: 'event' }> = {
    kind: 'event',
    event,
    eventName: schema.events.get(event) ?? schema.bandEvents.ownNames.get(event) ?? `UNKNOWN_${event}`,
    unixS,
    payload,
  };
  const detail = decodeEventDetail(event, payload);
  if (detail !== null) packet.detail = detail;
  if (event === 3) {
    const pr = new ByteReader(payload);
    const soc = attempt(() => readValue(pr, spec(schema.event.battery, 'soc_percent')));
    const mv = attempt(() => readValue(pr, spec(schema.event.battery, 'millivolts')));
    if (soc !== null && mv !== null) packet.battery = { socPercent: soc, millivolts: mv };
  }
  return packet;
}

function decodeConsole(r: ByteReader): Packet {
  const f = schema.console.fields;
  const sequence = attempt(() => readValue(r, spec(f, 'console_sequence')));
  if (sequence === null) return unknownPacket(50);
  const payload = sliceEnvelopePayload(
    r,
    schema.console.payloadOffset,
    attempt(() => readValue(r, spec(f, 'payload_length'))),
  );
  let end = payload.length;
  while (end > 1 && payload[end - 1] === 0) end -= 1;
  return {
    kind: 'console',
    consoleSequence: sequence,
    unixS: numberOr(r, f, 'unix_s', 0),
    text: latin1(payload.subarray(1, end)),
  };
}

function decodeMetadata(r: ByteReader): Packet {
  const f = schema.metadata.fields;
  const metaType = attempt(() => readValue(r, spec(f, 'meta_type')));
  if (metaType === null) return unknownPacket(49);
  const packet: Extract<Packet, { kind: 'metadata' }> = {
    kind: 'metadata',
    metaName: schema.metadataTypes.get(metaType) ?? `UNKNOWN_${metaType}`,
    unixS: numberOr(r, f, 'unix_s', 0),
  };
  const tokenEnd = schema.metadata.endTokenOffset + schema.metadata.endTokenLength;
  if (metaType === 2 && r.length >= tokenEnd) {
    packet.endToken = r.bytes(schema.metadata.endTokenOffset, schema.metadata.endTokenLength);
  }
  return packet;
}

function decodeDataRecord(raw: Uint8Array, r: ByteReader, packetType: 43 | 47): Packet {
  const f = schema.recordHeader;
  const layout = attempt(() => readValue(r, spec(f, 'layout')));
  const recordIndex = attempt(() => readValue(r, spec(f, 'record_index')));
  const unixS = attempt(() => readValue(r, spec(f, 'unix_s')));
  if (layout === null || recordIndex === null || unixS === null) return unknownPacket(packetType);
  return {
    kind: 'record',
    packetType,
    layout,
    recordIndex,
    unixS,
    subsec: numberOr(r, f, 'subsec', 0),
    record: decodeRecord(raw, layout),
  };
}

export function decodeFrame(raw: Uint8Array): Packet {
  validateFrame(raw);
  const r = new ByteReader(raw, raw.length - 4);
  const packetType = r.u8(8);
  switch (packetType) {
    case 36:
      return decodeCommandResponse(r);
    case 40:
      return decodeRealtime(r);
    case 43:
    case 47:
      return decodeDataRecord(raw, r, packetType);
    case 48:
      return decodeEvent(r);
    case 49:
      return decodeMetadata(r);
    case 50:
      return decodeConsole(r);
    case 54:
      return decodePackEvent(r);
    default:
      return unknownPacket(packetType);
  }
}
