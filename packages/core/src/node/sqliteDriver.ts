import { DatabaseSync } from 'node:sqlite';
import { createSerialDriver } from '../store/serialDriver';
import type { SqlDriver, SqlValue } from '../store/types';

export function openNodeDriver(path: string): SqlDriver {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = FULL');
  db.exec('PRAGMA foreign_keys = ON');

  return createSerialDriver({
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params) {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
    },
    async all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[]): Promise<T[]> {
      const rows: unknown = db.prepare(sql).all(...params);
      return rows as T[];
    },
    async close() {
      db.close();
    },
  });
}
