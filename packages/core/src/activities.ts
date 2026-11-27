import { ACTIVITY_MAX_S, ACTIVITY_MIN_S, ACTIVITY_NOTE_MAX, DEFAULT_CALIBRATION, activityMetrics, normalizeIntervals, parseActiveMinutes } from '@openhoop/analytics';
import type { ActiveMinutes, Calibration, HrPoint, Interval, LoadReference } from '@openhoop/analytics';
import { SOURCE_RANK, validHr } from './pipeline';
import type { SampleRow, SqlDriver, SqlValue, Store } from './store/types';

export { ACTIVITY_MAX_S, ACTIVITY_MIN_S, ACTIVITY_NOTE_MAX, loadReference } from '@openhoop/analytics';
export type { LoadReference } from '@openhoop/analytics';

export const ACTIVITY_SOURCES = ['manual', 'live', 'auto'] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const ACTIVITY_TYPE_MAX = 32;
export const ACTIVITY_MAX_PAUSES = 200;
const ZONE_COUNT = 6;

export interface ActivityMetricsRecord {
  activeS: number;
  load: number | null;
  loadReason: string | null;
  zoneSeconds: number[];
  avgHr: number | null;
  maxHr: number | null;
  hrSeconds: number;
  activeMinutes: ActiveMinutes | null;
}

export interface ActivityInput {
  deviceId: number;
  source: ActivitySource;
  detectedStart: number | null;
  type: string;
  start: number;
  end: number;
  paused: Interval[];
  note: string | null;
}

export interface ActivityRow extends ActivityInput {
  id: number;
  deletedAt: number | null;
  metrics: ActivityMetricsRecord;
  createdAt: number;
  updatedAt: number;
}

export class ActivityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityInputError';
  }
}

type ActivityDb = {
  id: number;
  device_id: number;
  source: string;
  detected_start: number | null;
  type: string;
  start: number;
  end: number;
  paused: string;
  note: string | null;
  deleted_at: number | null;
  active_s: number;
  load: number | null;
  load_reason: string | null;
  zone_seconds: string;
  avg_hr: number | null;
  max_hr: number | null;
  hr_seconds: number;
  active_minutes: string | null;
  created_at: number;
  updated_at: number;
};

