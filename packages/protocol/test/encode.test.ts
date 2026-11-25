import { describe, expect, it } from 'vitest';
import schema from '../src/schema/whoop5_protocol.json';
import {
  BAND_STATES,
  Command,
  concat,
  decodeFrame,
  encodeBatteryEvent,
  encodeBiometric,
  encodeCommandResponse,
  encodeConsole,
  encodeDataRangeBody,
  encodeEcgFiltered,
  encodeEvent,
  encodeHelloBody,
  encodeMetadata,
  encodeRealtimeHr,
  encodeUnknownRecord,
  fromHex,
  toHex,
  wrapFrame,
} from '../src/index';
import type { Packet, RecordBody } from '../src/index';

function record(p: Packet): Extract<Packet, { kind: 'record' }> {
  if (p.kind !== 'record') throw new Error(`expected record, got ${p.kind}`);
  return p;
}

function biometric(p: Packet): Extract<RecordBody, { type: 'biometric' }> {
  const r = record(p).record;
  if (r.type !== 'biometric') throw new Error(`expected biometric, got ${r.type}`);
  return r;
}

function response(p: Packet): Extract<Packet, { kind: 'commandResponse' }> {
  if (p.kind !== 'commandResponse') throw new Error(`expected response, got ${p.kind}`);
  return p;
}

describe('schema coupling', () => {
  it('uses the same band state labels as the schema', () => {
    const labels = schema.records['18'].band_state_from_state_bits.labels;
    expect(BAND_STATES).toEqual([labels['0'], labels['1'], labels['2'], labels['3']]);
  });
});

