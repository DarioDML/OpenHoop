import type { StrengthSession } from '@openhoop/core';

import { exerciseRefs } from '@/data/strength';
import {
  buildWorkoutRequestBody,
  cleanDescription,
  readWorkoutReply,
  recentWeights,
  requestWorkoutPlan,
  workoutSystemPrompt,
} from '@/data/strengthCoach';
import { isRecord, parseJson } from '@/lib/json';
import type { GatedFetch } from '@/net/gate';

import { TEST_KEY, jsonResponse, messageBody } from './support/coach';

const REFS = exerciseRefs([{ id: 4, name: 'Sled push', muscle: 'quads', createdAt: 1 }], (id) => id.replace(/_/g, ' '));

function reply(body: object): string {
  return JSON.stringify(body);
}

describe('reading the coach’s workout', () => {
  it('turns a valid reply into planned exercises', () => {
    const result = readWorkoutReply(
      reply({
        name: '  Push   A ',
        exercises: [
          { exercise: 'lib:bench_press', sets: 4, reps: 8, weightKg: 70 },
          { exercise: 'custom:4', sets: 3, reps: 10, weightKg: 0 },
        ],
      }),
      REFS,
    );
    expect(result).toEqual({
      ok: true,
      name: 'Push A',
      dropped: 0,
      items: [
        { exerciseKey: 'lib:bench_press', exerciseName: 'bench press', muscle: 'chest', sets: 4, reps: 8, weightKg: 70 },
        { exerciseKey: 'custom:4', exerciseName: 'Sled push', muscle: 'quads', sets: 3, reps: 10, weightKg: 0 },
      ],
    });
  });

  it('drops unknown exercises, duplicates and numbers out of range', () => {
    const result = readWorkoutReply(
      reply({
        name: 'x'.repeat(61),
        exercises: [
          { exercise: 'lib:bench_press', sets: 4, reps: 8, weightKg: 70 },
          { exercise: 'lib:bench_press', sets: 3, reps: 8, weightKg: 70 },
          { exercise: 'lib:made_up', sets: 3, reps: 8, weightKg: 0 },
          { exercise: 'custom:99', sets: 3, reps: 8, weightKg: 0 },
          { exercise: 'lib:deadlift', sets: 0, reps: 8, weightKg: 0 },
          { exercise: 'lib:deadlift', sets: 3, reps: 8.5, weightKg: 0 },
          { exercise: 'lib:deadlift', sets: 3, reps: 8, weightKg: 1200 },
          { exercise: 'lib:deadlift', sets: 3, reps: 8, weightKg: -1 },
          { exercise: 'lib:deadlift', sets: '3', reps: 8, weightKg: 0 },
          'lib:pull_up',
          { exercise: 'lib:back_squat', sets: 5, reps: 5, weightKg: 102.04567 },
        ],
      }),
      REFS,
    );
    expect(result).toMatchObject({ ok: true, name: null, dropped: 9 });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.items.map((item) => [item.exerciseKey, item.weightKg])).toEqual([
      ['lib:bench_press', 70],
      ['lib:back_squat', 102.046],
    ]);
  });

  it('caps the number of exercises', () => {
    const many = REFS.slice(0, 35).map((ref) => ({ exercise: ref.key, sets: 3, reps: 8, weightKg: 0 }));
    const result = readWorkoutReply(reply({ name: 'Big', exercises: many }), REFS);
    expect(result).toMatchObject({ ok: true, dropped: 5 });
    if (result.ok) expect(result.items).toHaveLength(30);
  });

  it('survives hostile replies', () => {
    const text = '{"name":' + JSON.stringify('Push\u0007\u0000A') + ',"exercises":[' +
      '{"exercise":"lib:bench_press","sets":1e999,"reps":8,"weightKg":70},' +
      '{"exercise":"lib:deadlift","sets":3,"reps":8,"weightKg":1e999},' +
      '{"exercise":"lib:back_squat","sets":3,"reps":8,"weightKg":"NaN"},' +
      '{"exercise":"lib:pull_up","sets":"Infinity","reps":8,"weightKg":0},' +
      '{"exercise":"lib:crunch","sets":3,"reps":-0,"weightKg":0},' +
      '{"exercise":"lib:leg_press","sets":3,"reps":10,"weightKg":120}]}';
    const result = readWorkoutReply(text, REFS);
    expect(result).toMatchObject({ ok: true, name: 'Push A', dropped: 5 });
    if (result.ok) expect(result.items.map((item) => item.exerciseKey)).toEqual(['lib:leg_press']);
    expect(readWorkoutReply(JSON.stringify({ name: '\u0001\u0002', exercises: [] }), REFS)).toEqual({ ok: true, name: null, items: [], dropped: 0 });
  });

  it('refuses anything that is not the expected shape', () => {
    expect(readWorkoutReply('not json', REFS)).toEqual({ ok: false, error: 'invalid-response' });
    expect(readWorkoutReply(reply({ name: 'A' }), REFS)).toEqual({ ok: false, error: 'invalid-response' });
    expect(readWorkoutReply('[]', REFS)).toEqual({ ok: false, error: 'invalid-response' });
  });
});

