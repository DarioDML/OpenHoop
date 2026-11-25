import { describe, expect, it } from 'vitest';
import {
  formatFirmware,
  fromHex,
  GATT,
  isDataLockFirmware,
  parseFirmware,
  parseHeartRateMeasurement,
} from '../src/index';

describe('parseHeartRateMeasurement', () => {
  it('reads R-R intervals as milliseconds', () => {
    expect(parseHeartRateMeasurement(fromHex('1051e502ec02'))).toEqual({ heartRate: 81, rrMs: [741, 748] });
  });

  it('honours the 16-bit heart-rate flag', () => {
    expect(parseHeartRateMeasurement(fromHex('112c01e502'))).toEqual({ heartRate: 300, rrMs: [741] });
  });

  it('skips the energy-expended field', () => {
    expect(parseHeartRateMeasurement(fromHex('1851' + '0a00' + 'e502'))).toEqual({ heartRate: 81, rrMs: [741] });
  });

  it('returns the beats that fit when truncated', () => {
    expect(parseHeartRateMeasurement(fromHex('1051e502ec'))).toEqual({ heartRate: 81, rrMs: [741] });
    expect(parseHeartRateMeasurement(fromHex('1051'))).toEqual({ heartRate: 81, rrMs: [] });
    expect(parseHeartRateMeasurement(fromHex('0051'))).toEqual({ heartRate: 81, rrMs: [] });
  });

  it('returns no reading for empty or header-only input', () => {
    expect(parseHeartRateMeasurement(new Uint8Array(0))).toEqual({ heartRate: 0, rrMs: [] });
    expect(parseHeartRateMeasurement(fromHex('11'))).toEqual({ heartRate: 0, rrMs: [] });
  });
});

describe('firmware', () => {
  it('parses and formats', () => {
    expect(parseFirmware('50.43.1.0')).toEqual({ major: 50, minor: 43, patch: 1, build: 0 });
    expect(parseFirmware(' 50.43.1.77\n')).toEqual({ major: 50, minor: 43, patch: 1, build: 77 });
    expect(formatFirmware({ major: 50, minor: 43, patch: 1, build: 0 })).toBe('50.43.1.0');
  });

  it('rejects malformed text', () => {
    for (const bad of ['', '50.43', '50.43.1', 'a.b.c.d', '50.43.1.0.1', '-1.0.0.0']) expect(parseFirmware(bad), bad).toBeNull();
  });

  it.each([
    ['50.38.1.0', false],
    ['50.42.9.9', false],
    ['50.43.1.0', true],
    ['51.0.0.0', true],
    ['49.99.0.0', false],
  ])('isDataLockFirmware(%s) is %s', (text, expected) => {
    const v = parseFirmware(text);
    if (!v) throw new Error(text);
    expect(isDataLockFirmware(v)).toBe(expected);
  });
});

describe('GATT', () => {
  it('exposes the band and standard characteristics', () => {
    expect(GATT.service).toBe('fd4b0001-cce1-4033-93ce-002d5875f58a');
    expect(GATT.cmdToStrap).toBe('fd4b0002-cce1-4033-93ce-002d5875f58a');
    expect(GATT.heartRateMeasurement).toBe('00002a37-0000-1000-8000-00805f9b34fb');
    expect(GATT.batteryLevel).toBe('00002a19-0000-1000-8000-00805f9b34fb');
  });
});
