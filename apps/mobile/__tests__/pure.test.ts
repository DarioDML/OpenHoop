import { CommandFailedError, CommandTimeoutError, DisconnectedError, OwnerSinceRequiredError } from '@openhoop/core';

import { BleError } from '@/ble/errors';
import {
  advertisesService,
  bytesFromNumbers,
  chunkSizeForMtu,
  isBandName,
  normalizeUuid,
  numbersFromBytes,
  sameUuid,
} from '@/ble/helpers';
import { AppError, toAppError } from '@/data/errors';
import { keyPragma, keyToHex, parseKeyHex } from '@/data/keyHex';
import {
  parseDataSource,
  parseLanguage,
  parseOptionalInteger,
  parseProfile,
  serializeOptionalInteger,
} from '@/data/settingsCodec';
import { isoDaysAgo, ownerSinceToUnix, parseIsoDate, unixToIsoDate } from '@/lib/dates';
import { exportFolderName, isExportFolder, isSafeSqlPath, toFileUri, uriToPath } from '@/lib/paths';

jest.mock('@openhoop/core', () => ({
  DisconnectedError: class DisconnectedError extends Error {},
  CommandTimeoutError: class CommandTimeoutError extends Error {},
  CommandFailedError: class CommandFailedError extends Error {},
  OwnerSinceRequiredError: class OwnerSinceRequiredError extends Error {},
}));

describe('settings serialisation', () => {
  it('round-trips optional integers and rejects out-of-range or malformed text', () => {
    expect(parseOptionalInteger(serializeOptionalInteger(1990), 1900, 2026)).toBe(1990);
    expect(parseOptionalInteger(serializeOptionalInteger(null), 1900, 2026)).toBeNull();
    expect(parseOptionalInteger('1800', 1900, 2026)).toBeNull();
    expect(parseOptionalInteger('19x0', 1900, 2026)).toBeNull();
    expect(parseOptionalInteger(null, 1, 2)).toBeNull();
  });

  it('falls back safely for unknown stored values', () => {
    expect(parseLanguage('nl')).toBe('nl');
    expect(parseLanguage('fr')).toBeNull();
    expect(parseDataSource('band')).toBe('band');
    expect(parseDataSource('whatever')).toBe('demo');
    expect(parseDataSource(null)).toBe('demo');
    expect(parseProfile('1985', '', 2026)).toEqual({ birthYear: 1985, maxHeartRate: null });
    expect(parseProfile('1985', '190', 2026)).toEqual({ birthYear: 1985, maxHeartRate: 190 });
    expect(parseProfile('3000', '50', 2026)).toEqual({ birthYear: null, maxHeartRate: null });
  });
});

describe('error to message mapping', () => {
  it('maps bluetooth failures to specific keys', () => {
    expect(toAppError(new BleError('unavailable')).key).toBe('error.bluetoothUnavailable');
    expect(toAppError(new BleError('off')).key).toBe('error.bluetoothOff');
    expect(toAppError(new BleError('permission')).key).toBe('error.bluetoothPermission');
    expect(toAppError(new BleError('not-found')).key).toBe('error.bandNotFound');
    expect(toAppError(new BleError('bond-refused')).key).toBe('error.bondRefused');
    expect(toAppError(new BleError('connect')).key).toBe('error.connectFailed');
  });

  it('maps session errors and passes AppError through', () => {
    expect(toAppError(new DisconnectedError()).key).toBe('error.disconnected');
    expect(toAppError(new CommandTimeoutError(1)).key).toBe('error.timeout');
    expect(toAppError(new CommandFailedError(1, 3)).key).toBe('error.commandFailed');
    expect(toAppError(new OwnerSinceRequiredError(1)).key).toBe('error.ownerSinceMissing');
    const own = new AppError('error.noBandPaired');
    expect(toAppError(own)).toBe(own);
    expect(toAppError('boom').key).toBe('error.unknown');
  });
});

