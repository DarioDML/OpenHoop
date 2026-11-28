import { describe, expect, it } from 'vitest';
import { sleepPeriods } from '@openhoop/analytics';
import type { SleepPeriod } from '@openhoop/analytics';
import { MANUAL_NAP_MAX_S, applySleepEdits, editsTouching, measuredNight, sleepEditSource, validateSleepEdit } from '../src/index';
import type { SleepEdit } from '../src/index';
import { awakeSamples, nightSamples } from './sampleFactory';

const HOUR_S = 3_600;
const T0 = 1_772_000_000;

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const item = items[0];
  if (item === undefined) throw new Error('missing item');
  return item;
}

function edit(overrides: Partial<SleepEdit>): SleepEdit {
  return { id: 1, targetOnset: null, targetOffset: null, onset: T0, offset: T0 + HOUR_S, removed: false, ...overrides };
}

const night = [...awakeSamples(1, T0 - 2 * HOUR_S, 2 * HOUR_S), ...nightSamples(1, T0, 8 * HOUR_S), ...awakeSamples(1, T0 + 8 * HOUR_S, 2 * HOUR_S)];
const detected = sleepPeriods(night);
const main = only(detected);

describe('applySleepEdits', () => {
  it('a removed edit takes the detected night away and emits nothing, and restoring brings it back', () => {
    const removal = edit({ id: 4, targetOnset: main.onset, targetOffset: main.offset, onset: main.onset, offset: main.offset + 1, removed: true });
    expect(applySleepEdits(detected, [removal], night)).toEqual([]);
    expect(only(applySleepEdits(detected, [], night))).toMatchObject({ onset: main.onset, source: 'detected' });
    expect(sleepEditSource(removal)).toBe('removed');
    expect(sleepEditSource({ targetOnset: null })).toBe('manual');
    expect(sleepEditSource({ targetOnset: main.onset, removed: false })).toBe('edited');
  });

  it('a nap added inside a removed night is still kept', () => {
    const removal = edit({ id: 4, targetOnset: main.onset, targetOffset: main.offset, onset: main.onset, offset: main.offset + 1, removed: true });
    const nap = edit({ id: 5, onset: T0 + 2 * HOUR_S, offset: T0 + 3 * HOUR_S });
    expect(only(applySleepEdits(detected, [removal, nap], night))).toMatchObject({ source: 'manual', editId: 5, onset: nap.onset, offset: nap.offset, measured: [] });
  });

  it('passes detected sleep through untouched when there are no edits', () => {
    const merged = only(applySleepEdits(detected, [], night));
    expect(merged).toEqual({ ...main, source: 'detected', editId: null, measured: [main] });
  });

  it('an earlier onset adds the extra time as asleep and keeps physiology on the measured part', () => {
    const correction = edit({ id: 7, targetOnset: main.onset, targetOffset: main.offset, onset: T0 - 30 * 60, offset: T0 + 8 * HOUR_S });
    const merged = only(applySleepEdits(detected, [correction], night));
    expect(merged).toMatchObject({ source: 'edited', editId: 7, onset: correction.onset, offset: correction.offset });
    expect(merged.inBedS).toBe(8 * HOUR_S + 30 * 60);
    expect(merged.asleepS).toBe(main.asleepS + 30 * 60);
    expect(only(merged.measured)).toMatchObject({ onset: main.onset, offset: main.offset, asleepS: main.asleepS });
  });

  it('a later onset and an earlier offset count only the band-measured sleep left inside', () => {
    const correction = edit({ targetOnset: main.onset, targetOffset: main.offset, onset: T0 + HOUR_S, offset: T0 + 7 * HOUR_S });
    const merged = only(applySleepEdits(detected, [correction], night));
    expect(merged.asleepS).toBe(6 * HOUR_S);
    expect(merged.inBedS).toBe(6 * HOUR_S);
    expect(only(merged.measured)).toMatchObject({ onset: T0 + HOUR_S, offset: T0 + 7 * HOUR_S - 1, inBedS: 6 * HOUR_S });
  });

  it('joins the periods of one night without counting the measured wake gap between them', () => {
    const split = [
      ...nightSamples(1, T0, 3 * HOUR_S),
      ...awakeSamples(1, T0 + 3 * HOUR_S, HOUR_S),
      ...nightSamples(1, T0 + 4 * HOUR_S, 3 * HOUR_S),
    ];
    const parts = sleepPeriods(split);
    expect(parts).toHaveLength(2);
    const first = parts[0];
    const last = parts[1];
    if (first === undefined || last === undefined) throw new Error('missing periods');
    const correction = edit({ targetOnset: first.onset, targetOffset: last.offset, onset: T0, offset: T0 + 7 * HOUR_S });
    const merged = only(applySleepEdits(parts, [correction], split));
    expect(merged.asleepS).toBe(first.asleepS + last.asleepS);
    expect(merged.measured).toHaveLength(2);
  });

  it('a correction moved away from its target still replaces the target and has no measured sleep', () => {
    const correction = edit({ targetOnset: main.onset, targetOffset: main.offset, onset: T0 + 9 * HOUR_S, offset: T0 + 9.5 * HOUR_S });
    const merged = only(applySleepEdits(detected, [correction], night));
    expect(merged).toMatchObject({ source: 'edited', onset: correction.onset, asleepS: 30 * 60 });
    expect(merged.measured).toEqual([]);
  });

  it('a manual nap counts its whole span as asleep and sits next to detected sleep', () => {
    const nap = edit({ id: 3, onset: T0 + 8.5 * HOUR_S, offset: T0 + 9 * HOUR_S });
    const merged = applySleepEdits(detected, [nap], night);
    expect(merged.map((p) => p.source)).toEqual(['detected', 'manual']);
    expect(merged[1]).toMatchObject({ editId: 3, asleepS: 30 * 60, inBedS: 30 * 60, measured: [] });
    expect(merged[1]?.hrMean).not.toBeNull();
  });

  it('ignores an invalid edit and a later edit that overlaps an earlier one', () => {
    const kept = edit({ id: 2, onset: T0 + 8.5 * HOUR_S, offset: T0 + 9 * HOUR_S });
    const clash = edit({ id: 5, onset: T0 + 8.75 * HOUR_S, offset: T0 + 9.5 * HOUR_S });
    const broken = edit({ id: 4, onset: T0 + 11 * HOUR_S, offset: T0 + 11 * HOUR_S });
    const merged = applySleepEdits(detected, [clash, broken, kept], night);
    expect(merged.map((p) => p.editId)).toEqual([null, 2]);
  });

  it('measuredNight swaps in the measured parts for physiology', () => {
    const correction = edit({ targetOnset: main.onset, targetOffset: main.offset, onset: T0 - HOUR_S, offset: T0 + 8 * HOUR_S });
    const merged = only(applySleepEdits(detected, [correction], night));
    const physio = measuredNight({ periods: [merged], onset: merged.onset, offset: merged.offset, asleepS: merged.asleepS, inBedS: merged.inBedS });
    expect(physio.periods).toEqual<SleepPeriod[]>(merged.measured);
    expect(physio.onset).toBe(merged.onset);
  });
});

