import type {
  STRENGTH_LIMITS as CoreLimits,
  CustomExercise,
  MuscleGroup,
  PlannedExercise,
  SessionExercise,
  StrengthSession,
  StrengthSet,
} from '@openhoop/core';

import { addDays, weekStart } from './derived';
import type { HeartRatePoint } from './types';

export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'] as const satisfies readonly MuscleGroup[];

export const MUSCLE_GROUPS_COMPLETE: [Exclude<MuscleGroup, (typeof MUSCLE_GROUPS)[number]>] extends [never] ? true : false = true;

export const STRENGTH_LIMITS = {
  nameLength: { min: 1, max: 40 },
  templateNameLength: { min: 1, max: 60 },
  sets: { min: 1, max: 20 },
  reps: { min: 1, max: 100 },
  weightKg: { min: 0, max: 1000 },
  rpe: { min: 1, max: 10 },
  items: { max: 30 },
} as const satisfies typeof CoreLimits;

export const LIBRARY = [
  { id: 'bench_press', muscle: 'chest' },
  { id: 'incline_dumbbell_press', muscle: 'chest' },
  { id: 'push_up', muscle: 'chest' },
  { id: 'cable_fly', muscle: 'chest' },
  { id: 'deadlift', muscle: 'back' },
  { id: 'barbell_row', muscle: 'back' },
  { id: 'pull_up', muscle: 'back' },
  { id: 'lat_pulldown', muscle: 'back' },
  { id: 'seated_cable_row', muscle: 'back' },
  { id: 'overhead_press', muscle: 'shoulders' },
  { id: 'lateral_raise', muscle: 'shoulders' },
  { id: 'face_pull', muscle: 'shoulders' },
  { id: 'barbell_curl', muscle: 'biceps' },
  { id: 'hammer_curl', muscle: 'biceps' },
  { id: 'triceps_pushdown', muscle: 'triceps' },
  { id: 'skull_crusher', muscle: 'triceps' },
  { id: 'bench_dip', muscle: 'triceps' },
  { id: 'back_squat', muscle: 'quads' },
  { id: 'front_squat', muscle: 'quads' },
  { id: 'leg_press', muscle: 'quads' },
  { id: 'walking_lunge', muscle: 'quads' },
  { id: 'leg_extension', muscle: 'quads' },
  { id: 'romanian_deadlift', muscle: 'hamstrings' },
  { id: 'leg_curl', muscle: 'hamstrings' },
  { id: 'hip_thrust', muscle: 'glutes' },
  { id: 'glute_bridge', muscle: 'glutes' },
  { id: 'standing_calf_raise', muscle: 'calves' },
  { id: 'seated_calf_raise', muscle: 'calves' },
  { id: 'crunch', muscle: 'core' },
  { id: 'hanging_leg_raise', muscle: 'core' },
  { id: 'cable_crunch', muscle: 'core' },
] as const satisfies ReadonlyArray<{ id: string; muscle: MuscleGroup }>;

export type LibraryId = (typeof LIBRARY)[number]['id'];

export const LIBRARY_PREFIX = 'lib:';
export const CUSTOM_PREFIX = 'custom:';

export interface ExerciseRef {
  key: string;
  name: string;
  muscle: MuscleGroup;
  custom: boolean;
}

export function isLibraryId(value: string): value is LibraryId {
  return LIBRARY.some((entry) => entry.id === value);
}

export function libraryIdOf(key: string): LibraryId | null {
  if (!key.startsWith(LIBRARY_PREFIX)) return null;
  const id = key.slice(LIBRARY_PREFIX.length);
  return isLibraryId(id) ? id : null;
}

export function exerciseRefs(custom: readonly CustomExercise[], libraryName: (id: LibraryId) => string): ExerciseRef[] {
  const built = LIBRARY.map((entry): ExerciseRef => ({ key: `${LIBRARY_PREFIX}${entry.id}`, name: libraryName(entry.id), muscle: entry.muscle, custom: false }));
  const own = custom.map((entry): ExerciseRef => ({ key: `${CUSTOM_PREFIX}${entry.id}`, name: entry.name, muscle: entry.muscle, custom: true }));
  return [...built, ...own];
}

export function exerciseLabel(key: string, storedName: string, libraryName: (id: LibraryId) => string): string {
  const id = libraryIdOf(key);
  return id === null ? storedName : libraryName(id);
}

export const DEFAULT_TARGET = { sets: 3, reps: 8, weightKg: 0 } as const;

export function planned(ref: ExerciseRef, target: { sets: number; reps: number; weightKg: number } = DEFAULT_TARGET): PlannedExercise {
  return { exerciseKey: ref.key, exerciseName: ref.name, muscle: ref.muscle, sets: target.sets, reps: target.reps, weightKg: target.weightKg };
}

