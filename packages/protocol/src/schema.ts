import schemaJson from './schema/whoop5_protocol.json';
import type { ByteReader } from './bytes';

export interface FieldSpec {
  readonly name: string;
  readonly offset?: number;
  readonly rel?: number;
  readonly type: string;
  readonly scale?: number | string;
  readonly valid?: readonly number[];
  readonly max?: number;
  readonly enum?: Readonly<Record<string, string>>;
}

export type FieldIndex = ReadonlyMap<string, FieldSpec>;

export function indexFields(specs: readonly FieldSpec[]): FieldIndex {
  return new Map(specs.map((s) => [s.name, s]));
}

export function spec(index: FieldIndex, name: string): FieldSpec {
  const s = index.get(name);
  if (!s) throw new Error(`schema has no field ${name}`);
  return s;
}

function specOffset(s: FieldSpec, base: number): number {
  return base + (s.offset ?? s.rel ?? 0);
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export function readRaw(r: ByteReader, s: FieldSpec, base = 0): number {
  const o = specOffset(s, base);
  switch (s.type) {
    case 'u8':
      return r.u8(o);
    case 'i8':
      return r.i8(o);
    case 'u16':
      return r.u16(o);
    case 'i16':
      return r.i16(o);
    case 'u32':
      return r.u32(o);
    case 'i32':
      return r.i32(o);
    case 'f32':
      return r.f32(o);
    default:
      throw new Error(`unsupported field type ${s.type}`);
  }
}

export function readValue(r: ByteReader, s: FieldSpec, base = 0): number | null {
  const raw = readRaw(r, s, base);
  if (typeof s.scale !== 'number') return raw;
  const scaled = round4(raw * s.scale);
  const lo = s.valid?.[0];
  const hi = s.valid?.[1];
  if (lo !== undefined && hi !== undefined && (scaled < lo || scaled > hi)) return null;
  return scaled;
}

export function writeValue(view: DataView, shift: number, s: FieldSpec, value: number, base = 0): void {
  const o = specOffset(s, base) - shift;
  const raw = typeof s.scale === 'number' ? Math.round(value / s.scale) : value;
  switch (s.type) {
    case 'u8':
      view.setUint8(o, raw);
      return;
    case 'i8':
      view.setInt8(o, raw);
      return;
    case 'u16':
      view.setUint16(o, raw, true);
      return;
    case 'i16':
      view.setInt16(o, raw, true);
      return;
    case 'u32':
      view.setUint32(o, raw, true);
      return;
    case 'i32':
      view.setInt32(o, raw, true);
      return;
    case 'f32':
      view.setFloat32(o, raw, true);
      return;
    default:
      throw new Error(`unsupported field type ${s.type}`);
  }
}

function stringTable(source: Readonly<Record<string, unknown>>): ReadonlyMap<number, string> {
  const out = new Map<number, string>();
  for (const [k, v] of Object.entries(source)) {
    if (/^\d+$/.test(k) && typeof v === 'string') out.set(Number(k), v);
  }
  return out;
}

const records = schemaJson.records;

export const schema = {
  gatt: schemaJson.gatt,
  commandNames: stringTable(schemaJson.commands),
  destructive: schemaJson.commands.destructive,
  packetTypes: stringTable(schemaJson.packet_types),
  events: stringTable(schemaJson.events),
  resultCodes: stringTable(schemaJson.result_codes),
  metadataTypes: stringTable(schemaJson.metadata_types),
  commandResponse: {
    fields: indexFields(schemaJson.command_response.fields),
    bodyOffset: schemaJson.command_response.body_offset,
  },
  dataRange: {
    fields: indexFields(schemaJson.responses.GET_DATA_RANGE.fields),
    bodyLength: schemaJson.responses.GET_DATA_RANGE.body_length,
  },
  hello: indexFields(schemaJson.responses.GET_HELLO.fields),
  clock: indexFields(schemaJson.responses.GET_CLOCK.fields),
  clockDeprecated: indexFields(schemaJson.responses.GET_CLOCK_DEPRECATED.fields),
  batteryLevel: indexFields(schemaJson.responses.GET_BATTERY_LEVEL.fields),
  recordHeader: indexFields(schemaJson.data_record_header.fields),
  realtime: {
    fields: indexFields(schemaJson.realtime_hr_40.fields),
    rrOffset: schemaJson.realtime_hr_40.rr_offset,
  },
  event: {
    fields: indexFields(schemaJson.event_48.fields),
    payloadOffset: schemaJson.event_48.payload_offset,
    battery: indexFields(schemaJson.event_48.payloads['3'].fields),
  },
  console: {
    fields: indexFields(schemaJson.console_50.fields),
    payloadOffset: schemaJson.event_48.payload_offset,
  },
  metadata: {
    fields: indexFields(schemaJson.metadata_49.fields),
    endTokenOffset: schemaJson.metadata_49.end_token_offset,
    endTokenLength: schemaJson.metadata_49.end_token_length,
  },
  ecgRaw: {
    length: records['16'].length,
    status: indexFields(records['16'].status_fields),
    sampleOffset: records['16'].sample_offset,
    sampleCapacity: records['16'].sample_capacity,
    leadCountOffset: records['16'].lead_count_offset,
    leadIOffset: records['16'].lead_i_offset,
    leadQOffset: records['16'].lead_q_offset,
    leadCapacity: records['16'].lead_capacity,
  },
  ecgFiltered: {
    length: records['17'].length,
    sampleOffset: records['17'].sample_offset,
    sampleCapacity: records['17'].sample_capacity,
  },
  biometric: {
    length: records['18'].length,
    fields: indexFields(records['18'].fields),
    rrOffset: records['18'].rr_offset,
    rrMax: records['18'].rr_max,
    bandShift: records['18'].band_state_from_state_bits.shift,
    bandMask: records['18'].band_state_from_state_bits.mask,
    bandLabels: stringTable(records['18'].band_state_from_state_bits.labels),
    spo2Min: records['18'].spo2.valid_percent[0] ?? 70,
    spo2Max: records['18'].spo2.valid_percent[1] ?? 100,
  },
  optical: {
    length: records['20'].length,
    blockBases: records['20'].block_bases,
    blockFields: indexFields(records['20'].block_fields),
    slotARel: records['20'].slot_a_rel,
    slotBRel: records['20'].slot_b_rel,
  },
  imu: {
    length: records['21'].length,
    accelCountOffset: records['21'].accel_count_offset,
    gyroCountOffset: records['21'].gyro_count_offset,
    accelOffsets: records['21'].accel_xyz_offsets,
    gyroOffsets: records['21'].gyro_xyz_offsets,
    capacity: records['21'].capacity,
  },
  compactOptical: {
    length: records['26'].length,
    fields: indexFields(records['26'].fields),
    deltaOffset: records['26'].delta_offset,
    deltaCount: records['26'].delta_count,
  },
  queued: {
    length: records['22'].length,
    innerVersionOffset: records['22'].inner_version_offset,
    v9: records['22'].v9,
  },
} as const;
