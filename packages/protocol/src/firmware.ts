export interface FirmwareVersion {
  major: number;
  minor: number;
  patch: number;
  build: number;
}

const VERSION = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})\.(\d{1,10})$/;

export function parseFirmware(text: string): FirmwareVersion | null {
  const m = VERSION.exec(text.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), build: Number(m[4]) };
}

export function formatFirmware(v: FirmwareVersion): string {
  return `${v.major}.${v.minor}.${v.patch}.${v.build}`;
}

export function isDataLockFirmware(v: FirmwareVersion): boolean {
  return v.major > 50 || (v.major === 50 && v.minor >= 43);
}
