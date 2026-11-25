import type { DayRecord, ImportedBodyMeasurement, SleepPeriodRecord } from '@openhoop/core';
import type {
  DeviceType,
  ExerciseSessionRecord,
  HealthConnectRecord,
  HeartRateRecord,
  HeartRateVariabilityRmssdRecord,
  Metadata,
  OxygenSaturationRecord,
  Permission,
  RecordingMethod,
  RecordType,
  RespiratoryRateRecord,
  RestingHeartRateRecord,
  SkinTemperatureRecord,
  SleepSessionRecord,
} from 'react-native-health-connect';

import { unixToIsoDate } from './dates';

export const HC_EXPORT_TYPES = ['heartRate', 'restingHeartRate', 'hrv', 'sleep', 'exercise', 'spo2', 'respiratoryRate', 'skinTemperature'] as const;
export type HcExportType = (typeof HC_EXPORT_TYPES)[number];

export const HC_IMPORT_TYPES = ['weight', 'bodyFat'] as const;
export type HcImportType = (typeof HC_IMPORT_TYPES)[number];

export type HcDataType = HcExportType | HcImportType;

export function isExportType(type: HcDataType): type is HcExportType {
  return (HC_EXPORT_TYPES as readonly HcDataType[]).includes(type);
}

export const HC_RECORD_TYPES: Readonly<Record<HcDataType, RecordType>> = {
  heartRate: 'HeartRate',
  restingHeartRate: 'RestingHeartRate',
  hrv: 'HeartRateVariabilityRmssd',
  sleep: 'SleepSession',
  exercise: 'ExerciseSession',
  spo2: 'OxygenSaturation',
  respiratoryRate: 'RespiratoryRate',
  skinTemperature: 'SkinTemperature',
  weight: 'Weight',
  bodyFat: 'BodyFat',
};

export interface HcPreferences {
  export: Record<HcExportType, boolean>;
  import: Record<HcImportType, boolean>;
}

export interface HeartRateMinute {
  t: number;
  hr: number;
}

export function permissionKey(permission: Permission): string {
  return `${permission.accessType}:${permission.recordType}`;
}

export function permissionFor(type: HcDataType): Permission {
  const accessType = isExportType(type) ? 'write' : 'read';
  return { accessType, recordType: HC_RECORD_TYPES[type] };
}

export function wantedPermissions(prefs: HcPreferences): Permission[] {
  const types: HcDataType[] = [
    ...HC_EXPORT_TYPES.filter((type) => prefs.export[type]),
    ...HC_IMPORT_TYPES.filter((type) => prefs.import[type]),
  ];
  return types.map(permissionFor);
}

const DEVICE_FITNESS_BAND: DeviceType = 6;
const RECORDED_ACTIVELY: RecordingMethod = 1;
const RECORDED_AUTOMATICALLY: RecordingMethod = 2;
const RECORDED_MANUALLY: RecordingMethod = 3;
const HOUR_S = 3_600;

export const EXERCISE_TYPE_OTHER = 0;
const EXERCISE_TYPES: Readonly<Record<string, number>> = {
  running: 56,
  walking: 79,
  cycling: 8,
  strength: 70,
  yoga: 83,
  hiit: 36,
  football: 64,
  pilates: 48,
  hiking: 37,
};

export function isoTime(unixS: number): string {
  return new Date(unixS * 1000).toISOString();
}

export function clientRecordId(kind: string, unixS: number): string {
  return `openhoop.${kind}.${Math.round(unixS)}`;
}

function metadata(kind: string, unixS: number, version: number, recordingMethod: RecordingMethod = RECORDED_AUTOMATICALLY): Metadata {
  return {
    clientRecordId: clientRecordId(kind, unixS),
    clientRecordVersion: version,
    recordingMethod,
    device: { type: DEVICE_FITNESS_BAND },
  };
}

function inRange(value: number | null, min: number, max: number): value is number {
  return value !== null && Number.isFinite(value) && value >= min && value <= max;
}

export function mainSleep(day: DayRecord): SleepPeriodRecord | null {
  let best: SleepPeriodRecord | null = null;
  for (const period of day.sleep.periods) {
    if (period.nap) continue;
    if (best === null || period.asleepS > best.asleepS) best = period;
  }
  return best;
}

