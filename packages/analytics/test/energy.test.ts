import { describe, expect, it } from 'vitest';
import {
  ALGO,
  ENERGY_MIN_MEASURED_MINUTES,
  activeMinutes,
  activeThresholdBpm,
  dailyEnergy,
  keytelKcalPerMinute,
  parseActiveMinutes,
  restingKcalPerDay,
} from '../src';
import type { ActiveMinutes, BodyProfile } from '../src';

const MAN: BodyProfile = { weightKg: 80, heightCm: 180, sex: 'male', ageYears: 35 };
const WOMAN: BodyProfile = { weightKg: 60, heightCm: 165, sex: 'female', ageYears: 30 };

function day(activeHr: ActiveMinutes['activeHr'], measuredMinutes = 1440, totalMinutes = 1440): ActiveMinutes {
  return { totalMinutes, measuredMinutes, thresholdBpm: 112, activeHr };
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
  it('uses 40 % of heart rate reserve as the active threshold', () => {
    expect(activeThresholdBpm(60, 190)).toBeCloseTo(112, 9);
    expect(activeThresholdBpm(60, 60)).toBeNull();
    expect(activeThresholdBpm(Number.NaN, 190)).toBeNull();
  });

  it('counts measured minutes and bins only minutes at or above the threshold', () => {
    const minutes = activeMinutes([null, 70, 111.9, 112, 120.4, 120.2, null, 150.6], 60, 190);
    expect(minutes).toEqual({
      totalMinutes: 8,
      measuredMinutes: 6,
      thresholdBpm: 112,
      activeHr: [
        { bpm: 112, minutes: 1 },
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

describe('worked examples end to end', () => {
  it('turns a minute series with gaps into a female day estimate', () => {
    const series: (number | null)[] = [...Array<number>(600).fill(62), ...Array<null>(240).fill(null), ...Array<number>(30).fill(150), ...Array<number>(570).fill(70)];
    const minutes = activeMinutes(series, 60, 190);
    expect(minutes).toMatchObject({ totalMinutes: 1440, measuredMinutes: 1200, thresholdBpm: 112 });
    const result = dailyEnergy(minutes, WOMAN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const femaleKcal = (-20.4022 + 0.4472 * 150 - 0.1263 * 60 + 0.074 * 30) / 4.184;
    expect(femaleKcal).toBeCloseTo(9.8757, 4);
    const restPerMinute = 1320.25 / 1440;
    expect(result.value.activeKcal).toBeCloseTo(30 * (femaleKcal - restPerMinute), 9);
    expect(result.value.totalKcal).toBeCloseTo(1320.25 + 30 * (femaleKcal - restPerMinute), 9);
    expect(result.value.totalKcal).toBeCloseTo(1589.01, 1);
    expect(result.coverage).toBeCloseTo(1200 / 1440, 9);
  });

  it('averages both equations for sex other in the day total', () => {
    const other: BodyProfile = { ...MAN, sex: 'other' };
    const result = dailyEnergy(day([{ bpm: 140, minutes: 60 }]), other);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const male = 13.4304;
    const female = (-20.4022 + 0.4472 * 140 - 0.1263 * 80 + 0.074 * 35) / 4.184;
    const rest = 1672;
    expect(result.value.restingKcal).toBeCloseTo(rest, 9);
    expect(result.value.activeKcal).toBeCloseTo(60 * ((male + female) / 2 - rest / 1440), 2);
  });
});

describe('parseActiveMinutes', () => {
  const valid = { totalMinutes: 1440, measuredMinutes: 1300, thresholdBpm: 99, activeHr: [{ bpm: 120, minutes: 30 }] };

  it('accepts a well formed stored value', () => {
    expect(parseActiveMinutes(valid)).toEqual(valid);
  });

  it('rejects missing, malformed or inconsistent values', () => {
    expect(parseActiveMinutes(undefined)).toBeNull();
    expect(parseActiveMinutes(null)).toBeNull();
    expect(parseActiveMinutes('1440')).toBeNull();
    expect(parseActiveMinutes({ ...valid, totalMinutes: '1440' })).toBeNull();
    expect(parseActiveMinutes({ ...valid, measuredMinutes: 1500 })).toBeNull();
    expect(parseActiveMinutes({ ...valid, thresholdBpm: Number.NaN })).toBeNull();
    expect(parseActiveMinutes({ ...valid, activeHr: [{ bpm: 120 }] })).toBeNull();
    expect(parseActiveMinutes({ ...valid, activeHr: [{ bpm: -5, minutes: 3 }] })).toBeNull();
    expect(parseActiveMinutes({ ...valid, activeHr: [{ bpm: 120, minutes: 1301 }] })).toBeNull();
  });
});
