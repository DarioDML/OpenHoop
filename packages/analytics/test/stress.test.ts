import { describe, expect, it } from 'vitest';
import {
  ALGO,
  STRESS_WINDOW_S,
  dayStress,
  parseStressDay,
  stressBaseline,
  stressFeatures,
  stressLevel,
  stressScore,
  stressSummary,
} from '../src';
import type { Sample, StressInput, StressWindow } from '../src';
import { lcg, sample } from './helpers';

const DAY_S = 86_400;
const HOURS = 2;

interface Segment {
  start: number;
  seconds: number;
  hr: number;
  jitterMs: number;
  state?: Sample['state'];
  motionG?: number | null;
  rr?: boolean;
  hrEvery?: number;
}

function segment(o: Segment): Sample[] {
  const rand = lcg(o.start);
  const base = 60_000 / o.hr;
  const out: Sample[] = [];
  let beat = 0;
  let clock = 0;
  for (let k = 0; k < o.seconds; k++) {
    const rr: number[] = [];
    while (clock < k + 1) {
      const sign = beat % 2 === 0 ? 1 : -1;
      const v = Math.round(base + sign * o.jitterMs + (rand() - 0.5) * 4);
      clock += v / 1000;
      beat++;
      rr.push(v);
    }
    const hrPresent = o.hrEvery === undefined || k % o.hrEvery === 0;
    out.push(
      sample(o.start + k, {
        hr: hrPresent ? o.hr : null,
        rr: o.rr === false ? [] : rr,
        state: o.state ?? 'STILL',
        motionG: o.motionG === undefined ? 0.03 : o.motionG,
      }),
    );
  }
  return out;
}

function input(start: number, seconds: number, over: Partial<StressInput> = {}): StressInput {
  return { start, end: start + seconds, workouts: [], activeThresholdBpm: 115, ...over };
}

function calmHistory(days: number): StressWindow[][] {
  return Array.from({ length: days }, (_, d) => {
    const start = d * DAY_S;
    const hr = 64 + (d % 2);
    return stressFeatures(segment({ start, seconds: HOURS * 3600, hr, jitterMs: 20 + d }), input(start, HOURS * 3600));
  });
}

const TODAY = 10 * DAY_S;

