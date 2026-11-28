import { SLEEP_STAGES } from '@openhoop/analytics';
import type { SleepStage } from '@openhoop/analytics';
import { ChunkIntegrityError, decodeChunk, encodeChunk } from './chunkCodec';
import { migrate } from './migrations';
import type {
  ConsoleRow,
  DayRecord,
  DeviceRow,
  EventRow,
  PackEventRow,
  SampleRow,
  SampleSource,
  SleepEditRow,
  SleepSource,
  SqlDriver,
  SqlValue,
  Store,
  SyncStateRow,
} from './types';

const MAX_PARAMS_PER_STATEMENT = 8000;

type DeviceDb = {
  id: number;
  ble_id: string;
  name: string | null;
  model: string | null;
  firmware: string | null;
  serial: string | null;
  owner_since: number | null;
  config_snapshot: string | null;
};

type SampleDb = {
  device_id: number;
  t: number;
  source: string;
  hr: number | null;
  rr: string;
  steps: number | null;
  skin_temp_c: number | null;
  spo2_raw: number | null;
  state: string | null;
  motion_g: number | null;
  chunk_id: number | null;
};

type SyncDb = {
  device_id: number;
  last_end_token: Uint8Array | null;
  last_sync_at: number | null;
  newest_sample_t: number | null;
  read_page: number | null;
  write_page: number | null;
  trim_page: number | null;
  total_pages: number | null;
};

const SAMPLE_COLUMNS = 'device_id, t, source, hr, rr, steps, skin_temp_c, spo2_raw, state, motion_g, chunk_id';

function toDevice(row: DeviceDb): DeviceRow {
  return {
    id: row.id,
    bleId: row.ble_id,
    name: row.name,
    model: row.model === '5.0' || row.model === 'MG' ? row.model : null,
    firmware: row.firmware,
    serial: row.serial,
    ownerSince: row.owner_since,
    configSnapshot: row.config_snapshot,
  };
}

function toSampleSource(value: string): SampleSource {
  if (value === 'history' || value === 'live' || value === 'hrm') return value;
  throw new Error(`Unknown sample source in database: ${value}`);
}

function toSampleState(value: string | null): SampleRow['state'] {
  if (value === null || value === 'WAKE' || value === 'STILL' || value === 'SLEEP' || value === 'UP') return value;
  throw new Error(`Unknown sample state in database: ${value}`);
}

function parseRr(text: string): number[] {
  return text === '' ? [] : text.split(',').map(Number);
}

function toSample(row: SampleDb): SampleRow {
  return {
    deviceId: row.device_id,
    t: row.t,
    source: toSampleSource(row.source),
    hr: row.hr,
    rr: parseRr(row.rr),
    steps: row.steps,
    skinTempC: row.skin_temp_c,
    spo2Raw: row.spo2_raw,
    state: toSampleState(row.state),
    motionG: row.motion_g,
    chunkId: row.chunk_id,
  };
}

function sampleParams(sample: SampleRow, chunkId: number | null): SqlValue[] {
  return [
    sample.deviceId,
    sample.t,
    sample.source,
    sample.hr,
    sample.rr.join(','),
    sample.steps,
    sample.skinTempC,
    sample.spo2Raw,
    sample.state,
    sample.motionG,
    chunkId,
  ];
}

function toSyncState(row: SyncDb): SyncStateRow {
  return {
    deviceId: row.device_id,
    lastEndToken: row.last_end_token,
    lastSyncAt: row.last_sync_at,
    newestSampleT: row.newest_sample_t,
    readPage: row.read_page,
    writePage: row.write_page,
    trimPage: row.trim_page,
    totalPages: row.total_pages,
  };
}

function isDayRecord(value: unknown): value is DayRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { deviceId?: unknown; day?: unknown };
  return typeof candidate.deviceId === 'number' && typeof candidate.day === 'string';
}

function isSleepStage(value: string): value is SleepStage {
  return (SLEEP_STAGES as readonly string[]).includes(value);
}

function isSleepSource(value: unknown): value is SleepSource {
  return value === 'detected' || value === 'edited' || value === 'manual';
}

