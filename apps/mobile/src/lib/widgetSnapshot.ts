import type { DayRecord } from '@openhoop/core';

import { visibleReadiness } from '@/data/derived';
import type { Language } from '@/data/types';
import { KNOWN_REASONS, reasonKey, translate, type TranslationKey, type TranslationParams } from '@/i18n';

import { formatAgo, formatNumber, formatShortDay } from './format';

export const WIDGET_NAMES = ['OpenHoopScores', 'OpenHoopOverview', 'OpenHoopReadiness', 'OpenHoopRings', 'OpenHoopDay'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

const VERSION = 1;
export const STALE_AFTER_S = 24 * 3_600;
const REASONS: readonly string[] = [...KNOWN_REASONS, 'unknown'];

export interface WidgetMetric {
  value: number | null;
  reason: string | null;
}

export interface WidgetRange {
  low: number;
  high: number;
}

export interface WidgetValues {
  v: typeof VERSION;
  kind: 'values';
  language: Language;
  day: string;
  syncedAt: number | null;
  readiness: WidgetMetric;
  calibrating: boolean;
  nightsLeft: number | null;
  sleep: WidgetMetric;
  load: WidgetMetric;
  restingHr: WidgetMetric;
  hrv: WidgetMetric;
  loadTarget: WidgetRange | null;
}

export interface WidgetNotice {
  v: typeof VERSION;
  kind: 'off' | 'empty';
  language: Language;
}

export type WidgetFile = WidgetValues | WidgetNotice;

export interface WidgetInput {
  enabled: boolean;
  day: DayRecord | undefined;
  syncedAt: number | null;
  language: Language;
  readinessNightsLeft: number | null;
  loadTarget?: WidgetRange | null;
}

function metric(derived: { value: number | null; reason: string | null }, decimals: number): WidgetMetric {
  if (derived.value !== null && Number.isFinite(derived.value)) {
    const factor = 10 ** decimals;
    return { value: Math.round(derived.value * factor) / factor, reason: null };
  }
  const reason = derived.reason === null ? 'no-data' : REASONS.includes(derived.reason) ? derived.reason : 'unknown';
  return { value: null, reason };
}

function range(target: WidgetRange | null | undefined): WidgetRange | null {
  if (target === null || target === undefined || !Number.isFinite(target.low) || !Number.isFinite(target.high)) return null;
  const low = Math.round(Math.max(0, target.low) * 10) / 10;
  const high = Math.round(Math.min(21, target.high) * 10) / 10;
  return low <= high ? { low, high } : null;
}

export function buildWidgetFile({ enabled, day, syncedAt, language, readinessNightsLeft, loadTarget }: WidgetInput): WidgetFile {
  if (!enabled) return { v: VERSION, kind: 'off', language };
  if (day === undefined) return { v: VERSION, kind: 'empty', language };
  return {
    v: VERSION,
    kind: 'values',
    language,
    day: day.day,
    syncedAt,
    readiness: metric(visibleReadiness(day), 0),
    calibrating: day.readinessCalibrating,
    nightsLeft: readinessNightsLeft,
    sleep: metric(day.sleep.score, 0),
    load: metric(day.load, 1),
    restingHr: metric(day.restingHr, 0),
    hrv: metric(day.hrv, 0),
    loadTarget: range(loadTarget),
  };
}

export function serializeWidgetFile(file: WidgetFile): string {
  return JSON.stringify(file);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isRecord(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLanguage(value: Json | undefined): Language | null {
  return value === 'en' || value === 'nl' ? value : null;
}

function parseMetric(value: Json | undefined, max: number): WidgetMetric | null {
  if (!isRecord(value)) return null;
  const { value: number, reason } = value;
  if (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= max && reason === null) return { value: number, reason: null };
  if (number === null && typeof reason === 'string' && REASONS.includes(reason)) return { value: null, reason };
  return null;
}

function parseRange(value: Json | undefined): WidgetRange | null | undefined {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return undefined;
  const { low, high } = value;
  if (typeof low !== 'number' || typeof high !== 'number' || !Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high > 21 || low > high) return undefined;
  return { low, high };
}

function parseNightsLeft(value: Json | undefined): number | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function parseWidgetFile(raw: string | null): WidgetFile | null {
  if (raw === null || raw === '') return null;
  let parsed: Json;
  try {
    parsed = JSON.parse(raw) as Json;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.v !== VERSION) return null;
  const language = parseLanguage(parsed.language);
  if (language === null) return null;
  if (parsed.kind === 'off' || parsed.kind === 'empty') return { v: VERSION, kind: parsed.kind, language };
  if (parsed.kind !== 'values') return null;
  const { day, syncedAt, calibrating } = parsed;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (syncedAt !== null && (typeof syncedAt !== 'number' || !Number.isInteger(syncedAt) || syncedAt < 0)) return null;
  if (typeof calibrating !== 'boolean') return null;
  const nightsLeft = parseNightsLeft(parsed.nightsLeft);
  if (nightsLeft === undefined) return null;
  const readiness = parseMetric(parsed.readiness, 100);
  const sleep = parseMetric(parsed.sleep, 100);
  const load = parseMetric(parsed.load, 21);
  const restingHr = parseMetric(parsed.restingHr, 250);
  const hrv = parseMetric(parsed.hrv, 500);
  if (readiness === null || sleep === null || load === null || restingHr === null || hrv === null) return null;
  const loadTarget = parseRange(parsed.loadTarget);
  if (loadTarget === undefined) return null;
  return { v: VERSION, kind: 'values', language, day, syncedAt, readiness, calibrating, nightsLeft, sleep, load, restingHr, hrv, loadTarget };
}

export type WidgetTone = 'text' | 'muted' | 'warning' | 'sleep' | 'load' | 'readinessHigh' | 'readinessMid' | 'readinessLow';

export interface WidgetLine {
  key: 'readiness' | 'sleep' | 'load' | 'restingHr' | 'hrv';
  label: string;
  value: string;
  note: string | null;
  tone: WidgetTone;
  fraction: number | null;
}

export type WidgetView =
  | { kind: 'message'; title: string; body: string; label: string }
  | {
      kind: 'values';
      scores: [WidgetLine, WidgetLine, WidgetLine];
      vitals: [WidgetLine, WidgetLine];
      age: string;
      stale: boolean;
      label: string;
      headline: string;
      loadLine: string;
    };

function readinessTone({ value }: WidgetMetric, calibrating: boolean): WidgetTone {
  if (value === null || calibrating) return 'muted';
  if (value >= 67) return 'readinessHigh';
  if (value >= 34) return 'readinessMid';
  return 'readinessLow';
}

export interface ViewContext {
  nowS: number;
  today: string;
  fallbackLanguage: Language;
}

export function widgetView(file: WidgetFile | null, { nowS, today, fallbackLanguage }: ViewContext): WidgetView {
  const language = file?.language ?? fallbackLanguage;
  const t = (key: TranslationKey, params?: TranslationParams): string => translate(language, key, params);
  const label = t('widget.open');
  if (file === null) return { kind: 'message', title: t('widget.missingTitle'), body: t('widget.missingBody'), label };
  if (file.kind !== 'values') {
    return file.kind === 'off'
      ? { kind: 'message', title: t('widget.offTitle'), body: t('widget.offBody'), label }
      : { kind: 'message', title: t('widget.emptyTitle'), body: t('widget.emptyBody'), label };
  }

  const reason = (entry: WidgetMetric): string | null => (entry.value === null ? t(reasonKey(entry.reason)) : null);
  const show = (entry: WidgetMetric, decimals: number, unit: string): string => (entry.value === null ? '–' : `${formatNumber(entry.value, decimals, language)}${unit}`);
  const line = (
    key: WidgetLine['key'],
    labelKey: TranslationKey,
    entry: WidgetMetric,
    decimals: number,
    unit: string,
    tone: WidgetTone,
    max: number | null = null,
  ): WidgetLine => ({
    key,
    label: t(labelKey),
    value: show(entry, decimals, unit),
    note: reason(entry),
    tone: entry.value === null ? 'muted' : tone,
    fraction: entry.value === null || max === null ? null : Math.max(0, Math.min(1, entry.value / max)),
  });

  const readinessLine = line('readiness', 'score.readiness', file.readiness, 0, '%', readinessTone(file.readiness, file.calibrating), 100);
  if (file.calibrating) {
    readinessLine.value = '–';
    readinessLine.tone = 'muted';
    readinessLine.fraction = null;
    if (file.nightsLeft !== null) readinessLine.note = file.nightsLeft === 1 ? t('widget.nightsLeftOne') : t('widget.nightsLeft', { count: file.nightsLeft });
    else readinessLine.note = t('reason.needs-history');
  }
  const sleep = line('sleep', 'score.sleep', file.sleep, 0, '%', 'sleep', 100);
  const load = line('load', 'score.load', file.load, 1, '', 'load', 21);
  const restingHr = line('restingHr', 'widget.restingHr', file.restingHr, 0, ` ${t('unit.bpm')}`, 'text');
  const hrv = line('hrv', 'metric.hrv', file.hrv, 0, ` ${t('unit.ms')}`, 'text');

  const synced = file.syncedAt === null ? t('widget.notSynced') : t('home.syncedShort', { ago: formatAgo(t, nowS, file.syncedAt) });
  const oldDay = file.day !== today;
  const stale = oldDay || file.syncedAt === null || nowS - file.syncedAt > STALE_AFTER_S;
  const age = oldDay ? `${t('widget.fromDay', { day: formatShortDay(file.day, language) })} · ${synced}` : synced;
  const tone = readinessLine.tone;
  const headline =
    readinessLine.fraction === null
      ? t('widget.day.unknown')
      : tone === 'readinessHigh'
        ? t('widget.day.high')
        : tone === 'readinessLow'
          ? t('widget.day.low')
          : t('widget.day.medium');
  const target = file.loadTarget;
  const loadLine =
    file.load.value === null
      ? `${load.label} ${load.note ?? '–'}`
      : target === null
        ? `${load.label} ${load.value}`
        : t('widget.day.loadOf', { label: load.label, value: load.value, low: formatNumber(target.low, 1, language), high: formatNumber(target.high, 1, language) });
  return { kind: 'values', scores: [readinessLine, sleep, load], vitals: [restingHr, hrv], age, stale, label, headline, loadLine };
}

export function ringSvg(fraction: number | null, color: string, track: string, size = 64, stroke = 6): string {
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = fraction === null ? 0 : Math.max(0, Math.min(1, fraction));
  const arc =
    shown > 0
      ? `<circle cx="${center}" cy="${center}" r="${radius.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(circumference * shown).toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 ${center} ${center})"/>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${radius.toFixed(2)}" fill="none" stroke="${track}" stroke-width="${stroke}"/>${arc}</svg>`;
}
