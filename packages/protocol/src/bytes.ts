export function toHex(b: Uint8Array): string {
  let out = '';
  for (const v of b) out += v.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new RangeError('invalid hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export class ByteReader {
  private readonly view: DataView;

  constructor(raw: Uint8Array, end: number = raw.length) {
    this.view = new DataView(raw.buffer, raw.byteOffset, Math.min(end, raw.length));
  }

  get length(): number {
    return this.view.byteLength;
  }

  u8(o: number): number {
    return this.view.getUint8(o);
  }

  i8(o: number): number {
    return this.view.getInt8(o);
  }

  u16(o: number): number {
    return this.view.getUint16(o, true);
  }

  i16(o: number): number {
    return this.view.getInt16(o, true);
  }

  u32(o: number): number {
    return this.view.getUint32(o, true);
  }

  i32(o: number): number {
    return this.view.getInt32(o, true);
  }

  f32(o: number): number {
    return this.view.getFloat32(o, true);
  }

  bytes(o: number, n: number): Uint8Array {
    if (o < 0 || n < 0 || o + n > this.view.byteLength) throw new RangeError('read out of bounds');
    return new Uint8Array(this.view.buffer, this.view.byteOffset + o, n).slice();
  }
}

export function attempt<T>(read: () => T): T | null {
  try {
    return read();
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}
