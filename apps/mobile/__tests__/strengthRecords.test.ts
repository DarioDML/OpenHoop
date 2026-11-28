import type { StrengthSession, StrengthSet } from '@openhoop/core';

import { REST_IDLE, REST_MAX_S, restJustEnded, restReducer, restView, type RestTimer } from '@/data/restTimer';
import {
  bestSet,
  exerciseHistory,
  exerciseRecords,
  formatVolume,
  muscleIntensity,
  muscleLoad,
  percentChange,
  sessionLoad,
  sessionRecords,
  stepDraftValue,
  suggestSet,
  targetDraftOf,
  templateMinutes,
  validateSetDraft,
  validateTargetDraft,
} from '@/data/strength';
import { PRESETS, PRESET_IDS, presetItems, presetTemplates, uniqueTemplateName } from '@/data/strengthPresets';

let nextSetId = 1;

function set(exerciseKey: string, reps: number, weightKg: number, muscle: StrengthSet['muscle'] = 'chest'): StrengthSet {
  return { id: nextSetId++, sessionId: 0, exerciseKey, exerciseName: exerciseKey, muscle, reps, weightKg, rpe: null, doneAt: 0 };
}

function session(id: number, day: string, sets: StrengthSet[], minutes = 50, templateId: number | null = null): StrengthSession {
  const startedAt = id * 10_000;
  return { id, templateId, name: `S${id}`, day, startedAt, endedAt: startedAt + minutes * 60, exercises: [], sets: sets.map((entry) => ({ ...entry, sessionId: id })) };
}

const BENCH = 'lib:bench_press';

describe('personal records of an exercise', () => {
  const sessions = [
    session(1, '2026-11-01', [set(BENCH, 12, 60), set(BENCH, 10, 60), set(BENCH, 3, 75)]),
    session(2, '2026-11-08', [set(BENCH, 8, 70), set(BENCH, 8, 70), set(BENCH, 8, 70), set(BENCH, 8, 70)]),
    session(3, '2026-11-15', [set(BENCH, 11, 60), set(BENCH, 3, 75), set(BENCH, 9, 60), set(BENCH, 8, 60)]),
  ];

  it('finds the heaviest set, the most reps at the usual weight and the best session volume', () => {
    const records = exerciseRecords(exerciseHistory(sessions, BENCH));
    expect(records.heaviest).toEqual({ weightKg: 75, reps: 3, day: '2026-11-01' });
    expect(records.mostReps).toEqual({ weightKg: 60, reps: 12, day: '2026-11-01' });
    expect(records.bestVolume).toEqual({ volumeKg: 2240, day: '2026-11-08' });
  });

  it('picks the best set by estimated 1RM', () => {
    expect(bestSet(exerciseHistory(sessions, BENCH))).toMatchObject({ weightKg: 70, reps: 8, day: '2026-11-08' });
  });

  it('falls back to reps for bodyweight work and has no heaviest or volume record', () => {
    const body = [session(1, '2026-11-01', [set('lib:crunch', 15, 0, 'core'), set('lib:crunch', 20, 0, 'core')])];
    const history = exerciseHistory(body, 'lib:crunch');
    expect(bestSet(history)).toMatchObject({ reps: 20, weightKg: 0, oneRepMaxKg: null });
    const records = exerciseRecords(history);
    expect(records.heaviest).toBeNull();
    expect(records.bestVolume).toBeNull();
    expect(records.mostReps).toEqual({ weightKg: 0, reps: 20, day: '2026-11-01' });
  });

  it('is empty without history', () => {
    const history = exerciseHistory([], BENCH);
    expect(bestSet(history)).toBeNull();
    expect(exerciseRecords(history)).toEqual({ heaviest: null, mostReps: null, bestVolume: null });
  });
});

