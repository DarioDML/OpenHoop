import { concat } from './bytes';

const SOF = 0xaa;
const FORMAT1 = 0x01;
const BODY_OFFSET = 8;
const MIN_FRAME = 16;
const MAX_FRAME = 4096;

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameError';
  }
}

export function crc16Modbus(data: Uint8Array): number {
  let crc = 0xffff;
  for (const b of data) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) crc = (CRC32_TABLE[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function view(raw: Uint8Array): DataView {
  return new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
}

export function validateFrame(raw: Uint8Array): void {
  if (raw.length < MIN_FRAME) throw new FrameError('too short');
  if (raw[0] !== SOF || raw[1] !== FORMAT1) throw new FrameError('not a format-1 frame');
  const v = view(raw);
  const declared = v.getUint16(2, true);
  if (declared + 8 !== raw.length) {
    throw new FrameError(`length mismatch: declared ${declared}, got ${raw.length - 8}`);
  }
  if ((declared - 4) % 4 !== 0) throw new FrameError('body not 4-aligned');
  if (crc16Modbus(raw.subarray(0, 6)) !== v.getUint16(6, true)) throw new FrameError('header CRC16 mismatch');
  if (crc32(raw.subarray(BODY_OFFSET, raw.length - 4)) !== v.getUint32(raw.length - 4, true)) {
    throw new FrameError('body CRC32 mismatch');
  }
}

export function wrapFrame(body: Uint8Array, destination = 0x01, source = 0x00): Uint8Array {
  const padded = new Uint8Array(Math.ceil(body.length / 4) * 4);
  padded.set(body);
  const out = new Uint8Array(BODY_OFFSET + padded.length + 4);
  const v = view(out);
  out[0] = SOF;
  out[1] = FORMAT1;
  v.setUint16(2, padded.length + 4, true);
  out[4] = destination;
  out[5] = source;
  v.setUint16(6, crc16Modbus(out.subarray(0, 6)), true);
  out.set(padded, BODY_OFFSET);
  v.setUint32(BODY_OFFSET + padded.length, crc32(padded), true);
  return out;
}

function findStart(buf: Uint8Array, from: number): number {
  for (let i = from; i + 1 < buf.length; i++) {
    if (buf[i] === SOF && buf[i + 1] === FORMAT1) return i;
  }
  return -1;
}

export class Reassembler {
  private buf: Uint8Array = new Uint8Array(0);
  private discarded = 0;

  get discardedBytes(): number {
    return this.discarded;
  }

  feed(chunk: Uint8Array): Uint8Array[] {
    const out: Uint8Array[] = [];
    this.feedEach(chunk, (frame) => out.push(frame));
    return out;
  }

  // onFrame runs as each frame is found, so discardedBytes read inside it counts only the bytes before that frame.
  feedEach(chunk: Uint8Array, onFrame: (frame: Uint8Array) => void): void {
    const buf = concat(this.buf, chunk);
    let pos = 0;
    const skipTo = (next: number): void => {
      this.discarded += next - pos;
      pos = next;
    };
    try {
      for (;;) {
        const start = findStart(buf, pos);
        if (start < 0) {
          skipTo(buf.length > pos && buf[buf.length - 1] === SOF ? buf.length - 1 : buf.length);
          break;
        }
        skipTo(start);
        if (buf.length - pos < 4) break;
        const total = view(buf).getUint16(pos + 2, true) + 8;
        if (total < MIN_FRAME || total > MAX_FRAME) {
          skipTo(pos + 1);
          continue;
        }
        if (buf.length - pos < total) break;
        const candidate = buf.slice(pos, pos + total);
        try {
          validateFrame(candidate);
        } catch (e) {
          if (!(e instanceof FrameError)) throw e;
          skipTo(pos + 1);
          continue;
        }
        pos += total;
        onFrame(candidate);
      }
    } finally {
      this.buf = buf.slice(pos);
    }
  }
}
