import type { BodyImportResult, DayRecord, ImportedBodyMeasurement } from '@openhoop/core';

import {
  HC_EXPORT_TYPES,
  HC_RECORD_TYPES,
  exportRecords,
  heartRateRecords,
  lastHeartRateHour,
  permissionFor,
  permissionKey,
  planBodyImport,
  type HcDataType,
  type HcExportType,
  type HeartRateMinute,
} from '@/lib/healthConnectMapping';

import type { HealthConnectApi } from './healthConnectApi';
import type { HcSyncReport, HcTypeResult, HealthConnectState } from './healthConnectState';

export const EXPORT_WINDOW_DAYS = 30;
export const FIRST_IMPORT_DAYS = 365;
export const IMPORT_OVERLAP_DAYS = 30;
const DAY_S = 86_400;
const HOUR_S = 3_600;

export interface HcSyncContext {
  api: HealthConnectApi;
  state: HealthConnectState;
  days: readonly DayRecord[];
  exportAllowed: boolean;
  heartRate(fromS: number, toS: number): Promise<HeartRateMinute[]>;
  importBody(entries: ImportedBodyMeasurement[]): Promise<BodyImportResult>;
  ownPackage: string;
  nowS: number;
  version: number;
  tzOffsetAt(unixS: number): number;
}

export interface HcSyncOutcome {
  report: HcSyncReport;
  heartRateCursorS: number | null;
  lastImportS: number | null;
}

export function isGranted(granted: ReadonlySet<string>, type: HcDataType): boolean {
  return granted.has(permissionKey(permissionFor(type)));
}

async function exportHeartRate(ctx: HcSyncContext, fromS: number): Promise<{ result: HcTypeResult; cursor: number | null }> {
  let written = 0;
  let cursor = ctx.state.heartRateCursorS;
  const start = Math.floor(Math.max(fromS, cursor ?? fromS) / HOUR_S) * HOUR_S;
  try {
    for (let sliceFrom = start; sliceFrom <= ctx.nowS; sliceFrom += DAY_S) {
      const sliceTo = Math.min(sliceFrom + DAY_S, ctx.nowS);
      const last = sliceTo === ctx.nowS;
      const minutes = (await ctx.heartRate(sliceFrom, sliceTo)).filter((m) => m.t >= sliceFrom && (last ? m.t <= sliceTo : m.t < sliceTo));
      const records = heartRateRecords(minutes, { fromS: sliceFrom, nowS: ctx.nowS, version: ctx.version });
      if (records.length === 0) continue;
      written += await ctx.api.insert(records);
      cursor = lastHeartRateHour(records) ?? cursor;
    }
  } catch {
    return { result: { status: 'error', step: 'write' }, cursor };
  }
  return { result: { status: 'ok', count: written }, cursor };
}

async function exportType(ctx: HcSyncContext, type: Exclude<HcExportType, 'heartRate'>, fromS: number): Promise<HcTypeResult> {
  const records = exportRecords(type, ctx.days, [], { fromS, nowS: ctx.nowS, version: ctx.version });
  try {
    await ctx.api.deleteOwn(HC_RECORD_TYPES[type], fromS, ctx.nowS);
    const written = records.length === 0 ? 0 : await ctx.api.insert(records);
    return { status: 'ok', count: written };
  } catch {
    return { status: 'error', step: 'write' };
  }
}

async function importBody(ctx: HcSyncContext, granted: ReadonlySet<string>): Promise<{ results: Partial<Record<HcDataType, HcTypeResult>>; done: boolean }> {
  const { state } = ctx;
  const results: Partial<Record<HcDataType, HcTypeResult>> = {};
  if (!state.import.weight) {
    if (state.import.bodyFat) results.bodyFat = { status: 'denied' };
    return { results, done: false };
  }
  if (!isGranted(granted, 'weight')) {
    results.weight = { status: 'denied' };
    if (state.import.bodyFat) results.bodyFat = { status: 'denied' };
    return { results, done: false };
  }
  const readFat = state.import.bodyFat && isGranted(granted, 'bodyFat');
  if (state.import.bodyFat && !readFat) results.bodyFat = { status: 'denied' };
  const fromS = state.lastImportS === null ? ctx.nowS - FIRST_IMPORT_DAYS * DAY_S : state.lastImportS - IMPORT_OVERLAP_DAYS * DAY_S;
  let weights: unknown[];
  let fats: unknown[] = [];
  try {
    weights = await ctx.api.readAll('Weight', fromS, ctx.nowS);
  } catch {
    results.weight = { status: 'error', step: 'read' };
    if (readFat) results.bodyFat = { status: 'error', step: 'read' };
    return { results, done: false };
  }
  let fatFailed = false;
  if (readFat) {
    try {
      fats = await ctx.api.readAll('BodyFat', fromS, ctx.nowS);
    } catch {
      fatFailed = true;
      results.bodyFat = { status: 'error', step: 'read' };
    }
  }
  const plan = planBodyImport(weights, fats, ctx.ownPackage, ctx.tzOffsetAt);
  try {
    const stored = await ctx.importBody(plan.entries);
    results.weight = { status: 'ok', count: stored.saved };
    if (readFat && !fatFailed) results.bodyFat = { status: 'ok', count: plan.entries.filter((e) => e.bodyFatPct !== null).length };
  } catch {
    results.weight = { status: 'error', step: 'store' };
    if (readFat && !fatFailed) results.bodyFat = { status: 'error', step: 'store' };
    return { results, done: false };
  }
  return { results, done: !fatFailed };
}

export async function runHealthConnectSync(ctx: HcSyncContext): Promise<HcSyncOutcome> {
  const granted = await ctx.api.grantedPermissions();
  const results: Partial<Record<HcDataType, HcTypeResult>> = {};
  const fromS = ctx.nowS - EXPORT_WINDOW_DAYS * DAY_S;
  let heartRateCursorS = ctx.state.heartRateCursorS;
  for (const type of HC_EXPORT_TYPES) {
    if (!ctx.state.export[type]) continue;
    if (!ctx.exportAllowed) {
      results[type] = { status: 'demo' };
      continue;
    }
    if (!isGranted(granted, type)) {
      results[type] = { status: 'denied' };
      continue;
    }
    if (type === 'heartRate') {
      const outcome = await exportHeartRate(ctx, fromS);
      results.heartRate = outcome.result;
      heartRateCursorS = outcome.cursor;
      continue;
    }
    results[type] = await exportType(ctx, type, fromS);
  }
  const imported = await importBody(ctx, granted);
  Object.assign(results, imported.results);
  return {
    report: { at: ctx.nowS, results },
    heartRateCursorS,
    lastImportS: imported.done ? ctx.nowS : ctx.state.lastImportS,
  };
}
