import type { SqlDriver, SqlValue } from './types';

export interface ContractCheck {
  name: string;
  run: () => Promise<void>;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Driver contract violated: ${message}`);
}

function sameBytes(a: unknown, b: Uint8Array): boolean {
  if (!(a instanceof Uint8Array) || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

class Rollback extends Error {}

async function withDriver(open: () => Promise<SqlDriver>, body: (driver: SqlDriver) => Promise<void>): Promise<void> {
  const driver = await open();
  try {
    await body(driver);
  } finally {
    await driver.close();
  }
}

export function driverContract(open: () => Promise<SqlDriver>): ContractCheck[] {
  return [
    {
      name: 'binds every SqlValue type and returns it unchanged',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, i INTEGER, r REAL, s TEXT, b BLOB, n)');
          const big = new Uint8Array(100_000);
          for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff;
          const text = 'héllo, "wörld"\nline2 \u{1F600}';
          const params: SqlValue[] = [42, 1.5, text, big, null];
          await driver.run('INSERT INTO t (i, r, s, b, n) VALUES (?, ?, ?, ?, ?)', params);
          const rows = await driver.all<{ i: number; r: number; s: string; b: Uint8Array; n: null }>('SELECT i, r, s, b, n FROM t');
          const row = rows[0];
          assert(rows.length === 1 && row !== undefined, 'expected one row');
          if (row === undefined) return;
          assert(row.i === 42, 'integer round trip');
          assert(row.r === 1.5, 'real round trip');
          assert(row.s === text, 'text round trip');
          assert(row.n === null, 'null round trip');
          assert(sameBytes(row.b, big), '100 kB blob round trip');
          await driver.run('INSERT INTO t (b) VALUES (?)', [new Uint8Array(0)]);
          const empty = await driver.all<{ b: Uint8Array | null }>('SELECT b FROM t WHERE id = 2');
          assert(sameBytes(empty[0]?.b, new Uint8Array(0)), 'empty blob round trip');
        }),
    },
    {
      name: 'reports changes and lastInsertRowid',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)');
          const first = await driver.run('INSERT INTO t (v) VALUES (?)', [1]);
          const second = await driver.run('INSERT INTO t (v) VALUES (?)', [1]);
          assert(first.changes === 1, 'first insert changes');
          assert(second.lastInsertRowid === first.lastInsertRowid + 1, 'rowid increments');
          const updated = await driver.run('UPDATE t SET v = ? WHERE v = ?', [2, 1]);
          assert(updated.changes === 2, 'update changes');
          const none = await driver.run('DELETE FROM t WHERE v = ?', [99]);
          assert(none.changes === 0, 'delete without match changes');
        }),
    },
    {
      name: 'commits a transaction and returns its result',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER)');
          const result = await driver.transaction(async () => {
            await driver.run('INSERT INTO t (v) VALUES (?)', [1]);
            return 'ok';
          });
          assert(result === 'ok', 'transaction result');
          const rows = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
          assert(rows[0]?.c === 1, 'committed row visible');
        }),
    },
    {
      name: 'rolls back when the transaction throws',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER)');
          await driver.run('INSERT INTO t (v) VALUES (?)', [1]);
          let caught = false;
          try {
            await driver.transaction(async () => {
              await driver.run('INSERT INTO t (v) VALUES (?)', [2]);
              throw new Rollback('boom');
            });
          } catch (error) {
            caught = error instanceof Rollback;
          }
          assert(caught, 'the original error is rethrown');
          const rows = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
          assert(rows[0]?.c === 1, 'rolled back row is gone');
          await driver.run('INSERT INTO t (v) VALUES (?)', [3]);
          const after = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
          assert(after[0]?.c === 2, 'driver is usable after a rollback');
        }),
    },
    {
      name: 'reads inside a transaction see its own writes',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER)');
          await driver.transaction(async () => {
            await driver.run('INSERT INTO t (v) VALUES (?)', [7]);
            const rows = await driver.all<{ v: number }>('SELECT v FROM t');
            assert(rows.length === 1 && rows[0]?.v === 7, 'uncommitted write visible to the same transaction');
            const again = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
            assert(again[0]?.c === 1, 'second read inside the transaction');
          });
        }),
    },
    {
      name: 'a nested transaction joins the outer one',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER)');
          let caught = false;
          try {
            await driver.transaction(async () => {
              await driver.transaction(async () => {
                await driver.run('INSERT INTO t (v) VALUES (?)', [1]);
              });
              throw new Rollback('outer fails');
            });
          } catch (error) {
            caught = error instanceof Rollback;
          }
          assert(caught, 'outer error rethrown');
          const rows = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
          assert(rows[0]?.c === 0, 'inner work rolled back with the outer transaction');
        }),
    },
  ];
}