function withSleepSources(record: DayRecord): DayRecord {
  const sleep: unknown = record.sleep;
  if (typeof sleep !== 'object' || sleep === null || !Array.isArray(record.sleep.periods)) return record;
  const periods = record.sleep.periods.map((p) => {
    const source: unknown = p.source;
    const editId: unknown = p.editId;
    return { ...p, source: isSleepSource(source) ? source : 'detected', editId: typeof editId === 'number' ? editId : null };
  });
  return { ...record, sleep: { ...record.sleep, periods } };
}

function parseDayRecord(text: string): DayRecord {
  const parsed: unknown = JSON.parse(text);
  if (!isDayRecord(parsed)) throw new Error('Stored daily record is malformed');
  return withSleepSources(parsed);
}

type SleepEditDb = {
  id: number;
  device_id: number;
  target_onset: number | null;
  target_offset: number | null;
  onset: number;
  offset: number;
  created_at: number;
  removed: number;
};

function toSleepEdit(row: SleepEditDb): SleepEditRow {
  return {
    id: row.id,
    deviceId: row.device_id,
    targetOnset: row.target_onset,
    targetOffset: row.target_offset,
    onset: row.onset,
    offset: row.offset,
    createdAt: row.created_at,
    removed: row.removed === 1,
  };
}

async function bulkInsert(
  driver: SqlDriver,
  head: string,
  columnCount: number,
  rows: SqlValue[][],
  tail = '',
): Promise<number> {
  const rowsPerStatement = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / columnCount));
  const placeholder = `(${new Array<string>(columnCount).fill('?').join(', ')})`;
  let changes = 0;
  for (let start = 0; start < rows.length; start += rowsPerStatement) {
    const batch = rows.slice(start, start + rowsPerStatement);
    const params: SqlValue[] = [];
    for (const row of batch) for (const value of row) params.push(value);
    const sql = `${head} VALUES ${new Array<string>(batch.length).fill(placeholder).join(', ')}${tail}`;
    changes += (await driver.run(sql, params)).changes;
  }
  return changes;
}

async function insertSamplesRaw(driver: SqlDriver, samples: SampleRow[], chunkId: number | null | undefined): Promise<number> {
  const rows = samples.map((s) => sampleParams(s, chunkId === undefined ? s.chunkId : chunkId));
  return bulkInsert(driver, `INSERT OR IGNORE INTO samples_1hz (${SAMPLE_COLUMNS})`, 11, rows);
}

async function insertPackEventsRaw(driver: SqlDriver, rows: PackEventRow[], chunkId: number | null): Promise<number> {
  return bulkInsert(
    driver,
    'INSERT OR IGNORE INTO battery_pack_events (device_id, t, event, name, payload_hex, chunk_id)',
    6,
    rows.map((e) => [e.deviceId, e.t, e.event, e.name, e.payloadHex, chunkId]),
  );
}

async function listEvents(
  driver: SqlDriver,
  deviceId: number,
  events: readonly number[],
  tail: string,
  tailParams: SqlValue[] = [],
): Promise<EventRow[]> {
  if (events.length === 0) return [];
  const rows = await driver.all<{ device_id: number; t: number; event: number; name: string; payload_hex: string }>(
    `SELECT device_id, t, event, name, payload_hex FROM events WHERE device_id = ? AND event IN (${events.map(() => '?').join(', ')}) ${tail}`,
    [deviceId, ...events, ...tailParams],
  );
  return rows.map((r) => ({ deviceId: r.device_id, t: r.t, event: r.event, name: r.name, payloadHex: r.payload_hex }));
}

async function writeSyncState(driver: SqlDriver, s: SyncStateRow): Promise<void> {
  await driver.run(
    `INSERT INTO sync_state (device_id, last_end_token, last_sync_at, newest_sample_t, read_page, write_page, trim_page, total_pages)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       last_end_token = excluded.last_end_token,
       last_sync_at = excluded.last_sync_at,
       newest_sample_t = excluded.newest_sample_t,
       read_page = excluded.read_page,
       write_page = excluded.write_page,
       trim_page = excluded.trim_page,
       total_pages = excluded.total_pages`,
    [s.deviceId, s.lastEndToken, s.lastSyncAt, s.newestSampleT, s.readPage, s.writePage, s.trimPage, s.totalPages],
  );
}