export interface ExportWindow {
  fromS: number;
  nowS: number;
  version: number;
}

function nightTime(day: DayRecord, window: ExportWindow): number | null {
  const sleep = mainSleep(day);
  if (sleep === null) return null;
  return sleep.offset >= window.fromS && sleep.offset <= window.nowS ? sleep.offset : null;
}

export function restingHeartRateRecords(days: readonly DayRecord[], window: ExportWindow): RestingHeartRateRecord[] {
  const out: RestingHeartRateRecord[] = [];
  for (const day of days) {
    const time = nightTime(day, window);
    const bpm = day.restingHr.value === null ? null : Math.round(day.restingHr.value);
    if (time === null || !inRange(bpm, 1, 300)) continue;
    out.push({ recordType: 'RestingHeartRate', time: isoTime(time), beatsPerMinute: bpm, metadata: metadata('rhr', time, window.version) });
  }
  return out;
}

export function hrvRecords(days: readonly DayRecord[], window: ExportWindow): HeartRateVariabilityRmssdRecord[] {
  const out: HeartRateVariabilityRmssdRecord[] = [];
  for (const day of days) {
    const time = nightTime(day, window);
    const ms = day.hrv.value;
    if (time === null || !inRange(ms, 1, 200)) continue;
    out.push({
      recordType: 'HeartRateVariabilityRmssd',
      time: isoTime(time),
      heartRateVariabilityMillis: ms,
      metadata: metadata('hrv', time, window.version),
    });
  }
  return out;
}

export function spo2Records(days: readonly DayRecord[], window: ExportWindow): OxygenSaturationRecord[] {
  const out: OxygenSaturationRecord[] = [];
  for (const day of days) {
    const time = nightTime(day, window);
    const percentage = day.spo2.value;
    if (time === null || !inRange(percentage, 0, 100)) continue;
    out.push({ recordType: 'OxygenSaturation', time: isoTime(time), percentage, metadata: metadata('spo2', time, window.version) });
  }
  return out;
}

export function respiratoryRateRecords(days: readonly DayRecord[], window: ExportWindow): RespiratoryRateRecord[] {
  const out: RespiratoryRateRecord[] = [];
  for (const day of days) {
    const time = nightTime(day, window);
    const rate = day.respiratoryRate.value;
    if (time === null || !inRange(rate, 1, 100)) continue;
    out.push({ recordType: 'RespiratoryRate', time: isoTime(time), rate, metadata: metadata('resp', time, window.version) });
  }
  return out;
}

export function skinTemperatureRecords(days: readonly DayRecord[], window: ExportWindow): SkinTemperatureRecord[] {
  const out: SkinTemperatureRecord[] = [];
  for (const day of days) {
    const sleep = mainSleep(day);
    const delta = day.skinTempDeviationC.value;
    if (sleep === null || sleep.offset <= window.fromS || sleep.offset > window.nowS || !inRange(delta, -30, 30)) continue;
    const absolute = day.skinTempC.value;
    const baseline = absolute === null ? null : absolute - delta;
    out.push({
      recordType: 'SkinTemperature',
      startTime: isoTime(sleep.onset),
      endTime: isoTime(sleep.offset),
      ...(inRange(baseline, 0, 100) ? { baseline: { value: baseline, unit: 'celsius' as const } } : {}),
      deltas: [{ time: isoTime(sleep.onset), delta: { value: delta, unit: 'celsius' } }],
      measurementLocation: 3,
      metadata: metadata('skin', sleep.onset, window.version),
    });
  }
  return out;
}

export function sleepSessionRecords(days: readonly DayRecord[], window: ExportWindow): SleepSessionRecord[] {
  const out: SleepSessionRecord[] = [];
  const seen = new Set<number>();
  for (const day of days) {
    for (const period of day.sleep.periods) {
      if (period.offset <= window.fromS || period.offset > window.nowS || period.offset <= period.onset || seen.has(period.onset)) continue;
      seen.add(period.onset);
      out.push({
        recordType: 'SleepSession',
        startTime: isoTime(period.onset),
        endTime: isoTime(period.offset),
        metadata: metadata('sleep', period.onset, window.version, period.source === 'detected' ? RECORDED_AUTOMATICALLY : RECORDED_MANUALLY),
      });
    }
  }
  return out;
}