describe('records set in one session', () => {
  const first = session(1, '2026-11-01', [set(BENCH, 8, 70), set(BENCH, 8, 70), set('lib:back_squat', 5, 100, 'quads')]);

  it('reports a heavier set, more reps at a known weight and a bigger volume', () => {
    const next = session(2, '2026-11-08', [set(BENCH, 3, 75), set(BENCH, 10, 70), set(BENCH, 8, 70)]);
    expect(sessionRecords(next, [first, next])).toEqual([
      { exerciseKey: BENCH, exerciseName: BENCH, kind: 'heaviest', weightKg: 75, reps: 3 },
      { exerciseKey: BENCH, exerciseName: BENCH, kind: 'reps', weightKg: 70, reps: 10 },
      { exerciseKey: BENCH, exerciseName: BENCH, kind: 'volume', volumeKg: 225 + 700 + 560 },
    ]);
  });

  it('gives no record on the first time or without improvement', () => {
    expect(sessionRecords(first, [first])).toEqual([]);
    const same = session(2, '2026-11-08', [set(BENCH, 8, 70), set('lib:back_squat', 5, 100, 'quads')]);
    expect(sessionRecords(same, [first, same])).toEqual([]);
  });

  it('ignores later sessions and unfinished ones', () => {
    const later = session(3, '2026-11-15', [set(BENCH, 1, 200)]);
    const open: StrengthSession = { ...session(4, '2026-11-02', [set(BENCH, 1, 300)]), endedAt: null };
    const next = session(2, '2026-11-08', [set(BENCH, 3, 75)]);
    expect(sessionRecords(next, [first, next, later, open]).map((record) => record.kind)).toEqual(['heaviest']);
  });
});

describe('session Load', () => {
  const ref = { rest: 60, max: 190 };
  const window = { start: 0, end: 30 * 60 };

  it('computes Load from heart rate covering the session', () => {
    const points = Array.from({ length: 30 * 60 }, (_, i) => ({ t: i, hr: 150 }));
    const load = sessionLoad(points, window, ref);
    expect(load.reason).toBeNull();
    expect(load.value).toBeGreaterThan(0);
    expect(load.value).toBeLessThanOrEqual(21);
  });

  it('says why there is no Load', () => {
    expect(sessionLoad([], window, ref)).toEqual({ value: null, reason: 'no-data' });
    const fiveMinutes = Array.from({ length: 5 * 60 }, (_, i) => ({ t: i, hr: 150 }));
    expect(sessionLoad(fiveMinutes, window, ref)).toEqual({ value: null, reason: 'low-coverage' });
    expect(sessionLoad([], { start: 10, end: 10 }, ref)).toEqual({ value: null, reason: 'no-data' });
  });
});

describe('muscle intensity', () => {
  it('scales by volume with a floor for trained muscles', () => {
    const rows = muscleLoad([set(BENCH, 10, 100), set('lib:barbell_row', 10, 50, 'back'), set('lib:crunch', 20, 0, 'core')]);
    expect(muscleIntensity(rows)).toEqual({ chest: 1, back: 0.5, core: 0.15 });
  });

  it('uses sets when the session has no volume', () => {
    const rows = muscleLoad([set('lib:crunch', 20, 0, 'core'), set('lib:crunch', 20, 0, 'core'), set('lib:push_up', 10, 0, 'chest')]);
    expect(muscleIntensity(rows)).toEqual({ core: 1, chest: 0.5 });
    expect(muscleIntensity([])).toEqual({});
  });
});

describe('helpers', () => {
  it('estimates a template’s minutes from its own sessions only', () => {
    const sessions = [session(1, '2026-11-01', [], 48, 7), session(2, '2026-11-02', [], 52, 7), session(3, '2026-11-03', [], 90, 8)];
    expect(templateMinutes(7, sessions)).toBe(50);
    expect(templateMinutes(9, sessions)).toBeNull();
  });

  it('computes percent change only against a real previous value', () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(50, 0)).toBeNull();
  });

  it('formats volume in kg, tonnes or pounds', () => {
    expect(formatVolume(7840, 'metric', 'en')).toEqual({ value: '7840', unit: 'kg' });
    expect(formatVolume(86_400, 'metric', 'nl')).toEqual({ value: '86,4', unit: 't' });
    expect(formatVolume(1000, 'imperial', 'en')).toEqual({ value: '2205', unit: 'lb' });
    expect(formatVolume(10_000, 'imperial', 'en')).toEqual({ value: '22.0', unit: 'k lb' });
  });

  it('steps a draft value within limits', () => {
    expect(stepDraftValue('8', 1, { min: 1, max: 100 }, 0)).toBe('9');
    expect(stepDraftValue('1', -1, { min: 1, max: 100 }, 0)).toBe('1');
    expect(stepDraftValue('62,5', 2.5, { min: 0, max: 1000 }, 2)).toBe('65');
    expect(stepDraftValue('', 2.5, { min: 0, max: 1000 }, 2)).toBe('2.5');
  });
});