const INTEGER = /^\d{1,3}$/;
const DECIMAL = /^\d{1,4}([.,]\d{1,2})?$/;
const RPE = /^\d{1,2}([.,][05])?$/;

function parseInteger(text: string, limits: { readonly min: number; readonly max: number }): number | null {
  const trimmed = text.trim();
  if (!INTEGER.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= limits.min && value <= limits.max ? value : null;
}

function parseDecimal(text: string, limits: { readonly min: number; readonly max: number }): number | null {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return value >= limits.min && value <= limits.max ? value : null;
}

function parseRpe(text: string): number | null {
  const trimmed = text.trim();
  if (!RPE.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return value >= STRENGTH_LIMITS.rpe.min && value <= STRENGTH_LIMITS.rpe.max ? value : null;
}

export function cleanName(text: string, limits: { readonly min: number; readonly max: number }): string | null {
  const name = text.replace(/\s+/g, ' ').trim();
  if (name.length < limits.min || name.length > limits.max) return null;
  return /[\u0000-\u001f\u007f]/.test(name) ? null : name;
}

export type SetField = 'reps' | 'weight' | 'rpe';

export interface SetDraft {
  reps: string;
  weight: string;
  rpe: string;
}

export interface SetValues {
  reps: number;
  weightKg: number;
  rpe: number | null;
}

export type SetValidation = { ok: true; value: SetValues } | { ok: false; invalid: SetField[] };

export function validateSetDraft(draft: SetDraft): SetValidation {
  const invalid: SetField[] = [];
  const reps = parseInteger(draft.reps, STRENGTH_LIMITS.reps);
  if (reps === null) invalid.push('reps');
  const weightKg = parseDecimal(draft.weight, STRENGTH_LIMITS.weightKg);
  if (weightKg === null) invalid.push('weight');
  let rpe: number | null = null;
  if (draft.rpe.trim() !== '') {
    rpe = parseRpe(draft.rpe);
    if (rpe === null) invalid.push('rpe');
  }
  if (invalid.length > 0 || reps === null || weightKg === null) return { ok: false, invalid };
  return { ok: true, value: { reps, weightKg, rpe } };
}

export type TargetField = 'sets' | 'reps' | 'weight';

export interface TargetDraft {
  sets: string;
  reps: string;
  weight: string;
}

export interface TargetValues {
  sets: number;
  reps: number;
  weightKg: number;
}

export type TargetValidation = { ok: true; value: TargetValues } | { ok: false; invalid: TargetField[] };

export function validateTargetDraft(draft: TargetDraft): TargetValidation {
  const invalid: TargetField[] = [];
  const sets = parseInteger(draft.sets, STRENGTH_LIMITS.sets);
  if (sets === null) invalid.push('sets');
  const reps = parseInteger(draft.reps, STRENGTH_LIMITS.reps);
  if (reps === null) invalid.push('reps');
  const weightKg = parseDecimal(draft.weight, STRENGTH_LIMITS.weightKg);
  if (weightKg === null) invalid.push('weight');
  if (invalid.length > 0 || sets === null || reps === null || weightKg === null) return { ok: false, invalid };
  return { ok: true, value: { sets, reps, weightKg } };
}

export function targetDraftOf(item: PlannedExercise): TargetDraft {
  return { sets: `${item.sets}`, reps: `${item.reps}`, weight: `${item.weightKg}` };
}

export function setVolumeKg(set: { reps: number; weightKg: number }): number {
  return set.reps * set.weightKg;
}

export const ONE_RM_MAX_REPS = 12;

/** Epley (1985): 1RM ≈ weight × (1 + reps / 30). An estimate, not a tested maximum. */
export function epleyOneRepMax(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isInteger(reps) || weightKg <= 0 || reps < 1 || reps > ONE_RM_MAX_REPS) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export interface SessionTotals {
  sets: number;
  reps: number;
  volumeKg: number;
}

export function sessionTotals(sets: readonly StrengthSet[]): SessionTotals {
  return sets.reduce<SessionTotals>(
    (total, set) => ({ sets: total.sets + 1, reps: total.reps + set.reps, volumeKg: total.volumeKg + setVolumeKg(set) }),
    { sets: 0, reps: 0, volumeKg: 0 },
  );
}

export interface TopSet {
  reps: number;
  weightKg: number;
  oneRepMaxKg: number | null;
}

function topSetOf(sets: readonly StrengthSet[]): TopSet | null {
  let best: TopSet | null = null;
  let bestScore = -1;
  for (const set of sets) {
    const oneRepMaxKg = epleyOneRepMax(set.weightKg, set.reps);
    const score = oneRepMaxKg ?? (set.weightKg > 0 ? set.weightKg * (1 + set.reps / 30) : set.reps);
    if (score > bestScore) {
      bestScore = score;
      best = { reps: set.reps, weightKg: set.weightKg, oneRepMaxKg };
    }
  }
  return best;
}

export interface ExerciseVolume {
  exerciseKey: string;
  exerciseName: string;
  muscle: MuscleGroup;
  sets: number;
  reps: number;
  volumeKg: number;
  topSet: TopSet | null;
}

export function exerciseVolumes(sets: readonly StrengthSet[]): ExerciseVolume[] {
  const groups = new Map<string, StrengthSet[]>();
  for (const set of sets) {
    const list = groups.get(set.exerciseKey);
    if (list === undefined) groups.set(set.exerciseKey, [set]);
    else list.push(set);
  }
  return [...groups.values()].map((list) => {
    const first = list[0];
    const totals = sessionTotals(list);
    return {
      exerciseKey: first?.exerciseKey ?? '',
      exerciseName: first?.exerciseName ?? '',
      muscle: first?.muscle ?? 'core',
      sets: totals.sets,
      reps: totals.reps,
      volumeKg: totals.volumeKg,
      topSet: topSetOf(list),
    };
  });
}

export interface MuscleLoad {
  muscle: MuscleGroup;
  sets: number;
  volumeKg: number;
  share: number | null;
}

/**
 * Muscular load: volume load (reps × weight, in kg) summed per primary muscle group, with the
 * set count next to it. No secondary muscles and no physiological weighting; bodyweight sets
 * (weight 0) add sets but no volume.
 */
export function muscleLoad(sets: readonly StrengthSet[]): MuscleLoad[] {
  const total = sets.reduce((sum, set) => sum + setVolumeKg(set), 0);
  const rows: MuscleLoad[] = [];
  for (const muscle of MUSCLE_GROUPS) {
    const own = sets.filter((set) => set.muscle === muscle);
    if (own.length === 0) continue;
    const volumeKg = own.reduce((sum, set) => sum + setVolumeKg(set), 0);
    rows.push({ muscle, sets: own.length, volumeKg, share: total > 0 ? volumeKg / total : null });
  }
  return rows.sort((a, b) => b.volumeKg - a.volumeKg || b.sets - a.sets);
}

export function durationS(session: Pick<StrengthSession, 'startedAt' | 'endedAt'>, nowS: number): number {
  return Math.max(0, (session.endedAt ?? nowS) - session.startedAt);
}

export interface HeartRateStats {
  avg: number;
  max: number;
  min: number;
  samples: number;
}

export function heartRateStats(points: readonly HeartRatePoint[]): HeartRateStats | null {
  const valid = points.filter((point) => Number.isFinite(point.hr) && point.hr > 0);
  if (valid.length === 0) return null;
  const values = valid.map((point) => point.hr);
  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    samples: values.length,
  };
}

export function finishedSessions(sessions: readonly StrengthSession[]): StrengthSession[] {
  return sessions.filter((session) => session.endedAt !== null);
}

export function activeSession(sessions: readonly StrengthSession[]): StrengthSession | null {
  let found: StrengthSession | null = null;
  for (const session of sessions) if (session.endedAt === null) found = session;
  return found;
}

function bestOneRepMax(sets: readonly StrengthSet[]): number | null {
  let best: number | null = null;
  for (const set of sets) {
    const value = epleyOneRepMax(set.weightKg, set.reps);
    if (value !== null && (best === null || value > best)) best = value;
  }
  return best;
}

export function newRecords(session: StrengthSession, all: readonly StrengthSession[]): string[] {
  const earlier = finishedSessions(all).filter((other) => other.id !== session.id && other.startedAt < session.startedAt);
  const keys: string[] = [];
  for (const volume of exerciseVolumes(session.sets)) {
    const now = bestOneRepMax(session.sets.filter((set) => set.exerciseKey === volume.exerciseKey));
    if (now === null) continue;
    const before = bestOneRepMax(earlier.flatMap((other) => other.sets.filter((set) => set.exerciseKey === volume.exerciseKey)));
    if (before !== null && now > before) keys.push(volume.exerciseKey);
  }
  return keys;
}

export interface ExerciseEntry {
  sessionId: number;
  day: string;
  sets: StrengthSet[];
  volumeKg: number;
  topSet: TopSet | null;
  oneRepMaxKg: number | null;
}

export interface ExerciseHistory {
  entries: ExerciseEntry[];
  bestOneRepMax: { kg: number; day: string } | null;
  heaviest: { weightKg: number; reps: number; day: string } | null;
  totalSets: number;
}

export function exerciseHistory(sessions: readonly StrengthSession[], exerciseKey: string): ExerciseHistory {
  const entries: ExerciseEntry[] = [];
  for (const session of finishedSessions(sessions)) {
    const sets = session.sets.filter((set) => set.exerciseKey === exerciseKey);
    if (sets.length === 0) continue;
    entries.push({
      sessionId: session.id,
      day: session.day,
      sets,
      volumeKg: sessionTotals(sets).volumeKg,
      topSet: topSetOf(sets),
      oneRepMaxKg: bestOneRepMax(sets),
    });
  }
  entries.reverse();
  let bestOneRepMaxEntry: ExerciseHistory['bestOneRepMax'] = null;
  let heaviest: ExerciseHistory['heaviest'] = null;
  for (const entry of [...entries].reverse()) {
    if (entry.oneRepMaxKg !== null && (bestOneRepMaxEntry === null || entry.oneRepMaxKg > bestOneRepMaxEntry.kg)) {
      bestOneRepMaxEntry = { kg: entry.oneRepMaxKg, day: entry.day };
    }
    for (const set of entry.sets) {
      if (heaviest === null || set.weightKg > heaviest.weightKg) heaviest = { weightKg: set.weightKg, reps: set.reps, day: entry.day };
    }
  }
  return { entries, bestOneRepMax: bestOneRepMaxEntry, heaviest, totalSets: entries.reduce((sum, entry) => sum + entry.sets.length, 0) };
}

export function exercisesUsed(sessions: readonly StrengthSession[]): Array<{ key: string; name: string; muscle: MuscleGroup }> {
  const seen = new Map<string, { key: string; name: string; muscle: MuscleGroup }>();
  for (const session of finishedSessions(sessions)) {
    for (const set of session.sets) seen.set(set.exerciseKey, { key: set.exerciseKey, name: set.exerciseName, muscle: set.muscle });
  }
  return [...seen.values()];
}

export interface WeekStat {
  weekStart: string;
  sessions: number;
  sets: number;
  volumeKg: number;
  byMuscle: Array<{ muscle: MuscleGroup; volumeKg: number; sets: number }>;
}

export const TREND_WEEKS = [4, 8, 12] as const;
export type TrendWeeks = (typeof TREND_WEEKS)[number];

export function parseTrendWeeks(value: string): TrendWeeks {
  return TREND_WEEKS.find((weeks) => `${weeks}` === value) ?? 8;
}

export function weeklyStats(sessions: readonly StrengthSession[], today: string, weeks: number): WeekStat[] {
  const current = weekStart(today);
  const result: WeekStat[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(current, -7 * i);
    const end = addDays(start, 6);
    const inWeek = finishedSessions(sessions).filter((session) => session.day >= start && session.day <= end);
    const sets = inWeek.flatMap((session) => session.sets);
    result.push({
      weekStart: start,
      sessions: inWeek.length,
      sets: sets.length,
      volumeKg: sessionTotals(sets).volumeKg,
      byMuscle: muscleLoad(sets).map((row) => ({ muscle: row.muscle, volumeKg: row.volumeKg, sets: row.sets })),
    });
  }
  return result;
}

export function sessionsThisWeek(sessions: readonly StrengthSession[], today: string): number {
  const start = weekStart(today);
  const end = addDays(start, 6);
  return finishedSessions(sessions).filter((session) => session.day >= start && session.day <= end).length;
}

export function strengthWeek(sessions: readonly StrengthSession[], anyDayInWeek: string): { dots: boolean[]; count: number } {
  const start = weekStart(anyDayInWeek);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const end = addDays(start, 6);
  const inWeek = finishedSessions(sessions).filter((session) => session.day >= start && session.day <= end);
  return { dots: days.map((day) => inWeek.some((session) => session.day === day)), count: inWeek.length };
}

export function suggestSet(exercise: Pick<SessionExercise, 'exerciseKey' | 'reps' | 'weightKg'>, sets: readonly StrengthSet[]): SetDraft {
  const last = [...sets].reverse().find((set) => set.exerciseKey === exercise.exerciseKey);
  const source = last ?? exercise;
  return { reps: `${source.reps}`, weight: `${source.weightKg}`, rpe: '' };
}

export function setsDone(exercise: Pick<SessionExercise, 'exerciseKey'>, sets: readonly StrengthSet[]): number {
  return sets.filter((set) => set.exerciseKey === exercise.exerciseKey).length;
}

export const REST_OPTIONS_S = [60, 90, 120, 180] as const;
export type RestSeconds = (typeof REST_OPTIONS_S)[number];

export function restRemainingS(startedAtMs: number, restS: number, nowMs: number): number {
  return Math.max(0, Math.ceil(restS - (nowMs - startedAtMs) / 1000));
}

export function formatClockTimer(totalS: number): string {
  const seconds = Math.max(0, Math.floor(totalS));
  const pad = (n: number): string => n.toString().padStart(2, '0');
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`;
}