export type HcExerciseKind = 'detected' | 'edited' | 'manual' | 'live';

export interface HcExercise {
  kind: HcExerciseKind;
  id: number | null;
  detectedStart: number | null;
  type: string | null;
  label: string | null;
  start: number;
  end: number;
}

export function exerciseType(exercise: Pick<HcExercise, 'type' | 'label'>): number {
  const name = exercise.type ?? exercise.label;
  if (name === null) return EXERCISE_TYPE_OTHER;
  return EXERCISE_TYPES[name] ?? EXERCISE_TYPE_OTHER;
}

const EXERCISE_METHOD: Readonly<Record<HcExerciseKind, RecordingMethod>> = {
  detected: RECORDED_AUTOMATICALLY,
  edited: RECORDED_AUTOMATICALLY,
  manual: RECORDED_MANUALLY,
  live: RECORDED_ACTIVELY,
};

function exerciseKey(exercise: HcExercise): { kind: string; at: number } | null {
  if (exercise.detectedStart !== null && (exercise.kind === 'detected' || exercise.kind === 'edited')) return { kind: 'exercise', at: exercise.detectedStart };
  if (exercise.id !== null) return { kind: 'activity', at: exercise.id };
  return null;
}

export function exerciseSessionRecords(exercises: readonly HcExercise[], window: ExportWindow): ExerciseSessionRecord[] {
  const out: ExerciseSessionRecord[] = [];
  const seen = new Set<string>();
  for (const exercise of exercises) {
    const key = exerciseKey(exercise);
    if (key === null || exercise.end <= window.fromS || exercise.end > window.nowS || exercise.end <= exercise.start) continue;
    const id = clientRecordId(key.kind, key.at);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      recordType: 'ExerciseSession',
      startTime: isoTime(exercise.start),
      endTime: isoTime(exercise.end),
      exerciseType: exerciseType(exercise),
      metadata: metadata(key.kind, key.at, window.version, EXERCISE_METHOD[exercise.kind]),
    });
  }
  return out;
}

export function heartRateRecords(minutes: readonly HeartRateMinute[], window: ExportWindow): HeartRateRecord[] {
  const hours = new Map<number, HeartRateMinute[]>();
  for (const point of minutes) {
    if (point.t < window.fromS || point.t >= window.nowS) continue;
    const bpm = Math.round(point.hr);
    if (!inRange(bpm, 1, 300)) continue;
    const hour = Math.floor(point.t / HOUR_S) * HOUR_S;
    const list = hours.get(hour) ?? [];
    list.push({ t: point.t, hr: bpm });
    hours.set(hour, list);
  }
  return [...hours.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, points]) => {
      const sorted = [...points].sort((a, b) => a.t - b.t);
      const last = sorted[sorted.length - 1]?.t ?? hour;
      return {
        recordType: 'HeartRate',
        startTime: isoTime(hour),
        endTime: isoTime(last + 1),
        samples: sorted.map((p) => ({ time: isoTime(p.t), beatsPerMinute: p.hr })),
        metadata: metadata('hr', hour, window.version),
      };
    });
}

export interface ExportSource {
  days: readonly DayRecord[];
  exercises: readonly HcExercise[];
  minutes: readonly HeartRateMinute[];
}

export function exportRecords(type: HcExportType, source: ExportSource, window: ExportWindow): HealthConnectRecord[] {
  const { days } = source;
  switch (type) {
    case 'heartRate':
      return heartRateRecords(source.minutes, window);
    case 'restingHeartRate':
      return restingHeartRateRecords(days, window);
    case 'hrv':
      return hrvRecords(days, window);
    case 'sleep':
      return sleepSessionRecords(days, window);
    case 'exercise':
      return exerciseSessionRecords(source.exercises, window);
    case 'spo2':
      return spo2Records(days, window);
    case 'respiratoryRate':
      return respiratoryRateRecords(days, window);
    case 'skinTemperature':
      return skinTemperatureRecords(days, window);
  }
}

