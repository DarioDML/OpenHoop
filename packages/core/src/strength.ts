import type { SqlDriver, SqlValue } from './store/types';

export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === 'string' && (MUSCLE_GROUPS as readonly string[]).includes(value);
}

export const STRENGTH_LIMITS = {
  nameLength: { min: 1, max: 40 },
  templateNameLength: { min: 1, max: 60 },
  sets: { min: 1, max: 20 },
  reps: { min: 1, max: 100 },
  weightKg: { min: 0, max: 1000 },
  rpe: { min: 1, max: 10 },
  items: { max: 30 },
} as const;

export interface CustomExerciseInput {
  name: string;
  muscle: MuscleGroup;
}

export interface CustomExercise extends CustomExerciseInput {
  id: number;
  createdAt: number;
}

export interface PlannedExercise {
  exerciseKey: string;
  exerciseName: string;
  muscle: MuscleGroup;
  sets: number;
  reps: number;
  weightKg: number;
}

export interface StrengthTemplateInput {
  name: string;
  items: PlannedExercise[];
}

export interface StrengthTemplate extends StrengthTemplateInput {
  id: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionExercise extends PlannedExercise {
  id: number;
  sessionId: number;
  position: number;
}

export interface StrengthSetInput {
  exerciseKey: string;
  exerciseName: string;
  muscle: MuscleGroup;
  reps: number;
  weightKg: number;
  rpe: number | null;
}

export interface StrengthSet extends StrengthSetInput {
  id: number;
  sessionId: number;
  doneAt: number;
}

export interface StrengthSessionInput {
  templateId: number | null;
  name: string;
  day: string;
  exercises: PlannedExercise[];
}

export interface StrengthSession {
  id: number;
  templateId: number | null;
  name: string;
  day: string;
  startedAt: number;
  endedAt: number | null;
  exercises: SessionExercise[];
  sets: StrengthSet[];
}

export interface StrengthData {
  customExercises: CustomExercise[];
  templates: StrengthTemplate[];
  sessions: StrengthSession[];
}

export function emptyStrengthData(): StrengthData {
  return { customExercises: [], templates: [], sessions: [] };
}

type Row = Record<string, SqlValue>;

const INVALID = 'Invalid strength row in database';

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(INVALID);
  return value;
}

function num(row: Row, column: string): number {
  const value = row[column];
  if (typeof value !== 'number') throw new Error(INVALID);
  return value;
}

function nullableNum(row: Row, column: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number') throw new Error(INVALID);
  return value;
}

function muscleOf(row: Row): MuscleGroup {
  const value = row.muscle;
  if (!isMuscleGroup(value)) throw new Error(INVALID);
  return value;
}

function plannedOf(row: Row): PlannedExercise {
  return {
    exerciseKey: text(row, 'exercise_key'),
    exerciseName: text(row, 'exercise_name'),
    muscle: muscleOf(row),
    sets: num(row, 'sets'),
    reps: num(row, 'reps'),
    weightKg: num(row, 'weight_kg'),
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const id = key(item);
    const list = groups.get(id);
    if (list === undefined) groups.set(id, [item]);
    else list.push(item);
  }
  return groups;
}

