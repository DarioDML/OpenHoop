import { describe, expect, it } from 'vitest';
import {
  ALGO,
  ENERGY_MIN_MEASURED_MINUTES,
  activeMinutes,
  activeThresholdBpm,
  dailyEnergy,
  keytelKcalPerMinute,
  restingKcalPerDay,
} from '../src';
import type { ActiveMinutes, BodyProfile } from '../src';

const MAN: BodyProfile = { weightKg: 80, heightCm: 180, sex: 'male', ageYears: 35 };
const WOMAN: BodyProfile = { weightKg: 60, heightCm: 165, sex: 'female', ageYears: 30 };

function day(activeHr: ActiveMinutes['activeHr'], measuredMinutes = 1440, totalMinutes = 1440): ActiveMinutes {
  return { totalMinutes, measuredMinutes, thresholdBpm: 96, activeHr };
}

describe('Mifflin-St Jeor resting energy', () => {
  it('matches the published equation for a man and a woman', () => {
    expect(restingKcalPerDay(MAN)).toBeCloseTo(10 * 80 + 6.25 * 180 - 5 * 35 + 5, 9);
    expect(restingKcalPerDay(MAN)).toBeCloseTo(1755, 9);
    expect(restingKcalPerDay(WOMAN)).toBeCloseTo(10 * 60 + 6.25 * 165 - 5 * 30 - 161, 9);
    expect(restingKcalPerDay(WOMAN)).toBeCloseTo(1320.25, 9);
  });

  it('averages both sex constants for other', () => {
    expect(restingKcalPerDay({ ...MAN, sex: 'other' })).toBeCloseTo(1755 - 83, 9);
  });
});

describe('Keytel 2005 heart rate equations without VO2max', () => {
  it('gives kJ/min from the published coefficients, converted to kcal', () => {
    const maleKj = -55.0969 + 0.6309 * 140 + 0.1988 * 80 + 0.2017 * 35;
    expect(maleKj).toBeCloseTo(56.1926, 4);
    expect(keytelKcalPerMinute(140, MAN)).toBeCloseTo(maleKj / 4.184, 9);
    expect(keytelKcalPerMinute(140, MAN)).toBeCloseTo(13.4304, 4);

    const femaleKj = -20.4022 + 0.4472 * 140 - 0.1263 * 60 + 0.074 * 30;
    expect(femaleKj).toBeCloseTo(36.8478, 4);
    expect(keytelKcalPerMinute(140, WOMAN)).toBeCloseTo(femaleKj / 4.184, 9);
  });

  it('averages the male and female equations for other', () => {
    const body: BodyProfile = { ...MAN, sex: 'other' };
    const expected = (keytelKcalPerMinute(150, MAN) + keytelKcalPerMinute(150, { ...MAN, sex: 'female' })) / 2;
    expect(keytelKcalPerMinute(150, body)).toBeCloseTo(expected, 12);
  });
});

describe('active minutes', () => {
  it('uses 30 % of heart rate reserve as the active threshold', () => {
    expect(activeThresholdBpm(60, 190)).toBeCloseTo(99, 9);
    expect(activeThresholdBpm(60, 60)).toBeNull();
    expect(activeThresholdBpm(Number.NaN, 190)).toBeNull();
  });

  it('counts measured minutes and bins only minutes at or above the threshold', () => {
    const minutes = activeMinutes([null, 70, 98.9, 99, 120.4, 120.2, null, 150.6], 60, 190);
    expect(minutes).toEqual({
      totalMinutes: 8,
      measuredMinutes: 6,
      thresholdBpm: 99,
      activeHr: [
        { bpm: 99, minutes: 1 },
        { bpm: 120, minutes: 2 },
        { bpm: 151, minutes: 1 },
      ],
    });
  });

  it('is null when rest and max do not define a reserve', () => {
    expect(activeMinutes([120], 180, 170)).toBeNull();
  });
});

describe('daily energy', () => {
  it('adds Keytel energy above rest for active minutes to a full day of resting energy', () => {
    const result = dailyEnergy(day([{ bpm: 140, minutes: 60 }]), MAN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restPerMinute = 1755 / 1440;
    const active = 60 * (keytelKcalPerMinute(140, MAN) - restPerMinute);
    expect(result.value.restingKcal).toBeCloseTo(1755, 9);
    expect(result.value.activeKcal).toBeCloseTo(active, 9);
    expect(result.value.activeKcal).toBeCloseTo(732.70, 1);
    expect(result.value.totalKcal).toBeCloseTo(1755 + active, 9);
    expect(result.value.activeMinutes).toBe(60);
    expect(result.coverage).toBe(1);
    expect(result.algo).toBe(ALGO.energy);
  });

  it('is only resting energy on a day without active minutes', () => {
    const result = dailyEnergy(day([]), WOMAN);
    expect(result.ok && result.value.totalKcal).toBeCloseTo(1320.25, 9);
    expect(result.ok && result.value.activeKcal).toBe(0);
  });

  it('never counts an active minute below rest', () => {
    const heavy: BodyProfile = { weightKg: 150, heightCm: 165, sex: 'female', ageYears: 20 };
    expect(keytelKcalPerMinute(95, heavy)).toBeLessThan(restingKcalPerDay(heavy) / 1440);
    const result = dailyEnergy(day([{ bpm: 95, minutes: 30 }]), heavy);
    expect(result.ok && result.value.activeKcal).toBe(0);
    expect(result.ok && result.value.totalKcal).toBeCloseTo(restingKcalPerDay(heavy), 9);
  });

  it('scales resting energy to the length of the day window', () => {
    const result = dailyEnergy(day([], 720, 720), MAN);
    expect(result.ok && result.value.restingKcal).toBeCloseTo(1755 / 2, 9);
  });

  it('counts heart rate gaps as rest and reports the coverage', () => {
    const result = dailyEnergy(day([{ bpm: 140, minutes: 60 }], 1000), MAN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.restingKcal).toBeCloseTo(1755, 9);
    expect(result.coverage).toBeCloseTo(1000 / 1440, 9);
  });

  it('refuses a day with too little heart rate', () => {
    expect(dailyEnergy(day([], ENERGY_MIN_MEASURED_MINUTES - 1), MAN)).toEqual({ ok: false, reason: 'low-coverage', algo: ALGO.energy });
    expect(dailyEnergy(day([], 0), MAN)).toEqual({ ok: false, reason: 'no-data', algo: ALGO.energy });
    expect(dailyEnergy(null, MAN)).toEqual({ ok: false, reason: 'missing-signal', algo: ALGO.energy });
  });

  it('refuses without a usable body profile', () => {
    expect(dailyEnergy(day([]), null)).toEqual({ ok: false, reason: 'no-profile', algo: ALGO.energy });
    expect(dailyEnergy(day([]), { ...MAN, ageYears: 15 })).toEqual({ ok: false, reason: 'no-profile', algo: ALGO.energy });
    expect(dailyEnergy(day([]), { ...MAN, weightKg: Number.NaN })).toEqual({ ok: false, reason: 'no-profile', algo: ALGO.energy });
  });
});
