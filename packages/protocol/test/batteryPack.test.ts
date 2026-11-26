import { describe, expect, it } from 'vitest';
import { decodeFrame, decodePackPayload, encodeEvent, encodePackInfoPayload, encodePackSocPayload, fromHex } from '../src/index';
import type { PackInfo } from '../src/index';

const INFO: PackInfo = {
  serial: 'TESTPACK0000001',
  hwFamily: 12,
  hwVersion: 13,
  firmware: { major: 3, minor: 30, patch: 5, build: 0 },
  colourway: 1,
};

function ascii(text: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += (i < text.length ? text.charCodeAt(i) : 0).toString(16).padStart(2, '0');
  return out;
}

const HW_REPORT = `010c${ascii('TESTPACK0000001', 16)}a1b2c3d4e5f60d031e0500019c00`;

describe('decodePackPayload', () => {
  it('reads the charge from a pack charge report', () => {
    expect(decodePackPayload(2, fromHex('01e50000'))).toEqual({ socPercent: 22.9 });
    expect(decodePackPayload(2, fromHex('01870200'))).toEqual({ socPercent: 64.7 });
  });

  it('reads the identity and charge from a pack hardware report', () => {
    expect(decodePackPayload(20, fromHex(HW_REPORT))).toEqual({ socPercent: 15.6, info: INFO });
  });

  it('round-trips its own encoders', () => {
    expect(decodePackPayload(2, encodePackSocPayload(41.5))).toEqual({ socPercent: 41.5 });
    expect(decodePackPayload(20, encodePackInfoPayload(INFO, 64.7))).toEqual({ socPercent: 64.7, info: INFO });
  });

  it('rejects a payload of the wrong length or revision', () => {
    expect(decodePackPayload(2, fromHex('01e500'))).toBeNull();
    expect(decodePackPayload(2, fromHex('01e5000000'))).toBeNull();
    expect(decodePackPayload(2, fromHex('02e50000'))).toBeNull();
    expect(decodePackPayload(20, fromHex(HW_REPORT.slice(0, -2)))).toBeNull();
  });

  it('drops a charge above 100 %', () => {
    expect(decodePackPayload(2, fromHex('01e90300'))).toEqual({ socPercent: null });
  });

  it('keeps the charge but drops the identity when the serial is not printable', () => {
    const garbled = `010c${'07'.repeat(16)}a1b2c3d4e5f60d031e0500019c00`;
    expect(decodePackPayload(20, fromHex(garbled))).toEqual({ socPercent: 15.6 });
  });

  it('does not guess at other pack events', () => {
    expect(decodePackPayload(7, fromHex('01e50000'))).toBeNull();
  });
});

describe('decodeFrame for packet type 54', () => {
  it('decodes a pack event captured from an MG band', () => {
    expect(decodeFrame(fromHex('aa0114000102a07036490200c87c086beb71040001e500002a2b0564'))).toEqual({
      kind: 'packEvent',
      event: 2,
      eventName: 'BPK_SOC',
      unixS: 1_795_718_344,
      payload: fromHex('01e50000'),
      pack: { socPercent: 22.9 },
    });
  });

  it('keeps pack event numbers apart from band event numbers', () => {
    const payload = encodePackInfoPayload(INFO, 15.6);
    expect(decodeFrame(encodeEvent({ event: 20, unixS: 1_795_700_000, payload }))).toMatchObject({
      kind: 'event',
      eventName: 'SERIAL_HEAD_REMOVED',
    });
    expect(decodeFrame(encodeEvent({ packetType: 54, event: 20, unixS: 1_795_700_000, payload }))).toMatchObject({
      kind: 'packEvent',
      eventName: 'BPK_HW_INFORMATION',
      pack: { socPercent: 15.6, info: INFO },
    });
  });

  it('names an unknown pack event without decoding it', () => {
    expect(decodeFrame(encodeEvent({ packetType: 54, event: 9, unixS: 1_795_700_000, payload: fromHex('0102') }))).toEqual({
      kind: 'packEvent',
      event: 9,
      eventName: 'UNKNOWN_9',
      unixS: 1_795_700_000,
      payload: fromHex('0102'),
    });
  });
});
