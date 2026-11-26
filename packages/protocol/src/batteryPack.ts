import { ByteReader } from './bytes';
import type { FirmwareVersion } from './firmware';
import { readValue, schema, spec } from './schema';

export interface PackInfo {
  serial: string;
  hwFamily: number;
  hwVersion: number;
  firmware: FirmwareVersion;
  colourway: number;
}

export interface PackReading {
  socPercent: number | null;
  info?: PackInfo;
}

export const PACK_SOC_EVENT = 2;
export const PACK_INFO_EVENT = 20;

function printable(bytes: Uint8Array): string | null {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  if (end === 0) return null;
  let out = '';
  for (const b of bytes.subarray(0, end)) {
    if (b < 0x20 || b > 0x7e) return null;
    out += String.fromCharCode(b);
  }
  return out;
}

function decodeInfo(r: ByteReader, payload: Uint8Array): PackInfo | null {
  const { fields: f, serialOffset, serialLength } = schema.pack.info;
  const serial = printable(payload.subarray(serialOffset, serialOffset + serialLength));
  if (serial === null) return null;
  const u8 = (name: string): number => r.u8(spec(f, name).offset ?? 0);
  return {
    serial,
    hwFamily: u8('hw_family'),
    hwVersion: u8('hw_version'),
    firmware: { major: u8('fw_major'), minor: u8('fw_minor'), patch: u8('fw_patch'), build: u8('fw_build') },
    colourway: u8('colourway'),
  };
}

export function decodePackPayload(event: number, payload: Uint8Array): PackReading | null {
  const layout = event === PACK_SOC_EVENT ? schema.pack.soc : event === PACK_INFO_EVENT ? schema.pack.info : null;
  if (layout === null || payload.length !== layout.length) return null;
  const r = new ByteReader(payload);
  if (readValue(r, spec(layout.fields, 'revision')) !== schema.pack.revision) return null;
  const socPercent = readValue(r, spec(layout.fields, 'soc_percent'));
  if (event === PACK_SOC_EVENT) return { socPercent };
  const info = decodeInfo(r, payload);
  return info === null ? { socPercent } : { socPercent, info };
}
