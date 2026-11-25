import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  dayLoad,
  debtMs,
  nightlySkinTemp,
  readiness,
  respiratoryRate,
  respiratoryWindows,
  rmssd,
  sleepPeriods,
  sleepScore,
  spo2Windows,
  strainNeedMs,
  zoneSeconds,
} from '../src';
import type { Sample } from '../src';
import { expandRuns, nightOf, sample } from './helpers';

type Runs = [number, number][];

interface PyPeriod {
  onset_unix: number;
  offset_unix: number;
  duration_s: number;
  asleep_s: number;
  hr_min: number | null;
  hr_mean: number | null;
}

interface PyRespWindow {
  start_s: number;
  end_s: number;
  beats: number;
  breaths_per_min: number | null;
  peak_fraction: number | null;
}

interface PySpo2Window {
  start_unix: number;
  valid_seconds: number;
  spo2_percent: number | null;
}

interface SkinRow {
  meanC: number;
  deviationC: number | null;
}

interface Fixture {
  rmssd: { rr: number[]; maxStepMs: number; expected: number | null }[];
  sleepPeriods: { t: Runs; state: string; hr: (number | null)[]; expected: PyPeriod[] }[];
  respiratory: { rr: number[]; expected: PyRespWindow[] }[];
  respiratoryNight: { t: Runs; rr: number[][]; onset: number; offset: number; expectedMedian: number; windows: number };
  spo2: { samples: [number, number | null][]; expected: PySpo2Window[] };
  skinTemp: {
    t: Runs;
    temp: (number | null)[];
    periods: [number, number][];
    baselineC: number;
    expectedNoBaseline: SkinRow[];
    expectedWithBaseline: SkinRow[];
  };
  scores: {
    debtMs: { need: number; asleep: number; rem: number; expected: number }[];
    strainNeedMs: { load: number; expected: number }[];
    sleepPerformance: { asleep: number; need: number; consistency: number; expected: number }[];
    dayStrain: { minuteHr: (number | null)[]; expected: number }[];
    zoneSeconds: { hr: (number | null)[]; rest: number; max: number; expected: number[] }[];
    recoveryLead: {
      history: { hrv: number; sleepScore: number; rhr: number }[];
      hrv: number;
      sleepScore: number;
      rhr: number;
      expected: number;
    }[];
  };
}

function isFixture(x: unknown): x is Fixture {
  if (typeof x !== 'object' || x === null) return false;
  const keys = ['rmssd', 'sleepPeriods', 'respiratory', 'respiratoryNight', 'spo2', 'skinTemp', 'scores'];
  return keys.every((k) => k in x);
}

function loadFixture(): Fixture {
  const parsed: unknown = JSON.parse(readFileSync(new URL('./fixtures/python-parity.json', import.meta.url), 'utf8'));
  if (!isFixture(parsed)) throw new Error('python-parity.json has an unexpected shape');
  return parsed;
}

const STATES: Record<string, Sample['state']> = { W: 'WAKE', T: 'STILL', S: 'SLEEP', U: 'UP', '-': null };
const fx = loadFixture();
const EPS = 1e-6;

