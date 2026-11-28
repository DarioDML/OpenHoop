import type { DayRecord, FlowLevel, Intensity, PeriodEntry, PeriodInput, PregnancyEntry, Symptom, SymptomEntry, SymptomInput } from '@openhoop/core';

import { parseIsoDate } from '@/lib/dates';

import { shiftIsoDay } from './bodyComposition';
import { metricValue, type MetricKey } from './derived';

export const CYCLE_LIMITS = {
  minCycleDays: 15,
  maxCycleDays: 60,
  maxPeriodDays: 14,
  recentCycles: 6,
  minCyclesForEstimate: 2,
} as const;

export const PREGNANCY_LIMITS = {
  fullTermDays: 280,
  pastDueDays: 14,
  lateTermDays: 294,
} as const;

export const SYMPTOM_OPTIONS = ['cramps', 'headache', 'bloating', 'mood', 'fatigue', 'breastTenderness', 'nausea', 'backPain'] as const satisfies readonly Symptom[];
export const FLOW_OPTIONS = [1, 2, 3] as const satisfies readonly FlowLevel[];
export const INTENSITY_OPTIONS = [1, 2, 3] as const satisfies readonly Intensity[];

type AssertNever<T extends never> = T;
type _CompleteOptions = [
  AssertNever<Exclude<Symptom, (typeof SYMPTOM_OPTIONS)[number]>>,
  AssertNever<Exclude<FlowLevel, (typeof FLOW_OPTIONS)[number]>>,
  AssertNever<Exclude<Intensity, (typeof INTENSITY_OPTIONS)[number]>>,
];

export const TIMELINE_RANGES = [30, 90] as const;
export type TimelineRange = (typeof TIMELINE_RANGES)[number];

export function parseTimelineRange(value: string): TimelineRange {
  return TIMELINE_RANGES.find((range) => `${range}` === value) ?? 90;
}

const MIN_YEAR = 2015;
const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a === null || b === null) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

function validDay(day: string): boolean {
  const parts = parseIsoDate(day);
  return parts !== null && parts.y >= MIN_YEAR;
}

export function isLogDay(day: string, today: string): boolean {
  return validDay(day) && day <= today;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sortedPeriods(periods: readonly PeriodEntry[]): PeriodEntry[] {
  return [...periods].sort((a, b) => (a.startDay === b.startDay ? a.id - b.id : a.startDay < b.startDay ? -1 : 1));
}

export function periodLengthDays(period: Pick<PeriodEntry, 'startDay' | 'endDay'>): number | null {
  if (period.endDay === null) return null;
  return daysBetween(period.startDay, period.endDay) + 1;
}

export interface CycleStats {
  cycleLengths: number[];
  cycleCount: number;
  skippedGaps: number;
  averageCycleDays: number | null;
  shortestCycleDays: number | null;
  longestCycleDays: number | null;
  periodCount: number;
  averagePeriodDays: number | null;
  lastStartDay: string | null;
}

export function computeCycleStats(periods: readonly PeriodEntry[]): CycleStats {
  const ordered = sortedPeriods(periods);
  const valid: number[] = [];
  let skippedGaps = 0;
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (previous === undefined || current === undefined) continue;
    const length = daysBetween(previous.startDay, current.startDay);
    if (length >= CYCLE_LIMITS.minCycleDays && length <= CYCLE_LIMITS.maxCycleDays) valid.push(length);
    else skippedGaps += 1;
  }
  const recent = valid.slice(-CYCLE_LIMITS.recentCycles);
  const lengths = ordered
    .map(periodLengthDays)
    .filter((length): length is number => length !== null && length >= 1 && length <= CYCLE_LIMITS.maxPeriodDays);
  const last = ordered[ordered.length - 1];
  return {
    cycleLengths: recent,
    cycleCount: recent.length,
    skippedGaps,
    averageCycleDays: recent.length === 0 ? null : roundTo(recent.reduce((sum, n) => sum + n, 0) / recent.length, 1),
    shortestCycleDays: recent.length === 0 ? null : Math.min(...recent),
    longestCycleDays: recent.length === 0 ? null : Math.max(...recent),
    periodCount: ordered.length,
    averagePeriodDays: lengths.length === 0 ? null : roundTo(lengths.reduce((sum, n) => sum + n, 0) / lengths.length, 1),
    lastStartDay: last?.startDay ?? null,
  };
}

