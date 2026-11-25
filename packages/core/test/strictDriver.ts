import type { SqlDriver, SqlValue } from '../src/index';
import { openNodeDriver } from '../src/node/index';

export class MissedTransactionHandleError extends Error {
  constructor(method: string) {
    super(`top-level ${method}() was called while a transaction is open; inside a transaction use its tx handle`);
    this.name = 'MissedTransactionHandleError';
  }
}

export function strictDriver(inner: SqlDriver): SqlDriver {
  let open = 0;
  const guard = (method: string): void => {
    if (open > 0) throw new MissedTransactionHandleError(method);
  };
  return {
    async exec(sql) {
      guard('exec');
      await inner.exec(sql);
    },
    async run(sql, params) {
      guard('run');
      return inner.run(sql, params);
    },
    async all<T extends Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]> {
      guard('all');
      return inner.all<T>(sql, params);
    },
    async transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
      guard('transaction');
      open += 1;
      try {
        return await inner.transaction(fn);
      } finally {
        open -= 1;
      }
    },
    async close() {
      guard('close');
      await inner.close();
    },
  };
}

export function openStrictDriver(path = ':memory:'): SqlDriver {
  return strictDriver(openNodeDriver(path));
}