describe('encoder round trips', () => {
  it('biometric with 4 R-R values, skin temperature and SpO2', () => {
    const raw = encodeBiometric({
      recordIndex: 1234,
      unixS: 1_790_000_100,
      heartRate: 61,
      rrMs: [980, 1000, 1010, 1020],
      stepCounter: 4321,
      activityClass: 'walk',
      dynamicAccelG: 0.5,
      gravityG: [0.1, -0.2, 0.97],
      skinTempC: 33.82,
      spo2Byte82: 97,
      bandState: 'SLEEP',
    });
    const p = record(decodeFrame(raw));
    expect(p).toMatchObject({ layout: 18, recordIndex: 1234, unixS: 1_790_000_100, packetType: 47 });
    const b = biometric(p);
    expect(b).toMatchObject({
      heartRate: 61,
      rrMs: [980, 1000, 1010, 1020],
      stepCounter: 4321,
      activityClass: 'walk',
      skinTempC: 33.82,
      spo2Byte82: 97,
      spo2Percent: 97,
      bandState: 'SLEEP',
    });
    expect(b.dynamicAccelG).toBeCloseTo(0.5, 6);
    expect(b.gravityG[0]).toBeCloseTo(0.1, 6);
    expect(b.gravityG[1]).toBeCloseTo(-0.2, 6);
    expect(b.gravityG[2]).toBeCloseTo(0.97, 6);
  });

  it.each(BAND_STATES.map((s) => [s] as const))('biometric band state %s', (bandState) => {
    const b = biometric(decodeFrame(encodeBiometric({ recordIndex: 1, unixS: 1, heartRate: 50, bandState, packetType: 43 })));
    expect(b.bandState).toBe(bandState);
    expect(b.skinTempC).toBeNull();
    expect(b.rrMs).toEqual([]);
  });

  it('biometric keeps explicit state bits outside the band state field', () => {
    const b = biometric(decodeFrame(encodeBiometric({ recordIndex: 1, unixS: 1, heartRate: 50, stateBits: 0x0f, bandState: 'UP' })));
    expect(b.stateBits).toBe(0x3f);
    expect(b.bandState).toBe('UP');
  });

  it('realtime heart rate', () => {
    const p = decodeFrame(encodeRealtimeHr({ unixS: 1_790_000_000, heartRate: 72, rrMs: [800, 810, 790] }));
    expect(p).toEqual({ kind: 'realtimeHr', unixS: 1_790_000_000, heartRate: 72, rrMs: [800, 810, 790] });
    expect(decodeFrame(encodeRealtimeHr({ unixS: 5, heartRate: 60, rrMs: [] }))).toMatchObject({ rrMs: [] });
  });

  it('metadata with and without a token', () => {
    const token = fromHex('41b6010010000000');
    expect(decodeFrame(encodeMetadata({ meta: 'HISTORY_END', unixS: 1_790_000_001, endToken: token }))).toEqual({
      kind: 'metadata',
      metaName: 'HISTORY_END',
      unixS: 1_790_000_001,
      endToken: token,
    });
    expect(decodeFrame(encodeMetadata({ meta: 'HISTORY_START', unixS: 7 }))).toEqual({
      kind: 'metadata',
      metaName: 'HISTORY_START',
      unixS: 7,
    });
    expect(decodeFrame(encodeMetadata({ meta: 'HISTORY_COMPLETE', unixS: 9 }))).toMatchObject({ metaName: 'HISTORY_COMPLETE', unixS: 9 });
    expect(() => encodeMetadata({ meta: 'HISTORY_END', unixS: 1, endToken: new Uint8Array(7) })).toThrow(RangeError);
  });

  it('events, including payload', () => {
    const payload = Uint8Array.of(1, 2, 3);
    expect(decodeFrame(encodeEvent({ event: 9, unixS: 100, payload }))).toEqual({
      kind: 'event',
      event: 9,
      eventName: 'WRIST_ON',
      unixS: 100,
      payload,
    });
    expect(decodeFrame(encodeEvent({ event: 250, unixS: 1 }))).toMatchObject({ eventName: 'UNKNOWN_250' });
  });

  it('battery event', () => {
    const p = decodeFrame(encodeBatteryEvent({ unixS: 1_790_000_000, socPercent: 57.7, millivolts: 3927 }));
    expect(p).toMatchObject({ kind: 'event', event: 3, eventName: 'BATTERY_LEVEL', battery: { socPercent: 57.7, millivolts: 3927 } });
  });

  it('console text, latin1 and fragments', () => {
    const p = decodeFrame(encodeConsole({ consoleSequence: 250, unixS: 10, text: 'café ok\n' }));
    expect(p).toEqual({ kind: 'console', consoleSequence: 250, unixS: 10, text: 'café ok\n' });
    expect(() => encodeConsole({ consoleSequence: 0, unixS: 0, text: '€' })).toThrow(RangeError);
  });

  it('filtered ECG', () => {
    const samples = [0, 120, -340, 1017, -5];
    const p = record(decodeFrame(encodeEcgFiltered({ recordIndex: 9, unixS: 55, samples })));
    expect(p).toMatchObject({ layout: 17, recordIndex: 9, unixS: 55, packetType: 43 });
    expect(p.record).toMatchObject({ type: 'ecgFiltered', samples });
    expect(() => encodeEcgFiltered({ recordIndex: 1, unixS: 1, samples: new Array<number>(101).fill(0) })).toThrow(RangeError);
  });

  it('hello response', () => {
    const body = encodeHelloBody({ batteryPercent: 57.7, unixS: 1_790_000_000, firmware: { major: 50, minor: 43, patch: 1, build: 77 } });
    const p = response(decodeFrame(encodeCommandResponse({ sequence: 4, command: Command.GET_HELLO, originSequence: 3, result: 1, body })));
    expect(p).toMatchObject({ sequence: 4, command: 145, commandName: 'GET_HELLO', originSequence: 3, result: 1, resultName: 'SUCCESS' });
    expect(p.hello).toEqual({
      revision: 1,
      batteryPercent: 57.7,
      unixS: 1_790_000_000,
      firmware: { major: 50, minor: 43, patch: 1, build: 77 },
    });
    expect(toHex(p.body.subarray(0, body.length))).toBe(toHex(body));
  });

  it('data range response, including sentinel clocks and wrap', () => {
    const input = { readPage: 3, writePage: 120, trimPage: 100, writeWrap: 0, totalPages: 131072, newestUnix: 1_790_000_123 };
    const p = response(decodeFrame(encodeCommandResponse({ sequence: 1, command: Command.GET_DATA_RANGE, originSequence: 1, result: 1, body: encodeDataRangeBody(input) })));
    expect(p.dataRange).toEqual({ ...input, pagesBehind: 20, newestUnix: 1_790_000_123 });
    for (const sentinel of [0, 0xffffffff]) {
      const body = encodeDataRangeBody({ ...input, writePage: 5, trimPage: 131070, newestUnix: sentinel });
      const q = response(decodeFrame(encodeCommandResponse({ sequence: 1, command: 34, originSequence: 1, result: 1, body })));
      expect(q.dataRange).toMatchObject({ pagesBehind: 7, newestUnix: null });
    }
  });

  it('command responses without a success result carry no parsed fields', () => {
    const body = encodeDataRangeBody({ readPage: 0, writePage: 1, trimPage: 0, writeWrap: 0, totalPages: 10, newestUnix: 1 });
    const p = response(decodeFrame(encodeCommandResponse({ sequence: 1, command: 34, originSequence: 1, result: 0, body })));
    expect(p.dataRange).toBeUndefined();
    expect(p.resultName).toBe('FAILURE');
  });

  it('clock and battery responses', () => {
    const clock = concat(Uint8Array.of(1), new Uint8Array(4));
    new DataView(clock.buffer).setUint32(1, 1_790_000_999, true);
    expect(response(decodeFrame(encodeCommandResponse({ sequence: 1, command: 147, originSequence: 1, result: 1, body: clock }))).clockUnixS).toBe(1_790_000_999);
    const battery = new Uint8Array(4);
    battery[0] = 88;
    expect(response(decodeFrame(encodeCommandResponse({ sequence: 1, command: 26, originSequence: 1, result: 1, body: battery }))).batteryPercent).toBe(88);
  });
});