describe('window features', () => {
  it('scores every complete five-minute window of a calm, still, awake stretch', () => {
    const windows = stressFeatures(segment({ start: TODAY, seconds: 3600, hr: 64, jitterMs: 20 }), input(TODAY, 3600));
    expect(windows).toHaveLength(3600 / STRESS_WINDOW_S);
    for (const w of windows) {
      expect(w.t % STRESS_WINDOW_S).toBe(0);
      expect(w.hr).toBeCloseTo(64, 6);
      expect(w.rmssd).toBeGreaterThan(36);
      expect(w.rmssd).toBeLessThan(44);
      expect(w.score).toBeNull();
    }
  });

  it('aligns windows to the clock and drops the incomplete edges', () => {
    const start = TODAY + 100;
    const windows = stressFeatures(segment({ start, seconds: 1000, hr: 64, jitterMs: 20 }), input(start, 1000));
    expect(windows.map((w) => w.t)).toEqual([TODAY + 300, TODAY + 600]);
  });

  it('excludes a workout and the 30 minutes after it so exercise does not read as stress', () => {
    const rows = [
      ...segment({ start: TODAY, seconds: 1800, hr: 64, jitterMs: 20 }),
      ...segment({ start: TODAY + 1800, seconds: 1800, hr: 150, jitterMs: 4, state: 'WAKE', motionG: 0.8 }),
      ...segment({ start: TODAY + 3600, seconds: 3600, hr: 72, jitterMs: 12 }),
    ];
    const workouts = [{ start: TODAY + 1800, end: TODAY + 3599 }];
    const windows = stressFeatures(rows, input(TODAY, 7200, { workouts }));
    const times = windows.map((w) => w.t - TODAY);
    expect(times.every((t) => t + STRESS_WINDOW_S <= 1800 || t > 3599 + 1800)).toBe(true);
    expect(times).toContain(0);
    expect(times).toContain(5700);
  });

  it('excludes moving, high heart rate, asleep and getting-up windows even without a workout record', () => {
    const rows = [
      ...segment({ start: TODAY, seconds: 600, hr: 90, jitterMs: 10, state: 'WAKE', motionG: 0.35 }),
      ...segment({ start: TODAY + 600, seconds: 600, hr: 130, jitterMs: 5 }),
      ...segment({ start: TODAY + 1200, seconds: 600, hr: 52, jitterMs: 40, state: 'SLEEP', motionG: 0.005 }),
      ...segment({ start: TODAY + 1800, seconds: 600, hr: 70, jitterMs: 20, state: 'UP', motionG: 0.05 }),
      ...segment({ start: TODAY + 2400, seconds: 600, hr: 66, jitterMs: 20, state: 'WAKE', motionG: 0.06 }),
    ];
    const windows = stressFeatures(rows, input(TODAY, 3000));
    expect(windows.map((w) => w.t - TODAY)).toEqual([2400, 2700]);
  });

  it('skips sleep periods the wearer added by hand even when the band reported awake', () => {
    const rows = segment({ start: TODAY, seconds: 1800, hr: 64, jitterMs: 20 });
    const windows = stressFeatures(rows, input(TODAY, 1800, { sleep: [{ start: TODAY + 600, end: TODAY + 1199 }] }));
    expect(windows.map((w) => w.t - TODAY)).toEqual([0, 300, 1200, 1500]);
  });

  it('needs four minutes of heart rate and motion data in a window', () => {
    const sparse = segment({ start: TODAY, seconds: 600, hr: 64, jitterMs: 20, hrEvery: 2 });
    expect(stressFeatures(sparse, input(TODAY, 600))).toEqual([]);
    const noMotion = segment({ start: TODAY, seconds: 600, hr: 64, jitterMs: 20, motionG: null });
    expect(stressFeatures(noMotion, input(TODAY, 600))).toEqual([]);
  });

  it('keeps heart rate but leaves RMSSD empty when there are no beat intervals', () => {
    const windows = stressFeatures(segment({ start: TODAY, seconds: 600, hr: 64, jitterMs: 20, rr: false }), input(TODAY, 600));
    expect(windows).toHaveLength(2);
    expect(windows.every((w) => w.rmssd === null)).toBe(true);
  });

  it('never takes a successive difference across a gap in the beat series', () => {
    const rows: Sample[] = [];
    for (let k = 0; k < STRESS_WINDOW_S; k++) {
      const block = Math.floor(k / 40);
      const rr = k % 40 >= 35 ? [] : [block % 2 === 0 ? 800 : 950];
      rows.push(sample(TODAY + k, { hr: 70, rr, state: 'STILL', motionG: 0.02 }));
    }
    const [w] = stressFeatures(rows, input(TODAY, STRESS_WINDOW_S));
    expect(w?.rmssd).toBe(0);
  });
});

describe('baseline', () => {
  it('stays empty while there are fewer than three days with an hour of windows', () => {
    expect(stressBaseline(calmHistory(2))).toBeNull();
    const short = calmHistory(3).map((days, i) => (i === 0 ? days.slice(0, 11) : days));
    expect(stressBaseline(short)).toBeNull();
  });

  it('uses the median and the MAD-scaled spread of earlier windows', () => {
    const baseline = stressBaseline(calmHistory(4));
    expect(baseline?.days).toBe(4);
    expect(baseline?.hr.center).toBeCloseTo(64.5, 0);
    expect(baseline?.hr.spread).toBeGreaterThanOrEqual(2);
    expect(baseline?.lnRmssd?.center).toBeCloseTo(Math.log(43), 1);
  });

  it('keeps only the latest 14 qualifying days', () => {
    expect(stressBaseline(calmHistory(20))?.days).toBe(14);
  });
});

describe('scoring', () => {
  const baseline = {
    days: 5,
    hr: { center: 64, spread: 4 },
    lnRmssd: { center: Math.log(40), spread: 0.25 },
  };

  it('is zero at or below the baseline and caps at three', () => {
    expect(stressScore({ hr: 60, rmssd: 55 }, baseline)).toBe(0);
    expect(stressScore({ hr: 120, rmssd: 5 }, baseline)).toBe(3);
  });

  it('averages the heart rate and HRV z values', () => {
    const z = ((72 - 64) / 4 + (Math.log(40) - Math.log(40 * Math.exp(-0.25))) / 0.25) / 2;
    expect(stressScore({ hr: 72, rmssd: 40 * Math.exp(-0.25) }, baseline)).toBeCloseTo(z, 1);
  });

  it('falls back to heart rate alone when a window or the baseline has no HRV', () => {
    expect(stressScore({ hr: 70, rmssd: null }, baseline)).toBe(1.5);
    expect(stressScore({ hr: 70, rmssd: 10 }, { ...baseline, lnRmssd: null })).toBe(1.5);
  });

  it('maps scores to levels at 1 and 2', () => {
    expect(stressLevel(0)).toBe('low');
    expect(stressLevel(0.9)).toBe('low');
    expect(stressLevel(1)).toBe('medium');
    expect(stressLevel(1.9)).toBe('medium');
    expect(stressLevel(2)).toBe('high');
    expect(stressLevel(3)).toBe('high');
  });
});

