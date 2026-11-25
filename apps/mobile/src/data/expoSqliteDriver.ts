import { createSerialDriver, type SqlDriver, type SqlValue } from '@openhoop/core';
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
    await database.execAsync('PRAGMA synchronous = FULL');
    await database.execAsync('PRAGMA foreign_keys = ON');
    await database.getFirstAsync('SELECT count(*) FROM sqlite_master');
  } catch (error) {
    await database.closeAsync();
    throw error;
  }

  const driver = createSerialDriver({
    async exec(sql) {
      await database.execAsync(sql);
    },
    async run(sql, params) {
      const result = await database.runAsync(sql, params);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowId };
    },
    async all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[]): Promise<T[]> {
      return database.getAllAsync<T>(sql, params);
    },
    async close() {
      await database.closeAsync();
    },
  });
  return { ...driver, database };
}
