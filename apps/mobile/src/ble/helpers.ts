const BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';

export function normalizeUuid(uuid: string): string {
  const lower = uuid.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(lower)) return `0000${lower}${BASE_SUFFIX}`;
  if (/^[0-9a-f]{8}$/.test(lower)) return `${lower}${BASE_SUFFIX}`;
  return lower;
}

export function sameUuid(a: string, b: string): boolean {
  return normalizeUuid(a) === normalizeUuid(b);
}

export function bytesFromNumbers(values: ReadonlyArray<number>): Uint8Array {
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = (values[i] ?? 0) & 0xff;
  return out;
}

export function numbersFromBytes(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

export function isBandName(name: string | null | undefined): boolean {
  return name !== null && name !== undefined && name.toUpperCase().startsWith('WHOOP');
}

export function advertisesService(serviceUuids: ReadonlyArray<string> | undefined, service: string): boolean {
  return serviceUuids?.some((uuid) => sameUuid(uuid, service)) ?? false;
}

export function chunkSizeForMtu(mtu: number): number {
  return Math.max(20, mtu - 3);
}
