import { newestFrameTime } from './pipeline';
import { pruneSignalsBefore } from './signals';
import { ChunkIntegrityError, decodeChunk } from './store/chunkCodec';
import type { SqlDriver, SqlValue, Store } from './store/types';

export interface RawPruneResult {
  chunks: number;
  frames: number;
  signals: number;
}

const CHUNK_REFERENCES = ['samples_1hz', 'events', 'battery_pack_events', 'console_log', 'optical_bursts', 'imu_blocks'] as const;

// The band's raw bytes and the optical and motion signals before t are removed. Readings and events decoded from a pruned chunk stay, without a link to it.
export function pruneRawBefore(store: Store, deviceId: number, t: number): Promise<RawPruneResult> {
  return store.driver.transaction(async (tx) => {
    const retained = new Set(
      (
        await tx.all<{ chunk_id: number }>(
          `SELECT chunk_id FROM samples_1hz WHERE device_id = ? AND t >= ? AND chunk_id IS NOT NULL
           UNION SELECT chunk_id FROM events WHERE device_id = ? AND t >= ? AND chunk_id IS NOT NULL
           UNION SELECT chunk_id FROM battery_pack_events WHERE device_id = ? AND t >= ? AND chunk_id IS NOT NULL
           UNION SELECT chunk_id FROM console_log WHERE device_id = ? AND t >= ? AND chunk_id IS NOT NULL`,
          [deviceId, t, deviceId, t, deviceId, t, deviceId, t],
        )
      ).map((row) => row.chunk_id),
    );
    const candidates = await tx.all<{ id: number }>('SELECT id FROM raw_chunks WHERE device_id = ? ORDER BY id', [deviceId]);
    let chunks = 0;
    let frames = 0;
    for (const { id } of candidates) {
      if (retained.has(id)) continue;
      const rows = await tx.all<{ frames: Uint8Array; sha256: Uint8Array; frame_count: number }>('SELECT frames, sha256, frame_count FROM raw_chunks WHERE id = ?', [id]);
      const row = rows[0];
      if (row === undefined) continue;
      let decoded: Uint8Array[];
      try {
        decoded = decodeChunk(row.frames, row.sha256);
      } catch (error) {
        if (error instanceof ChunkIntegrityError) continue;
        throw error;
      }
      const newest = newestFrameTime(decoded);
      if (newest === null || newest >= t) continue;
      for (const table of CHUNK_REFERENCES) await tx.run(`UPDATE ${table} SET chunk_id = NULL WHERE chunk_id = ?`, [id]);
      chunks += (await tx.run('DELETE FROM raw_chunks WHERE id = ?', [id])).changes;
      frames += row.frame_count;
    }
    const signals = await pruneSignalsBefore(tx, deviceId, t);
    return { chunks, frames, signals };
  });
}

export interface StorageStats {
  databaseBytes: number | null;
  rawChunks: number;
  rawFrames: number;
  oldestRawAt: number | null;
}

function firstNumber(rows: readonly Record<string, SqlValue>[], column: string): number | null {
  const value = rows[0]?.[column];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function storageStats(driver: SqlDriver): Promise<StorageStats> {
  const pages = firstNumber(await driver.all<Record<string, SqlValue>>('PRAGMA page_count'), 'page_count');
  const size = firstNumber(await driver.all<Record<string, SqlValue>>('PRAGMA page_size'), 'page_size');
  const raw = await driver.all<Record<string, SqlValue>>('SELECT COUNT(*) AS chunks, COALESCE(SUM(frame_count), 0) AS frames, MIN(received_at) AS oldest FROM raw_chunks');
  return {
    databaseBytes: pages === null || size === null ? null : pages * size,
    rawChunks: firstNumber(raw, 'chunks') ?? 0,
    rawFrames: firstNumber(raw, 'frames') ?? 0,
    oldestRawAt: firstNumber(raw, 'oldest'),
  };
}

export interface WipeResult {
  tables: number;
}

// Every table is emptied in one transaction. Foreign keys are checked at commit, when no rows are left, so the order does not matter.
export async function wipeAllData(driver: SqlDriver): Promise<WipeResult> {
  const tables = await driver.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  await driver.transaction(async (tx) => {
    await tx.exec('PRAGMA defer_foreign_keys = ON');
    for (const { name } of tables) await tx.run(`DELETE FROM "${name.replace(/"/g, '""')}"`);
  });
  return { tables: tables.length };
}
