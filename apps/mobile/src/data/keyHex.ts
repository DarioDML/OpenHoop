const HEX = '0123456789abcdef';
const KEY_BYTES = 32;

export function keyToHex(key: Uint8Array): string {
  let out = '';
  for (const byte of key) out += HEX.charAt(byte >> 4) + HEX.charAt(byte & 15);
  return out;
}

export function keyPragma(key: Uint8Array): string {
  return `PRAGMA key = "x'${keyToHex(key)}'"`;
}

export function parseKeyHex(text: string | null): Uint8Array | null {
  if (text === null || !/^[0-9a-f]{64}$/.test(text)) return null;
  const out = new Uint8Array(KEY_BYTES);
  for (let i = 0; i < KEY_BYTES; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}
