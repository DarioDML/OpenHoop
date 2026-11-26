import { describe, expect, it } from 'vitest';
import {
  ALGO,
  cleanRr,
  groupNights,
  nightlyHrv,
  nightlySkinTemp,
  nightlySpo2,
  respiratoryRate,
  restingHr,
  rmssd,
  sleepPeriods,
  spo2Windows,
} from '../src';
import type { Sample, SleepPeriod } from '../src';
import { beatSamples, lcg, nightOf, sample } from './helpers';

const T0 = 1_764_000_000;

function alternating(): (t: number, i: number) => number {
  return (_t, i) => (i % 2 === 0 ? 1000 : 1040);
}

function wholeNight(samples: Sample[]) {
  const first = samples[0]?.t ?? 0;
  const last = samples[samples.length - 1]?.t ?? 0;
  return nightOf([[first, last]]);
}

describe('rr', () => {
  it('cleanRr drops out-of-range values and large steps against the previous in-range value', () => {
    expect(cleanRr([1000, 250, 1010, 1500, 1520, 2100, 1530])).toEqual([1000, 1010, 1520, 1530]);
  });

  it('rmssd needs ten usable differences', () => {
    expect(rmssd([1000, 1040, 1000, 1040, 1000, 1040, 1000, 1040, 1000, 1040])).toBeNull();
    expect(rmssd([1000, 1040, 1000, 1040, 1000, 1040, 1000, 1040, 1000, 1040, 1000])).toBe(40);
  });
});

describe('sleep periods and nights', () => {
  function period(onset: number, offset: number): SleepPeriod {
    return { onset, offset, asleepS: offset - onset + 1, inBedS: offset - onset + 1, hrMin: null, hrMean: null };
  }

  it('periods 90 minutes apart form one night, 150 minutes apart form two', () => {
    const a = period(T0, T0 + 3 * 3600);
    const b = period(a.offset + 90 * 60, a.offset + 90 * 60 + 3600);
    const c = period(b.offset + 150 * 60, b.offset + 150 * 60 + 3600);
    const nights = groupNights([c, b, a]);
    expect(nights).toHaveLength(2);
    expect(nights[0]?.periods).toEqual([a, b]);
    expect(nights[0]?.asleepS).toBe(a.asleepS + b.asleepS);
    expect(nights[0]?.onset).toBe(a.onset);
    expect(nights[0]?.offset).toBe(b.offset);
    expect(nights[1]?.periods).toEqual([c]);
  });

  it('keeps a sleep run of at least 1200 s and drops a shorter one', () => {
    const samples: Sample[] = [];
    for (let i = 0; i < 6000; i++) {
      const asleep = (i >= 1000 && i < 2300) || (i >= 4000 && i < 5000);
      samples.push(sample(T0 + i, { state: asleep ? 'SLEEP' : 'WAKE', hr: 55 }));
    }
    const periods = sleepPeriods(samples);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.onset).toBe(T0 + 1000);
    expect(periods[0]?.offset).toBe(T0 + 2299);
    expect(periods[0]?.hrMean).toBe(55);
  });

  it('does not count seconds above 100 bpm as sleep even when the band flags them SLEEP', () => {
    const samples: Sample[] = [];
    for (let i = 0; i < 6000; i++) {
      const running = i >= 2000 && i < 4000;
      samples.push(sample(T0 + i, { state: 'SLEEP', hr: running ? 160 : 55 }));
    }
    const periods = sleepPeriods(samples);
    expect(periods.map((p) => [p.onset, p.offset])).toEqual([
      [T0, T0 + 1999],
      [T0 + 4000, T0 + 5999],
    ]);
    expect(periods.every((p) => (p.hrMean ?? 0) < 100)).toBe(true);
  });

  it('merges a 500 s awakening and splits at a 900 s one', () => {
    const build = (wake: number): Sample[] => {
      const out: Sample[] = [];
      for (let i = 0; i < 7200 + wake; i++) {
        const asleep = i < 3600 || i >= 3600 + wake;
        out.push(sample(T0 + i, { state: asleep ? 'SLEEP' : 'WAKE' }));
      }
      return out;
    };
    expect(sleepPeriods(build(500))).toHaveLength(1);
    expect(sleepPeriods(build(900))).toHaveLength(2);
  });

  it('returns no periods for no samples', () => {
    expect(sleepPeriods([])).toEqual([]);
    expect(groupNights([])).toEqual([]);
  });
});

