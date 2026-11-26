import { describe, expect, it } from 'vitest';
import golden from './golden.json';
import { decodeFrame, fromHex, toHex } from '../src/index';
import type { Packet, RecordBody } from '../src/index';

interface Vector {
  name: string;
  hex: string;
  expected: Record<string, unknown>;
}

const vectors: Vector[] = golden;

function record(p: Packet): Extract<Packet, { kind: 'record' }> | undefined {
  return p.kind === 'record' ? p : undefined;
}

function body<T extends RecordBody['type']>(p: Packet, type: T): Extract<RecordBody, { type: T }> | undefined {
  const r = record(p)?.record;
  return r?.type === type ? (r as Extract<RecordBody, { type: T }>) : undefined;
}

function packetType(p: Packet): number {
  switch (p.kind) {
    case 'commandResponse':
      return 36;
    case 'realtimeHr':
      return 40;
    case 'event':
      return 48;
    case 'metadata':
      return 49;
    case 'console':
      return 50;
    case 'packEvent':
      return 54;
    default:
      return p.packetType;
  }
}

function trimCursor(token: Uint8Array | undefined): number | undefined {
  return token ? new DataView(token.buffer, token.byteOffset, token.byteLength).getUint32(0, true) : undefined;
}

type Accessor = (p: Packet, raw: Uint8Array) => unknown;

const FIELDS: Record<string, Accessor> = {
  packet_type: (p) => packetType(p),
  layout: (p) => record(p)?.layout,
  record_index: (p) => record(p)?.recordIndex,
  unix_s: (p, raw) => {
    if (p.kind === 'metadata') return raw.length < 20 ? null : p.unixS;
    if (p.kind === 'record' || p.kind === 'realtimeHr' || p.kind === 'event' || p.kind === 'console') return p.unixS;
    return undefined;
  },
  heart_rate: (p) => (p.kind === 'realtimeHr' ? p.heartRate : body(p, 'biometric')?.heartRate),
  rr_ms: (p) => (p.kind === 'realtimeHr' ? p.rrMs : body(p, 'biometric')?.rrMs),
  skin_temp_c: (p) => body(p, 'biometric')?.skinTempC,
  temp_aux1_c: (p) => body(p, 'biometric')?.tempAux1C,
  step_counter: (p) => body(p, 'biometric')?.stepCounter,
  band_state: (p) => body(p, 'biometric')?.bandState,
  spo2_percent: (p) => body(p, 'biometric')?.spo2Percent,
  accel_x: (p) => body(p, 'imu')?.accel[0],
  gyro_z: (p) => body(p, 'imu')?.gyro[2],
  samples: (p) =>
    body(p, 'compactOptical')?.samples ?? body(p, 'ecgRaw')?.samples ?? body(p, 'ecgFiltered')?.samples,
  burst_counter: (p) => body(p, 'compactOptical')?.burstCounter,
  sample_count: (p) => (body(p, 'ecgRaw') ?? body(p, 'ecgFiltered'))?.samples.length,
  quality: (p) => (body(p, 'ecgRaw') ?? body(p, 'ecgFiltered'))?.quality,
  lead_i: (p) => body(p, 'ecgRaw')?.leadI,
  event: (p) => (p.kind === 'event' ? p.event : undefined),
  event_name: (p) => (p.kind === 'event' ? p.eventName : undefined),
  payload_hex: (p) => (p.kind === 'event' ? toHex(p.payload) : undefined),
  soc_percent: (p) => (p.kind === 'event' ? p.battery?.socPercent : undefined),
  millivolts: (p) => (p.kind === 'event' ? p.battery?.millivolts : undefined),
  meta_type: (p) => (p.kind === 'metadata' ? { HISTORY_START: 1, HISTORY_END: 2, HISTORY_COMPLETE: 3 }[p.metaName] : undefined),
  trim_cursor: (p) => (p.kind === 'metadata' ? trimCursor(p.endToken) : undefined),
  end_token_hex: (p) => (p.kind === 'metadata' && p.endToken ? toHex(p.endToken) : undefined),
  command: (p) => (p.kind === 'commandResponse' ? p.command : undefined),
  result: (p) => (p.kind === 'commandResponse' ? p.result : undefined),
  pages_behind: (p) => (p.kind === 'commandResponse' ? p.dataRange?.pagesBehind : undefined),
  newest_unix: (p) => (p.kind === 'commandResponse' ? p.dataRange?.newestUnix : undefined),
  console_sequence: (p) => (p.kind === 'console' ? p.consoleSequence : undefined),
  text: (p) => (p.kind === 'console' ? p.text : undefined),
};

function expectSame(actual: unknown, expected: unknown, label: string): void {
  if (typeof expected === 'number' && typeof actual === 'number') {
    expect(actual, label).toBeCloseTo(expected, 3);
  } else if (Array.isArray(expected) && Array.isArray(actual)) {
    expect(actual, label).toHaveLength(expected.length);
    expected.forEach((e, i) => expectSame(actual[i], e, `${label}[${i}]`));
  } else {
    expect(actual, label).toEqual(expected);
  }
}

describe('golden vectors', () => {
  it('has the 18 reference vectors', () => {
    expect(vectors).toHaveLength(18);
  });

  it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const raw = fromHex(v.hex);
    const packet = decodeFrame(raw);
    for (const [key, expected] of Object.entries(v.expected)) {
      const accessor = FIELDS[key];
      if (!accessor) throw new Error(`golden key ${key} has no mapping`);
      expectSame(accessor(packet, raw), expected, `${v.name}.${key}`);
    }
  });
});
