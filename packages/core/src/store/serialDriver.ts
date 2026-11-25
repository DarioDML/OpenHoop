import type { SqlDriver, SqlRunResult, SqlValue } from './types';

export interface SqlConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<SqlRunResult>;
  all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}

export class TransactionFinishedError extends Error {
  constructor() {
    super('This transaction handle was used after its transaction ended');
    this.name = 'TransactionFinishedError';
  }
}

export class DriverClosedError extends Error {
  constructor() {
    super('The database driver is closed');
    this.name = 'DriverClosedError';
  }
}

interface Scope {
  finished: boolean;
  nestedFailure: { error: unknown } | null;
}

async function rollbackQuietly(connection: SqlConnection): Promise<void> {
  try {
    await connection.exec('ROLLBACK');
  } catch {
    // SQLite may already have rolled back on its own; the caller's error is the one to report
  }
}

function transactionHandle(connection: SqlConnection, scope: Scope): SqlDriver {
  const live = (): void => {
    if (scope.finished) throw new TransactionFinishedError();
  };
  const handle: SqlDriver = {
    async exec(sql) {
      live();
      await connection.exec(sql);
    },
    async run(sql, params = []) {
      live();
      return connection.run(sql, params);
    },
    async all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      live();
      return connection.all<T>(sql, params);
    },
    async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
      live();
      try {
        return await fn(handle);
      } catch (error) {
        scope.nestedFailure ??= { error };
        throw error;
      }
    },
    async close() {
      throw new Error('close() cannot be called on a transaction handle');
    },
  };
  return handle;
}

/**
 * Every top-level call runs on one FIFO queue, so a statement issued outside a transaction can never
 * land inside one, and transactions never interleave. Inside `transaction(fn)` all work must go
 * through the `tx` handle: awaiting a top-level call from within `fn` waits for `fn` itself and deadlocks.
 */
export function createSerialDriver(connection: SqlConnection): SqlDriver {
  let tail: Promise<unknown> = Promise.resolve();
  let closed = false;

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(new DriverClosedError());
    const result = tail.then(task);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const runTransaction = async <T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> => {
    await connection.exec('BEGIN IMMEDIATE');
    const scope: Scope = { finished: false, nestedFailure: null };
    let result: T;
    try {
      result = await fn(transactionHandle(connection, scope));
    } catch (error) {
      scope.finished = true;
      await rollbackQuietly(connection);
      throw error;
    }
    scope.finished = true;
    if (scope.nestedFailure !== null) {
      await rollbackQuietly(connection);
      throw scope.nestedFailure.error;
    }
    try {
      await connection.exec('COMMIT');
    } catch (error) {
      await rollbackQuietly(connection);
      throw error;
    }
    return result;
  };

  return {
    exec: (sql) => enqueue(() => connection.exec(sql)),
    run: (sql, params = []) => enqueue(() => connection.run(sql, params)),
    all: <T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []) =>
      enqueue(() => connection.all<T>(sql, params)),
    transaction: <T>(fn: (tx: SqlDriver) => Promise<T>) => enqueue(() => runTransaction(fn)),
    async close() {
      if (closed) return;
      const pending = enqueue(() => connection.close());
      closed = true;
      await pending;
    },
  };
}
