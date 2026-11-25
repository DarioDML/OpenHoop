import type { ExportTable, SqlValue, Store } from './store/types';

interface ExportSpec {
  columns: readonly string[];
  select: string;
  order: string;
}

const EXPORTS: Record<ExportTable, ExportSpec> = {
  devices: {
    columns: ['id', 'ble_id', 'name', 'model', 'firmware', 'serial', 'owner_since', 'config_snapshot'],
    select: 'id, ble_id, name, model, firmware, serial, owner_since, config_snapshot',
    order: 'id',
  },
  samples_1hz: {
    columns: ['device_id', 't', 'source', 'hr', 'rr', 'steps', 'skin_temp_c', 'spo2_raw', 'state', 'motion_g', 'chunk_id'],
    select: 'device_id, t, source, hr, rr, steps, skin_temp_c, spo2_raw, state, motion_g, chunk_id',
    order: 'device_id, t, source',
  },
  daily_metrics: {
    columns: ['device_id', 'day', 'readiness', 'load', 'sleep_score', 'record'],
    select: 'device_id, day, readiness, load, sleep_score, record',
    order: 'device_id, day',
  },
  sleeps: {
    columns: ['id', 'device_id', 'day', 'onset', 'offset', 'asleep_s', 'in_bed_s', 'nap', 'source'],
    select: 'id, device_id, day, onset, offset, asleep_s, in_bed_s, nap, source',
    order: 'device_id, day, onset',
  },
  sleep_edits: {
    columns: ['id', 'device_id', 'target_onset', 'target_offset', 'onset', 'offset', 'created_at'],
    select: 'id, device_id, target_onset, target_offset, onset, offset, created_at',
    order: 'device_id, onset, id',
  },
  workouts: {
    columns: ['id', 'device_id', 'day', 'start', 'end', 'zone_seconds', 'avg_hr', 'max_hr', 'source', 'label'],
    select: 'id, device_id, day, start, "end", zone_seconds, avg_hr, max_hr, source, label',
    order: 'device_id, day, start',
  },
  activities: {
    columns: [
      'id', 'device_id', 'source', 'detected_start', 'type', 'start', 'end', 'paused', 'note', 'deleted_at', 'active_s',
      'load', 'load_reason', 'zone_seconds', 'avg_hr', 'max_hr', 'hr_seconds', 'active_minutes', 'created_at', 'updated_at',
    ],
    select:
      'id, device_id, source, detected_start, type, start, "end", paused, note, deleted_at, active_s, load, load_reason, zone_seconds, avg_hr, max_hr, hr_seconds, active_minutes, created_at, updated_at',
    order: 'device_id, start, id',
  },
  events: {
    columns: ['id', 'device_id', 't', 'event', 'name', 'payload_hex', 'chunk_id'],
    select: 'id, device_id, t, event, name, payload_hex, chunk_id',
    order: 'device_id, t, id',
  },
  console_log: {
    columns: ['id', 'device_id', 't', 'sequence', 'text', 'chunk_id'],
    select: 'id, device_id, t, sequence, text, chunk_id',
    order: 'device_id, t, sequence',
  },
  raw_chunks: {
    columns: ['id', 'device_id', 'received_at', 'clock_offset_s', 'frame_count', 'unknown_frames', 'end_token', 'sha256'],
    select:
      'id, device_id, received_at, clock_offset_s, frame_count, unknown_frames, hex(end_token) AS end_token, hex(sha256) AS sha256',
    order: 'device_id, id',
  },
  body_measurements: {
    columns: ['id', 'day', 'weight_kg', 'body_fat_pct', 'created_at'],
    select: 'id, day, weight_kg, body_fat_pct, created_at',
    order: 'day, id',
  },
};

function cell(value: SqlValue | undefined): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Uint8Array ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportCsv(store: Store, table: ExportTable): Promise<string> {
  if (!Object.prototype.hasOwnProperty.call(EXPORTS, table)) throw new Error(`Table cannot be exported: ${String(table)}`);
  const spec = EXPORTS[table];
  const rows = await store.driver.all<Record<string, SqlValue>>(`SELECT ${spec.select} FROM ${table} ORDER BY ${spec.order}`);
  const lines = [spec.columns.join(',')];
  for (const row of rows) lines.push(spec.columns.map((c) => cell(row[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
