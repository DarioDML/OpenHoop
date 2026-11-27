export const SERIAL_CODE_LENGTH = 4;

export function serialCode(serial: string | null | undefined): string | null {
  if (serial === null || serial === undefined) return null;
  const clean = serial.replace(/[^0-9a-z]/gi, '').toUpperCase();
  return clean.length >= SERIAL_CODE_LENGTH ? clean.slice(-SERIAL_CODE_LENGTH) : null;
}

export function codeMatches(typed: string, code: string): boolean {
  return typed.trim().toUpperCase() === code.toUpperCase();
}
