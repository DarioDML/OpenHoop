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
CREATE TABLE body_measurements (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  weight_kg REAL NOT NULL CHECK (weight_kg >= 25 AND weight_kg <= 300),
  body_fat_pct REAL CHECK (body_fat_pct IS NULL OR (body_fat_pct >= 2 AND body_fat_pct <= 70)),
  created_at INTEGER NOT NULL
);
CREATE INDEX body_measurements_day ON body_measurements (day, id);
`;

const V4 = `
ALTER TABLE sleeps ADD COLUMN source TEXT NOT NULL DEFAULT 'detected' CHECK (source IN ('detected', 'edited', 'manual'));

CREATE TABLE sleep_edits (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  target_onset INTEGER,
  target_offset INTEGER,
  onset INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (offset > onset),
  CHECK ((target_onset IS NULL) = (target_offset IS NULL))
);
CREATE INDEX sleep_edits_device ON sleep_edits (device_id, onset);
`;

const V5 = `
CREATE TABLE lab_results (
  id INTEGER PRIMARY KEY,
  biomarker TEXT NOT NULL CHECK (length(biomarker) BETWEEN 1 AND 80),
  unit TEXT NOT NULL CHECK (length(unit) BETWEEN 1 AND 24),
  value REAL NOT NULL CHECK (value >= 0 AND value <= 1000000),
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  ref_low REAL CHECK (ref_low IS NULL OR (ref_low >= 0 AND ref_low <= 1000000)),
  ref_high REAL CHECK (ref_high IS NULL OR (ref_high >= 0 AND ref_high <= 1000000)),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  created_at INTEGER NOT NULL,
  CHECK (ref_low IS NULL OR ref_high IS NULL OR ref_low < ref_high)
);
CREATE INDEX lab_results_biomarker_day ON lab_results (biomarker, day, id);
`;

const V6 = `
CREATE TABLE activities (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  source TEXT NOT NULL CHECK (source IN ('manual', 'live', 'auto')),
  detected_start INTEGER,
  type TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  paused TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  deleted_at INTEGER,
  active_s INTEGER NOT NULL DEFAULT 0,
  load REAL,
  load_reason TEXT,
  zone_seconds TEXT NOT NULL DEFAULT '[0,0,0,0,0,0]',
  avg_hr REAL,
  max_hr REAL,
  hr_seconds INTEGER NOT NULL DEFAULT 0,
  active_minutes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (end > start),
  CHECK ((source = 'auto') = (detected_start IS NOT NULL))
);
CREATE INDEX activities_device_start ON activities (device_id, start);
CREATE UNIQUE INDEX activities_detected ON activities (device_id, detected_start) WHERE detected_start IS NOT NULL;
`;

const V7 = `
CREATE TABLE vendor_cycles (
  start_t INTEGER PRIMARY KEY,
  end_t INTEGER,
  tz_offset_s INTEGER NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  recovery_pct REAL,
  resting_hr REAL,
  hrv_ms REAL,
  skin_temp_c REAL,
  spo2_pct REAL,
  respiratory_rate REAL,
  day_strain REAL,
  source TEXT NOT NULL DEFAULT 'vendor-export' CHECK (source = 'vendor-export'),
  imported_at INTEGER NOT NULL,
  CHECK (end_t IS NULL OR end_t > start_t)
);
CREATE INDEX vendor_cycles_day ON vendor_cycles (day);

CREATE TABLE vendor_sleeps (
  onset INTEGER PRIMARY KEY,
  wake INTEGER NOT NULL,
  tz_offset_s INTEGER NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  nap INTEGER NOT NULL CHECK (nap IN (0, 1)),
  performance_pct REAL,
  asleep_min REAL,
  in_bed_min REAL,
  light_min REAL,
  deep_min REAL,
  rem_min REAL,
  awake_min REAL,
  efficiency_pct REAL,
  consistency_pct REAL,
  respiratory_rate REAL,
  source TEXT NOT NULL DEFAULT 'vendor-export' CHECK (source = 'vendor-export'),
  imported_at INTEGER NOT NULL,
  CHECK (wake > onset)
);
CREATE INDEX vendor_sleeps_day ON vendor_sleeps (day);

CREATE TABLE vendor_workouts (
  start_t INTEGER PRIMARY KEY,
  end_t INTEGER NOT NULL,
  tz_offset_s INTEGER NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  activity TEXT,
  strain REAL,
  avg_hr REAL,
  max_hr REAL,
  source TEXT NOT NULL DEFAULT 'vendor-export' CHECK (source = 'vendor-export'),
  imported_at INTEGER NOT NULL,
  CHECK (end_t > start_t)
);
CREATE INDEX vendor_workouts_day ON vendor_workouts (day);

CREATE TABLE vendor_journal (
  cycle_start INTEGER NOT NULL,
  question TEXT NOT NULL,
  tz_offset_s INTEGER NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  answered_yes INTEGER NOT NULL CHECK (answered_yes IN (0, 1)),
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'vendor-export' CHECK (source = 'vendor-export'),
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (cycle_start, question)
);
CREATE INDEX vendor_journal_day ON vendor_journal (day);
`;

export const MIGRATIONS: readonly string[] = [V1, V2, V3, V4, V5, V6, V7];

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