describe('HRV and resting heart rate', () => {
  it('recovers a known RMSSD of 40 ms', () => {
    const samples = beatSamples({ start: T0, seconds: 7200, rr: alternating() });
    const r = nightlyHrv(samples, wholeNight(samples));
    expect(r).toMatchObject({ ok: true, algo: ALGO.hrv });
    if (r.ok) {
      expect(r.value).toBeCloseTo(40, 6);
      expect(r.coverage).toBeGreaterThan(0.95);
    }
  });

  it('a loose strap with 5 % of beats returns low-coverage for HRV and respiration (Review Focus 3)', () => {
    const rand = lcg(7);
    const samples = beatSamples({
      start: T0,
      seconds: 4 * 3600,
      rr: (t) => 1000 + 50 * Math.sin(2 * Math.PI * 0.25 * t),
      keep: () => rand() < 0.05,
    });
    const night = wholeNight(samples);
    expect(nightlyHrv(samples, night)).toEqual({ ok: false, reason: 'low-coverage', algo: ALGO.hrv });
    expect(respiratoryRate(samples, night)).toEqual({ ok: false, reason: 'low-coverage', algo: ALGO.respiratory });
  });

  it('a window with 50 % of expected beats does not count, one with 75 % does', () => {
    const at = (fraction: number) => {
      const rand = lcg(11);
      const samples = beatSamples({ start: T0, seconds: 7200, rr: alternating(), keep: () => rand() < fraction });
      return nightlyHrv(samples, wholeNight(samples));
    };
    expect(at(0.5)).toMatchObject({ ok: false, reason: 'low-coverage' });
    expect(at(0.75).ok).toBe(true);
  });

  it('needs 20 valid windows', () => {
    const ok = beatSamples({ start: T0, seconds: 300 + 19 * 30, rr: alternating() });
    const short = beatSamples({ start: T0, seconds: 300 + 18 * 30, rr: alternating() });
    expect(nightlyHrv(ok, wholeNight(ok)).ok).toBe(true);
    expect(nightlyHrv(short, wholeNight(short))).toMatchObject({ ok: false, reason: 'low-coverage' });
  });

  it('reports no-data, no-sleep and missing-signal', () => {
    const samples = Array.from({ length: 3600 }, (_, i) => sample(T0 + i, { hr: 55, state: 'SLEEP' }));
    expect(nightlyHrv([], nightOf([[T0, T0 + 3599]]))).toMatchObject({ ok: false, reason: 'no-data' });
    expect(nightlyHrv(samples, nightOf([]))).toMatchObject({ ok: false, reason: 'no-sleep' });
    expect(nightlyHrv(samples, nightOf([[T0 + 10_000, T0 + 13_000]]))).toMatchObject({ ok: false, reason: 'no-data' });
    expect(nightlyHrv(samples, nightOf([[T0, T0 + 3599]]))).toMatchObject({ ok: false, reason: 'missing-signal' });
    expect(respiratoryRate(samples, nightOf([[T0, T0 + 3599]]))).toMatchObject({ ok: false, reason: 'missing-signal' });
  });

  it('resting HR is the lowest 5-minute mean', () => {
    const samples = Array.from({ length: 7200 }, (_, i) => sample(T0 + i, { hr: i >= 3000 && i < 3600 ? 48 : 60 }));
    const r = restingHr(samples, wholeNight(samples));
    expect(r).toMatchObject({ ok: true, value: 48, algo: ALGO.restingHr });
  });

  it('resting HR ignores a 5-minute block with fewer than 240 valid seconds', () => {
    const samples = Array.from({ length: 7200 }, (_, i) => {
      const low = i >= 3000 && i < 3300;
      return sample(T0 + i, { hr: low ? (i < 3230 ? 45 : null) : 60 });
    });
    expect(restingHr(samples, wholeNight(samples))).toMatchObject({ ok: true, value: 60 });
    const sparse = samples.map((s, i) => ({ ...s, hr: i % 2 === 0 ? s.hr : null }));
    expect(restingHr(sparse, wholeNight(sparse))).toMatchObject({ ok: false, reason: 'low-coverage' });
  });
});

describe('respiratory rate', () => {
  it.each([9, 14, 18])('recovers synthetic sinus arrhythmia at %i per minute within 0.3', (bpm) => {
    const rand = lcg(bpm);
    const samples = beatSamples({
      start: T0,
      seconds: 1800,
      rr: (t) => 950 + 45 * Math.sin((2 * Math.PI * bpm * t) / 60) + (rand() - 0.5) * 10,
    });
    const r = respiratoryRate(samples, wholeNight(samples));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Math.abs(r.value - bpm)).toBeLessThanOrEqual(0.3);
  });
});