export function lastHeartRateHour(records: readonly HeartRateRecord[]): number | null {
  const last = records[records.length - 1];
  if (last === undefined) return null;
  return Math.floor(Date.parse(last.startTime) / 1000);
}

interface Reading {
  id: string;
  origin: string | null;
  t: number;
  tzOffsetS: number | null;
}

interface WeightReading extends Reading {
  kg: number;
}

interface FatReading extends Reading {
  pct: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readingBase(value: unknown): Reading | null {
  if (!isObject(value) || !isObject(value.metadata)) return null;
  const { id, dataOrigin } = value.metadata;
  if (typeof id !== 'string' || id === '' || id.length > 200) return null;
  if (typeof value.time !== 'string') return null;
  const ms = Date.parse(value.time);
  if (!Number.isFinite(ms)) return null;
  const offset = isObject(value.zoneOffset) ? finite(value.zoneOffset.totalSeconds) : null;
  const origin = typeof dataOrigin === 'string' && dataOrigin !== '' ? dataOrigin.slice(0, 200) : null;
  return { id, origin, t: Math.floor(ms / 1000), tzOffsetS: offset !== null && Math.abs(offset) <= 18 * HOUR_S ? offset : null };
}

export function parseWeightReading(value: unknown): WeightReading | null {
  const base = readingBase(value);
  if (base === null || !isObject(value) || !isObject(value.weight)) return null;
  const kg = finite(value.weight.inKilograms);
  return kg === null ? null : { ...base, kg };
}

export function parseBodyFatReading(value: unknown): FatReading | null {
  const base = readingBase(value);
  if (base === null || !isObject(value)) return null;
  const pct = finite(value.percentage);
  return pct === null ? null : { ...base, pct };
}

export interface BodyImportPlan {
  entries: ImportedBodyMeasurement[];
  weightsRead: number;
  bodyFatRead: number;
  bodyFatUnmatched: number;
}

const ROUND_KG = 100;
const ROUND_PCT = 10;
const BODY_FAT_MIN_PCT = 2;
const BODY_FAT_MAX_PCT = 70;

export function planBodyImport(
  weights: readonly unknown[],
  fats: readonly unknown[],
  ownPackage: string,
  tzOffsetAt: (unixS: number) => number,
): BodyImportPlan {
  const isForeign = (reading: Reading): boolean => reading.origin !== ownPackage;
  const dayOf = (reading: Reading): string => unixToIsoDate(reading.t, reading.tzOffsetS ?? tzOffsetAt(reading.t));
  const parsedWeights = weights.map(parseWeightReading).filter((r): r is WeightReading => r !== null && isForeign(r));
  const parsedFats = fats
    .map(parseBodyFatReading)
    .filter((r): r is FatReading => r !== null && isForeign(r) && r.pct >= BODY_FAT_MIN_PCT && r.pct <= BODY_FAT_MAX_PCT);
  const fatFor = new Map<string, FatReading>();
  let unmatched = 0;
  for (const fat of parsedFats) {
    const day = dayOf(fat);
    let best: WeightReading | null = null;
    for (const weight of parsedWeights) {
      if (weight.origin !== fat.origin || dayOf(weight) !== day) continue;
      if (best === null || Math.abs(weight.t - fat.t) < Math.abs(best.t - fat.t)) best = weight;
    }
    if (best === null) {
      unmatched++;
      continue;
    }
    const current = fatFor.get(best.id);
    if (current === undefined || Math.abs(fat.t - best.t) < Math.abs(current.t - best.t)) fatFor.set(best.id, fat);
  }
  const entries = parsedWeights
    .sort((a, b) => a.t - b.t)
    .map((weight) => {
      const fat = fatFor.get(weight.id);
      return {
        day: dayOf(weight),
        weightKg: Math.round(weight.kg * ROUND_KG) / ROUND_KG,
        bodyFatPct: fat === undefined ? null : Math.round(fat.pct * ROUND_PCT) / ROUND_PCT,
        externalId: weight.id,
        origin: weight.origin,
      };
    });
  return { entries, weightsRead: parsedWeights.length, bodyFatRead: parsedFats.length, bodyFatUnmatched: unmatched };
}