export type NextPeriodReason = 'no-data' | 'needs-history';

export type NextPeriodEstimate =
  | { ok: true; day: string; daysUntil: number; averageCycleDays: number; cyclesUsed: number; earliestDay: string; latestDay: string }
  | { ok: false; reason: NextPeriodReason };

export function estimateNextPeriod(stats: CycleStats, today: string): NextPeriodEstimate {
  if (stats.lastStartDay === null) return { ok: false, reason: 'no-data' };
  if (stats.cycleCount < CYCLE_LIMITS.minCyclesForEstimate || stats.averageCycleDays === null) return { ok: false, reason: 'needs-history' };
  const day = shiftIsoDay(stats.lastStartDay, Math.round(stats.averageCycleDays));
  return {
    ok: true,
    day,
    daysUntil: daysBetween(today, day),
    averageCycleDays: stats.averageCycleDays,
    cyclesUsed: stats.cycleCount,
    earliestDay: shiftIsoDay(stats.lastStartDay, stats.shortestCycleDays ?? Math.round(stats.averageCycleDays)),
    latestDay: shiftIsoDay(stats.lastStartDay, stats.longestCycleDays ?? Math.round(stats.averageCycleDays)),
  };
}

export function dayOfCycle(stats: CycleStats, today: string): number | null {
  if (stats.lastStartDay === null) return null;
  const day = daysBetween(stats.lastStartDay, today) + 1;
  return day >= 1 && day <= CYCLE_LIMITS.maxCycleDays ? day : null;
}

export type PeriodField = 'start' | 'end' | 'overlap';

export interface PeriodDraft {
  start: string;
  end: string;
  flow: FlowLevel;
}

export type PeriodValidation = { ok: true; value: PeriodInput } | { ok: false; invalid: PeriodField[] };

function coveredRange(start: string, end: string | null): { from: string; to: string } {
  return { from: start, to: end ?? start };
}

export function validatePeriodDraft(draft: PeriodDraft, today: string, existing: readonly PeriodEntry[], editingId: number | null): PeriodValidation {
  const invalid: PeriodField[] = [];
  const start = draft.start.trim();
  const endText = draft.end.trim();
  const startOk = validDay(start) && start <= today;
  if (!startOk) invalid.push('start');
  let endDay: string | null = null;
  if (endText !== '') {
    const endOk = validDay(endText) && endText <= today && startOk && endText >= start && daysBetween(start, endText) + 1 <= CYCLE_LIMITS.maxPeriodDays;
    if (endOk) endDay = endText;
    else invalid.push('end');
  }
  if (startOk && !invalid.includes('end')) {
    const mine = coveredRange(start, endDay);
    const clash = existing.some((other) => {
      if (other.id === editingId) return false;
      const theirs = coveredRange(other.startDay, other.endDay);
      return mine.from <= theirs.to && theirs.from <= mine.to;
    });
    if (clash) invalid.push('overlap');
  }
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true, value: { startDay: start, endDay, flow: draft.flow } };
}

export type SymptomField = 'day' | 'symptom';

export interface SymptomDraft {
  day: string;
  symptom: Symptom | null;
  intensity: Intensity;
}

export type SymptomValidation = { ok: true; value: SymptomInput } | { ok: false; invalid: SymptomField[] };