describe('bluetooth helpers', () => {
  it('normalises short and long uuids', () => {
    expect(normalizeUuid('180D')).toBe('0000180d-0000-1000-8000-00805f9b34fb');
    expect(normalizeUuid('0000180D-0000-1000-8000-00805F9B34FB')).toBe('0000180d-0000-1000-8000-00805f9b34fb');
    expect(sameUuid('2a37', '00002A37-0000-1000-8000-00805f9b34fb')).toBe(true);
    expect(sameUuid('2a37', '2a38')).toBe(false);
  });

  it('converts bytes both ways and masks values', () => {
    expect(Array.from(bytesFromNumbers([0, 255, 256, 7]))).toEqual([0, 255, 0, 7]);
    expect(numbersFromBytes(Uint8Array.of(1, 2, 3))).toEqual([1, 2, 3]);
  });

  it('recognises bands by name or service', () => {
    expect(isBandName('WHOOP 4C1234')).toBe(true);
    expect(isBandName('whoop')).toBe(true);
    expect(isBandName('Fitbit')).toBe(false);
    expect(isBandName(null)).toBe(false);
    expect(advertisesService(['FD4B0001-CCE1-4033-93CE-002D5875F58A'], 'fd4b0001-cce1-4033-93ce-002d5875f58a')).toBe(true);
    expect(advertisesService(undefined, 'x')).toBe(false);
  });

  it('keeps the write chunk size at least 20 bytes', () => {
    expect(chunkSizeForMtu(247)).toBe(244);
    expect(chunkSizeForMtu(23)).toBe(20);
    expect(chunkSizeForMtu(5)).toBe(20);
  });
});

describe('database key helpers', () => {
  it('encodes and decodes a 32 byte key', () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i * 8);
    const hex = keyToHex(key);
    expect(hex).toHaveLength(64);
    expect(parseKeyHex(hex)).toEqual(key);
    expect(keyPragma(key)).toBe(`PRAGMA key = "x'${hex}'"`);
  });

  it('rejects malformed stored keys', () => {
    expect(parseKeyHex(null)).toBeNull();
    expect(parseKeyHex('abc')).toBeNull();
    expect(parseKeyHex('z'.repeat(64))).toBeNull();
  });
});

describe('owner-since date handling', () => {
  it('parses only real calendar dates', () => {
    expect(parseIsoDate('2026-02-28')).toEqual({ y: 2026, m: 2, d: 28 });
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('26-02-28')).toBeNull();
  });

  it('converts to local midnight and back', () => {
    const tz = 3600;
    const unix = ownerSinceToUnix('2026-11-15', tz);
    expect(unix).toBe(Date.UTC(2026, 10, 15) / 1000 - tz);
    expect(unix === null ? null : unixToIsoDate(unix, tz)).toBe('2026-11-15');
    expect(ownerSinceToUnix('nonsense', tz)).toBeNull();
  });

  it('counts days back from now', () => {
    const now = Date.UTC(2026, 10, 25, 12) / 1000;
    expect(isoDaysAgo(now, 10, 0)).toBe('2026-11-15');
  });
});

describe('export path helpers', () => {
  it('builds recognisable folder names', () => {
    const name = exportFolderName(new Date(5));
    expect(name).toBe('openhoop-export-5');
    expect(isExportFolder(name)).toBe(true);
    expect(isExportFolder('other')).toBe(false);
  });

  it('turns file uris into paths and refuses quotes', () => {
    expect(uriToPath('file:///data/user/0/app/cache/a%20b/x.db')).toBe('/data/user/0/app/cache/a b/x.db');
    expect(isSafeSqlPath('/data/x.db')).toBe(true);
    expect(isSafeSqlPath("/data/x'.db")).toBe(false);
    expect(isSafeSqlPath('')).toBe(false);
    expect(toFileUri('/data/db')).toBe('file:///data/db');
    expect(toFileUri('file:///data/db')).toBe('file:///data/db');
  });
});