describe('unknown and malformed records', () => {
  it('reports an unknown layout 99 as unknown without inventing samples', () => {
    const p = record(decodeFrame(encodeUnknownRecord({ layout: 99, recordIndex: 5, unixS: 1_790_000_000, length: 124 })));
    expect(p).toMatchObject({ layout: 99, recordIndex: 5, unixS: 1_790_000_000, record: { type: 'unknown', reason: 'layout' } });
  });

  it('reports an R18 with a wrong length as unknown', () => {
    const p = record(decodeFrame(encodeUnknownRecord({ layout: 18, recordIndex: 5, unixS: 1, length: 128 })));
    expect(p.record).toEqual({ type: 'unknown', reason: 'length' });
  });

  it('rejects impossible unknown-record lengths', () => {
    expect(() => encodeUnknownRecord({ layout: 1, recordIndex: 0, unixS: 0, length: 20 })).toThrow(RangeError);
    expect(() => encodeUnknownRecord({ layout: 1, recordIndex: 0, unixS: 0, length: 125 })).toThrow(RangeError);
  });

  it('reports a count above capacity as a length problem', () => {
    const body = new Uint8Array(1244 - 12);
    body[0] = 47;
    body[1] = 21;
    new DataView(body.buffer).setUint16(24 - 8, 101, true);
    expect(record(decodeFrame(wrapFrame(body))).record).toEqual({ type: 'unknown', reason: 'length' });
  });

  it('decodes a frame of an unmodelled packet type as unknown', () => {
    expect(decodeFrame(wrapFrame(Uint8Array.of(51, 0, 0, 0)))).toEqual({ kind: 'unknown', packetType: 51 });
  });
});

describe('SpO2 and skin temperature rules', () => {
  it.each([
    [0, null],
    [16, null],
    [160, null],
    [69, null],
    [70, 70],
    [100, 100],
    [101, null],
  ])('byte %i gives %s', (byte, expected) => {
    const b = biometric(decodeFrame(encodeBiometric({ recordIndex: 1, unixS: 1, heartRate: 60, spo2Byte82: byte })));
    expect(b.spo2Byte82).toBe(byte);
    expect(b.spo2Percent).toBe(expected);
  });

  it.each([
    [4.99, null],
    [5, 5],
    [45, 45],
    [45.01, null],
    [0, null],
  ])('skin temperature %f gives %s', (temp, expected) => {
    expect(biometric(decodeFrame(encodeBiometric({ recordIndex: 1, unixS: 1, heartRate: 60, skinTempC: temp }))).skinTempC).toBe(expected);
  });
});