export async function listStrengthData(driver: SqlDriver): Promise<StrengthData> {
  const exerciseRows = await driver.all<Row>('SELECT id, name, muscle, created_at FROM strength_exercises ORDER BY name COLLATE NOCASE, id');
  const customExercises = exerciseRows.map(
    (row): CustomExercise => ({ id: num(row, 'id'), name: text(row, 'name'), muscle: muscleOf(row), createdAt: num(row, 'created_at') }),
  );

  const itemRows = await driver.all<Row>(
    'SELECT template_id, exercise_key, exercise_name, muscle, sets, reps, weight_kg FROM strength_template_items ORDER BY template_id, position, id',
  );
  const items = groupBy(itemRows, (row) => num(row, 'template_id'));
  const templateRows = await driver.all<Row>('SELECT id, name, created_at, updated_at FROM strength_templates ORDER BY updated_at DESC, id DESC');
  const templates = templateRows.map((row): StrengthTemplate => {
    const id = num(row, 'id');
    return {
      id,
      name: text(row, 'name'),
      createdAt: num(row, 'created_at'),
      updatedAt: num(row, 'updated_at'),
      items: (items.get(id) ?? []).map(plannedOf),
    };
  });

  const sessionExerciseRows = await driver.all<Row>(
    'SELECT id, session_id, position, exercise_key, exercise_name, muscle, sets, reps, weight_kg FROM strength_session_exercises ORDER BY session_id, position, id',
  );
  const exercises = groupBy(sessionExerciseRows, (row) => num(row, 'session_id'));
  const setRows = await driver.all<Row>(
    'SELECT id, session_id, exercise_key, exercise_name, muscle, reps, weight_kg, rpe, done_at FROM strength_sets ORDER BY session_id, id',
  );
  const sets = groupBy(setRows, (row) => num(row, 'session_id'));
  const sessionRows = await driver.all<Row>('SELECT id, template_id, name, day, started_at, ended_at FROM strength_sessions ORDER BY started_at, id');
  const sessions = sessionRows.map((row): StrengthSession => {
    const id = num(row, 'id');
    return {
      id,
      templateId: nullableNum(row, 'template_id'),
      name: text(row, 'name'),
      day: text(row, 'day'),
      startedAt: num(row, 'started_at'),
      endedAt: nullableNum(row, 'ended_at'),
      exercises: (exercises.get(id) ?? []).map((exerciseRow) => ({
        ...plannedOf(exerciseRow),
        id: num(exerciseRow, 'id'),
        sessionId: id,
        position: num(exerciseRow, 'position'),
      })),
      sets: (sets.get(id) ?? []).map((setRow) => ({
        id: num(setRow, 'id'),
        sessionId: id,
        exerciseKey: text(setRow, 'exercise_key'),
        exerciseName: text(setRow, 'exercise_name'),
        muscle: muscleOf(setRow),
        reps: num(setRow, 'reps'),
        weightKg: num(setRow, 'weight_kg'),
        rpe: nullableNum(setRow, 'rpe'),
        doneAt: num(setRow, 'done_at'),
      })),
    };
  });

  return { customExercises, templates, sessions };
}

export async function insertCustomExercise(driver: SqlDriver, input: CustomExerciseInput, nowS: number): Promise<CustomExercise> {
  const result = await driver.run('INSERT INTO strength_exercises (name, muscle, created_at) VALUES (?, ?, ?)', [input.name, input.muscle, nowS]);
  return { ...input, id: result.lastInsertRowid, createdAt: nowS };
}

export async function deleteCustomExercise(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM strength_exercises WHERE id = ?', [id]);
  return result.changes > 0;
}

