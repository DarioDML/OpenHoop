import { consoleLines } from './consoleLines';
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
    columns: ['id', 'device_id', 'target_onset', 'target_offset', 'onset', 'offset', 'created_at', 'removed'],
    select: 'id, device_id, target_onset, target_offset, onset, offset, created_at, removed',
    order: 'device_id, onset, id',
  },
  sleep_stages: {
    columns: ['device_id', 't', 'stage'],
    select: 'device_id, t, stage',
    order: 'device_id, t',
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
  battery_pack_events: {
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
    columns: ['id', 'day', 'weight_kg', 'body_fat_pct', 'created_at', 'source', 'origin', 'external_id', 'deleted_at'],
    select: 'id, day, weight_kg, body_fat_pct, created_at, source, origin, external_id, deleted_at',
    order: 'day, id',
  },
  lab_results: {
    columns: ['id', 'biomarker', 'unit', 'value', 'day', 'ref_low', 'ref_high', 'note', 'created_at'],
    select: 'id, biomarker, unit, value, day, ref_low, ref_high, note, created_at',
    order: 'day, id',
  },
  coach_conversations: {
    columns: ['id', 'title', 'created_at', 'updated_at'],
    select: 'id, title, created_at, updated_at',
    order: 'id',
  },
  coach_messages: {
    columns: ['id', 'conversation_id', 'role', 'text', 'chips', 'created_at'],
    select: 'id, conversation_id, role, text, chips, created_at',
    order: 'conversation_id, id',
  },
  coach_memory: {
    columns: ['id', 'text', 'source', 'created_at', 'updated_at'],
    select: 'id, text, source, created_at, updated_at',
    order: 'id',
  },
  cycle_periods: {
    columns: ['id', 'start_day', 'end_day', 'flow', 'created_at'],
    select: 'id, start_day, end_day, flow, created_at',
    order: 'start_day, id',
  },
  symptom_logs: {
    columns: ['id', 'day', 'symptom', 'intensity', 'created_at'],
    select: 'id, day, symptom, intensity, created_at',
    order: 'day, id',
  },
  pregnancy: {
    columns: ['id', 'due_day', 'created_at'],
    select: 'id, due_day, created_at',
    order: 'id',
  },
  strength_exercises: {
    columns: ['id', 'name', 'muscle', 'created_at'],
    select: 'id, name, muscle, created_at',
    order: 'id',
  },
  strength_templates: {
    columns: ['id', 'name', 'created_at', 'updated_at'],
    select: 'id, name, created_at, updated_at',
    order: 'id',
  },
  strength_template_items: {
    columns: ['id', 'template_id', 'position', 'exercise_key', 'exercise_name', 'muscle', 'sets', 'reps', 'weight_kg'],
    select: 'id, template_id, position, exercise_key, exercise_name, muscle, sets, reps, weight_kg',
    order: 'template_id, position, id',
  },
  strength_sessions: {
    columns: ['id', 'template_id', 'name', 'day', 'started_at', 'ended_at'],
    select: 'id, template_id, name, day, started_at, ended_at',
    order: 'started_at, id',
  },
  strength_session_exercises: {
    columns: ['id', 'session_id', 'position', 'exercise_key', 'exercise_name', 'muscle', 'sets', 'reps', 'weight_kg'],
    select: 'id, session_id, position, exercise_key, exercise_name, muscle, sets, reps, weight_kg',
    order: 'session_id, position, id',
  },
  strength_sets: {
    columns: ['id', 'session_id', 'exercise_key', 'exercise_name', 'muscle', 'reps', 'weight_kg', 'rpe', 'done_at'],
    select: 'id, session_id, exercise_key, exercise_name, muscle, reps, weight_kg, rpe, done_at',
    order: 'session_id, id',
  },
  journal_notes: {
    columns: ['id', 'day', 'body', 'tags', 'created_at'],
    select: 'id, day, body, tags, created_at',
    order: 'day, id',
  },
  vendor_cycles: {
    columns: ['start_t', 'end_t', 'tz_offset_s', 'day', 'recovery_pct', 'resting_hr', 'hrv_ms', 'skin_temp_c', 'spo2_pct', 'respiratory_rate', 'day_strain', 'source', 'imported_at'],
    select: 'start_t, end_t, tz_offset_s, day, recovery_pct, resting_hr, hrv_ms, skin_temp_c, spo2_pct, respiratory_rate, day_strain, source, imported_at',
    order: 'start_t',
  },
  vendor_sleeps: {
    columns: [
      'onset',
      'wake',
      'tz_offset_s',
      'day',
      'nap',
      'performance_pct',
      'asleep_min',
      'in_bed_min',
      'light_min',
      'deep_min',
      'rem_min',
      'awake_min',
      'efficiency_pct',
      'consistency_pct',
      'respiratory_rate',
      'source',
      'imported_at',
    ],
    select:
      'onset, wake, tz_offset_s, day, nap, performance_pct, asleep_min, in_bed_min, light_min, deep_min, rem_min, awake_min, efficiency_pct, consistency_pct, respiratory_rate, source, imported_at',
    order: 'onset',
  },
  vendor_workouts: {
    columns: ['start_t', 'end_t', 'tz_offset_s', 'day', 'activity', 'strain', 'avg_hr', 'max_hr', 'source', 'imported_at'],
    select: 'start_t, end_t, tz_offset_s, day, activity, strain, avg_hr, max_hr, source, imported_at',
    order: 'start_t',
  },
  vendor_journal: {
    columns: ['cycle_start', 'question', 'tz_offset_s', 'day', 'answered_yes', 'notes', 'source', 'imported_at'],
    select: 'cycle_start, question, tz_offset_s, day, answered_yes, notes, source, imported_at',
    order: 'cycle_start, question',
  },
  route_points: {
    columns: ['activity_id', 'seq', 'segment', 't_ms', 'lat', 'lon', 'alt_m', 'accuracy_m'],
    select: 'activity_id, seq, segment, t_ms, lat, lon, alt_m, accuracy_m',
    order: 'activity_id, seq',
  },
  ecg_recordings: {
    columns: ['id', 'device_id', 't', 'duration_ms', 'sample_count', 'rate_hz', 'wrist', 'samples_i16le'],
    select: 'id, device_id, t, duration_ms, sample_count, rate_hz, wrist, hex(data) AS samples_i16le',
    order: 'device_id, t, id',
  },
};

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

function cell(value: SqlValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Uint8Array) return '';
  const raw = String(value);
  const text = typeof value === 'string' && FORMULA_START.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvText(columns: readonly string[], rows: readonly Record<string, SqlValue>[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

export async function exportCsv(store: Store, table: ExportTable): Promise<string> {
  if (!Object.prototype.hasOwnProperty.call(EXPORTS, table)) throw new Error(`Table cannot be exported: ${String(table)}`);
  const spec = EXPORTS[table];
  const rows = await store.driver.all<Record<string, SqlValue>>(`SELECT ${spec.select} FROM ${table} ORDER BY ${spec.order}`);
  return csvText(spec.columns, rows);
}

export async function consoleLinesCsv(store: Store): Promise<string> {
  const devices = await store.driver.all<{ id: number }>('SELECT DISTINCT device_id AS id FROM console_log ORDER BY device_id');
  const lines = ['device_id,t,text'];
  for (const { id } of devices) {
    for (const line of await consoleLines(store, id)) lines.push([id, line.t, line.text].map(cell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
