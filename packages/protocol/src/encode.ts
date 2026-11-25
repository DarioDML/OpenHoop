import { concat } from './bytes';
import type { FirmwareVersion } from './firmware';
import { wrapFrame } from './framing';
import type { Biometric } from './records';
import { BAND_STATES } from './records';
import type { FieldIndex } from './schema';
import { schema, spec, writeValue } from './schema';

const FRAME_BODY_OFFSET = 8;
const FRAME_OVERHEAD = 12;
const RECORD_MARKER_BIOMETRIC = 0x80;
const ECG_QUALITY = 3;
const ECG_STATE_BITS = 0x08;

function u16le(v: number): Uint8Array {
  return Uint8Array.of(v & 0xff, (v >> 8) & 0xff);
}

class FrameBody {
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(bodyLength: number) {
    this.bytes = new Uint8Array(bodyLength);
    this.view = new DataView(this.bytes.buffer);
  }

  put(index: FieldIndex, name: string, value: number, base = 0): void {
    writeValue(this.view, FRAME_BODY_OFFSET, spec(index, name), value, base);
  }

  at(frameOffset: number, value: number): void {
    this.bytes[frameOffset - FRAME_BODY_OFFSET] = value;
  }

  i16(frameOffset: number, value: number): void {
    this.view.setInt16(frameOffset - FRAME_BODY_OFFSET, value, true);
  }

  bytesAt(frameOffset: number, data: Uint8Array): void {
    this.bytes.set(data, frameOffset - FRAME_BODY_OFFSET);
  }

  frame(): Uint8Array {
    return wrapFrame(this.bytes);
  }
}

interface RecordHeader {
  recordIndex: number;
  unixS: number;
  packetType?: 43 | 47;
}

function recordBody(totalLength: number, layout: number, marker: number, h: RecordHeader): FrameBody {
  const body = new FrameBody(totalLength - FRAME_OVERHEAD);
  const f = schema.recordHeader;
  body.put(f, 'packet_type', h.packetType ?? 47);
  body.put(f, 'layout', layout);
  body.put(f, 'marker', marker);
  body.put(f, 'record_index', h.recordIndex);
  body.put(f, 'unix_s', h.unixS);
  return body;
}

export function encodeUnknownRecord(i: { layout: number; recordIndex: number; unixS: number; length: number }): Uint8Array {
  if (i.length < 24 || (i.length - FRAME_OVERHEAD) % 4 !== 0) {
    throw new RangeError('record length must be at least 24 and 4-aligned after the 12-byte envelope');
  }
  return recordBody(i.length, i.layout, RECORD_MARKER_BIOMETRIC, i).frame();
}

export function encodeCommandResponse(i: {
  sequence: number;
  command: number;
  originSequence: number;
  result: number;
  body?: Uint8Array;
}): Uint8Array {
  const head = Uint8Array.of(36, i.sequence & 0xff, i.command & 0xff, i.originSequence & 0xff, i.result & 0xff);
  return wrapFrame(concat(head, i.body ?? new Uint8Array(0)));
}

function bodyWriter(length: number): { bytes: Uint8Array; put: (index: FieldIndex, name: string, value: number) => void } {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  return { bytes, put: (index, name, value) => writeValue(view, 0, spec(index, name), value) };
}

export function encodeHelloBody(i: { batteryPercent: number; unixS: number; firmware: FirmwareVersion }): Uint8Array {
  const w = bodyWriter(107);
  const f = schema.hello;
  w.put(f, 'revision', 1);
  w.put(f, 'battery_tenths', Math.round(i.batteryPercent * 10));
  w.put(f, 'unix_s', i.unixS);
  w.put(f, 'fw_major', i.firmware.major);
  w.put(f, 'fw_minor', i.firmware.minor);
  w.put(f, 'fw_patch', i.firmware.patch);
  w.put(f, 'fw_build', i.firmware.build);
  return w.bytes;
}

export function encodeDataRangeBody(i: {
  readPage: number;
  writePage: number;
  trimPage: number;
  writeWrap: number;
  totalPages: number;
  newestUnix: number;
}): Uint8Array {
  const w = bodyWriter(schema.dataRange.bodyLength);
  const f = schema.dataRange.fields;
  w.put(f, 'revision', 1);
  w.put(f, 'read_page', i.readPage);
  w.put(f, 'write_page', i.writePage);
  w.put(f, 'trim_page', i.trimPage);
  w.put(f, 'write_wrap', i.writeWrap);
  w.put(f, 'total_pages', i.totalPages);
  w.put(f, 'newest_clock_s', i.newestUnix);
  return w.bytes;
}

function activityCode(label: string | undefined): number {
  if (label === undefined) return 0;
  const names = spec(schema.biometric.fields, 'activity_class').enum ?? {};
  for (const [code, name] of Object.entries(names)) if (name === label) return Number(code);
  const raw = /^raw_(\d+)$/.exec(label);
  return raw?.[1] === undefined ? 0 : Number(raw[1]);
}

