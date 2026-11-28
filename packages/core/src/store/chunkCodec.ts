import { deflateSync, inflateSync } from 'fflate';
import { sha256 } from '@noble/hashes/sha2.js';

export class ChunkIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkIntegrityError';
  }
}

export interface EncodedChunk {
  blob: Uint8Array;
  sha256: Uint8Array;
  frameCount: number;
}

export function encodeChunk(frames: readonly Uint8Array[]): EncodedChunk {
  let total = 0;
  for (const frame of frames) total += 4 + frame.length;
  const raw = new Uint8Array(total);
  const view = new DataView(raw.buffer);
  let offset = 0;
  for (const frame of frames) {
    view.setUint32(offset, frame.length, true);
    raw.set(frame, offset + 4);
    offset += 4 + frame.length;
  }
  return { blob: deflateSync(raw), sha256: sha256(raw), frameCount: frames.length };
}

const LENGTH_PREFIX = 4;

function lengthPrefix(length: number): Uint8Array {
  const prefix = new Uint8Array(LENGTH_PREFIX);
  new DataView(prefix.buffer).setUint32(0, length, true);
  return prefix;
}

// Hashes each frame as it is added, so encoding a finished chunk only has to deflate it.
export class ChunkBuilder {
  private readonly list: Uint8Array[] = [];
  private readonly hash = sha256.create();
  private total = 0;
  private result: EncodedChunk | null = null;

  get frames(): readonly Uint8Array[] {
    return this.list;
  }

  add(frame: Uint8Array): void {
    if (this.result !== null) throw new Error('This chunk is already encoded; start a new one');
    const copy = frame.slice();
    this.list.push(copy);
    this.hash.update(lengthPrefix(copy.length));
    this.hash.update(copy);
    this.total += LENGTH_PREFIX + copy.length;
  }

  encode(): EncodedChunk {
    if (this.result !== null) return this.result;
    const raw = new Uint8Array(this.total);
    const view = new DataView(raw.buffer);
    let offset = 0;
    for (const frame of this.list) {
      view.setUint32(offset, frame.length, true);
      raw.set(frame, offset + LENGTH_PREFIX);
      offset += LENGTH_PREFIX + frame.length;
    }
    this.result = { blob: deflateSync(raw), sha256: this.hash.digest(), frameCount: this.list.length };
    return this.result;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function decodeChunk(blob: Uint8Array, expectedSha256: Uint8Array): Uint8Array[] {
  let raw: Uint8Array;
  try {
    raw = inflateSync(blob);
  } catch {
    throw new ChunkIntegrityError('Raw chunk is corrupted: the compressed data cannot be inflated');
  }
  if (!sameBytes(sha256(raw), expectedSha256)) {
    throw new ChunkIntegrityError('Raw chunk is corrupted: SHA-256 checksum does not match');
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const frames: Uint8Array[] = [];
  let offset = 0;
  while (offset < raw.length) {
    if (offset + 4 > raw.length) throw new ChunkIntegrityError('Raw chunk is corrupted: truncated length prefix');
    const length = view.getUint32(offset, true);
    offset += 4;
    if (offset + length > raw.length) throw new ChunkIntegrityError('Raw chunk is corrupted: truncated frame');
    frames.push(raw.slice(offset, offset + length));
    offset += length;
  }
  return frames;
}
