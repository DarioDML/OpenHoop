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

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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
          const result = await driver.transaction(async (tx) => {
            await tx.run('INSERT INTO t (v) VALUES (?)', [1]);
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
            await driver.transaction(async (tx) => {
              await tx.run('INSERT INTO t (v) VALUES (?)', [2]);
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
          await driver.transaction(async (tx) => {
            await tx.run('INSERT INTO t (v) VALUES (?)', [7]);
            const rows = await tx.all<{ v: number }>('SELECT v FROM t');
            assert(rows.length === 1 && rows[0]?.v === 7, 'uncommitted write visible to the same transaction');
            const again = await tx.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
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
            await driver.transaction(async (tx) => {
              await tx.transaction(async (inner) => {
                await inner.run('INSERT INTO t (v) VALUES (?)', [1]);
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
    {
      name: 'a throw from a nested transaction rolls back the whole transaction',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER)');
          let caught = false;
          try {
            await driver.transaction(async (tx) => {
              await tx.run('INSERT INTO t (v) VALUES (?)', [1]);
              try {
                await tx.transaction(async (inner) => {
                  await inner.run('INSERT INTO t (v) VALUES (?)', [2]);
                  throw new Rollback('inner fails');
                });
              } catch {
                await tx.run('INSERT INTO t (v) VALUES (?)', [3]);
              }
            });
          } catch (error) {
            caught = error instanceof Rollback;
          }
          assert(caught, 'the nested error is rethrown even when the outer callback swallows it');
          const rows = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
          assert(rows[0]?.c === 0, 'outer and nested work rolled back together');
        }),
    },
    {
      name: 'concurrent top-level transactions do not interleave',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER)');
          const seen: number[] = [];
          const writer = driver.transaction(async (tx) => {
            await tx.run('INSERT INTO t (v) VALUES (?)', [1]);
            await tick();
            await tick();
            await tx.run('INSERT INTO t (v) VALUES (?)', [2]);
          });
          const reader = driver.transaction(async (tx) => {
            const rows = await tx.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
            seen.push(rows[0]?.c ?? -1);
            await tx.run('INSERT INTO t (v) VALUES (?)', [3]);
          });
          await Promise.all([writer, reader]);
          assert(seen.length === 1 && (seen[0] === 0 || seen[0] === 2), `second transaction saw ${seen[0] ?? 'nothing'} rows`);
          const rows = await driver.all<{ c: number }>('SELECT COUNT(*) AS c FROM t');
          assert(rows[0]?.c === 3, 'both transactions committed');
        }),
    },
    {
      name: 'a top-level statement waits for an open transaction and survives its rollback',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER)');
          const opened = deferred();
          const proceed = deferred();
          let insideSaw: number[] = [];
          const failing = driver.transaction(async (tx) => {
            await tx.run('INSERT INTO t (v) VALUES (?)', [1]);
            opened.resolve();
            await proceed.promise;
            await tick();
            await tick();
            insideSaw = (await tx.all<{ v: number }>('SELECT v FROM t ORDER BY v')).map((row) => row.v);
            throw new Rollback('roll back the transaction');
          });
          await opened.promise;
          const outside = driver.run('INSERT INTO t (v) VALUES (?)', [99]);
          proceed.resolve();
          let caught = false;
          try {
            await failing;
          } catch (error) {
            caught = error instanceof Rollback;
          }
          await outside;
          assert(caught, 'the transaction error is rethrown');
          assert(insideSaw.length === 1 && insideSaw[0] === 1, `the transaction saw rows ${insideSaw.join(',')}`);
          const rows = await driver.all<{ v: number }>('SELECT v FROM t ORDER BY v');
          assert(rows.length === 1 && rows[0]?.v === 99, 'the outside write is kept and the rolled-back one is gone');
        }),
    },
    {
      name: 'a failed statement inside a transaction leaves the driver usable',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER NOT NULL)');
          let failed = false;
          try {
            await driver.transaction(async (tx) => {
              await tx.run('INSERT INTO t (v) VALUES (?)', [1]);
              await tx.run('INSERT INTO t (v) VALUES (?)', [null]);
            });
          } catch {
            failed = true;
          }
          assert(failed, 'the constraint violation is reported');
          await driver.transaction(async (tx) => {
            await tx.run('INSERT INTO t (v) VALUES (?)', [2]);
          });
          const rows = await driver.all<{ v: number }>('SELECT v FROM t');
          assert(rows.length === 1 && rows[0]?.v === 2, 'the next transaction commits on its own');
        }),
    },
    {
      name: 'a transaction handle cannot be used after its transaction ends',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE t (v INTEGER)');
          const leaked: SqlDriver[] = [];
          await driver.transaction(async (tx) => {
            leaked.push(tx);
          });
          let rejected = false;
          try {
            await leaked[0]?.run('INSERT INTO t (v) VALUES (?)', [1]);
          } catch {
            rejected = true;
          }
          assert(rejected, 'a stale handle rejects');
          let closeRejected = false;
          await driver.transaction(async (tx) => {
            try {
              await tx.close();
            } catch {
              closeRejected = true;
            }
          });
          assert(closeRejected, 'close() on a handle rejects');
        }),
    },
    {
      name: '50 concurrent read-modify-write transactions all count',
      run: () =>
        withDriver(open, async (driver) => {
          await driver.exec('CREATE TABLE counter (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)');
          await driver.run('INSERT INTO counter (id, n) VALUES (?, ?)', [1, 0]);
          const bump = (): Promise<void> =>
            driver.transaction(async (tx) => {
              const rows = await tx.all<{ n: number }>('SELECT n FROM counter WHERE id = ?', [1]);
              await tick();
              await tx.run('UPDATE counter SET n = ? WHERE id = ?', [(rows[0]?.n ?? 0) + 1, 1]);
            });
          const work: Promise<unknown>[] = [];
          for (let i = 0; i < 50; i++) {
            work.push(bump());
            if (i % 5 === 0) work.push(driver.run('UPDATE counter SET n = n WHERE id = ?', [1]));
          }
          await Promise.all(work);
          const rows = await driver.all<{ n: number }>('SELECT n FROM counter WHERE id = ?', [1]);
          assert(rows[0]?.n === 50, `counter is ${rows[0]?.n ?? 'missing'} after 50 increments`);
        }),
    },
  ];
}
