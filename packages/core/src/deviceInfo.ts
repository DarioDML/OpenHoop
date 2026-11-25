import { GATT } from '@stoop/protocol';
import type { Transport } from './transport';

export interface DeviceInformation {
  firmware: string | null;
  serial: string | null;
  model: string | null;
  battery: number | null;
}

export function printableAscii(bytes: Uint8Array): string | null {
  let end = bytes.length;
  const nul = bytes.indexOf(0);
  if (nul >= 0) end = nul;
  let out = '';
  for (let i = 0; i < end; i++) {
    const b = bytes[i];
    if (b === undefined || b < 0x20 || b > 0x7e) return null;
    out += String.fromCharCode(b);
  }
  const trimmed = out.trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function readOrNull<T>(read: () => Promise<Uint8Array>, parse: (bytes: Uint8Array) => T | null): Promise<T | null> {
  try {
    return parse(await read());
  } catch {
    return null;
  }
}

export async function readDeviceInformation(transport: Transport): Promise<DeviceInformation> {
  const info = (characteristic: string): Promise<string | null> =>
    readOrNull(() => transport.read(GATT.deviceInformationService, characteristic), printableAscii);
  const firmware = await info(GATT.firmwareRevision);
  const serial = await info(GATT.serialNumber);
  const model = await info(GATT.modelNumber);
  const battery = await readOrNull(
    () => transport.read(GATT.batteryService, GATT.batteryLevel),
    (bytes) => {
      const level = bytes[0];
      return level === undefined || level > 100 ? null : level;
    },
  );
  return { firmware, serial, model, battery };
}