describe('parity with wearable5.0 experimental.py', () => {
  it('rmssd matches rmssd_ms', () => {
    for (const c of fx.rmssd) {
      const got = rmssd(c.rr, c.maxStepMs);
      if (c.expected === null) expect(got).toBeNull();
      else expect(Math.abs((got ?? Number.NaN) - c.expected)).toBeLessThan(EPS);
    }
  });

  it('sleepPeriods matches sleep_periods', () => {
    for (const c of fx.sleepPeriods) {
      const ts = expandRuns(c.t);
      const samples = ts.map((t, i) => sample(t, { state: STATES[c.state[i] ?? '-'] ?? null, hr: c.hr[i] ?? null }));
      const got = sleepPeriods(samples);
      expect(got.length).toBe(c.expected.length);
      c.expected.forEach((e, i) => {
        const g = got[i];
        expect(g?.onset).toBe(e.onset_unix);
        expect(g?.offset).toBe(e.offset_unix);
        expect(g?.inBedS).toBe(e.duration_s);
        expect(g?.asleepS).toBe(e.asleep_s);
        expect(g?.hrMin).toBe(e.hr_min);
        expect(Math.abs((g?.hrMean ?? Number.NaN) - (e.hr_mean ?? Number.NaN))).toBeLessThan(EPS);
      });
    }
  });

  it('sleepPeriods is unaffected by input order', () => {
    const c = fx.sleepPeriods[0];
    if (c === undefined) throw new Error('missing case');
    const ts = expandRuns(c.t);
    const samples = ts.map((t, i) => sample(t, { state: STATES[c.state[i] ?? '-'] ?? null, hr: c.hr[i] ?? null }));
    expect(sleepPeriods(samples.slice().reverse())).toEqual(sleepPeriods(samples));
  });

  it('respiratoryWindows matches respiratory_rate', () => {
    for (const c of fx.respiratory) {
      const got = respiratoryWindows(c.rr);
      expect(got.length).toBe(c.expected.length);
      c.expected.forEach((e, i) => {
        const g = got[i];
        expect(g?.startS).toBeCloseTo(e.start_s, 9);
        expect(g?.beats).toBe(e.beats);
        if (e.breaths_per_min === null) expect(g?.breathsPerMin).toBeNull();
        else expect(Math.abs((g?.breathsPerMin ?? Number.NaN) - e.breaths_per_min)).toBeLessThan(0.05);
        if (e.peak_fraction === null) expect(g?.peakFraction).toBeNull();
        else expect(Math.abs((g?.peakFraction ?? Number.NaN) - e.peak_fraction)).toBeLessThan(EPS);
      });
    }
  });

  it('respiratoryRate over a night matches the median of respiratory_rate', () => {
    const c = fx.respiratoryNight;
    const ts = expandRuns(c.t);
    const samples = ts.map((t, i) => sample(t, { rr: c.rr[i] ?? [], hr: 57, state: 'SLEEP' }));
    const got = respiratoryRate(samples, nightOf([[c.onset, c.offset]]));
    expect(got.ok).toBe(true);
    if (got.ok) expect(Math.abs(got.value - c.expectedMedian)).toBeLessThan(0.05);
  });

  it('spo2Windows matches spo2_windows', () => {
    const samples = fx.spo2.samples.map(([t, raw]) => sample(t, { spo2Raw: raw }));
    const expected = fx.spo2.expected.filter((w) => w.spo2_percent !== null);
    const got = spo2Windows(samples);
    expect(got.length).toBe(expected.length);
    expected.forEach((e, i) => {
      expect(got[i]?.start).toBe(e.start_unix);
      expect(got[i]?.validSeconds).toBe(e.valid_seconds);
      expect(Math.abs((got[i]?.percent ?? Number.NaN) - (e.spo2_percent ?? Number.NaN))).toBeLessThan(EPS);
    });
  });

  it('nightlySkinTemp matches skin_temp_baseline', () => {
    const c = fx.skinTemp;
    const ts = expandRuns(c.t);
    const samples = ts.map((t, i) => sample(t, { skinTempC: c.temp[i] ?? null }));
    const check = (period: [number, number] | undefined, baseline: number | null, e: SkinRow | undefined): void => {
      if (period === undefined || e === undefined) throw new Error('missing case');
      const got = nightlySkinTemp(samples, nightOf([period]), baseline);
      expect(got.ok).toBe(true);
      if (!got.ok) return;
      expect(Math.abs(got.value.meanC - e.meanC)).toBeLessThan(EPS);
      if (e.deviationC === null) expect(got.value.deviationC).toBeNull();
      else expect(Math.abs((got.value.deviationC ?? Number.NaN) - e.deviationC)).toBeLessThan(EPS);
    };
    check(c.periods[0], null, c.expectedNoBaseline[0]);
    c.periods.forEach((p, i) => check(p, c.baselineC, c.expectedWithBaseline[i]));
  });
});

describe('parity with wearable5.0 score_formulas.py', () => {
  it('debtMs matches debt_ms', () => {
    for (const c of fx.scores.debtMs) expect(debtMs(c.need, c.asleep, c.rem)).toBe(c.expected);
  });

  it('strainNeedMs matches strain_need_ms', () => {
    for (const c of fx.scores.strainNeedMs) expect(Math.abs(strainNeedMs(c.load) - c.expected)).toBeLessThan(EPS);
  });

  it('sleepScore matches sleep_performance, clamped', () => {
    for (const c of fx.scores.sleepPerformance) {
      const got = sleepScore({ asleepMs: c.asleep, needMs: c.need, consistency: c.consistency });
      expect(got.ok).toBe(true);
      if (got.ok) expect(Math.abs(got.value - Math.min(100, Math.max(0, c.expected)))).toBeLessThan(EPS);
    }
  });

  it('dayLoad with rest 57 and max 189 matches day_strain, clamped', () => {
    for (const c of fx.scores.dayStrain) {
      const got = dayLoad(c.minuteHr, 57, 189);
      expect(got.ok).toBe(true);
      if (got.ok) expect(Math.abs(got.value - Math.min(21, c.expected))).toBeLessThan(EPS);
    }
  });

  it('zoneSeconds matches zone_seconds', () => {
    for (const c of fx.scores.zoneSeconds) expect(zoneSeconds(c.hr, c.rest, c.max)).toEqual(c.expected);
  });

  it('readiness with under 4 nights of history matches recovery_lead fed rhr + 4.6', () => {
    for (const c of fx.scores.recoveryLead) {
      const got = readiness({ history: c.history, hrv: c.hrv, sleepScore: c.sleepScore, rhr: c.rhr });
      expect(got.ok).toBe(true);
      if (got.ok) expect(Math.abs(got.value.score - c.expected)).toBeLessThan(EPS);
    }
  });
});
