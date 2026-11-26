import type { ActiveMinutes, StressDay } from '@openhoop/analytics';

export type SqlValue = string | number | null | Uint8Array;

export interface SqlRunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<SqlRunResult>;
  all<T extends Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /**
   * Top-level calls are serialised: each waits for any open transaction and for earlier calls.
   * Inside `fn` every statement must go through `tx`; calling the top-level driver there deadlocks.
   * `tx.transaction(inner)` joins the open transaction, and `tx.close()` throws.
   */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type BandModel = '5.0' | 'MG';
export type SampleSource = 'history' | 'live' | 'hrm';

export interface DeviceRow {
  id: number;
  bleId: string;
  name: string | null;
  model: BandModel | null;
  firmware: string | null;
  serial: string | null;
  ownerSince: number | null;
  configSnapshot: string | null;
}

export interface SampleRow {
  deviceId: number;
  t: number;
  source: SampleSource;
  hr: number | null;
  rr: number[];
  steps: number | null;
  skinTempC: number | null;
  spo2Raw: number | null;
  state: 'WAKE' | 'STILL' | 'SLEEP' | 'UP' | null;
  motionG: number | null;
  chunkId: number | null;
}

export interface ChunkInput {
  deviceId: number;
  endToken: Uint8Array | null;
  frames: Uint8Array[];
  clockOffsetS: number | null;
  receivedAt: number;
}

export interface EventRow {
  deviceId: number;
  t: number;
  event: number;
  name: string;
  payloadHex: string;
}

export interface ConsoleRow {
  deviceId: number;
  t: number;
  sequence: number;
  text: string;
}

export interface SyncStateRow {
  deviceId: number;
  lastEndToken: Uint8Array | null;
  lastSyncAt: number | null;
  newestSampleT: number | null;
  readPage: number | null;
  writePage: number | null;
  trimPage: number | null;
  totalPages: number | null;
}

export interface Derived {
  value: number | null;
  reason: string | null;
  coverage: number | null;
  algo: string;
}

export type SleepSource = 'detected' | 'edited' | 'manual';

export interface SleepPeriodRecord {
  onset: number;
  offset: number;
  asleepS: number;
  inBedS: number;
  nap: boolean;
  source: SleepSource;
  editId: number | null;
}

export interface SleepEdit {
  id: number;
  targetOnset: number | null;
  targetOffset: number | null;
  onset: number;
  offset: number;
}

export interface SleepEditRow extends SleepEdit {
  deviceId: number;
  createdAt: number;
}

export type SleepEditInput = Omit<SleepEditRow, 'id'> & { id: number | null };

export interface WorkoutRecord {
  start: number;
  end: number;
  zoneSeconds: number[];
  avgHr: number;
  maxHr: number;
  source: 'auto' | 'manual';
  label: string | null;
}

export interface DayRecord {
  deviceId: number;
  day: string;
  start: number;
  end: number;
  tzOffsetS: number;
  flags: string[];
  sleep: {
    periods: SleepPeriodRecord[];
    asleepS: number | null;
    inBedS: number | null;
    need: Derived;
    debt: Derived;
    consistency: Derived;
    score: Derived;
  };
  hrv: Derived;
  restingHr: Derived;
  respiratoryRate: Derived;
  spo2: Derived;
  skinTempC: Derived;
  skinTempDeviationC: Derived;
  readiness: Derived;
  readinessCalibrating: boolean;
  readinessContributions: { hrv: number; sleep: number; rhr: number } | null;
  load: Derived;
  zoneSeconds: number[];
  steps: number | null;
  heartRate: { min: number | null; avg: number | null; max: number | null };
  workouts: WorkoutRecord[];
  activeMinutes?: ActiveMinutes | null;
  stress?: StressDay | null;
}

export type ExportTable =
  | 'devices'
  | 'samples_1hz'
  | 'daily_metrics'
  | 'sleeps'
  | 'sleep_edits'
  | 'workouts'
  | 'activities'
  | 'events'
  | 'console_log'
  | 'raw_chunks'
  | 'body_measurements'
  | 'lab_results'
  | 'coach_conversations'
  | 'coach_messages'
  | 'coach_memory'
  | 'cycle_periods'
  | 'symptom_logs'
  | 'pregnancy'
  | 'strength_exercises'
  | 'strength_templates'
  | 'strength_template_items'
  | 'strength_sessions'
  | 'strength_session_exercises'
  | 'strength_sets'
  | 'journal_notes'
  | 'vendor_cycles'
  | 'vendor_sleeps'
  | 'vendor_workouts'
  | 'vendor_journal'
  | 'route_points';

export interface Store {
  driver: SqlDriver;
  upsertDevice(device: Omit<DeviceRow, 'id'>): Promise<DeviceRow>;
  getDevice(id: number): Promise<DeviceRow | null>;
  listDevices(): Promise<DeviceRow[]>;
  commitChunk(
    chunk: ChunkInput,
    samples: SampleRow[],
    extras: { events: EventRow[]; console: ConsoleRow[]; unknownFrames: number; syncState: SyncStateRow },
  ): Promise<number>;
  readChunkFrames(chunkId: number): Promise<Uint8Array[]>;
  getChunkMeta(chunkId: number): Promise<{ deviceId: number; clockOffsetS: number | null; receivedAt: number } | null>;
  listChunkIds(deviceId: number): Promise<number[]>;
  insertSamples(samples: SampleRow[]): Promise<number>;
  samplesBetween(deviceId: number, from: number, to: number): Promise<SampleRow[]>;
  sampleRange(deviceId: number): Promise<{ first: number; last: number; count: number } | null>;
  deleteSamples(deviceId: number, source?: SampleSource): Promise<void>;
  getSyncState(deviceId: number): Promise<SyncStateRow | null>;
  setSyncState(state: SyncStateRow): Promise<void>;
  replaceDay(day: DayRecord): Promise<void>;
  getDay(deviceId: number, day: string): Promise<DayRecord | null>;
  listDays(deviceId: number, fromDay: string, toDay: string): Promise<DayRecord[]>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  clearDerived(deviceId: number): Promise<void>;
  listSleepEdits(deviceId: number): Promise<SleepEditRow[]>;
  saveSleepEdit(edit: SleepEditInput): Promise<number>;
  deleteSleepEdit(deviceId: number, id: number): Promise<boolean>;
  deleteBefore(
    deviceId: number,
    t: number,
    newestInChunk: (frames: Uint8Array[]) => number | null,
  ): Promise<DeleteBeforeResult>;
}

export interface DeleteBeforeResult {
  samples: number;
  events: number;
  console: number;
  chunks: number;
}