function isSource(value: string): value is ActivitySource {
  return (ACTIVITY_SOURCES as readonly string[]).includes(value);
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

function isInterval(value: unknown): value is Interval {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { start?: unknown; end?: unknown };
  return (
    typeof candidate.start === 'number' &&
    typeof candidate.end === 'number' &&
    Number.isFinite(candidate.start) &&
    Number.isFinite(candidate.end) &&
    candidate.end > candidate.start
  );
}

export function parsePaused(text: string): Interval[] {
  const parsed = parseJson(text);
  if (!Array.isArray(parsed)) return [];
  return normalizeIntervals(parsed.filter(isInterval).slice(0, ACTIVITY_MAX_PAUSES));
}

function parseZones(text: string): number[] {
  const parsed = parseJson(text);
  if (!Array.isArray(parsed) || parsed.length !== ZONE_COUNT) return new Array<number>(ZONE_COUNT).fill(0);
  return parsed.map((v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0));
}

function toActivity(row: ActivityDb): ActivityRow {
  if (!isSource(row.source)) throw new Error(`Unknown activity source in database: ${row.source}`);
  return {
    id: row.id,
    deviceId: row.device_id,
    source: row.source,
    detectedStart: row.detected_start,
    type: row.type,
    start: row.start,
    end: row.end,
    paused: parsePaused(row.paused),
    note: row.note,
    deletedAt: row.deleted_at,
    metrics: {
      activeS: row.active_s,
      load: row.load,
      loadReason: row.load_reason,
      zoneSeconds: parseZones(row.zone_seconds),
      avgHr: row.avg_hr,
      maxHr: row.max_hr,
      hrSeconds: row.hr_seconds,
      activeMinutes: row.active_minutes === null ? null : parseActiveMinutes(parseJson(row.active_minutes)),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isWholeSecond(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function checkActivityInput(input: ActivityInput): ActivityInput {
  if (!isSource(input.source)) throw new ActivityInputError('unknown source');
  if ((input.source === 'auto') !== (input.detectedStart !== null)) throw new ActivityInputError('detected start mismatch');
  if (input.detectedStart !== null && !isWholeSecond(input.detectedStart)) throw new ActivityInputError('bad detected start');
  if (!isWholeSecond(input.start) || !isWholeSecond(input.end)) throw new ActivityInputError('bad time');
  if (input.end - input.start < ACTIVITY_MIN_S) throw new ActivityInputError('too short');
  if (input.end - input.start > ACTIVITY_MAX_S) throw new ActivityInputError('too long');
  const type = input.type.trim();
  if (type === '' || type.length > ACTIVITY_TYPE_MAX || !/^[a-z0-9-]+$/.test(type)) throw new ActivityInputError('bad type');
  const note = input.note === null ? null : input.note.trim().slice(0, ACTIVITY_NOTE_MAX);
  if (input.paused.length > ACTIVITY_MAX_PAUSES) throw new ActivityInputError('too many pauses');
  const paused = normalizeIntervals(input.paused.filter(isInterval))
    .map((p) => ({ start: Math.max(p.start, input.start), end: Math.min(p.end, input.end) }))
    .filter((p) => p.end > p.start);
  return { ...input, type, note: note === '' ? null : note, paused };
}

function metricParams(m: ActivityMetricsRecord): SqlValue[] {
  return [m.activeS, m.load, m.loadReason, JSON.stringify(m.zoneSeconds), m.avgHr, m.maxHr, m.hrSeconds, m.activeMinutes === null ? null : JSON.stringify(m.activeMinutes)];
}

export interface ActivityStore {
  list(deviceId: number): Promise<ActivityRow[]>;
  get(id: number): Promise<ActivityRow | null>;
  findDetected(deviceId: number, detectedStart: number): Promise<ActivityRow | null>;
  save(input: ActivityInput, metrics: ActivityMetricsRecord, now: number, id?: number): Promise<ActivityRow>;
  setMetrics(id: number, metrics: ActivityMetricsRecord): Promise<void>;
  setDeleted(id: number, deletedAt: number | null, now: number): Promise<void>;
  remove(id: number): Promise<void>;
  purgeDeleted(deviceId: number | null): Promise<number>;
}

export function bindActivityStore(driver: SqlDriver): ActivityStore {
  const get = async (id: number): Promise<ActivityRow | null> => {
    const rows = await driver.all<ActivityDb>('SELECT * FROM activities WHERE id = ?', [id]);
    const row = rows[0];
    return row === undefined ? null : toActivity(row);
  };

  return {
    get,

    async list(deviceId) {
      const rows = await driver.all<ActivityDb>('SELECT * FROM activities WHERE device_id = ? ORDER BY start, id', [deviceId]);
      return rows.map(toActivity);
    },

    async findDetected(deviceId, detectedStart) {
      const rows = await driver.all<ActivityDb>('SELECT * FROM activities WHERE device_id = ? AND detected_start = ?', [
        deviceId,
        detectedStart,
      ]);
      const row = rows[0];
      return row === undefined ? null : toActivity(row);
    },

    async save(raw, metrics, now, id) {
      const input = checkActivityInput(raw);
      const fields: SqlValue[] = [
        input.deviceId,
        input.source,
        input.detectedStart,
        input.type,
        input.start,
        input.end,
        JSON.stringify(input.paused),
        input.note,
      ];
      let savedId: number;
      if (id === undefined) {
        const result = await driver.run(
          `INSERT INTO activities (device_id, source, detected_start, type, start, end, paused, note,
             active_s, load, load_reason, zone_seconds, avg_hr, max_hr, hr_seconds, active_minutes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...fields, ...metricParams(metrics), now, now],
        );
        savedId = result.lastInsertRowid;
      } else {
        const result = await driver.run(
          `UPDATE activities SET device_id = ?, source = ?, detected_start = ?, type = ?, start = ?, end = ?, paused = ?, note = ?,
             active_s = ?, load = ?, load_reason = ?, zone_seconds = ?, avg_hr = ?, max_hr = ?, hr_seconds = ?, active_minutes = ?, updated_at = ?
           WHERE id = ?`,
          [...fields, ...metricParams(metrics), now, id],
        );
        if (result.changes === 0) throw new ActivityInputError('activity does not exist');
        savedId = id;
      }
      const saved = await get(savedId);
      if (saved === null) throw new Error('Activity save did not persist');
      return saved;
    },

    async setMetrics(id, metrics) {
      await driver.run(
        `UPDATE activities SET active_s = ?, load = ?, load_reason = ?, zone_seconds = ?, avg_hr = ?, max_hr = ?, hr_seconds = ?, active_minutes = ? WHERE id = ?`,
        [...metricParams(metrics), id],
      );
    },

    async setDeleted(id, deletedAt, now) {
      await driver.run('UPDATE activities SET deleted_at = ?, updated_at = ? WHERE id = ?', [deletedAt, now, id]);
    },

    async remove(id) {
      await driver.run('DELETE FROM activities WHERE id = ?', [id]);
    },

    async purgeDeleted(deviceId) {
      const result =
        deviceId === null
          ? await driver.run("DELETE FROM activities WHERE deleted_at IS NOT NULL AND source IN ('manual', 'live')")
          : await driver.run("DELETE FROM activities WHERE device_id = ? AND deleted_at IS NOT NULL AND source IN ('manual', 'live')", [deviceId]);
      return result.changes;
    },
  };
}

export function heartRatePoints(rows: readonly SampleRow[]): HrPoint[] {
  const best = new Map<number, SampleRow>();
  for (const row of rows) {
    const current = best.get(row.t);
    if (current === undefined || SOURCE_RANK[row.source] < SOURCE_RANK[current.source]) best.set(row.t, row);
  }
  return [...best.values()].sort((a, b) => a.t - b.t).map((row) => ({ t: row.t, hr: validHr(row.hr) }));
}

export function metricsFromPoints(
  points: readonly HrPoint[],
  window: Interval,
  paused: readonly Interval[],
  ref: LoadReference,
  calibration: Calibration = DEFAULT_CALIBRATION,
): ActivityMetricsRecord {
  const m = activityMetrics(points, window, paused, ref.rest, ref.max, calibration, ref.zoneFloors ?? null);
  return {
    activeS: m.activeS,
    load: m.load.ok ? m.load.value : null,
    loadReason: m.load.ok ? null : m.load.reason,
    zoneSeconds: [...m.zoneSeconds],
    avgHr: m.avgHr,
    maxHr: m.maxHr,
    hrSeconds: m.hrSeconds,
    activeMinutes: m.activeMinutes,
  };
}

export async function computeActivityMetrics(
  store: Store,
  deviceId: number,
  window: Interval,
  paused: readonly Interval[],
  ref: LoadReference,
  calibration: Calibration = DEFAULT_CALIBRATION,
): Promise<ActivityMetricsRecord> {
  const rows = await store.samplesBetween(deviceId, window.start, window.end);
  return metricsFromPoints(heartRatePoints(rows), window, paused, ref, calibration);
}