describe('asking the coach', () => {
  it('cleans the description', () => {
    expect(cleanDescription('  45 min push,\n shoulder-friendly ')).toBe('45 min push, shoulder-friendly');
    expect(cleanDescription('ab')).toBeNull();
    expect(cleanDescription('x'.repeat(301))).toBeNull();
  });

  it('lists the library, the recent weights and the reply language in the prompt', () => {
    const prompt = workoutSystemPrompt(REFS, [{ exerciseKey: 'lib:bench_press', weightKg: 80, reps: 5, day: '2026-11-24' }], 'nl');
    expect(prompt).toContain('- lib:bench_press: bench press (chest)');
    expect(prompt).toContain('- custom:4: Sled push (quads)');
    expect(prompt).toContain('- lib:bench_press: 80 kg × 5 on 2026-11-24');
    expect(prompt).toContain('Dutch');
    expect(workoutSystemPrompt(REFS, [], 'en')).toContain('No recent working weights are known');
  });

  it('builds a structured request limited to the known keys', () => {
    const body = parseJson(buildWorkoutRequestBody({ model: 'claude-sonnet-5-5', description: 'Legs', language: 'en', refs: REFS, recent: [] }));
    if (!isRecord(body)) throw new Error('expected an object');
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.messages).toEqual([{ role: 'user', content: 'Legs' }]);
    expect(body.fallbacks).toBe('default');
    expect(JSON.stringify(body.output_config)).toContain('"custom:4"');
  });

  it('takes the latest heaviest set per exercise from finished sessions', () => {
    const sessions: StrengthSession[] = [
      { id: 1, templateId: null, name: 'A', day: '2026-11-01', startedAt: 1, endedAt: 2, exercises: [], sets: [
        { id: 1, sessionId: 1, exerciseKey: 'lib:bench_press', exerciseName: 'B', muscle: 'chest', reps: 5, weightKg: 70, rpe: null, doneAt: 1 },
        { id: 2, sessionId: 1, exerciseKey: 'lib:crunch', exerciseName: 'C', muscle: 'core', reps: 20, weightKg: 0, rpe: null, doneAt: 1 },
      ] },
      { id: 2, templateId: null, name: 'B', day: '2026-11-08', startedAt: 3, endedAt: 4, exercises: [], sets: [
        { id: 3, sessionId: 2, exerciseKey: 'lib:bench_press', exerciseName: 'B', muscle: 'chest', reps: 8, weightKg: 72.5, rpe: null, doneAt: 3 },
        { id: 4, sessionId: 2, exerciseKey: 'lib:bench_press', exerciseName: 'B', muscle: 'chest', reps: 6, weightKg: 72.5, rpe: null, doneAt: 3 },
      ] },
      { id: 3, templateId: null, name: 'open', day: '2026-11-09', startedAt: 5, endedAt: null, exercises: [], sets: [
        { id: 5, sessionId: 3, exerciseKey: 'lib:bench_press', exerciseName: 'B', muscle: 'chest', reps: 1, weightKg: 150, rpe: null, doneAt: 5 },
      ] },
    ];
    expect(recentWeights(sessions)).toEqual([{ exerciseKey: 'lib:bench_press', weightKg: 72.5, reps: 8, day: '2026-11-08' }]);
  });

  it('sends the request through the coach network feature and reads the reply', async () => {
    const send = jest.fn<Promise<Response>, Parameters<GatedFetch>>(async () =>
      jsonResponse(200, messageBody(reply({ name: 'Legs', exercises: [{ exercise: 'lib:back_squat', sets: 5, reps: 5, weightKg: 100 }] }))),
    );
    const result = await requestWorkoutPlan(send, { apiKey: TEST_KEY, model: 'claude-haiku-5-5', description: 'Legs', language: 'en', refs: REFS, recent: [] });
    expect(send.mock.calls[0]?.[0]).toBe('coach');
    expect(result).toMatchObject({ ok: true, name: 'Legs', dropped: 0 });
  });

  it('passes API errors through', async () => {
    const send = jest.fn<Promise<Response>, Parameters<GatedFetch>>(async () => jsonResponse(401, {}));
    const result = await requestWorkoutPlan(send, { apiKey: TEST_KEY, model: 'claude-haiku-5-5', description: 'Legs', language: 'en', refs: REFS, recent: [] });
    expect(result).toEqual({ ok: false, error: 'invalid-key' });
  });
});