describe('a day', () => {
  const seconds = HOURS * 3600;

  it('reads calm as low', () => {
    const day = dayStress(segment({ start: TODAY, seconds, hr: 64, jitterMs: 21 }), input(TODAY, seconds), calmHistory(5));
    expect(day.reason).toBeNull();
    expect(day.algo).toBe(ALGO.stress);
    expect(day.baselineDays).toBe(5);
    expect(day.windows.length).toBe(seconds / STRESS_WINDOW_S);
    expect(day.windows.every((w) => w.score !== null && stressLevel(w.score) === 'low')).toBe(true);
  });

  it('reads a raised heart rate with suppressed HRV as high', () => {
    const day = dayStress(segment({ start: TODAY, seconds, hr: 82, jitterMs: 6 }), input(TODAY, seconds), calmHistory(5));
    expect(day.reason).toBeNull();
    expect(day.windows.every((w) => w.score !== null && stressLevel(w.score) === 'high')).toBe(true);
  });

  it('marks the first days as calibrating and still keeps their windows for the baseline', () => {
    const day = dayStress(segment({ start: TODAY, seconds, hr: 82, jitterMs: 6 }), input(TODAY, seconds), calmHistory(2));
    expect(day.reason).toBe('needs-history');
    expect(day.windows.length).toBeGreaterThan(0);
    expect(day.windows.every((w) => w.score === null)).toBe(true);
  });

  it('gives a reason instead of a score when data is missing', () => {
    expect(dayStress([], input(TODAY, seconds), calmHistory(5)).reason).toBe('no-data');
    const exercising = segment({ start: TODAY, seconds, hr: 150, jitterMs: 4, state: 'WAKE', motionG: 0.8 });
    const all = dayStress(exercising, input(TODAY, seconds, { workouts: [{ start: TODAY, end: TODAY + seconds }] }), calmHistory(5));
    expect(all.reason).toBe('low-coverage');
    expect(all.windows).toEqual([]);
  });

  it('summarises time per level and the latest window', () => {
    const rows = [
      ...segment({ start: TODAY, seconds: 3600, hr: 64, jitterMs: 21 }),
      ...segment({ start: TODAY + 3600, seconds: 1800, hr: 82, jitterMs: 6 }),
    ];
    const day = dayStress(rows, input(TODAY, 5400), calmHistory(5));
    const summary = stressSummary(day);
    expect(summary.seconds.low).toBe(3600);
    expect(summary.seconds.high).toBe(1800);
    expect(summary.seconds.medium).toBe(0);
    expect(summary.latest?.t).toBe(TODAY + 5400 - STRESS_WINDOW_S);
    expect(stressSummary({ ...day, reason: 'needs-history', windows: day.windows.map((w) => ({ ...w, score: null })) }).latest).toBeNull();
  });
});

describe('stored day parser', () => {
  const day = dayStress(segment({ start: TODAY, seconds: 3600, hr: 70, jitterMs: 15 }), input(TODAY, 3600), calmHistory(5));

  it('round-trips through JSON', () => {
    expect(parseStressDay(JSON.parse(JSON.stringify(day)))).toEqual(day);
  });

  it('rejects malformed values', () => {
    expect(parseStressDay(null)).toBeNull();
    expect(parseStressDay(undefined)).toBeNull();
    expect(parseStressDay({ ...day, reason: 'bogus' })).toBeNull();
    expect(parseStressDay({ ...day, baselineDays: -1 })).toBeNull();
    expect(parseStressDay({ ...day, windows: 'x' })).toBeNull();
    expect(parseStressDay({ ...day, windows: [{ t: 1, hr: 60, rmssd: null, score: 7 }] })).toBeNull();
    expect(parseStressDay({ ...day, windows: [{ t: 1, hr: 'x', rmssd: null, score: null }] })).toBeNull();
    expect(parseStressDay({ ...day, windows: [{ t: 1, hr: 60, score: null }] })).toBeNull();
  });
});
