import { beforeEach, describe, expect, it } from 'vitest';
import {
  addStrengthSessionExercise,
  addStrengthSet,
  deleteCustomExercise,
  deleteStrengthSession,
  deleteStrengthSet,
  deleteStrengthTemplate,
  exportCsv,
  finishStrengthSession,
  insertCustomExercise,
  listStrengthData,
  openStore,
  removeStrengthSessionExercise,
  saveStrengthTemplate,
  startStrengthSession,
} from '../src/index';
import type { MuscleGroup, PlannedExercise, SqlDriver, StrengthSetInput } from '../src/index';
import { openStrictDriver } from './strictDriver';

const SQUAT: PlannedExercise = { exerciseKey: 'lib:back_squat', exerciseName: 'Back squat', muscle: 'quads', sets: 3, reps: 5, weightKg: 100 };
const BENCH: PlannedExercise = { exerciseKey: 'lib:bench_press', exerciseName: 'Bench press', muscle: 'chest', sets: 3, reps: 8, weightKg: 60 };
const SET: StrengthSetInput = { exerciseKey: 'lib:back_squat', exerciseName: 'Back squat', muscle: 'quads', reps: 5, weightKg: 100, rpe: 8 };

function unknownMuscle(): MuscleGroup {
  const value: unknown = 'toes';
  return value as MuscleGroup;
}