export function validateSymptomDraft(draft: SymptomDraft, today: string): SymptomValidation {
  const invalid: SymptomField[] = [];
  const day = draft.day.trim();
  if (!validDay(day) || day > today) invalid.push('day');
  if (draft.symptom === null) invalid.push('symptom');
  if (invalid.length > 0 || draft.symptom === null) return { ok: false, invalid };
  return { ok: true, value: { day, symptom: draft.symptom, intensity: draft.intensity } };
}

export interface SymptomDay {
  day: string;
  entries: SymptomEntry[];
}

export function groupSymptomsByDay(entries: readonly SymptomEntry[]): SymptomDay[] {
  const byDay = new Map<string, SymptomEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.day) ?? [];
    list.push(entry);
    byDay.set(entry.day, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => ({ day, entries: list.sort((a, b) => a.id - b.id) }));
}

export type PregnancyValidation = { ok: true; dueDay: string } | { ok: false };

export function validateDueDay(text: string, today: string): PregnancyValidation {
  const dueDay = text.trim();
  if (!validDay(dueDay)) return { ok: false };
  const earliest = shiftIsoDay(today, -PREGNANCY_LIMITS.pastDueDays);
  const latest = shiftIsoDay(today, PREGNANCY_LIMITS.fullTermDays);
  return dueDay >= earliest && dueDay <= latest ? { ok: true, dueDay } : { ok: false };
}

export type PregnancyStage = 'before' | 'ongoing' | 'beyond';

export interface PregnancyProgress {
  stage: PregnancyStage;
  weeks: number;
  days: number;
  gestationalDays: number;
  daysToDue: number;
}

export function pregnancyProgress(pregnancy: Pick<PregnancyEntry, 'dueDay'>, today: string): PregnancyProgress {
  const daysToDue = daysBetween(today, pregnancy.dueDay);
  const gestationalDays = PREGNANCY_LIMITS.fullTermDays - daysToDue;
  const stage: PregnancyStage = gestationalDays < 0 ? 'before' : gestationalDays > PREGNANCY_LIMITS.lateTermDays ? 'beyond' : 'ongoing';
  const clamped = Math.max(0, gestationalDays);
  return { stage, weeks: Math.floor(clamped / 7), days: clamped % 7, gestationalDays, daysToDue };
}

export interface TimelineDay {
  day: string;
  flow: FlowLevel | null;
  deviationC: number | null;
}

export function buildTimeline(days: readonly DayRecord[], periods: readonly PeriodEntry[], today: string, range: TimelineRange): TimelineDay[] {
  const deviation = new Map<string, number | null>();
  for (const record of days) deviation.set(record.day, metricValue(record, 'skinTempDeviation'));
  const flows = new Map<string, FlowLevel>();
  for (const period of periods) {
    const length = Math.min(Math.max(daysBetween(period.startDay, period.endDay ?? period.startDay), 0), CYCLE_LIMITS.maxPeriodDays);
    for (let offset = 0; offset <= length; offset++) flows.set(shiftIsoDay(period.startDay, offset), period.flow);
  }
  const timeline: TimelineDay[] = [];
  for (let offset = range - 1; offset >= 0; offset--) {
    const day = shiftIsoDay(today, -offset);
    timeline.push({ day, flow: flows.get(day) ?? null, deviationC: deviation.get(day) ?? null });
  }
  return timeline;
}

export interface NightlyPoint {
  day: string;
  value: number | null;
}

export function nightlySeries(days: readonly DayRecord[], key: MetricKey, today: string, range: number): NightlyPoint[] {
  const byDay = new Map<string, number | null>();
  for (const record of days) byDay.set(record.day, metricValue(record, key));
  const points: NightlyPoint[] = [];
  for (let offset = range - 1; offset >= 0; offset--) {
    const day = shiftIsoDay(today, -offset);
    points.push({ day, value: byDay.get(day) ?? null });
  }
  return points;
}

export const CYCLE_PHASES = ['menstrual', 'follicular', 'ovulation', 'luteal'] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];