export function encodeBiometric(
  i: { recordIndex: number; unixS: number; packetType?: 43 | 47 } & Partial<Biometric> & { heartRate: number },
): Uint8Array {
  const body = recordBody(schema.biometric.length, 18, RECORD_MARKER_BIOMETRIC, i);
  const f = schema.biometric.fields;
  const rr = (i.rrMs ?? []).slice(0, schema.biometric.rrMax);
  const gravity = i.gravityG ?? [0, 0, 1];
  let stateBits = i.stateBits ?? 0;
  if (i.bandState !== undefined) {
    const shift = schema.biometric.bandShift;
    stateBits = (stateBits & ~(schema.biometric.bandMask << shift)) | (BAND_STATES.indexOf(i.bandState) << shift);
  }
  body.put(f, 'heart_rate', i.heartRate);
  body.put(f, 'rr_count', rr.length);
  rr.forEach((ms, k) => body.bytesAt(schema.biometric.rrOffset + 2 * k, u16le(ms)));
  body.put(f, 'dynamic_accel_g', i.dynamicAccelG ?? 0);
  body.put(f, 'gravity_x_g', gravity[0]);
  body.put(f, 'gravity_y_g', gravity[1]);
  body.put(f, 'gravity_z_g', gravity[2]);
  body.put(f, 'step_counter', i.stepCounter ?? 0);
  body.put(f, 'activity_class', activityCode(i.activityClass));
  body.put(f, 'temp_aux1_c', i.tempAux1C ?? 0);
  body.put(f, 'skin_temp_c', i.skinTempC ?? 0);
  body.put(f, 'state_bits', stateBits);
  body.put(f, 'spo2_byte_82', i.spo2Byte82 ?? i.spo2Percent ?? 0);
  return body.frame();
}

export function encodeRealtimeHr(i: { unixS: number; heartRate: number; rrMs: number[] }): Uint8Array {
  const body = new FrameBody(10 + 2 * i.rrMs.length);
  const f = schema.realtime.fields;
  body.at(8, 40);
  body.put(f, 'unix_s', i.unixS);
  body.put(f, 'heart_rate', i.heartRate);
  body.put(f, 'rr_count', i.rrMs.length);
  i.rrMs.forEach((ms, k) => body.bytesAt(schema.realtime.rrOffset + 2 * k, u16le(ms)));
  return body.frame();
}

export function encodeMetadata(i: {
  meta: 'HISTORY_START' | 'HISTORY_END' | 'HISTORY_COMPLETE';
  unixS: number;
  endToken?: Uint8Array;
}): Uint8Array {
  const metaType = [...schema.metadataTypes].find(([, name]) => name === i.meta)?.[0];
  if (metaType === undefined) throw new Error(`schema has no metadata type ${i.meta}`);
  const { endTokenOffset, endTokenLength } = schema.metadata;
  const token = i.endToken ?? (i.meta === 'HISTORY_END' ? new Uint8Array(endTokenLength) : undefined);
  if (token !== undefined && token.length !== endTokenLength) throw new RangeError('end token must be 8 bytes');
  const body = new FrameBody(token === undefined ? endTokenOffset - FRAME_BODY_OFFSET : endTokenOffset + endTokenLength - FRAME_BODY_OFFSET);
  body.at(8, 49);
  body.at(9, 0x0c);
  body.put(schema.metadata.fields, 'meta_type', metaType);
  body.put(schema.metadata.fields, 'unix_s', i.unixS);
  if (token !== undefined) body.bytesAt(endTokenOffset, token);
  return body.frame();
}

export function encodeEvent(i: { event: number; unixS: number; payload?: Uint8Array }): Uint8Array {
  const payload = i.payload ?? new Uint8Array(0);
  const body = new FrameBody(schema.event.payloadOffset - FRAME_BODY_OFFSET + payload.length);
  const f = schema.event.fields;
  body.at(8, 48);
  body.at(9, 3);
  body.at(11, 1);
  body.put(f, 'event', i.event);
  body.put(f, 'unix_s', i.unixS);
  body.put(f, 'payload_length', payload.length);
  body.bytesAt(schema.event.payloadOffset, payload);
  return body.frame();
}

export function encodeBatteryEvent(i: { unixS: number; socPercent: number; millivolts: number }): Uint8Array {
  const w = bodyWriter(20);
  w.put(schema.event.battery, 'revision', 2);
  w.put(schema.event.battery, 'soc_percent', i.socPercent);
  w.put(schema.event.battery, 'millivolts', i.millivolts);
  return encodeEvent({ event: 3, unixS: i.unixS, payload: w.bytes });
}

export function encodeConsole(i: { consoleSequence: number; unixS: number; text: string }): Uint8Array {
  const payload = new Uint8Array(i.text.length + 2);
  payload[0] = 1;
  for (let k = 0; k < i.text.length; k++) {
    const c = i.text.charCodeAt(k);
    if (c > 0xff) throw new RangeError('console text must be latin1');
    payload[k + 1] = c;
  }
  const body = new FrameBody(schema.console.payloadOffset - FRAME_BODY_OFFSET + payload.length);
  const f = schema.console.fields;
  body.at(8, 50);
  body.put(f, 'console_sequence', i.consoleSequence);
  body.at(10, 2);
  body.put(f, 'unix_s', i.unixS);
  body.put(f, 'payload_length', payload.length);
  body.bytesAt(schema.console.payloadOffset, payload);
  return body.frame();
}

export function encodeEcgFiltered(i: { recordIndex: number; unixS: number; samples: number[] }): Uint8Array {
  if (i.samples.length > schema.ecgFiltered.sampleCapacity) throw new RangeError('too many ECG samples');
  const body = recordBody(schema.ecgFiltered.length, 17, 0, { ...i, packetType: 43 });
  const status = schema.ecgRaw.status;
  body.put(status, 'quality', ECG_QUALITY);
  body.put(status, 'state_bits', ECG_STATE_BITS);
  body.put(status, 'sample_count', i.samples.length);
  i.samples.forEach((s, k) => body.i16(schema.ecgFiltered.sampleOffset + 2 * k, s));
  return body.frame();
}
