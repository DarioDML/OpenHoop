import type { SqlDriver, SqlValue } from '@stoop/core';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { keyPragma } from './keyHex';

export interface ExpoDriver extends SqlDriver {
  database: SQLiteDatabase;
}

export async function openExpoDriver(name: string, key: Uint8Array): Promise<ExpoDriver> {
  const database = await openDatabaseAsync(name, { useNewConnection: true });
  try {
    await database.execAsync(keyPragma(key));
    await database.execAsync('PRAGMA journal_mode = WAL');
    await database.execAsync('PRAGMA synchronous = NORMAL');
    await database.execAsync('PRAGMA foreign_keys = ON');
    await database.getFirstAsync('SELECT count(*) FROM sqlite_master');
  } catch (error) {
    await database.closeAsync();
    throw error;
  }

  let queue: Promise<void> = Promise.resolve();
  let active = false;

  return {
    database,

    async exec(sql) {
      await database.execAsync(sql);
    },

    async run(sql, params = []) {
      const result = await database.runAsync(sql, params);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowId };
    },

    async all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      return database.getAllAsync<T>(sql, params);
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (active) return fn();
      const previous = queue;
      let release: () => void = () => undefined;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      active = true;
      try {
        await database.execAsync('BEGIN IMMEDIATE');
        try {
          const result = await fn();
          await database.execAsync('COMMIT');
          return result;
        } catch (error) {
          try {
            await database.execAsync('ROLLBACK');
          } catch {
            // the original error is the one worth reporting
          }
          throw error;
        }
      } finally {
        active = false;
        release();
      }
    },

    async close() {
      await queue;
      await database.closeAsync();
    },
  };
}
