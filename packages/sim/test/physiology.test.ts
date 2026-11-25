import { groupNights, nightlyHrv, nightlySpo2, respiratoryRate, sleepPeriods } from '@openhoop/analytics';
import type { Sample } from '@openhoop/analytics';
import { describe, expect, it } from 'vitest';
import { simulateSecond } from '../src/index';

const DAY = 86400;
const BASE = 1_800_000_000 - (1_800_000_000 % DAY);

function samples(seed: number, from: number, to: number): Sample[] {
  const out: Sample[] = [];
  for (let t = from; t < to; t++) {
    const s = simulateSecond(seed, t);
    out.push({
      t,
      hr: s.heartRate,
      rr: s.rrMs,
      steps: s.stepCounter,
      skinTempC: s.skinTempC,
      spo2Raw: s.spo2Byte82,
      state: s.bandState,
      motionG: s.dynamicAccelG,
    });
  }
  return out;
}

describe('simulateSecond', () => {
  it('is a pure function of seed and time', () => {
    for (const t of [BASE, BASE + 3 * 3600 + 17, BASE + 20 * 3600, BASE + 5 * DAY + 123]) {
      expect(simulateSecond(7, t)).toEqual(simulateSecond(7, t));
    }
    const a = Array.from({ length: 600 }, (_, i) => simulateSecond(7, BASE + 2 * 3600 + i).heartRate);
    const b = Array.from({ length: 600 }, (_, i) => simulateSecond(8, BASE + 2 * 3600 + i).heartRate);
    expect(a).not.toEqual(b);
    expect(simulateSecond(7, BASE + 1000.9)).toEqual(simulateSecond(7, BASE + 1000));
  });

  it('keeps every field in its encodable range over a week', () => {
    for (let t = BASE; t < BASE + 7 * DAY; t += 97) {
      const s = simulateSecond(3, t);
      expect(s.heartRate).toBeGreaterThanOrEqual(40);
      expect(s.heartRate).toBeLessThanOrEqual(180);
      expect(s.rrMs.length).toBeLessThanOrEqual(4);
      for (const rr of s.rrMs) expect(rr).toBeGreaterThanOrEqual(300);
      expect(s.stepCounter).toBeGreaterThanOrEqual(0);
      expect(s.stepCounter).toBeLessThanOrEqual(0xffff);
      expect(s.skinTempC).toBeGreaterThan(30);
      expect(s.skinTempC).toBeLessThan(36);
      expect(s.spo2Byte82 === 0 || s.spo2Byte82 >= 16).toBe(true);
    }
  });

  it('advances the step counter while walking and wraps over days', () => {
    const counters = Array.from({ length: 10 * DAY / 600 }, (_, i) => simulateSecond(5, BASE + i * 600).stepCounter);
    let wrapped = false;
    let advanced = 0;
    for (let i = 1; i < counters.length; i++) {
      const prev = counters[i - 1] ?? 0;
      const cur = counters[i] ?? 0;
      if (cur < prev) wrapped = true;
      if (cur !== prev) advanced += 1;
    }
    expect(wrapped).toBe(true);
    expect(advanced).toBeGreaterThan(100);
    expect(simulateSecond(5, BASE + 3 * 3600).stepCounter).toBe(simulateSecond(5, BASE + 3 * 3600 + 59).stepCounter);
  });

  it('puts SpO2 windows of 30 s every 1200 s into sleep only', () => {
    const rows = Array.from({ length: DAY }, (_, i) => ({ t: BASE + i, ...simulateSecond(9, BASE + i) }));
    const nonZero = rows.filter((r) => r.spo2Byte82 !== 0);
    expect(nonZero.length).toBeGreaterThan(300);
    expect(nonZero.filter((r) => r.bandState === 'SLEEP').length).toBeGreaterThan(nonZero.length * 0.97);
    const starts = new Set(nonZero.map((r) => Math.floor((r.t - 337) / 1200)));
    expect(nonZero.length / starts.size).toBe(30);
    const valid = nonZero.filter((r) => r.spo2Byte82 >= 90 && r.spo2Byte82 <= 100);
    expect(valid.length).toBeGreaterThan(nonZero.length * 0.7);
    expect(nonZero.some((r) => [16, 32, 128, 160].includes(r.spo2Byte82))).toBe(true);
  });

  it.each([1, 7, 42, 2024, 99999])('yields one believable night through the analytics (seed %i)', (seed) => {
    const from = BASE + 18 * 3600 - 3600;
    const rows = samples(seed, from, from + 18 * 3600);
    const nights = groupNights(sleepPeriods(rows));
    expect(nights.length).toBe(1);
    const night = nights[0];
    if (night === undefined) throw new Error('no night');
    expect(night.inBedS).toBeGreaterThan(6 * 3600);
    expect(night.inBedS).toBeLessThan(9 * 3600);
    expect(night.asleepS).toBeGreaterThan(6 * 3600);

    const hrv = nightlyHrv(rows, night);
    expect(hrv.ok).toBe(true);
    if (hrv.ok) {
      expect(hrv.value).toBeGreaterThanOrEqual(20);
      expect(hrv.value).toBeLessThanOrEqual(150);
    }
    const resp = respiratoryRate(rows, night);
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.value).toBeGreaterThanOrEqual(10);
      expect(resp.value).toBeLessThanOrEqual(20);
    }
    const spo2 = nightlySpo2(rows, night);
    expect(spo2.ok).toBe(true);
    if (spo2.ok) {
      expect(spo2.value).toBeGreaterThanOrEqual(93);
      expect(spo2.value).toBeLessThanOrEqual(100);
    }
  });

  it('keeps the night heart rate low and the daytime in range', () => {
    const rows = samples(7, BASE, BASE + 2 * DAY);
    const asleep = rows.filter((r) => r.state === 'SLEEP');
    const hrs = asleep.map((r) => r.hr ?? 0);
    expect(Math.min(...hrs)).toBeGreaterThanOrEqual(46);
    expect(Math.max(...hrs)).toBeLessThanOrEqual(60);
    const workout = rows.filter((r) => (r.hr ?? 0) >= 125);
    expect(workout.length).toBeGreaterThan(0);
    const awake = rows.filter((r) => r.state === 'WAKE' || r.state === 'STILL');
    expect(awake.length).toBeGreaterThan(DAY / 2);
    const temps = asleep.map((r) => r.skinTempC ?? 0);
    expect(Math.min(...temps)).toBeLessThan(32.6);
    expect(Math.max(...temps)).toBeGreaterThan(34);
  });
});
