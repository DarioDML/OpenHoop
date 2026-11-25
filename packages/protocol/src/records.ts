import { ByteReader } from './bytes';
import { readRaw, readValue, schema, spec } from './schema';

export type BandState = 'WAKE' | 'STILL' | 'SLEEP' | 'UP';

export const BAND_STATES: readonly BandState[] = ['WAKE', 'STILL', 'SLEEP', 'UP'];

export interface Biometric {
  heartRate: number;
  rrMs: number[];
  stepCounter: number;
  activityClass: string;
  dynamicAccelG: number;
  gravityG: [number, number, number];
  skinTempC: number | null;
  spo2Byte82: number;
  spo2Percent: number | null;
  bandState: BandState;
  stateBits: number;
  tempAux1C?: number | null;
}

export interface OpticalBlock {
  count: number;
  sourceA: number;
  driveA: number;
  sourceB: number;
  driveB: number;
  detectorA: number;
  rangeA: number;
  offsetA: number;
  detectorB: number;
  rangeB: number;
  offsetB: number;
  slotA: number[];
  slotB: number[];
}

export type RecordBody =
  | ({ type: 'biometric' } & Biometric)
  | { type: 'ecgRaw'; quality: number; samples: number[]; leadI: number[]; leadQ: number[] }
  | { type: 'ecgFiltered'; quality: number; samples: number[] }
  | { type: 'optical'; blocks: OpticalBlock[] }
  | { type: 'imu'; accel: [number[], number[], number[]]; gyro: [number[], number[], number[]] }
  | { type: 'compactOptical'; samples: number[]; acceptanceRaw: number; onWristRaw: number; burstCounter?: number }
  | { type: 'queued'; innerVersion: number; channel?: number; sampleBits?: number[] }
  | { type: 'unknown'; reason: 'layout' | 'length' };

export const RECORD_LENGTHS: ReadonlyMap<number, number> = new Map([
  [16, schema.ecgRaw.length],
  [17, schema.ecgFiltered.length],
  [18, schema.biometric.length],
  [20, schema.optical.length],
  [21, schema.imu.length],
  [22, schema.queued.length],
  [26, schema.compactOptical.length],
]);

const LENGTH_ERROR: RecordBody = { type: 'unknown', reason: 'length' };

function readArray(r: ByteReader, offset: number, count: number, size: 2 | 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(size === 2 ? r.i16(offset + 2 * i) : r.i32(offset + 4 * i));
  return out;
}

function cumulative(base: number, deltas: number[]): number[] {
  const out = [base];
  let acc = base;
  for (const d of deltas) {
    acc += d;
    out.push(acc);
  }
  return out;
}

export function rrList(r: ByteReader, offset: number, count: number, limit: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(count, limit); i++) {
    const o = offset + 2 * i;
    if (o + 2 > r.length) break;
    const t = r.u16(o);
    if (t !== 0) out.push(t);
  }
  return out;
}

function required(value: number | null): number {
  if (value === null) throw new RangeError('required field out of range');
  return value;
}

function decodeBiometric(r: ByteReader): RecordBody {
  const f = schema.biometric.fields;
  const get = (name: string): number | null => readValue(r, spec(f, name));
  const stateBits = required(get('state_bits'));
  const byte82 = required(get('spo2_byte_82'));
  const activityRaw = required(get('activity_class'));
  const bandIndex = (stateBits >> schema.biometric.bandShift) & schema.biometric.bandMask;
  return {
    type: 'biometric',
    heartRate: required(get('heart_rate')),
    rrMs: rrList(r, schema.biometric.rrOffset, required(get('rr_count')), schema.biometric.rrMax),
    stepCounter: required(get('step_counter')),
    activityClass: spec(f, 'activity_class').enum?.[String(activityRaw)] ?? `raw_${activityRaw}`,
    dynamicAccelG: required(get('dynamic_accel_g')),
    gravityG: [required(get('gravity_x_g')), required(get('gravity_y_g')), required(get('gravity_z_g'))],
    skinTempC: get('skin_temp_c'),
    spo2Byte82: byte82,
    spo2Percent: byte82 >= schema.biometric.spo2Min && byte82 <= schema.biometric.spo2Max ? byte82 : null,
    bandState: BAND_STATES[bandIndex] ?? 'WAKE',
    stateBits,
    tempAux1C: get('temp_aux1_c'),
  };
}