export const PHASE_DEFAULTS = {
  cycleDays: 28,
  periodDays: 5,
  lutealDays: 14,
  ovulationHalfWindow: 1,
  fertileBefore: 5,
  fertileAfter: 1,
  minPeriodDays: 2,
  maxPeriodDays: 8,
} as const;

export interface PhaseSpan {
  phase: CyclePhase;
  from: number;
  to: number;
}

export function cyclePhases(cycleDays: number, periodDays: number): PhaseSpan[] {
  const length = Math.max(CYCLE_LIMITS.minCycleDays, Math.round(cycleDays));
  const period = Math.min(PHASE_DEFAULTS.maxPeriodDays, Math.max(PHASE_DEFAULTS.minPeriodDays, Math.round(periodDays)));
  const ovulation = Math.max(period + 3, length - PHASE_DEFAULTS.lutealDays);
  const spans: PhaseSpan[] = [
    { phase: 'menstrual', from: 1, to: period },
    { phase: 'follicular', from: period + 1, to: ovulation - PHASE_DEFAULTS.ovulationHalfWindow - 1 },
    { phase: 'ovulation', from: ovulation - PHASE_DEFAULTS.ovulationHalfWindow, to: Math.min(length, ovulation + PHASE_DEFAULTS.ovulationHalfWindow) },
    { phase: 'luteal', from: ovulation + PHASE_DEFAULTS.ovulationHalfWindow + 1, to: length },
  ];
  return spans.filter((span) => span.to >= span.from);
}

export function phaseOn(spans: readonly PhaseSpan[], day: number): PhaseSpan | null {
  return spans.find((span) => day >= span.from && day <= span.to) ?? null;
}

export interface CycleWheel {
  day: number;
  length: number;
  typicalLength: boolean;
  spans: PhaseSpan[];
  phase: CyclePhase;
  daysLeftInPhase: number;
  overdue: boolean;
}

export function cycleWheel(stats: CycleStats, today: string): CycleWheel | null {
  const day = dayOfCycle(stats, today);
  if (day === null) return null;
  const typicalLength = stats.averageCycleDays === null;
  const length = Math.round(stats.averageCycleDays ?? PHASE_DEFAULTS.cycleDays);
  const spans = cyclePhases(length, stats.averagePeriodDays ?? PHASE_DEFAULTS.periodDays);
  const shownLength = spans[spans.length - 1]?.to ?? length;
  const span = phaseOn(spans, day);
  if (span === null) return { day, length: shownLength, typicalLength, spans, phase: 'luteal', daysLeftInPhase: 0, overdue: true };
  return { day, length: shownLength, typicalLength, spans, phase: span.phase, daysLeftInPhase: span.to - day, overdue: false };
}

export interface DayWindow {
  from: string;
  to: string;
}

export function fertileWindow(next: NextPeriodEstimate): DayWindow | null {
  if (!next.ok) return null;
  const ovulation = shiftIsoDay(next.day, -PHASE_DEFAULTS.lutealDays);
  return { from: shiftIsoDay(ovulation, -PHASE_DEFAULTS.fertileBefore), to: shiftIsoDay(ovulation, PHASE_DEFAULTS.fertileAfter) };
}

export interface RecentValue {
  day: string;
  value: number;
}

export function latestDeviation(days: readonly DayRecord[], today: string, maxAgeDays: number): RecentValue | null {
  const from = shiftIsoDay(today, -maxAgeDays);
  for (let i = days.length - 1; i >= 0; i--) {
    const record = days[i];
    if (record === undefined || record.day > today) continue;
    if (record.day < from) return null;
    const value = metricValue(record, 'skinTempDeviation');
    if (value !== null) return { day: record.day, value };
  }
  return null;
}

export type TempFit = 'typical' | 'different';

export const TEMP_FIT_C = 0.1;

