import { describe, expect, it } from 'vitest';
import { GATT } from '@stoop/protocol';
import { interpretPairingError, isBandAdvertisement, normalizeUuid, sameUuid } from '../src/matching';

describe('normalizeUuid', () => {
  it('expands 16-bit and 32-bit forms to the 128-bit form used in GATT', () => {
    expect(normalizeUuid('180d')).toBe(GATT.heartRateService);
    expect(normalizeUuid('0000180D')).toBe(GATT.heartRateService);
    expect(normalizeUuid('0x2A19')).toBe(GATT.batteryLevel);
  });

  it('adds dashes to the compact lowercase form noble reports', () => {
    expect(normalizeUuid('fd4b0001cce1403393ce002d5875f58a')).toBe(GATT.service);
    expect(normalizeUuid(GATT.service.toUpperCase())).toBe(GATT.service);
  });

  it('matches every characteristic constant against its noble form', () => {
    for (const uuid of Object.values(GATT)) {
      expect(normalizeUuid(uuid.replace(/-/g, ''))).toBe(uuid);
      expect(sameUuid(uuid, uuid.replace(/-/g, '').toUpperCase())).toBe(true);
    }
  });

  it('rejects text that is not a UUID', () => {
    expect(() => normalizeUuid('')).toThrow(RangeError);
    expect(() => normalizeUuid('xyz1')).toThrow(RangeError);
    expect(() => normalizeUuid('123')).toThrow(RangeError);
  });
});

describe('isBandAdvertisement', () => {
  it('accepts the custom service in any notation', () => {
    expect(isBandAdvertisement({ localName: '', serviceUuids: ['fd4b0001cce1403393ce002d5875f58a'] })).toBe(true);
    expect(isBandAdvertisement({ serviceUuids: ['180d', GATT.service.toUpperCase()] })).toBe(true);
  });

  it('accepts names that start with WHOOP', () => {
    expect(isBandAdvertisement({ localName: 'WHOOP 4C0123', serviceUuids: [] })).toBe(true);
    expect(isBandAdvertisement({ localName: ' whoop mg' })).toBe(true);
  });

  it('rejects everything else, including malformed service entries', () => {
    expect(isBandAdvertisement({ localName: 'Polar H10', serviceUuids: ['180d'] })).toBe(false);
    expect(isBandAdvertisement({ localName: 'My WHOOP', serviceUuids: ['not-a-uuid'] })).toBe(false);
    expect(isBandAdvertisement({})).toBe(false);
  });
});

describe('interpretPairingError', () => {
  it('maps the library messages to bond results', () => {
    expect(interpretPairingError(new Error('Pairing is not supported on this platform'))).toBe('unsupported');
    expect(interpretPairingError(new Error('pairing failed with status AuthenticationNotAllowed'))).toBe('refused');
    expect(interpretPairingError(new Error('device reports it cannot be paired'))).toBe('refused');
    expect(interpretPairingError(new Error('device not connected'))).toBeNull();
    expect(interpretPairingError('boom')).toBeNull();
  });
});
