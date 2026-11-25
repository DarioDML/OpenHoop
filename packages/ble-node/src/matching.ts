import { GATT } from '@openhoop/protocol';
import type { BondResult } from '@openhoop/core';

const BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';
const HEX = /^[0-9a-f]+$/;
const NAME_PREFIX = 'whoop';

export function normalizeUuid(uuid: string): string {
  const hex = uuid.trim().toLowerCase().replace(/^0x/, '').replace(/[-{}]/g, '');
  if (!HEX.test(hex)) throw new RangeError(`not a Bluetooth UUID: ${uuid}`);
  if (hex.length === 4) return `0000${hex}${BASE_SUFFIX}`;
  if (hex.length === 8) return `${hex}${BASE_SUFFIX}`;
  if (hex.length === 32) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new RangeError(`not a Bluetooth UUID: ${uuid}`);
}

export function sameUuid(a: string, b: string): boolean {
  return normalizeUuid(a) === normalizeUuid(b);
}

export function isBandAdvertisement(advertisement: {
  localName?: string | null;
  serviceUuids?: readonly string[];
}): boolean {
  const name = advertisement.localName?.trim().toLowerCase() ?? '';
  if (name.startsWith(NAME_PREFIX)) return true;
  const band = normalizeUuid(GATT.service);
  return (advertisement.serviceUuids ?? []).some((uuid) => {
    try {
      return normalizeUuid(uuid) === band;
    } catch {
      return false;
    }
  });
}

const REFUSAL_MARKERS = [
  'pairing failed with status',
  'cannot be paired',
  'pin or password',
  'rejectedbyhandler',
  'pairingcanceled',
];

export function interpretPairingError(error: unknown): BondResult | null {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (message.includes('not supported on this platform')) return 'unsupported';
  if (REFUSAL_MARKERS.some((marker) => message.includes(marker))) return 'refused';
  return null;
}
