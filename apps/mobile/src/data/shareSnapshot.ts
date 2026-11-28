import type { HeartRatePoint, ParityLevel } from './types';
import type { ActivityType } from './activityDerived';
import type { ActivityEntry, EntryKind } from './activities';
import { hideAroundEnds, MIN_PACE_DISTANCE_M, paceSecondsPerKm, routeStats, speedKmh, usesPace, type RoutePoint } from './route';
import { displayedZones } from '@/ui/ZoneBar';
import { PARITY } from '@/ui/parity';

export const SNAPSHOT_FIELDS = ['route', 'load', 'hrChart', 'pace', 'name', 'date', 'duration', 'heartRate', 'zones', 'calories'] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export type SnapshotSelection = Readonly<Record<SnapshotField, boolean>>;

export type SnapshotStyle = 'light' | 'dark';

export const SNAPSHOT_FORMATS = ['story', 'square', 'transparent'] as const;

export type SnapshotFormat = (typeof SNAPSHOT_FORMATS)[number];

export const DEFAULT_SELECTION: SnapshotSelection = {
  route: true,
  load: true,
  hrChart: false,
  pace: true,
  name: false,
  date: true,
  duration: true,
  heartRate: true,
  zones: true,
  calories: true,
};

export interface SnapshotInput {
  entry: ActivityEntry;
  day: string;
  kcal: number | null;
  route?: readonly RoutePoint[];
  heartRate?: readonly HeartRatePoint[];
}

export interface SnapshotOptions {
  privacyRadiusM: number;
}

export const NO_PRIVACY: SnapshotOptions = { privacyRadiusM: 0 };

export interface SnapshotPace {
  distanceM: number;
  usesPace: boolean;
  secondsPerKm: number | null;
  speedKmh: number | null;
}

export interface SnapshotView {
  type: ActivityType | null;
  name: string | null;
  day: string | null;
  duration: { seconds: number; level: ParityLevel } | null;
  load: { value: number; level: ParityLevel } | null;
  avgHr: number | null;
  maxHr: number | null;
  heartRateLevel: ParityLevel;
  noHeartRate: boolean;
  zones: { seconds: ReadonlyArray<number>; level: ParityLevel } | null;
  calories: { kcal: number; level: ParityLevel } | null;
  route: { points: RoutePoint[]; trimmed: boolean; level: ParityLevel } | null;
  routeHiddenAway: boolean;
  pace: (SnapshotPace & { level: ParityLevel }) | null;
  hrChart: { points: ReadonlyArray<HeartRatePoint>; start: number; end: number; level: ParityLevel } | null;
}

export function durationParity(kind: EntryKind): ParityLevel {
  return kind === 'detected' ? PARITY.workouts : 'D';
}

function routeDistanceM(input: SnapshotInput): number {
  const route = input.route ?? [];
  return route.length >= 2 ? routeStats(route).distanceM : 0;
}

export function snapshotPace(input: SnapshotInput): SnapshotPace | null {
  const distanceM = routeDistanceM(input);
  const activeS = input.entry.metrics.activeS;
  if (distanceM < MIN_PACE_DISTANCE_M || activeS <= 0) return null;
  return { distanceM, usesPace: usesPace(input.entry.type ?? 'other'), secondsPerKm: paceSecondsPerKm(distanceM, activeS), speedKmh: speedKmh(distanceM, activeS) };
}

export function availableFields(input: SnapshotInput): ReadonlyArray<SnapshotField> {
  const { entry, kcal } = input;
  return SNAPSHOT_FIELDS.filter((field) => {
    if (field === 'route') return (input.route?.length ?? 0) >= 2;
    if (field === 'pace') return snapshotPace(input) !== null;
    if (field === 'hrChart') return (input.heartRate?.length ?? 0) >= 2;
    if (field === 'name') return entry.label !== null && entry.label.trim() !== '';
    if (field === 'duration') return entry.metrics.activeS > 0;
    if (field === 'load') return entry.hasLoad && entry.metrics.load !== null;
    if (field === 'zones') return displayedZones(entry.metrics.zoneSeconds).some((s) => s > 0);
    if (field === 'calories') return kcal !== null;
    return true;
  });
}

export function buildSnapshot(input: SnapshotInput, selection: SnapshotSelection, options: SnapshotOptions = NO_PRIVACY): SnapshotView {
  const { entry, day, kcal } = input;
  const m = entry.metrics;
  const has = new Set(availableFields(input));
  const on = (field: SnapshotField): boolean => selection[field] && has.has(field);
  const showHeartRate = selection.heartRate;
  const hasAnyHr = m.avgHr !== null || m.maxHr !== null;
  const label = entry.label?.trim() ?? '';
  const shownRoute = on('route') ? hideAroundEnds(input.route ?? [], options.privacyRadiusM) : null;
  const routeVisible = shownRoute !== null && shownRoute.length >= 2;
  const pace = on('pace') ? snapshotPace(input) : null;
  return {
    type: entry.type,
    name: on('name') && label !== '' ? label : null,
    day: selection.date ? day : null,
    duration: on('duration') ? { seconds: m.activeS, level: durationParity(entry.kind) } : null,
    load: on('load') && m.load !== null ? { value: m.load, level: PARITY.load } : null,
    avgHr: showHeartRate ? m.avgHr : null,
    maxHr: showHeartRate ? m.maxHr : null,
    heartRateLevel: PARITY.heartRate,
    noHeartRate: showHeartRate && !hasAnyHr,
    zones: on('zones') ? { seconds: displayedZones(m.zoneSeconds), level: PARITY.zones } : null,
    calories: on('calories') && kcal !== null ? { kcal, level: PARITY.calories } : null,
    route: routeVisible ? { points: shownRoute, trimmed: options.privacyRadiusM > 0, level: PARITY.route } : null,
    routeHiddenAway: shownRoute !== null && !routeVisible,
    pace: pace === null ? null : { ...pace, level: PARITY.route },
    hrChart: on('hrChart') ? { points: input.heartRate ?? [], start: entry.start, end: entry.end, level: PARITY.heartRate } : null,
  };
}

export function snapshotFileName(type: ActivityType | null, day: string, format: SnapshotFormat, nowMs: number): string {
  const kind = type ?? 'workout';
  const safeDay = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : 'activity';
  const stamp = Number.isFinite(nowMs) && nowMs > 0 ? `-${Math.floor(nowMs)}` : '';
  return `openhoop-${kind}-${safeDay}-${format}${stamp}.png`;
}

export function toggleField(selection: SnapshotSelection, field: SnapshotField, value: boolean): SnapshotSelection {
  return { ...selection, [field]: value };
}