describe('SpO2', () => {
  function window(start: number, values: number[]): Sample[] {
    return values.map((v, i) => sample(start + i, { spo2Raw: v, state: 'SLEEP' }));
  }

  it('accepts only 70-100 and needs 5 valid seconds per window', () => {
    const samples = [
      ...window(T0, [97, 96, 69, 160, 96, 97, 98]),
      ...window(T0 + 1200, [99, 100, 16, 0, 128]),
      ...window(T0 + 2400, [70, 71, 72, 73, 101]),
    ];
    const w = spo2Windows(samples);
    expect(w).toEqual([{ start: T0, percent: 97, validSeconds: 5 }]);
  });

  it('bridges a 2 s gap inside a window and splits at a larger one', () => {
    const samples = [
      ...window(T0, [95, 95, 95]),
      ...window(T0 + 4, [96, 96, 96]),
      ...window(T0 + 10, [90, 90, 90, 90, 90]),
    ];
    expect(spo2Windows(samples)).toEqual([
      { start: T0, percent: 95.5, validSeconds: 6 },
      { start: T0 + 10, percent: 90, validSeconds: 5 },
    ]);
  });

  it('a night needs 3 valid windows', () => {
    const good = (k: number) => window(T0 + k * 1200, [95, 96, 96, 97, 96, 95]);
    const two = [...good(0), ...good(1), ...window(T0 + 2400, [160, 160, 160])];
    const three = [...two, ...good(3)];
    const night = nightOf([[T0, T0 + 4 * 1200]]);
    expect(nightlySpo2(two, night)).toMatchObject({ ok: false, reason: 'low-coverage', algo: ALGO.spo2 });
    const r = nightlySpo2(three, night);
    expect(r).toMatchObject({ ok: true, value: 96, coverage: 0.75 });
  });

  it('reports missing-signal without any SpO2 bytes', () => {
    const samples = Array.from({ length: 100 }, (_, i) => sample(T0 + i, { spo2Raw: i % 2 === 0 ? 0 : null }));
    expect(nightlySpo2(samples, nightOf([[T0, T0 + 99]]))).toMatchObject({ ok: false, reason: 'missing-signal' });
  });
});

describe('skin temperature', () => {
  it('reports mean and deviation against the baseline', () => {
    const samples = Array.from({ length: 3600 }, (_, i) => sample(T0 + i, { skinTempC: i % 2 === 0 ? 33 : 34 }));
    const night = nightOf([[T0, T0 + 3599]]);
    const r = nightlySkinTemp(samples, night, 33.2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.meanC).toBeCloseTo(33.5, 9);
      expect(r.value.deviationC).toBeCloseTo(0.3, 9);
    }
    const none = nightlySkinTemp(samples, night, null);
    expect(none.ok && none.value.deviationC).toBeNull();
  });

  it('a handful of readings is low-coverage', () => {
    const samples = Array.from({ length: 3600 }, (_, i) => sample(T0 + i, { skinTempC: i < 100 ? 33 : null }));
    expect(nightlySkinTemp(samples, nightOf([[T0, T0 + 3599]]), null)).toMatchObject({ ok: false, reason: 'low-coverage' });
  });
});

describe('performance', () => {
  it('processes a 30 000-second night and an 86 400-second day quickly', () => {
    const rand = lcg(3);
    const night = beatSamples({
      start: T0,
      seconds: 30_000,
      rr: (t) => 1000 + 40 * Math.sin((2 * Math.PI * 14 * t) / 60) + (rand() - 0.5) * 20,
    }).map((s, i) => ({ ...s, skinTempC: 33.5, spo2Raw: i % 1200 < 30 ? 96 : 0 }));
    const day: Sample[] = Array.from({ length: 86_400 }, (_, i) =>
      sample(T0 + i, { hr: 60 + Math.round(rand() * 40), state: i > 20_000 && i < 50_000 ? 'SLEEP' : 'WAKE' }),
    );
    const started = performance.now();
    const n = wholeNight(night);
    expect(nightlyHrv(night, n).ok).toBe(true);
    expect(restingHr(night, n).ok).toBe(true);
    expect(respiratoryRate(night, n).ok).toBe(true);
    expect(nightlySpo2(night, n).ok).toBe(true);
    expect(nightlySkinTemp(night, n, null).ok).toBe(true);
    expect(sleepPeriods(day)).toHaveLength(1);
    expect(performance.now() - started).toBeLessThan(5000);
  });
});
