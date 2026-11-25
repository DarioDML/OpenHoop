import { decodeChunk, encodeChunk } from './chunkCodec';
import { migrate } from './migrations';
import type {
  ConsoleRow,
  DayRecord,
  DeviceRow,
  EventRow,
  SampleRow,
  SampleSource,
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

function parseDayRecord(text: string): DayRecord {
  const parsed: unknown = JSON.parse(text);
  if (!isDayRecord(parsed)) throw new Error('Stored daily record is malformed');
  return parsed;
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

export async function openStore(driver: SqlDriver): Promise<Store> {
  await migrate(driver);

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
      return driver.transaction(async () => {
        const inserted = await driver.run(
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
        );
        const chunkId = inserted.lastInsertRowid;
        await insertSamplesRaw(driver, samples, chunkId);
        await bulkInsert(
          driver,
          'INSERT OR IGNORE INTO events (device_id, t, event, name, payload_hex, chunk_id)',
          6,
          extras.events.map((e: EventRow) => [e.deviceId, e.t, e.event, e.name, e.payloadHex, chunkId]),
        );
        await bulkInsert(
          driver,
          'INSERT OR IGNORE INTO console_log (device_id, t, sequence, text, chunk_id)',
          5,
          extras.console.map((c: ConsoleRow) => [c.deviceId, c.t, c.sequence, c.text, chunkId]),
        );
        await writeSyncState(driver, extras.syncState);
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

    async listChunkIds(deviceId) {
      const rows = await driver.all<{ id: number }>('SELECT id FROM raw_chunks WHERE device_id = ? ORDER BY id', [deviceId]);
      return rows.map((r) => r.id);
    },

    async insertSamples(samples) {
      return driver.transaction(() => insertSamplesRaw(driver, samples, undefined));
    },

    async samplesBetween(deviceId, from, to) {
      const rows = await driver.all<SampleDb>(
        `SELECT ${SAMPLE_COLUMNS} FROM samples_1hz WHERE device_id = ? AND t >= ? AND t < ? ORDER BY t, source`,
        [deviceId, from, to],
      );
      return rows.map(toSample);
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
      await driver.transaction(async () => {
        await driver.run(
          `INSERT INTO daily_metrics (device_id, day, record, readiness, load, sleep_score)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(device_id, day) DO UPDATE SET
             record = excluded.record,
             readiness = excluded.readiness,
             load = excluded.load,
             sleep_score = excluded.sleep_score`,
          [day.deviceId, day.day, JSON.stringify(day), day.readiness.value, day.load.value, day.sleep.score.value],
        );
        await driver.run('DELETE FROM sleeps WHERE device_id = ? AND day = ?', [day.deviceId, day.day]);
        await driver.run('DELETE FROM workouts WHERE device_id = ? AND day = ?', [day.deviceId, day.day]);
        await bulkInsert(
          driver,
          'INSERT INTO sleeps (device_id, day, onset, offset, asleep_s, in_bed_s, nap)',
          7,
          day.sleep.periods.map((p) => [day.deviceId, day.day, p.onset, p.offset, p.asleepS, p.inBedS, p.nap ? 1 : 0]),
        );
        await bulkInsert(
          driver,
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
      await driver.transaction(async () => {
        await driver.run('DELETE FROM daily_metrics WHERE device_id = ?', [deviceId]);
        await driver.run('DELETE FROM sleeps WHERE device_id = ?', [deviceId]);
        await driver.run('DELETE FROM workouts WHERE device_id = ?', [deviceId]);
        await driver.run('DELETE FROM baselines WHERE device_id = ?', [deviceId]);
      });
    },
  };
}
