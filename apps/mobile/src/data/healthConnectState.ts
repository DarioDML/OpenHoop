import {
  HC_EXPORT_TYPES,
  HC_IMPORT_TYPES,
  MAX_DAY_STEPS,
  MAX_STEPS_DAYS,
  isStepsOrigin,
  type HcDataType,
  type HcExportType,
  type HcImportType,
  type HcPreferences,
  type HcStepsDay,
} from '@/lib/healthConnectMapping';

export const HEALTH_CONNECT_STATE_KEY = 'healthConnect.state';

export type HcTypeResult =
  | { status: 'ok'; count: number }
  | { status: 'denied' }
  | { status: 'demo' }
  | { status: 'error'; step: HcFailedStep };

export type HcFailedStep = 'read' | 'write' | 'store';

export interface HcSyncReport {
  at: number;
  results: Partial<Record<HcDataType, HcTypeResult>>;
}

export interface HealthConnectState extends HcPreferences {
  afterBandSync: boolean;
  heartRateCursorS: number | null;
  lastImportS: number | null;
  lastStepsImportS: number | null;
  lastSync: HcSyncReport | null;
  steps: HcStepsDay[];
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const ALL_TYPES: readonly HcDataType[] = [...HC_EXPORT_TYPES, ...HC_IMPORT_TYPES];
const STEPS: readonly HcFailedStep[] = ['read', 'write', 'store'];
const MAX_COUNT = 10_000_000;

function exportOff(): Record<HcExportType, boolean> {
  return {
    heartRate: false,
    restingHeartRate: false,
    hrv: false,
    sleep: false,
    exercise: false,
    spo2: false,
    respiratoryRate: false,
    skinTemperature: false,
  };
}

function importOff(): Record<HcImportType, boolean> {
  return { weight: false, bodyFat: false, steps: false };
}

export function defaultHealthConnectState(): HealthConnectState {
  return {
    export: exportOff(),
    import: importOff(),
    afterBandSync: false,
    heartRateCursorS: null,
    lastImportS: null,
    lastStepsImportS: null,
    lastSync: null,
    steps: [],
  };
}

function isRecord(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unixOrNull(value: Json | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseFlags<T extends string>(value: Json | undefined, types: readonly T[], out: Record<T, boolean>): Record<T, boolean> {
  if (!isRecord(value)) return out;
  for (const type of types) out[type] = value[type] === true;
  return out;
}

function parseResult(value: Json | undefined): HcTypeResult | null {
  if (!isRecord(value)) return null;
  const { status } = value;
  if (status === 'ok') {
    const { count } = value;
    return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= MAX_COUNT ? { status, count } : null;
  }
  if (status === 'denied' || status === 'demo') return { status };
  if (status === 'error') {
    const step = STEPS.find((s) => s === value.step);
    return step === undefined ? null : { status, step };
  }
  return null;
}

function parseReport(value: Json | undefined): HcSyncReport | null {
  if (!isRecord(value)) return null;
  const at = unixOrNull(value.at);
  if (at === null) return null;
  const results: Partial<Record<HcDataType, HcTypeResult>> = {};
  if (isRecord(value.results)) {
    for (const type of ALL_TYPES) {
      const result = parseResult(value.results[type]);
      if (result !== null) results[type] = result;
    }
  }
  return { at, results };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseStepsDay(value: Json | undefined): HcStepsDay | null {
  if (!isRecord(value)) return null;
  const { day, steps, origins } = value;
  if (typeof day !== 'string' || !ISO_DAY.test(day)) return null;
  if (typeof steps !== 'number' || !Number.isSafeInteger(steps) || steps < 1 || steps > MAX_DAY_STEPS) return null;
  if (!Array.isArray(origins)) return null;
  return { day, steps, origins: origins.filter(isStepsOrigin) };
}

function parseSteps(value: Json | undefined): HcStepsDay[] {
  if (!Array.isArray(value)) return [];
  const byDay = new Map<string, HcStepsDay>();
  for (const item of value) {
    const parsed = parseStepsDay(item);
    if (parsed !== null) byDay.set(parsed.day, parsed);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_STEPS_DAYS);
}

export function parseHealthConnectState(raw: string | null): HealthConnectState {
  const base = defaultHealthConnectState();
  if (raw === null || raw === '') return base;
  let parsed: Json;
  try {
    parsed = JSON.parse(raw) as Json;
  } catch {
    return base;
  }
  if (!isRecord(parsed)) return base;
  return {
    export: parseFlags(parsed.export, HC_EXPORT_TYPES, exportOff()),
    import: parseFlags(parsed.import, HC_IMPORT_TYPES, importOff()),
    afterBandSync: parsed.afterBandSync === true,
    heartRateCursorS: unixOrNull(parsed.heartRateCursorS),
    lastImportS: unixOrNull(parsed.lastImportS),
    lastStepsImportS: unixOrNull(parsed.lastStepsImportS),
    lastSync: parseReport(parsed.lastSync),
    steps: parseSteps(parsed.steps),
  };
}

export function serializeHealthConnectState(state: HealthConnectState): string {
  return JSON.stringify(state);
}

export function anyTypeEnabled(prefs: HcPreferences): boolean {
  return HC_EXPORT_TYPES.some((type) => prefs.export[type]) || HC_IMPORT_TYPES.some((type) => prefs.import[type]);
}
