import { describe, expect, it } from 'vitest';
import { concat, crc16Modbus, crc32, fromHex, FrameError, Reassembler, toHex, validateFrame, wrapFrame } from '../src/index';

function frame(n: number): Uint8Array {
  return wrapFrame(Uint8Array.of(47, n, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14));
}

function patched(raw: Uint8Array, at: number, value: number): Uint8Array {
  const copy = raw.slice();
  copy[at] = value;
  return copy;
}

const FRAMES = [frame(1), frame(2), frame(3)];
const [FIRST, SECOND, THIRD] = FRAMES;
const STREAM = concat(...FRAMES);

describe('checksums', () => {
  it('computes CRC16-Modbus for the client hello header', () => {
    expect(crc16Modbus(fromHex('aa0108000001'))).toBe(0x71e6);
  });

  it('computes CRC32 like zlib', () => {
    expect(crc32(Uint8Array.from('123456789', (c) => c.charCodeAt(0)))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('hex helpers', () => {
  it('round trips and rejects bad input', () => {
    expect(toHex(fromHex('00ff10'))).toBe('00ff10');
    expect(() => fromHex('abc')).toThrow(RangeError);
    expect(() => fromHex('zz')).toThrow(RangeError);
  });
});

describe('validateFrame', () => {
  const good = frame(1);

  it('accepts a wrapped frame', () => {
    expect(() => validateFrame(good)).not.toThrow();
  });

  it('rejects frames shorter than 16 bytes', () => {
    expect(() => validateFrame(good.subarray(0, 15))).toThrow(FrameError);
  });

  it('rejects wrong start bytes', () => {
    expect(() => validateFrame(patched(good, 0, 0xab))).toThrow(FrameError);
    expect(() => validateFrame(patched(good, 1, 0x02))).toThrow(FrameError);
  });

  it('rejects a declared length mismatch', () => {
    expect(() => validateFrame(concat(good, Uint8Array.of(0)))).toThrow(/length mismatch/);
  });

  it('rejects a body that is not 4-aligned', () => {
    const raw = concat(good.subarray(0, good.length - 4), Uint8Array.of(0), good.subarray(good.length - 4));
    const v = new DataView(raw.buffer);
    v.setUint16(2, raw.length - 8, true);
    v.setUint16(6, crc16Modbus(raw.subarray(0, 6)), true);
    v.setUint32(raw.length - 4, crc32(raw.subarray(8, raw.length - 4)), true);
    expect(() => validateFrame(raw)).toThrow(/aligned/);
  });

  it('rejects a bad header CRC16', () => {
    expect(() => validateFrame(patched(good, 4, 0x09))).toThrow(/CRC16/);
  });

  it('rejects a bad body CRC32', () => {
    expect(() => validateFrame(patched(good, 12, 0x77))).toThrow(/CRC32/);
  });
});

describe('Reassembler', () => {
  it('yields the same frames when split at every byte offset (including inside the start marker)', () => {
    for (let cut = 0; cut <= STREAM.length; cut++) {
      const r = new Reassembler();
      const out = [...r.feed(STREAM.subarray(0, cut)), ...r.feed(STREAM.subarray(cut))];
      expect(out.map(toHex)).toEqual(FRAMES.map(toHex));
    }
  });

  it('yields the same frames when fed one byte at a time', () => {
    const r = new Reassembler();
    const out: Uint8Array[] = [];
    for (const b of STREAM) out.push(...r.feed(Uint8Array.of(b)));
    expect(out.map(toHex)).toEqual(FRAMES.map(toHex));
  });

  it('loses at most one frame to a corrupt byte', () => {
    if (!FIRST || !SECOND || !THIRD) throw new Error('fixture');
    const out = new Reassembler().feed(concat(FIRST, patched(SECOND, 14, 0xee), THIRD));
    expect(out.map(toHex)).toEqual([toHex(FIRST), toHex(THIRD)]);
  });

  it('skips garbage before a frame', () => {
    const r = new Reassembler();
    const out = r.feed(concat(Uint8Array.of(0, 1, 2, 0xaa, 0x55, 0xaa), STREAM));
    expect(out.map(toHex)).toEqual(FRAMES.map(toHex));
    expect(r.discardedBytes).toBe(6);
  });

  it('counts no discard for a clean stream or a partial frame waiting for more bytes', () => {
    if (!FIRST) throw new Error('fixture');
    const r = new Reassembler();
    for (const b of STREAM) r.feed(Uint8Array.of(b));
    expect(r.discardedBytes).toBe(0);
    expect(r.feed(FIRST.subarray(0, FIRST.length - 1))).toEqual([]);
    expect(r.discardedBytes).toBe(0);
    expect(r.feed(FIRST.subarray(FIRST.length - 1)).map(toHex)).toEqual([toHex(FIRST)]);
    expect(r.discardedBytes).toBe(0);
  });

  it('counts every byte of a corrupt frame as discarded', () => {
    if (!FIRST || !SECOND || !THIRD) throw new Error('fixture');
    const r = new Reassembler();
    r.feed(concat(FIRST, patched(SECOND, 14, 0xee), THIRD));
    expect(r.discardedBytes).toBe(SECOND.length);
  });

  it('reports the discard count reached before each frame while feeding', () => {
    if (!FIRST || !SECOND || !THIRD) throw new Error('fixture');
    const r = new Reassembler();
    const seen: number[] = [];
    r.feedEach(concat(FIRST, patched(SECOND, 14, 0xee), THIRD), () => seen.push(r.discardedBytes));
    expect(seen).toEqual([0, SECOND.length]);
  });
});