const RECORDING_TABLES = [
  'events',
  'battery_pack_events',
  'console_log',
  'optical_bursts',
  'imu_blocks',
  'ecg_recordings',
  'sleep_stages',
  'oracle_values',
  'calibration',
  'sleep_edits',
  'sync_state',
] as const;

async function clearDerivedRaw(tx: SqlDriver, deviceId: number): Promise<void> {
  await tx.run('DELETE FROM daily_metrics WHERE device_id = ?', [deviceId]);
  await tx.run('DELETE FROM sleeps WHERE device_id = ?', [deviceId]);
  await tx.run('DELETE FROM workouts WHERE device_id = ?', [deviceId]);
  await tx.run('DELETE FROM baselines WHERE device_id = ?', [deviceId]);
  await tx.run('DELETE FROM sleep_stages WHERE device_id = ?', [deviceId]);
}

export async function openStore(driver: SqlDriver): Promise<Store> {
  await migrate(driver);
  return bindStore(driver);
}

export function bindStore(driver: SqlDriver): Store {
  const getDevice = async (id: number): Promise<DeviceRow | null> => {
    const rows = await driver.all<DeviceDb>('SELECT * FROM devices WHERE id = ?', [id]);
    const row = rows[0];
    return row === undefined ? null : toDevice(row);
  };

  return {
    driver,
    getDevice,

    async upsertDevice(device) {
      await driver.run(
        `INSERT INTO devices (ble_id, name, model, firmware, serial, owner_since, config_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ble_id) DO UPDATE SET
           name = excluded.name,
           model = COALESCE(excluded.model, devices.model),
           firmware = excluded.firmware,
           serial = COALESCE(excluded.serial, devices.serial),
           owner_since = COALESCE(excluded.owner_since, devices.owner_since),
           config_snapshot = excluded.config_snapshot`,
        [device.bleId, device.name, device.model, device.firmware, device.serial, device.ownerSince, device.configSnapshot],
      );
      const rows = await driver.all<DeviceDb>('SELECT * FROM devices WHERE ble_id = ?', [device.bleId]);
      const row = rows[0];
      if (row === undefined) throw new Error('Device upsert did not persist');
      return toDevice(row);
    },

    async listDevices() {
      const rows = await driver.all<DeviceDb>('SELECT * FROM devices ORDER BY id');
      return rows.map(toDevice);
    },

    async commitChunk(chunk, samples, extras) {
      const encoded = encodeChunk(chunk.frames);
      return driver.transaction(async (tx) => {
        const existing =
          encoded.frameCount === 0
            ? []
            : await tx.all<{ id: number }>(
                'SELECT id FROM raw_chunks WHERE device_id = ? AND sha256 = ? ORDER BY id LIMIT 1',
                [chunk.deviceId, encoded.sha256],
              );
        const chunkId =
          existing[0]?.id ??
          (
            await tx.run(
              `INSERT INTO raw_chunks (device_id, end_token, frames, frame_count, sha256, clock_offset_s, received_at, unknown_frames)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                chunk.deviceId,
                chunk.endToken,
                encoded.blob,
                encoded.frameCount,
                encoded.sha256,
                chunk.clockOffsetS,
                chunk.receivedAt,
                extras.unknownFrames,
              ],
            )
          ).lastInsertRowid;
        await insertSamplesRaw(tx, samples, chunkId);
        await bulkInsert(
          tx,
          'INSERT OR IGNORE INTO events (device_id, t, event, name, payload_hex, chunk_id)',
          6,
          extras.events.map((e: EventRow) => [e.deviceId, e.t, e.event, e.name, e.payloadHex, chunkId]),
        );
        await insertPackEventsRaw(tx, extras.packEvents ?? [], chunkId);
        await bulkInsert(
          tx,
          'INSERT OR IGNORE INTO console_log (device_id, t, sequence, text, chunk_id)',
          5,
          extras.console.map((c: ConsoleRow) => [c.deviceId, c.t, c.sequence, c.text, chunkId]),
        );
        await writeSyncState(tx, extras.syncState);
        return chunkId;
      });
    },

    async readChunkFrames(chunkId) {
      const rows = await driver.all<{ frames: Uint8Array; sha256: Uint8Array }>(
        'SELECT frames, sha256 FROM raw_chunks WHERE id = ?',
        [chunkId],
      );
      const row = rows[0];
      if (row === undefined) throw new Error(`Raw chunk ${chunkId} does not exist`);
      return decodeChunk(row.frames, row.sha256);
    },

    async getChunkMeta(chunkId) {
      const rows = await driver.all<{ device_id: number; clock_offset_s: number | null; received_at: number }>(
        'SELECT device_id, clock_offset_s, received_at FROM raw_chunks WHERE id = ?',
        [chunkId],
      );
      const row = rows[0];
      return row === undefined
        ? null
        : { deviceId: row.device_id, clockOffsetS: row.clock_offset_s, receivedAt: row.received_at };
    },

    async skewedChunkIds(deviceId, firstId, lastId, limitS) {
      const rows = await driver.all<{ id: number }>(
        'SELECT id FROM raw_chunks WHERE device_id = ? AND id BETWEEN ? AND ? AND ABS(clock_offset_s) > ? ORDER BY id',
        [deviceId, firstId, lastId, limitS],
      );
      return rows.map((r) => r.id);
    },

    async listChunkIds(deviceId) {
      const rows = await driver.all<{ id: number }>('SELECT id FROM raw_chunks WHERE device_id = ? ORDER BY id', [deviceId]);
      return rows.map((r) => r.id);
    },

    async eventsOf(deviceId, events) {
      return listEvents(driver, deviceId, events, 'ORDER BY t, id');
    },

    async latestEventsOf(deviceId, events, limit) {
      return listEvents(driver, deviceId, events, 'ORDER BY t DESC, id DESC LIMIT ?', [limit]);
    },

    async insertPackEvents(rows, chunkId) {
      return driver.transaction((tx) => insertPackEventsRaw(tx, rows, chunkId));
    },

    async listPackEvents(deviceId, limit) {
      const rows = await driver.all<{ device_id: number; t: number; event: number; name: string; payload_hex: string }>(
        'SELECT device_id, t, event, name, payload_hex FROM battery_pack_events WHERE device_id = ? ORDER BY t DESC, id DESC LIMIT ?',
        [deviceId, limit],
      );
      return rows.map((r) => ({ deviceId: r.device_id, t: r.t, event: r.event, name: r.name, payloadHex: r.payload_hex }));
    },

    async insertSamples(samples) {
      return driver.transaction((tx) => insertSamplesRaw(tx, samples, undefined));
    },

    async samplesBetween(deviceId, from, to) {
      const rows = await driver.all<SampleDb>(
        `SELECT ${SAMPLE_COLUMNS} FROM samples_1hz WHERE device_id = ? AND t >= ? AND t < ? ORDER BY t, source`,
        [deviceId, from, to],
      );
      return rows.map(toSample);
    },

    async heartRateBuckets(deviceId, from, to, bucketS) {
      if (!Number.isInteger(bucketS) || bucketS <= 0) throw new RangeError(`bucketS must be a positive integer, got ${bucketS}`);
      const rows = await driver.all<{ bucket: number; total: number; count: number }>(
        `SELECT t - ((t % ?) + ?) % ? AS bucket, SUM(hr) AS total, COUNT(*) AS count
         FROM samples_1hz WHERE device_id = ? AND t >= ? AND t < ? AND hr > 0
         GROUP BY bucket ORDER BY bucket`,
        [bucketS, bucketS, bucketS, deviceId, from, to],
      );
      return rows.map((r) => ({ t: r.bucket, hr: r.total / r.count }));
    },

    async sampleRange(deviceId) {
      const rows = await driver.all<{ first: number | null; last: number | null; count: number }>(
        'SELECT MIN(t) AS first, MAX(t) AS last, COUNT(*) AS count FROM samples_1hz WHERE device_id = ?',
        [deviceId],
      );
      const row = rows[0];
      if (row === undefined || row.first === null || row.last === null || row.count === 0) return null;
      return { first: row.first, last: row.last, count: row.count };
    },

    async deleteSamples(deviceId, source) {
      if (source === undefined) {
        await driver.run('DELETE FROM samples_1hz WHERE device_id = ?', [deviceId]);
      } else {
        await driver.run('DELETE FROM samples_1hz WHERE device_id = ? AND source = ?', [deviceId, source]);
      }
    },

    async getSyncState(deviceId) {
      const rows = await driver.all<SyncDb>('SELECT * FROM sync_state WHERE device_id = ?', [deviceId]);
      const row = rows[0];
      return row === undefined ? null : toSyncState(row);
    },

    async setSyncState(state) {
      await writeSyncState(driver, state);
    },

    async replaceDay(day) {
      await driver.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO daily_metrics (device_id, day, record, readiness, load, sleep_score)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(device_id, day) DO UPDATE SET
             record = excluded.record,
             readiness = excluded.readiness,
             load = excluded.load,
             sleep_score = excluded.sleep_score`,
          [day.deviceId, day.day, JSON.stringify(day), day.readiness.value, day.load.value, day.sleep.score.value],
        );
        await tx.run('DELETE FROM sleeps WHERE device_id = ? AND day = ?', [day.deviceId, day.day]);
        await tx.run('DELETE FROM workouts WHERE device_id = ? AND day = ?', [day.deviceId, day.day]);
        await bulkInsert(
          tx,
          'INSERT INTO sleeps (device_id, day, onset, offset, asleep_s, in_bed_s, nap, source)',
          8,
          day.sleep.periods.map((p) => [day.deviceId, day.day, p.onset, p.offset, p.asleepS, p.inBedS, p.nap ? 1 : 0, p.source]),
        );
        await bulkInsert(
          tx,
          'INSERT INTO workouts (device_id, day, start, end, zone_seconds, avg_hr, max_hr, source, label)',
          9,
          day.workouts.map((w) => [
            day.deviceId,
            day.day,
            w.start,
            w.end,
            JSON.stringify(w.zoneSeconds),
            w.avgHr,
            w.maxHr,
            w.source,
            w.label,
          ]),
        );
      });
    },

    async getDay(deviceId, day) {
      const rows = await driver.all<{ record: string }>(
        'SELECT record FROM daily_metrics WHERE device_id = ? AND day = ?',
        [deviceId, day],
      );
      const row = rows[0];
      return row === undefined ? null : parseDayRecord(row.record);
    },

    async listDays(deviceId, fromDay, toDay) {
      const rows = await driver.all<{ record: string }>(
        'SELECT record FROM daily_metrics WHERE device_id = ? AND day >= ? AND day <= ? ORDER BY day',
        [deviceId, fromDay, toDay],
      );
      return rows.map((r) => parseDayRecord(r.record));
    },

    async getSetting(key) {
      const rows = await driver.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
      return rows[0]?.value ?? null;
    },

    async setSetting(key, value) {
      await driver.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
    },

    async clearDerived(deviceId) {
      await driver.transaction((tx) => clearDerivedRaw(tx, deviceId));
    },

    async replaceSleepStages(deviceId, from, to, epochs) {
      await driver.transaction(async (tx) => {
        await tx.run('DELETE FROM sleep_stages WHERE device_id = ? AND t >= ? AND t < ?', [deviceId, from, to]);
        await bulkInsert(
          tx,
          'INSERT OR REPLACE INTO sleep_stages (device_id, t, stage)',
          3,
          epochs.filter((e) => e.t >= from && e.t < to).map((e) => [deviceId, e.t, e.stage]),
        );
      });
    },

    async sleepStagesBetween(deviceId, from, to) {
      const rows = await driver.all<{ t: number; stage: string }>(
        'SELECT t, stage FROM sleep_stages WHERE device_id = ? AND t >= ? AND t < ? ORDER BY t',
        [deviceId, from, to],
      );
      return rows.flatMap((r) => (isSleepStage(r.stage) ? [{ t: r.t, stage: r.stage }] : []));
    },

    async listSleepEdits(deviceId) {
      const rows = await driver.all<SleepEditDb>('SELECT * FROM sleep_edits WHERE device_id = ? ORDER BY onset, id', [deviceId]);
      return rows.map(toSleepEdit);
    },

    async saveSleepEdit(edit) {
      if (edit.id === null) {
        const result = await driver.run(
          `INSERT INTO sleep_edits (device_id, target_onset, target_offset, onset, offset, created_at, removed)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [edit.deviceId, edit.targetOnset, edit.targetOffset, edit.onset, edit.offset, edit.createdAt, edit.removed ? 1 : 0],
        );
        return result.lastInsertRowid;
      }
      const result = await driver.run(
        `UPDATE sleep_edits SET target_onset = ?, target_offset = ?, onset = ?, offset = ?, created_at = ?, removed = ?
         WHERE id = ? AND device_id = ?`,
        [edit.targetOnset, edit.targetOffset, edit.onset, edit.offset, edit.createdAt, edit.removed ? 1 : 0, edit.id, edit.deviceId],
      );
      if (result.changes === 0) throw new Error(`Sleep edit ${edit.id} does not exist`);
      return edit.id;
    },

    async deleteSleepEdit(deviceId, id) {
      const result = await driver.run('DELETE FROM sleep_edits WHERE id = ? AND device_id = ?', [id, deviceId]);
      return result.changes > 0;
    },

    async deleteBefore(deviceId, t, newestInChunk) {
      return driver.transaction(async (tx) => {
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
        const ids = await tx.all<{ id: number }>('SELECT id FROM raw_chunks WHERE device_id = ? ORDER BY id', [deviceId]);
        // A raw chunk is the band's bytes as received, so it is kept whole: it is removed only when every
        // dated frame in it is older than t. A chunk straddling t, or with no dated frame, stays on disk.
        const doomed: number[] = [];
        for (const { id } of ids) {
          if (retained.has(id)) continue;
          const rows = await tx.all<{ frames: Uint8Array; sha256: Uint8Array }>(
            'SELECT frames, sha256 FROM raw_chunks WHERE id = ?',
            [id],
          );
          const row = rows[0];
          if (row === undefined) continue;
          let frames: Uint8Array[];
          try {
            frames = decodeChunk(row.frames, row.sha256);
          } catch (error) {
            if (error instanceof ChunkIntegrityError) continue;
            throw error;
          }
          const newest = newestInChunk(frames);
          if (newest !== null && newest < t) doomed.push(id);
        }
        const samples = await tx.run('DELETE FROM samples_1hz WHERE device_id = ? AND t < ?', [deviceId, t]);
        const events = await tx.run('DELETE FROM events WHERE device_id = ? AND t < ?', [deviceId, t]);
        const consoleLines = await tx.run('DELETE FROM console_log WHERE device_id = ? AND t < ?', [deviceId, t]);
        for (const table of ['battery_pack_events', 'optical_bursts', 'imu_blocks', 'ecg_recordings', 'sleep_stages', 'oracle_values']) {
          await tx.run(`DELETE FROM ${table} WHERE device_id = ? AND t < ?`, [deviceId, t]);
        }
        await tx.run('DELETE FROM sleep_edits WHERE device_id = ? AND onset < ?', [deviceId, t]);
        let chunks = 0;
        for (const id of doomed) chunks += (await tx.run('DELETE FROM raw_chunks WHERE id = ?', [id])).changes;
        await clearDerivedRaw(tx, deviceId);
        return { samples: samples.changes, events: events.changes, console: consoleLines.changes, chunks };
      });
    },
    async deleteRecordings(deviceId) {
      return driver.transaction(async (tx) => {
        const samples = await tx.run('DELETE FROM samples_1hz WHERE device_id = ?', [deviceId]);
        for (const table of RECORDING_TABLES) await tx.run(`DELETE FROM ${table} WHERE device_id = ?`, [deviceId]);
        await tx.run('DELETE FROM raw_chunks WHERE device_id = ?', [deviceId]);
        await clearDerivedRaw(tx, deviceId);
        return samples.changes;
      });
    },
  };
}
