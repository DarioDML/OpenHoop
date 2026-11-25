import type { SqlDriver } from './types';

const V1 = `
CREATE TABLE devices (
  id INTEGER PRIMARY KEY,
  ble_id TEXT NOT NULL UNIQUE,
  name TEXT,
  model TEXT CHECK (model IN ('5.0', 'MG')),
  firmware TEXT,
  serial TEXT,
  owner_since INTEGER,
  config_snapshot TEXT
);

CREATE TABLE raw_chunks (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  end_token BLOB,
  frames BLOB NOT NULL,
  frame_count INTEGER NOT NULL,
  sha256 BLOB NOT NULL,
  clock_offset_s INTEGER,
  received_at INTEGER NOT NULL,
  unknown_frames INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX raw_chunks_device ON raw_chunks (device_id, id);

CREATE TABLE samples_1hz (
  device_id INTEGER NOT NULL REFERENCES devices(id),
  t INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('history', 'live', 'hrm')),
  hr INTEGER,
  rr TEXT NOT NULL DEFAULT '',
  steps INTEGER,
  skin_temp_c REAL,
  spo2_raw INTEGER,
  state TEXT CHECK (state IN ('WAKE', 'STILL', 'SLEEP', 'UP')),
  motion_g REAL,
  chunk_id INTEGER REFERENCES raw_chunks(id),
  PRIMARY KEY (device_id, t, source)
) WITHOUT ROWID;

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  t INTEGER NOT NULL,
  event INTEGER NOT NULL,
  name TEXT NOT NULL,
  payload_hex TEXT NOT NULL,
  chunk_id INTEGER REFERENCES raw_chunks(id),
  UNIQUE (device_id, t, event, payload_hex)
);

CREATE TABLE console_log (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  t INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  text TEXT NOT NULL,
  chunk_id INTEGER REFERENCES raw_chunks(id),
  UNIQUE (device_id, t, sequence)
);

CREATE TABLE sync_state (
  device_id INTEGER PRIMARY KEY REFERENCES devices(id),
  last_end_token BLOB,
  last_sync_at INTEGER,
  newest_sample_t INTEGER,
  read_page INTEGER,
  write_page INTEGER,
  trim_page INTEGER,
  total_pages INTEGER
);

CREATE TABLE daily_metrics (
  device_id INTEGER NOT NULL REFERENCES devices(id),
  day TEXT NOT NULL,
  record TEXT NOT NULL,
  readiness REAL,
  load REAL,
  sleep_score REAL,
  PRIMARY KEY (device_id, day)
);
CREATE INDEX daily_metrics_day ON daily_metrics (day);

CREATE TABLE sleeps (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  day TEXT NOT NULL,
  onset INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  asleep_s INTEGER NOT NULL,
  in_bed_s INTEGER NOT NULL,
  nap INTEGER NOT NULL
);
CREATE INDEX sleeps_day ON sleeps (device_id, day);

CREATE TABLE workouts (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  day TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  zone_seconds TEXT NOT NULL,
  avg_hr REAL NOT NULL,
  max_hr REAL NOT NULL,
  source TEXT NOT NULL,
  label TEXT
);
CREATE INDEX workouts_day ON workouts (device_id, day);

CREATE TABLE baselines (
  device_id INTEGER NOT NULL REFERENCES devices(id),
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER,
  PRIMARY KEY (device_id, name)
);

CREATE TABLE calibration (
  device_id INTEGER NOT NULL REFERENCES devices(id),
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (device_id, name)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sleep_stages (
  device_id INTEGER NOT NULL REFERENCES devices(id),
  t INTEGER NOT NULL,
  stage TEXT NOT NULL,
  PRIMARY KEY (device_id, t)
) WITHOUT ROWID;

CREATE TABLE journal (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  day TEXT NOT NULL,
  entry TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE oracle_values (
  device_id INTEGER NOT NULL REFERENCES devices(id),
  t INTEGER NOT NULL,
  name TEXT NOT NULL,
  value REAL,
  PRIMARY KEY (device_id, t, name)
) WITHOUT ROWID;

CREATE TABLE optical_bursts (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  t INTEGER NOT NULL,
  data BLOB NOT NULL,
  chunk_id INTEGER REFERENCES raw_chunks(id)
);

CREATE TABLE imu_blocks (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  t INTEGER NOT NULL,
  data BLOB NOT NULL,
  chunk_id INTEGER REFERENCES raw_chunks(id)
);

CREATE TABLE ecg_recordings (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  t INTEGER NOT NULL,
  data BLOB NOT NULL
);
`;

const V2 = `
CREATE INDEX raw_chunks_checksum ON raw_chunks (device_id, sha256);
`;

const V3 = `
ALTER TABLE sleeps ADD COLUMN source TEXT NOT NULL DEFAULT 'detected' CHECK (source IN ('detected', 'edited', 'manual'));

CREATE TABLE sleep_edits (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  kind TEXT NOT NULL CHECK (kind IN ('night', 'nap')),
  target_onset INTEGER,
  target_offset INTEGER,
  onset INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (offset > onset),
  CHECK ((target_onset IS NULL) = (target_offset IS NULL)),
  CHECK (kind = 'nap' OR target_onset IS NOT NULL)
);
CREATE INDEX sleep_edits_device ON sleep_edits (device_id, onset);
`;

export const MIGRATIONS: readonly string[] = [V1, V2, V3];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(driver: SqlDriver): Promise<void> {
  const rows = await driver.all<{ user_version: number }>('PRAGMA user_version');
  const current = rows[0]?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database schema version ${current} is newer than this app supports (${SCHEMA_VERSION})`);
  }
  for (let version = current + 1; version <= SCHEMA_VERSION; version++) {
    const script = MIGRATIONS[version - 1];
    if (script === undefined) throw new Error(`Missing migration ${version}`);
    await driver.transaction(async (tx) => {
      await tx.exec(script);
      await tx.exec(`PRAGMA user_version = ${version}`);
    });
  }
}
