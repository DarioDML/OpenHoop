import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlValue } from '../store/types';

export function openNodeDriver(path: string): SqlDriver {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const scope = new AsyncLocalStorage<true>();
  let queue: Promise<void> = Promise.resolve();

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

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (scope.getStore() === true) return fn();
      const previous = queue;
      let release: () => void = () => undefined;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await scope.run(true, async () => {
          db.exec('BEGIN IMMEDIATE');
          try {
            const result = await fn();
            db.exec('COMMIT');
            return result;
          } catch (error) {
            try {
              db.exec('ROLLBACK');
            } catch {
              // the original error is the one worth reporting
            }
            throw error;
          }
        });
      } finally {
        release();
      }
    },

    async close() {
      db.close();
    },
  };
  return driver;
}
