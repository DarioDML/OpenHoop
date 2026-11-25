import type { ParityLevel } from './types';
import type { ActivityType } from './activityDerived';
import type { ActivityEntry, EntryKind } from './activities';
import { displayedZones } from '@/ui/ZoneBar';
import { PARITY } from '@/ui/parity';

export const SNAPSHOT_FIELDS = ['name', 'date', 'duration', 'load', 'heartRate', 'zones', 'calories'] as const;

export type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export type SnapshotSelection = Readonly<Record<SnapshotField, boolean>>;

export type SnapshotStyle = 'light' | 'dark';

export const DEFAULT_SELECTION: SnapshotSelection = {
  name: false,
  date: true,
  duration: true,
  load: true,
  heartRate: true,
  zones: true,
  calories: true,
};

export interface SnapshotInput {
  entry: ActivityEntry;
  day: string;
  kcal: number | null;
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
}

export function durationParity(kind: EntryKind): ParityLevel {
  return kind === 'detected' ? PARITY.workouts : 'D';
}

export function availableFields(input: SnapshotInput): ReadonlyArray<SnapshotField> {
  const { entry, kcal } = input;
  return SNAPSHOT_FIELDS.filter((field) => {
    if (field === 'name') return entry.label !== null && entry.label.trim() !== '';
    if (field === 'duration') return entry.metrics.activeS > 0;
    if (field === 'load') return entry.hasLoad && entry.metrics.load !== null;
    if (field === 'zones') return displayedZones(entry.metrics.zoneSeconds).some((s) => s > 0);
    if (field === 'calories') return kcal !== null;
    return true;
  });
}

export function buildSnapshot(input: SnapshotInput, selection: SnapshotSelection): SnapshotView {
  const { entry, day, kcal } = input;
  const m = entry.metrics;
  const has = new Set(availableFields(input));
  const on = (field: SnapshotField): boolean => selection[field] && has.has(field);
  const showHeartRate = selection.heartRate;
  const hasAnyHr = m.avgHr !== null || m.maxHr !== null;
  const label = entry.label?.trim() ?? '';
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
  };
}

export function toggleField(selection: SnapshotSelection, field: SnapshotField, value: boolean): SnapshotSelection {
  return { ...selection, [field]: value };
}