async function insertItems(tx: SqlDriver, table: 'strength_template_items' | 'strength_session_exercises', ownerColumn: string, ownerId: number, items: readonly PlannedExercise[], firstPosition = 0): Promise<void> {
  for (const [offset, item] of items.entries()) {
    const position = firstPosition + offset;
    await tx.run(
      `INSERT INTO ${table} (${ownerColumn}, position, exercise_key, exercise_name, muscle, sets, reps, weight_kg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, position, item.exerciseKey, item.exerciseName, item.muscle, item.sets, item.reps, item.weightKg],
    );
  }
}

export async function saveStrengthTemplate(driver: SqlDriver, id: number | null, input: StrengthTemplateInput, nowS: number): Promise<number | null> {
  return driver.transaction(async (tx) => {
    let templateId = id;
    if (templateId === null) {
      const result = await tx.run('INSERT INTO strength_templates (name, created_at, updated_at) VALUES (?, ?, ?)', [input.name, nowS, nowS]);
      templateId = result.lastInsertRowid;
    } else {
      const result = await tx.run('UPDATE strength_templates SET name = ?, updated_at = ? WHERE id = ?', [input.name, nowS, templateId]);
      if (result.changes === 0) return null;
      await tx.run('DELETE FROM strength_template_items WHERE template_id = ?', [templateId]);
    }
    await insertItems(tx, 'strength_template_items', 'template_id', templateId, input.items);
    return templateId;
  });
}

export async function deleteStrengthTemplate(driver: SqlDriver, id: number): Promise<boolean> {
  return driver.transaction(async (tx) => {
    await tx.run('DELETE FROM strength_template_items WHERE template_id = ?', [id]);
    const result = await tx.run('DELETE FROM strength_templates WHERE id = ?', [id]);
    return result.changes > 0;
  });
}

export async function startStrengthSession(driver: SqlDriver, input: StrengthSessionInput, nowS: number): Promise<number> {
  return driver.transaction(async (tx) => {
    const result = await tx.run('INSERT INTO strength_sessions (template_id, name, day, started_at) VALUES (?, ?, ?, ?)', [
      input.templateId,
      input.name,
      input.day,
      nowS,
    ]);
    await insertItems(tx, 'strength_session_exercises', 'session_id', result.lastInsertRowid, input.exercises);
    return result.lastInsertRowid;
  });
}

export async function addStrengthSessionExercise(driver: SqlDriver, sessionId: number, item: PlannedExercise): Promise<boolean> {
  return driver.transaction(async (tx) => {
    const session = await tx.all<Row>('SELECT id FROM strength_sessions WHERE id = ? AND ended_at IS NULL', [sessionId]);
    if (session.length === 0) return false;
    const rows = await tx.all<Row>('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM strength_session_exercises WHERE session_id = ?', [sessionId]);
    const first = rows[0];
    const next = first === undefined ? 0 : num(first, 'next');
    await insertItems(tx, 'strength_session_exercises', 'session_id', sessionId, [item], next);
    return true;
  });
}

export async function removeStrengthSessionExercise(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run(
    `DELETE FROM strength_session_exercises WHERE id = ? AND NOT EXISTS (
       SELECT 1 FROM strength_sets s WHERE s.session_id = strength_session_exercises.session_id AND s.exercise_key = strength_session_exercises.exercise_key
     )`,
    [id],
  );
  return result.changes > 0;
}

export async function addStrengthSet(driver: SqlDriver, sessionId: number, input: StrengthSetInput, nowS: number): Promise<StrengthSet | null> {
  return driver.transaction(async (tx) => {
    const session = await tx.all<Row>('SELECT id FROM strength_sessions WHERE id = ? AND ended_at IS NULL', [sessionId]);
    if (session.length === 0) return null;
    const result = await tx.run(
      'INSERT INTO strength_sets (session_id, exercise_key, exercise_name, muscle, reps, weight_kg, rpe, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [sessionId, input.exerciseKey, input.exerciseName, input.muscle, input.reps, input.weightKg, input.rpe, nowS],
    );
    return { ...input, id: result.lastInsertRowid, sessionId, doneAt: nowS };
  });
}

export async function deleteStrengthSet(driver: SqlDriver, id: number): Promise<boolean> {
  const result = await driver.run('DELETE FROM strength_sets WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function finishStrengthSession(driver: SqlDriver, id: number, nowS: number): Promise<boolean> {
  const result = await driver.run(
    `UPDATE strength_sessions SET ended_at = MAX(?, started_at) WHERE id = ? AND ended_at IS NULL
       AND EXISTS (SELECT 1 FROM strength_sets WHERE session_id = strength_sessions.id)`,
    [nowS, id],
  );
  return result.changes > 0;
}

export async function deleteStrengthSession(driver: SqlDriver, id: number): Promise<boolean> {
  return driver.transaction(async (tx) => {
    await tx.run('DELETE FROM strength_sets WHERE session_id = ?', [id]);
    await tx.run('DELETE FROM strength_session_exercises WHERE session_id = ?', [id]);
    const result = await tx.run('DELETE FROM strength_sessions WHERE id = ?', [id]);
    return result.changes > 0;
  });
}
