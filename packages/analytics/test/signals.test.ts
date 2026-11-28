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
  withStillLeadIn,
  withoutAwakeTails,
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

  it('drops a SLEEP stretch without a worn-wrist skin temperature when the band reports one elsewhere', () => {
    const samples: Sample[] = [];
    for (let i = 0; i < 9000; i++) {
      const unworn = i >= 1000 && i < 4000;
      const asleep = unworn || (i >= 5000 && i < 8000);
      samples.push(sample(T0 + i, { state: asleep ? 'SLEEP' : 'WAKE', hr: 60, skinTempC: unworn ? null : 33.1 }));
    }
    expect(sleepPeriods(samples).map((p) => [p.onset, p.offset])).toEqual([[T0 + 5000, T0 + 7999]]);
  });

  it('keeps a sleep whose skin temperature is mostly present', () => {
    const samples: Sample[] = [];
    for (let i = 0; i < 4000; i++) {
      samples.push(sample(T0 + i, { state: 'SLEEP', hr: 55, skinTempC: i % 3 === 0 ? null : 33.4 }));
    }
    expect(sleepPeriods(samples)).toHaveLength(1);
  });

  it('keeps sleep from data that carries no skin temperature at all', () => {
    const samples: Sample[] = [];
    for (let i = 0; i < 4000; i++) samples.push(sample(T0 + i, { state: 'SLEEP', hr: 55 }));
    expect(sleepPeriods(samples)).toHaveLength(1);
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
    expect(withoutAwakeTails([], [])).toEqual([]);
  });
});

describe('awake time at the end of a band-flagged sleep', () => {
  const ASLEEP_S = 6 * 3600;

  function asleep(i: number): Sample {
    return sample(T0 + i, { state: 'SLEEP', hr: 54 + (Math.floor(i / 40) % 3), motionG: 0.006, skinTempC: 33.4 });
  }

  function nightThen(tailS: number, tail: (i: number) => Partial<Sample>): Sample[] {
    const out: Sample[] = [];
    for (let i = 0; i < ASLEEP_S; i++) out.push(asleep(i));
    for (let i = 0; i < tailS; i++) out.push(sample(T0 + ASLEEP_S + i, { state: 'SLEEP', skinTempC: 33.6, ...tail(i) }));
    return out;
  }

  function detect(samples: Sample[]): SleepPeriod[] {
    return withoutAwakeTails(sleepPeriods(samples), samples);
  }

  it('ends the sleep where the wearer woke when the band keeps flagging restless minutes in bed as SLEEP', () => {
    const samples = nightThen(45 * 60, (i) => ({ hr: 66, motionG: i % 60 < 6 ? 0.08 : 0.006 }));
    expect(sleepPeriods(samples)[0]?.offset).toBe(T0 + ASLEEP_S + 45 * 60 - 1);
    const [period, ...rest] = detect(samples);
    expect(rest).toEqual([]);
    expect(Math.abs((period?.offset ?? 0) - (T0 + ASLEEP_S - 1))).toBeLessThanOrEqual(60);
    expect(period?.asleepS).toBe((period?.offset ?? 0) - T0 + 1);
    expect(period?.inBedS).toBe(ASLEEP_S + 45 * 60);
    expect(period?.hrMean ?? 99).toBeLessThan(57);
  });

  it('counts lying still with a heart rate well above the sleeping rate as awake', () => {
    const samples = nightThen(30 * 60, () => ({ hr: 70, motionG: 0.006 }));
    expect(Math.abs((detect(samples)[0]?.offset ?? 0) - (T0 + ASLEEP_S - 1))).toBeLessThanOrEqual(60);
  });

  it('keeps sleep with an occasional turn and a short heart rate rise', () => {
    const turned = (i: number): Sample => {
      const turning = i % 900 >= 300 && i % 900 < 315;
      return turning ? { ...asleep(i), hr: 66, motionG: 0.4 } : asleep(i);
    };
    const samples = Array.from({ length: ASLEEP_S }, (_, i) => turned(i));
    expect(detect(samples)).toEqual(sleepPeriods(samples));
  });

  it('cuts no more than the restless minutes when the data stops right after a turn', () => {
    const samples = nightThen(90, () => ({ hr: 66, motionG: 0.3 }));
    const offset = detect(samples)[0]?.offset ?? 0;
    expect(offset).toBeGreaterThanOrEqual(T0 + ASLEEP_S - 120);
  });

  it('ignores turns in the last minutes of sleep when the heart rate settles right after them', () => {
    const turnsAt = [ASLEEP_S - 18 * 60, ASLEEP_S - 9 * 60, ASLEEP_S - 6 * 60, ASLEEP_S - 5 * 60];
    const samples = nightThen(40 * 60, (i) => ({ hr: 70, motionG: i % 60 < 20 ? 0.05 : 0.006 })).map((s) => {
      const i = s.t - T0;
      return turnsAt.some((at) => i >= at && i < at + 20) ? { ...s, hr: 72, motionG: 0.6 } : s;
    });
    expect(Math.abs((detect(samples)[0]?.offset ?? 0) - (T0 + ASLEEP_S - 1))).toBeLessThanOrEqual(120);
  });
});

describe('lying still before the band flags sleep', () => {
  const LEAD_S = 15 * 60;
  const ASLEEP_S = 6 * 3600;

  function night(lead: (i: number) => Partial<Sample>, leadS = LEAD_S): Sample[] {
    const out: Sample[] = [];
    for (let i = 0; i < 1800; i++) out.push(sample(T0 + i, { state: 'WAKE', hr: 75, motionG: 0.2, skinTempC: 32 }));
    for (let i = 0; i < leadS; i++) out.push(sample(T0 + 1800 + i, { state: 'STILL', hr: 56, motionG: 0.006, skinTempC: 33.2, ...lead(i) }));
    for (let i = 0; i < ASLEEP_S; i++) out.push(sample(T0 + 1800 + leadS + i, { state: 'SLEEP', hr: 54 + (Math.floor(i / 40) % 3), motionG: 0.006, skinTempC: 33.4 }));
    return out;
  }

  it('starts the night when the wearer lay still and counts the calm minutes after the last movement as asleep', () => {
    const samples = night((i) => (Math.floor(i / 60) === 3 && i % 60 < 10 ? { hr: 66, motionG: 0.3 } : {}));
    const band = sleepPeriods(samples)[0];
    const [period, ...rest] = withStillLeadIn(sleepPeriods(samples), samples);
    expect(rest).toEqual([]);
    expect(period?.onset).toBe(T0 + 1800);
    expect(period?.offset).toBe(band?.offset);
    expect(period?.inBedS).toBe((band?.inBedS ?? 0) + LEAD_S);
    expect(period?.asleepS).toBe((band?.asleepS ?? 0) + LEAD_S - 4 * 60);
  });

  it('leaves a night alone when the wearer was moving right up to the band flagging sleep', () => {
    const samples = night(() => ({}), 0);
    expect(withStillLeadIn(sleepPeriods(samples), samples)).toEqual(sleepPeriods(samples));
  });

  it('reaches back at most an hour and not over seconds without skin temperature', () => {
    const long = night(() => ({}), 2 * 3600);
    expect(withStillLeadIn(sleepPeriods(long), long)[0]?.onset).toBe(T0 + 1800 + 3600);
    const offWrist = night((i) => (i < 600 ? { skinTempC: null } : {}));
    expect(withStillLeadIn(sleepPeriods(offWrist), offWrist)[0]?.onset).toBe(T0 + 1800 + 600);
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