export function tempFitsPhase(phase: CyclePhase, deviationC: number): TempFit | null {
  if (phase === 'ovulation') return null;
  if (phase === 'luteal') return deviationC >= TEMP_FIT_C ? 'typical' : 'different';
  return deviationC <= TEMP_FIT_C ? 'typical' : 'different';
}

export type FlowChoice = 0 | FlowLevel;

export type FlowAction =
  | { kind: 'none' }
  | { kind: 'insert'; input: PeriodInput }
  | { kind: 'update'; id: number; input: PeriodInput }
  | { kind: 'delete'; id: number }
  | { kind: 'newPeriod'; input: PeriodInput }
  | { kind: 'inside' }
  | { kind: 'invalid' };

export const FLOW_JOIN_GAP_DAYS = 2;

export function coverEnd(period: PeriodEntry, today: string): string {
  if (period.endDay !== null) return period.endDay;
  const longest = shiftIsoDay(period.startDay, CYCLE_LIMITS.maxPeriodDays - 1);
  return longest < today ? longest : today;
}

export function periodOn(periods: readonly PeriodEntry[], day: string, today: string): PeriodEntry | null {
  return periods.find((period) => period.startDay <= day && day <= coverEnd(period, today)) ?? null;
}

export function dayFlow(periods: readonly PeriodEntry[], day: string, today: string): FlowChoice {
  return periodOn(periods, day, today)?.flow ?? 0;
}

function checked(input: PeriodInput, id: number | null, periods: readonly PeriodEntry[], today: string): FlowAction {
  const result = validatePeriodDraft({ start: input.startDay, end: input.endDay ?? '', flow: input.flow }, today, periods, id);
  if (!result.ok) return { kind: 'invalid' };
  return id === null ? { kind: 'insert', input: result.value } : { kind: 'update', id, input: result.value };
}

export function applyDayFlow(periods: readonly PeriodEntry[], day: string, choice: FlowChoice, today: string): FlowAction {
  const cover = periodOn(periods, day, today);
  if (choice === 0) {
    if (cover === null) return { kind: 'none' };
    const last = coverEnd(cover, today);
    if (cover.startDay === day && last === day) return { kind: 'delete', id: cover.id };
    if (last === day) return checked({ startDay: cover.startDay, endDay: shiftIsoDay(day, -1), flow: cover.flow }, cover.id, periods, today);
    if (cover.startDay === day) return checked({ startDay: shiftIsoDay(day, 1), endDay: cover.endDay, flow: cover.flow }, cover.id, periods, today);
    return { kind: 'inside' };
  }
  if (cover !== null) {
    if (cover.flow === choice) return { kind: 'none' };
    return checked({ startDay: cover.startDay, endDay: cover.endDay, flow: choice }, cover.id, periods, today);
  }
  const joins = (gap: number): boolean => gap >= 0 && gap <= FLOW_JOIN_GAP_DAYS;
  const before = periods
    .filter((period) => period.startDay < day && joins(daysBetween(coverEnd(period, today), day) - 1) && daysBetween(period.startDay, day) + 1 <= CYCLE_LIMITS.maxPeriodDays)
    .sort((a, b) => (a.startDay < b.startDay ? 1 : -1))[0];
  if (before !== undefined) return checked({ startDay: before.startDay, endDay: day === today ? null : day, flow: choice }, before.id, periods, today);
  const after = periods.find(
    (period) => period.startDay > day && joins(daysBetween(day, period.startDay) - 1) && daysBetween(day, coverEnd(period, today)) + 1 <= CYCLE_LIMITS.maxPeriodDays,
  );
  if (after !== undefined) return checked({ startDay: day, endDay: after.endDay, flow: choice }, after.id, periods, today);
  const fresh = checked({ startDay: day, endDay: day === today ? null : day, flow: choice }, null, periods, today);
  return fresh.kind === 'insert' ? { kind: 'newPeriod', input: fresh.input } : fresh;
}