describe('strength storage', () => {
  let driver: SqlDriver;

  beforeEach(async () => {
    driver = openStrictDriver();
    await openStore(driver);
  });

  it('starts empty', async () => {
    expect(await listStrengthData(driver)).toEqual({ customExercises: [], templates: [], sessions: [] });
  });

  it('stores custom exercises, rejects duplicate names ignoring case and unknown muscles', async () => {
    const created = await insertCustomExercise(driver, { name: 'Sled push', muscle: 'quads' }, 5);
    expect((await listStrengthData(driver)).customExercises).toEqual([{ id: created.id, name: 'Sled push', muscle: 'quads', createdAt: 5 }]);
    await expect(insertCustomExercise(driver, { name: 'sled PUSH', muscle: 'quads' }, 6)).rejects.toThrow();
    await expect(insertCustomExercise(driver, { name: 'Odd', muscle: unknownMuscle() }, 6)).rejects.toThrow();
    await expect(insertCustomExercise(driver, { name: '', muscle: 'core' }, 6)).rejects.toThrow();
    expect(await deleteCustomExercise(driver, created.id)).toBe(true);
    expect(await deleteCustomExercise(driver, created.id)).toBe(false);
  });

  it('never reuses the id of a deleted custom exercise', async () => {
    const first = await insertCustomExercise(driver, { name: 'Cable kickback', muscle: 'glutes' }, 1);
    await deleteCustomExercise(driver, first.id);
    const second = await insertCustomExercise(driver, { name: 'Weighted dip', muscle: 'triceps' }, 2);
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('creates, edits and deletes templates with ordered items', async () => {
    const id = await saveStrengthTemplate(driver, null, { name: 'Leg day', items: [SQUAT, BENCH] }, 10);
    expect(id).not.toBeNull();
    let [template] = (await listStrengthData(driver)).templates;
    expect(template?.items.map((item) => item.exerciseKey)).toEqual(['lib:back_squat', 'lib:bench_press']);
    await saveStrengthTemplate(driver, id, { name: 'Leg day 2', items: [BENCH] }, 20);
    [template] = (await listStrengthData(driver)).templates;
    expect(template).toMatchObject({ name: 'Leg day 2', createdAt: 10, updatedAt: 20 });
    expect(template?.items).toEqual([BENCH]);
    expect(await saveStrengthTemplate(driver, 999, { name: 'x', items: [] }, 30)).toBeNull();
    expect(await deleteStrengthTemplate(driver, id ?? 0)).toBe(true);
    expect((await listStrengthData(driver)).templates).toEqual([]);
    expect(await exportCsv(await openStore(driver), 'strength_template_items')).toBe(
      'id,template_id,position,exercise_key,exercise_name,muscle,sets,reps,weight_kg\r\n',
    );
  });

  it('rejects out-of-range targets at the database', async () => {
    await expect(saveStrengthTemplate(driver, null, { name: 'Bad', items: [{ ...SQUAT, sets: 0 }] }, 1)).rejects.toThrow();
    await expect(saveStrengthTemplate(driver, null, { name: 'Bad', items: [{ ...SQUAT, reps: 101 }] }, 1)).rejects.toThrow();
    await expect(saveStrengthTemplate(driver, null, { name: 'Bad', items: [{ ...SQUAT, weightKg: -1 }] }, 1)).rejects.toThrow();
    expect((await listStrengthData(driver)).templates).toEqual([]);
  });

  it('runs a session: log sets, finish, and keeps the history', async () => {
    const id = await startStrengthSession(driver, { templateId: null, name: 'Push', day: '2026-11-25', exercises: [SQUAT] }, 1_000);
    expect(await addStrengthSessionExercise(driver, id, BENCH)).toBe(true);
    const first = await addStrengthSet(driver, id, SET, 1_100);
    await addStrengthSet(driver, id, { ...SET, rpe: null, weightKg: 0 }, 1_200);
    expect(first).toMatchObject({ sessionId: id, doneAt: 1_100 });
    expect(await removeStrengthSessionExercise(driver, (await listStrengthData(driver)).sessions[0]?.exercises[0]?.id ?? 0)).toBe(false);
    expect(await finishStrengthSession(driver, id, 2_000)).toBe(true);
    expect(await finishStrengthSession(driver, id, 3_000)).toBe(false);
    expect(await addStrengthSet(driver, id, SET, 2_500)).toBeNull();
    expect(await addStrengthSessionExercise(driver, id, BENCH)).toBe(false);
    const [session] = (await listStrengthData(driver)).sessions;
    expect(session).toMatchObject({ id, name: 'Push', day: '2026-11-25', startedAt: 1_000, endedAt: 2_000 });
    expect(session?.exercises.map((exercise) => exercise.position)).toEqual([0, 1]);
    expect(session?.sets.map((set) => set.rpe)).toEqual([8, null]);
  });

  it('does not finish a session without sets and removes an exercise only while it has none', async () => {
    const id = await startStrengthSession(driver, { templateId: null, name: 'Empty', day: '2026-11-25', exercises: [SQUAT, BENCH] }, 1_000);
    expect(await finishStrengthSession(driver, id, 2_000)).toBe(false);
    const exercises = (await listStrengthData(driver)).sessions[0]?.exercises ?? [];
    await addStrengthSet(driver, id, SET, 1_100);
    expect(await removeStrengthSessionExercise(driver, exercises[0]?.id ?? 0)).toBe(false);
    expect(await removeStrengthSessionExercise(driver, exercises[1]?.id ?? 0)).toBe(true);
  });

  it('rejects invalid sets at the database', async () => {
    const id = await startStrengthSession(driver, { templateId: null, name: 'Push', day: '2026-11-25', exercises: [] }, 1_000);
    await expect(addStrengthSet(driver, id, { ...SET, reps: 0 }, 1)).rejects.toThrow();
    await expect(addStrengthSet(driver, id, { ...SET, weightKg: 1001 }, 1)).rejects.toThrow();
    await expect(addStrengthSet(driver, id, { ...SET, rpe: 11 }, 1)).rejects.toThrow();
    await expect(addStrengthSet(driver, id, { ...SET, rpe: 0.5 }, 1)).rejects.toThrow();
    await expect(startStrengthSession(driver, { templateId: null, name: 'Push', day: 'today', exercises: [] }, 1)).rejects.toThrow();
  });

  it('deletes a set and a whole session with everything under it', async () => {
    const id = await startStrengthSession(driver, { templateId: null, name: 'Push', day: '2026-11-25', exercises: [SQUAT] }, 1_000);
    const set = await addStrengthSet(driver, id, SET, 1_100);
    expect(await deleteStrengthSet(driver, set?.id ?? 0)).toBe(true);
    expect(await deleteStrengthSet(driver, set?.id ?? 0)).toBe(false);
    await addStrengthSet(driver, id, SET, 1_200);
    expect(await deleteStrengthSession(driver, id)).toBe(true);
    expect(await deleteStrengthSession(driver, id)).toBe(false);
    expect(await listStrengthData(driver)).toEqual({ customExercises: [], templates: [], sessions: [] });
  });

  it('exports every strength table as CSV', async () => {
    const store = await openStore(driver);
    await insertCustomExercise(driver, { name: 'Sled, push', muscle: 'quads' }, 5);
    await saveStrengthTemplate(driver, null, { name: 'Leg day', items: [SQUAT] }, 10);
    const id = await startStrengthSession(driver, { templateId: 1, name: 'Leg day', day: '2026-11-25', exercises: [SQUAT] }, 1_000);
    await addStrengthSet(driver, id, SET, 1_100);
    expect(await exportCsv(store, 'strength_exercises')).toBe('id,name,muscle,created_at\r\n1,"Sled, push",quads,5\r\n');
    expect(await exportCsv(store, 'strength_templates')).toBe('id,name,created_at,updated_at\r\n1,Leg day,10,10\r\n');
    expect(await exportCsv(store, 'strength_template_items')).toContain('1,1,0,lib:back_squat,Back squat,quads,3,5,100\r\n');
    expect(await exportCsv(store, 'strength_sessions')).toBe('id,template_id,name,day,started_at,ended_at\r\n1,1,Leg day,2026-11-25,1000,\r\n');
    expect(await exportCsv(store, 'strength_session_exercises')).toContain('1,1,0,lib:back_squat,Back squat,quads,3,5,100\r\n');
    expect(await exportCsv(store, 'strength_sets')).toBe(
      'id,session_id,exercise_key,exercise_name,muscle,reps,weight_kg,rpe,done_at\r\n1,1,lib:back_squat,Back squat,quads,5,100,8,1100\r\n',
    );
  });
});