describe('validateSleepEdit', () => {
  const now = T0 + 24 * HOUR_S;
  const others = [{ onset: T0, offset: T0 + 8 * HOUR_S }];

  it.each([
    ['end before start', { targetOnset: null, onset: T0 + 10 * HOUR_S, offset: T0 + 9 * HOUR_S }, 'end-before-start'],
    ['equal times', { targetOnset: null, onset: T0 + 10 * HOUR_S, offset: T0 + 10 * HOUR_S }, 'end-before-start'],
    ['not a number', { targetOnset: null, onset: Number.NaN, offset: T0 }, 'end-before-start'],
    ['a nap over four hours', { targetOnset: null, onset: T0 + 9 * HOUR_S, offset: T0 + 9 * HOUR_S + MANUAL_NAP_MAX_S + 1 }, 'too-long'],
    ['a night over sixteen hours', { targetOnset: T0, onset: T0 - 9 * HOUR_S, offset: T0 + 8 * HOUR_S }, 'too-long'],
    ['a future end', { targetOnset: null, onset: now - 600, offset: now + 60 }, 'future'],
    ['an overlap', { targetOnset: null, onset: T0 + 7 * HOUR_S, offset: T0 + 9 * HOUR_S }, 'overlap'],
  ] as const)('rejects %s', (_name, draft, problem) => {
    expect(validateSleepEdit(draft, others, now)).toBe(problem);
  });

  it('accepts a nap that touches the night and a long corrected night', () => {
    expect(validateSleepEdit({ targetOnset: null, onset: T0 + 8 * HOUR_S, offset: T0 + 9 * HOUR_S }, others, now)).toBeNull();
    expect(validateSleepEdit({ targetOnset: T0, onset: T0 - 2 * HOUR_S, offset: T0 + 10 * HOUR_S }, [], now)).toBeNull();
  });
});

describe('editsTouching', () => {
  it('keeps edits whose new span or target span meets the window', () => {
    const edits = [
      edit({ id: 1, onset: 100, offset: 200 }),
      edit({ id: 2, onset: 500, offset: 600, targetOnset: 150, targetOffset: 250 }),
      edit({ id: 3, onset: 400, offset: 450 }),
    ];
    expect(editsTouching(edits, 180, 300).map((e) => e.id)).toEqual([1, 2]);
    expect(editsTouching(edits, 200, 250).map((e) => e.id)).toEqual([2]);
  });
});
