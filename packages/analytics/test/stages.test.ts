import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALGO, STAGE_EPOCH_S, classifyRecentStages, classifyStages, stageTrace } from '../src';
import type { Sample, SleepStage } from '../src';
import { sample } from './helpers';

interface Fixture {
  hr: (number | null)[];
  motion: (number | null)[];
  features: (number[] | null)[];
  stages: (SleepStage | null)[];
  posterior: number[][];
  partialCutEpochs: number;
  partialLast: number[];
}

const fixture = JSON.parse(readFileSync(new URL('./fixtures/stages-parity.json', import.meta.url), 'utf8')) as Fixture;
const T0 = 1_764_000_000;
const TOL = 1e-6;

function nightSamples(scaleMotion = 1): Sample[] {
  return fixture.hr.map((hr, i) => {
    const m = fixture.motion[i] ?? null;
    return sample(T0 + i, { hr, motionG: m === null ? null : m * scaleMotion, state: 'SLEEP' });
  });
}

const epochs = Math.floor(fixture.hr.length / STAGE_EPOCH_S);
const span = { onset: T0, offset: T0 + fixture.hr.length - 1 };

function close(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(Math.abs(v - (expected[i] ?? Number.NaN))).toBeLessThan(TOL));
}

describe('sleep stages, parity with train_stages.py', () => {
  const trace = stageTrace(nightSamples(), T0, epochs);

  it('computes the same features per epoch', () => {
    expect(trace).not.toBeNull();
    expect(trace?.features).toHaveLength(fixture.features.length);
    fixture.features.forEach((expected, k) => {
      const actual = trace?.features[k] ?? null;
      if (expected === null) expect(actual).toBeNull();
      else close(actual ?? [], expected);
    });
  });

  it('smooths to the same posterior', () => {
    fixture.posterior.forEach((expected, k) => close(trace?.posterior[k] ?? [], expected));
  });

  it('labels the whole night like the reference', () => {
    const result = classifyStages(nightSamples(), [span]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.algo).toBe(ALGO.stages);
    const expected = fixture.stages.flatMap((stage, k) => (stage === null ? [] : [{ t: T0 + k * STAGE_EPOCH_S, stage }]));
    expect(result.value.epochs).toEqual(expected);
    const total = result.value.totals.wake + result.value.totals.light + result.value.totals.deep + result.value.totals.rem;
    expect(total).toBe(expected.length * STAGE_EPOCH_S);
    expect(result.coverage).toBeCloseTo(expected.length / epochs, 9);
    expect(new Set(expected.map((e) => e.stage))).toEqual(new Set(['wake', 'light', 'deep', 'rem']));
  });

  it('filters a partial night forward only, as the reference does', () => {
    const now = T0 + fixture.partialCutEpochs * STAGE_EPOCH_S;
    const result = classifyRecentStages(nightSamples(), T0, now, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const last = result.value[result.value.length - 1];
    expect(last?.t).toBe(now - STAGE_EPOCH_S);
    close(last?.probabilities ?? [], fixture.partialLast);
    expect(result.value.map((e) => e.t)).toEqual([now - 3 * STAGE_EPOCH_S, now - 2 * STAGE_EPOCH_S, now - STAGE_EPOCH_S]);
  });
});

describe('sleep stages, behaviour', () => {
  it('does not change when the motion scale changes', () => {
    const base = classifyStages(nightSamples(), [span]);
    const scaled = classifyStages(nightSamples(4), [span]);
    expect(base.ok && scaled.ok).toBe(true);
    if (base.ok && scaled.ok) expect(scaled.value.epochs).toEqual(base.value.epochs);
  });

  it('ignores samples after now for a partial night', () => {
    const now = T0 + 300 * STAGE_EPOCH_S;
    const cut = nightSamples().filter((s) => s.t < now);
    expect(classifyRecentStages(nightSamples(), T0, now)).toEqual(classifyRecentStages(cut, T0, now));
  });

  it('keeps only epochs inside the sleep periods', () => {
    const first = { onset: T0, offset: T0 + 3599 };
    const second = { onset: T0 + 7200, offset: span.offset };
    const result = classifyStages(nightSamples(), [second, first]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.epochs.every((e) => e.t + STAGE_EPOCH_S <= first.offset + 1 || e.t >= second.onset)).toBe(true);
    expect(result.value.epochs[0]?.t).toBe(T0);
  });

  it('gives a reason instead of stages when the data cannot support them', () => {
    expect(classifyStages(nightSamples(), [])).toEqual({ ok: false, reason: 'no-sleep', algo: ALGO.stages });
    const noHr = nightSamples().map((s) => ({ ...s, hr: null }));
    expect(classifyStages(noHr, [span])).toEqual({ ok: false, reason: 'missing-signal', algo: ALGO.stages });
    const noMotion = nightSamples().map((s) => ({ ...s, motionG: null }));
    expect(classifyStages(noMotion, [span])).toEqual({ ok: false, reason: 'missing-signal', algo: ALGO.stages });
    const sparse = nightSamples().map((s, i) => (i % 30 < 25 && i > 3600 ? { ...s, hr: null } : s));
    expect(classifyStages(sparse, [span])).toEqual({ ok: false, reason: 'low-coverage', algo: ALGO.stages });
    expect(classifyRecentStages(nightSamples(), T0, T0)).toEqual({ ok: false, reason: 'no-sleep', algo: ALGO.stages });
  });

  it('needs ten seconds of readings in an epoch', () => {
    const rows = nightSamples().slice(0, 40 * STAGE_EPOCH_S).map((s, i) => (i >= 300 && i < 330 && i % 30 >= 9 ? { ...s, hr: null } : s));
    const result = classifyStages(rows, [{ onset: T0, offset: T0 + 40 * STAGE_EPOCH_S - 1 }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.epochs.map((e) => e.t)).not.toContain(T0 + 10 * STAGE_EPOCH_S);
  });
});