describe('weights in pounds', () => {
  it('stores kilograms when the person types pounds', () => {
    expect(validateSetDraft({ reps: '5', weight: '225', rpe: '' }, 'imperial')).toEqual({ ok: true, value: { reps: 5, weightKg: 102.058, rpe: null } });
    expect(validateTargetDraft({ sets: '3', reps: '5', weight: '2205' }, 'imperial')).toEqual({ ok: false, invalid: ['weight'] });
  });

  it('shows stored kilograms back in pounds', () => {
    const item = { exerciseKey: BENCH, exerciseName: 'Bench', muscle: 'chest' as const, sets: 3, reps: 5, weightKg: 102.058 };
    expect(targetDraftOf(item, 'imperial').weight).toBe('225');
    expect(suggestSet(item, [], 'imperial').weight).toBe('225');
    expect(targetDraftOf(item).weight).toBe('102.06');
  });
});

describe('preset templates', () => {
  const name = (id: string): string => `N:${id}`;
  const lib = (id: string): string => `L:${id}`;

  it('turns every preset into valid library exercises', () => {
    for (const preset of PRESET_IDS) {
      for (const id of PRESETS[preset]) {
        const items = presetItems(id, lib);
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
          expect(item.exerciseKey.startsWith('lib:')).toBe(true);
          expect(item.weightKg).toBe(0);
          expect(item.sets).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('creates both halves of a split and avoids taken names', () => {
    const created = presetTemplates('upperLower', name, lib, ['n:upper']);
    expect(created.map((template) => template.name)).toEqual(['N:upper 2', 'N:lower']);
    expect(uniqueTemplateName('Push', ['Push', 'push 2'])).toBe('Push 3');
  });
});

describe('rest timer', () => {
  const start = (seconds: number): RestTimer => restReducer(REST_IDLE, { kind: 'start', atMs: 0, seconds });

  it('counts down and ends', () => {
    const timer = start(90);
    expect(restView(timer, 0)).toEqual({ status: 'running', remainingS: 90, fraction: 1 });
    expect(restView(timer, 18_000)).toMatchObject({ status: 'running', remainingS: 72 });
    expect(restView(timer, 18_000).fraction).toBeCloseTo(0.8, 5);
    const done = restReducer(timer, { kind: 'tick', atMs: 90_000 });
    expect(done).toEqual({ status: 'done', totalS: 90 });
    expect(restJustEnded(timer, done)).toBe(true);
    expect(restJustEnded(done, restReducer(done, { kind: 'tick', atMs: 91_000 }))).toBe(false);
  });

  it('adds and removes 15 seconds', () => {
    const timer = start(60);
    const longer = restReducer(timer, { kind: 'adjust', atMs: 10_000, deltaS: 15 });
    expect(restView(longer, 10_000)).toMatchObject({ remainingS: 65 });
    expect(longer).toMatchObject({ totalS: 75 });
    const shorter = restReducer(longer, { kind: 'adjust', atMs: 10_000, deltaS: -15 });
    expect(restView(shorter, 10_000)).toMatchObject({ remainingS: 50 });
    const over = restReducer(restReducer(timer, { kind: 'tick', atMs: 50_000 }), { kind: 'adjust', atMs: 50_000, deltaS: -15 });
    expect(over).toEqual({ status: 'done', totalS: 45 });
  });

  it('caps the length, skips and ignores adjustments when idle', () => {
    expect(start(10_000)).toMatchObject({ totalS: REST_MAX_S });
    expect(restReducer(start(60), { kind: 'skip' })).toEqual(REST_IDLE);
    expect(restReducer(REST_IDLE, { kind: 'adjust', atMs: 0, deltaS: 15 })).toEqual(REST_IDLE);
    expect(restView(REST_IDLE, 0)).toEqual({ status: 'idle', remainingS: null, fraction: 0 });
  });
});
