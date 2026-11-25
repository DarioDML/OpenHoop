import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChunkIntegrityError, decodeChunk, driverContract, encodeChunk, openStore } from '../src/index';
import { openNodeDriver } from '../src/node/index';

describe('driver contract (node:sqlite)', () => {
  for (const check of driverContract(async () => openNodeDriver(':memory:'))) {
    it(check.name, check.run);
  }
});

describe('node driver', () => {
  it('serialises concurrent top-level transactions', async () => {
    const driver = openNodeDriver(':memory:');
    await driver.exec('CREATE TABLE t (v INTEGER)');
    const work = (n: number): Promise<number> =>
      driver.transaction(async () => {
        await driver.run('INSERT INTO t (v) VALUES (?)', [n]);
        await Promise.resolve();
        await driver.run('INSERT INTO t (v) VALUES (?)', [n]);
        return n;
      });
    expect(await Promise.all([work(1), work(2), work(3)])).toEqual([1, 2, 3]);
    const rows = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
    expect(rows[0]?.c).toBe(6);
    await driver.close();
  });

  it('enables foreign keys and WAL on a file database and persists data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stoop-core-'));
    const path = join(dir, 'db.sqlite');
    try {
      const store = await openStore(openNodeDriver(path));
      const fk = await store.driver.all<{ foreign_keys: number }>('PRAGMA foreign_keys');
      const mode = await store.driver.all<{ journal_mode: string }>('PRAGMA journal_mode');
      expect(fk[0]?.foreign_keys).toBe(1);
      expect(mode[0]?.journal_mode).toBe('wal');
      await store.setSetting('a', 'b');
      await store.driver.close();
      const reopened = await openStore(openNodeDriver(path));
      expect(await reopened.getSetting('a')).toBe('b');
      await reopened.driver.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('chunk codec', () => {
  it('round-trips frames and reports corruption', () => {
    const frames = [new Uint8Array([1, 2, 3]), new Uint8Array(0), new Uint8Array(500).fill(9)];
    const encoded = encodeChunk(frames);
    expect(encoded.frameCount).toBe(3);
    expect(encoded.sha256).toHaveLength(32);
    expect(decodeChunk(encoded.blob, encoded.sha256)).toEqual(frames);
    const wrongHash = encoded.sha256.slice();
    wrongHash[0] = (wrongHash[0] ?? 0) ^ 1;
    expect(() => decodeChunk(encoded.blob, wrongHash)).toThrow(ChunkIntegrityError);
  });

  it('handles an empty chunk', () => {
    const encoded = encodeChunk([]);
    expect(decodeChunk(encoded.blob, encoded.sha256)).toEqual([]);
  });
});
