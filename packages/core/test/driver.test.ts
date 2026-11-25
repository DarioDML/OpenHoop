import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ChunkIntegrityError, DriverClosedError, bindStore, decodeChunk, driverContract, encodeChunk, openStore } from '../src/index';
import { openNodeDriver } from '../src/node/index';
import type { SqlDriver, SqlValue } from '../src/index';
import { MissedTransactionHandleError, openStrictDriver } from './strictDriver';

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
      driver.transaction(async (tx) => {
        await tx.run('INSERT INTO t (v) VALUES (?)', [n]);
        await Promise.resolve();
        await tx.run('INSERT INTO t (v) VALUES (?)', [n]);
        return n;
      });
    expect(await Promise.all([work(1), work(2), work(3)])).toEqual([1, 2, 3]);
    const rows = await driver.all<{ v: number }>('SELECT v FROM t ORDER BY rowid');
    expect(rows.map((r) => r.v)).toEqual([1, 1, 2, 2, 3, 3]);
    await driver.close();
  });

  it('rejects calls after close', async () => {
    const driver = openNodeDriver(':memory:');
    await driver.close();
    await expect(driver.run('SELECT 1')).rejects.toBeInstanceOf(DriverClosedError);
  });

  it('enables foreign keys, WAL and full sync on a file database and persists data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stoop-core-'));
    const path = join(dir, 'db.sqlite');
    try {
      const store = await openStore(openStrictDriver(path));
      const fk = await store.driver.all<{ foreign_keys: number }>('PRAGMA foreign_keys');
      const mode = await store.driver.all<{ journal_mode: string }>('PRAGMA journal_mode');
      const sync = await store.driver.all<{ synchronous: number }>('PRAGMA synchronous');
      expect(fk[0]?.foreign_keys).toBe(1);
      expect(mode[0]?.journal_mode).toBe('wal');
      expect(sync[0]?.synchronous).toBe(2);
      await store.setSetting('a', 'b');
      await store.driver.close();
      const reopened = await openStore(openStrictDriver(path));
      expect(await reopened.getSetting('a')).toBe('b');
      await reopened.driver.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function globalFlagDriver(): SqlDriver {
  const db = new DatabaseSync(':memory:');
  let active = false;
  const driver: SqlDriver = {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
    },
    async all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      const rows: unknown = db.prepare(sql).all(...params);
      return rows as T[];
    },
    async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
      if (active) return fn(driver);
      active = true;
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(driver);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        active = false;
      }
    },
    async close() {
      db.close();
    },
  };
  return driver;
}

describe('driver contract against the old global-flag driver', () => {
  it('fails the isolation checks', async () => {
    const failed: string[] = [];
    for (const check of driverContract(async () => globalFlagDriver())) {
      try {
        await check.run();
      } catch {
        failed.push(check.name);
      }
    }
    expect(failed).toEqual(
      expect.arrayContaining([
        'concurrent top-level transactions do not interleave',
        'a top-level statement waits for an open transaction and survives its rollback',
        '50 concurrent read-modify-write transactions all count',
      ]),
    );
  });
});

describe('strict test driver', () => {
  it('rejects a top-level call made inside a transaction instead of deadlocking', async () => {
    const driver = openStrictDriver();
    await openStore(driver);
    await driver.exec('CREATE TABLE t (v INTEGER)');
    await expect(
      driver.transaction(async () => {
        await driver.run('INSERT INTO t (v) VALUES (?)', [1]);
      }),
    ).rejects.toBeInstanceOf(MissedTransactionHandleError);
    await driver.transaction(async (tx) => {
      await bindStore(tx).setSetting('k', 'v');
    });
    expect(await bindStore(driver).getSetting('k')).toBe('v');
    await driver.close();
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