function decodeOptical(r: ByteReader): RecordBody {
  const f = schema.optical.blockFields;
  const blocks: OpticalBlock[] = [];
  for (const base of schema.optical.blockBases) {
    const get = (name: string): number => required(readValue(r, spec(f, name), base));
    const count = get('count');
    if (count > (spec(f, 'count').max ?? 0)) return LENGTH_ERROR;
    blocks.push({
      count,
      sourceA: get('source_a'),
      driveA: get('drive_a'),
      sourceB: get('source_b'),
      driveB: get('drive_b'),
      detectorA: get('detector_a'),
      rangeA: get('range_a'),
      offsetA: get('offset_a'),
      detectorB: get('detector_b'),
      rangeB: get('range_b'),
      offsetB: get('offset_b'),
      slotA: readArray(r, base + schema.optical.slotARel, count, 4),
      slotB: readArray(r, base + schema.optical.slotBRel, count, 4),
    });
  }
  return { type: 'optical', blocks };
}

function decodeImu(r: ByteReader): RecordBody {
  const na = r.u16(schema.imu.accelCountOffset);
  const ng = r.u16(schema.imu.gyroCountOffset);
  if (na > schema.imu.capacity || ng > schema.imu.capacity) return LENGTH_ERROR;
  const [ax, ay, az] = schema.imu.accelOffsets;
  const [gx, gy, gz] = schema.imu.gyroOffsets;
  if (ax === undefined || ay === undefined || az === undefined) throw new Error('schema accel offsets');
  if (gx === undefined || gy === undefined || gz === undefined) throw new Error('schema gyro offsets');
  return {
    type: 'imu',
    accel: [readArray(r, ax, na, 2), readArray(r, ay, na, 2), readArray(r, az, na, 2)],
    gyro: [readArray(r, gx, ng, 2), readArray(r, gy, ng, 2), readArray(r, gz, ng, 2)],
  };
}

function decodeCompactOptical(r: ByteReader): RecordBody {
  const f = schema.compactOptical.fields;
  const get = (name: string): number => required(readValue(r, spec(f, name)));
  const deltas = readArray(r, schema.compactOptical.deltaOffset, schema.compactOptical.deltaCount, 2);
  return {
    type: 'compactOptical',
    samples: cumulative(get('base'), deltas),
    acceptanceRaw: get('acceptance_raw'),
    onWristRaw: get('on_wrist_raw'),
    burstCounter: get('burst_counter'),
  };
}

function decodeQueued(r: ByteReader): RecordBody {
  const innerVersion = r.u8(schema.queued.innerVersionOffset);
  if (innerVersion !== 9) return { type: 'queued', innerVersion };
  const v = schema.queued.v9;
  const deltas = readArray(r, v.delta_offset, v.delta_count, 2);
  return {
    type: 'queued',
    innerVersion,
    channel: r.u8(v.channel_offset),
    sampleBits: cumulative(r.u32(v.initial_offset), deltas).map((x) => x >>> 0),
  };
}

function decodeEcg(r: ByteReader, layout: 16 | 17): RecordBody {
  const status = schema.ecgRaw.status;
  const quality = required(readRaw(r, spec(status, 'quality')));
  const count = required(readRaw(r, spec(status, 'sample_count')));
  const capacity = layout === 17 ? schema.ecgFiltered.sampleCapacity : schema.ecgRaw.sampleCapacity;
  if (count > capacity) return LENGTH_ERROR;
  if (layout === 17) {
    return { type: 'ecgFiltered', quality, samples: readArray(r, schema.ecgFiltered.sampleOffset, count, 2) };
  }
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = schema.ecgRaw.sampleOffset + 3 * i;
    const v = ((r.u8(o) & 0x03) << 16) | (r.u8(o + 1) << 8) | r.u8(o + 2);
    samples.push(v >= 131072 ? v - 262144 : v);
  }
  const leads = Math.min(r.u8(schema.ecgRaw.leadCountOffset), schema.ecgRaw.leadCapacity);
  return {
    type: 'ecgRaw',
    quality,
    samples,
    leadI: readArray(r, schema.ecgRaw.leadIOffset, leads, 2),
    leadQ: readArray(r, schema.ecgRaw.leadQOffset, leads, 2),
  };
}

export function decodeRecord(raw: Uint8Array, layout: number): RecordBody {
  const expected = RECORD_LENGTHS.get(layout);
  if (expected === undefined) return { type: 'unknown', reason: 'layout' };
  if (raw.length !== expected) return LENGTH_ERROR;
  const r = new ByteReader(raw, raw.length - 4);
  try {
    switch (layout) {
      case 16:
      case 17:
        return decodeEcg(r, layout);
      case 18:
        return decodeBiometric(r);
      case 20:
        return decodeOptical(r);
      case 21:
        return decodeImu(r);
      case 22:
        return decodeQueued(r);
      case 26:
        return decodeCompactOptical(r);
      default:
        return { type: 'unknown', reason: 'layout' };
    }
  } catch (e) {
    if (e instanceof RangeError) return LENGTH_ERROR;
    throw e;
  }
}
