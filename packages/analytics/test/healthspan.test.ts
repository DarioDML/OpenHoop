import { describe, expect, it } from 'vitest';
import {
  LOE_2013_NORMS,
  UTH_SEE_ML_KG_MIN,
  VO2_MIN_NIGHTS,
  activityPillar,
  compareToOwnBaseline,
  compareVo2ToNorm,
  estimateVo2max,
  median,
  sleepPillar,
  tanakaMaxHr,
  uthVo2max,
  vo2Norm,
} from '../src';
import type { SleepNightInput } from '../src';

const nights = (value: number, count: number): number[] => Array.from({ length: count }, () => value);

describe('Tanaka age-predicted maximum heart rate', () => {
  it('is 208 - 0.7 × age', () => {
    expect(tanakaMaxHr(40)).toBeCloseTo(180, 9);
    expect(tanakaMaxHr(20)).toBeCloseTo(194, 9);
  });
});

describe('Uth heart rate ratio VO2 max', () => {
  it('worked example: HRmax 180, resting 60 gives 15.3 × 3 = 45.9 mL/kg/min', () => {
    expect(uthVo2max(180, 60)).toBeCloseTo(45.9, 9);
  });

  it('uses the median resting heart rate and Tanaka when no maximum is set', () => {
    const result = estimateVo2max({ restingHrs: [50, 52, 54, 56, 90, null, 55], maxHrSetting: null, ageYears: 40 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inputs).toEqual({ restingHr: 54.5, nights: 6, maxHr: 180, maxHrSource: 'age', ageYears: 40 });
    expect(result.value.vo2max).toBeCloseTo((15.3 * 180) / 54.5, 9);
    expect(result.value.seeMlKgMin).toBe(UTH_SEE_ML_KG_MIN.age);
  });

  it('prefers the maximum heart rate setting and its smaller published error', () => {
    const result = estimateVo2max({ restingHrs: nights(50, 7), maxHrSetting: 190, ageYears: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.vo2max).toBeCloseTo(58.14, 9);
    expect(result.value.inputs.maxHrSource).toBe('setting');
    expect(result.value.seeMlKgMin).toBe(UTH_SEE_ML_KG_MIN.setting);
  });

  it('gives a reason instead of a number without enough nights', () => {
    expect(estimateVo2max({ restingHrs: nights(55, VO2_MIN_NIGHTS - 1), maxHrSetting: null, ageYears: 40 })).toEqual({
      ok: false,
      reason: 'no-resting-hr',
      nights: VO2_MIN_NIGHTS - 1,
    });
  });

  it('ignores implausible resting values when counting nights', () => {
    const result = estimateVo2max({ restingHrs: [...nights(55, 4), 10, 200, Number.NaN], maxHrSetting: null, ageYears: 40 });
    expect(result).toEqual({ ok: false, reason: 'no-resting-hr', nights: 4 });
  });

  it('needs an age or a maximum setting', () => {
    expect(estimateVo2max({ restingHrs: nights(55, 7), maxHrSetting: null, ageYears: null })).toEqual({ ok: false, reason: 'no-max-hr', nights: 7 });
    expect(estimateVo2max({ restingHrs: nights(55, 7), maxHrSetting: null, ageYears: 12 })).toEqual({ ok: false, reason: 'no-max-hr', nights: 7 });
  });

  it('falls back to age when the setting is outside a plausible range', () => {
    const result = estimateVo2max({ restingHrs: nights(60, 7), maxHrSetting: 400, ageYears: 40 });
    expect(result.ok && result.value.inputs.maxHrSource).toBe('age');
  });

  it('refuses results outside a plausible range', () => {
    expect(estimateVo2max({ restingHrs: nights(30, 7), maxHrSetting: 220, ageYears: null })).toEqual({ ok: false, reason: 'out-of-range', nights: 7 });
  });
});

describe('Loe 2013 reference data', () => {
  it('holds Table 2 per sex and decade', () => {
    expect(LOE_2013_NORMS).toHaveLength(12);
    expect(vo2Norm('male', 35)).toMatchObject({ mean: 49.1, sd: 7.5 });
    expect(vo2Norm('female', 29.9)).toMatchObject({ mean: 43.0, sd: 7.7 });
    expect(vo2Norm('female', 85)).toMatchObject({ ageFrom: 70, mean: 28.3 });
    expect(vo2Norm('male', 19)).toBeNull();
  });

  it('worked example: 45.9 for a 40-year-old man is within 47.2 ± 7.7', () => {
    const comparison = compareVo2ToNorm(45.9, 'male', 40);
    expect(comparison?.position).toBe('within');
    expect(comparison?.deltaSd).toBeCloseTo((45.9 - 47.2) / 7.7, 9);
    expect(compareVo2ToNorm(56, 'female', 45)?.position).toBe('above');
    expect(compareVo2ToNorm(25, 'female', 45)?.position).toBe('below');
  });
});

describe('median', () => {
  it('handles odd, even and empty input', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([null])).toBeNull();
  });
});

describe('sleep pillar', () => {
  const night = (hours: number, needHours: number | null, consistency: number | null = 80): SleepNightInput => ({
    asleepS: hours * 3600,
    needS: needHours === null ? null : needHours * 3600,
    consistency,
  });

  it('worked example: 7 nights of 6.5 h against 8 h need is 81 % and below the 7 h reference', () => {
    const pillar = sleepPillar(Array.from({ length: 7 }, () => night(6.5, 8)));
    expect(pillar?.meanAsleepS).toBe(6.5 * 3600);
    expect(pillar?.needRatio).toBeCloseTo(6.5 / 8, 9);
    expect(pillar?.meanConsistency).toBe(80);
    expect(pillar?.meetsReference).toBe(false);
  });

  it('meets the reference at 7 hours and leaves out need when too few nights have one', () => {
    const pillar = sleepPillar([night(7, null), night(7.5, null), night(7, 8), night(7.5, null)]);
    expect(pillar?.meetsReference).toBe(true);
    expect(pillar?.needRatio).toBeNull();
    expect(pillar?.meanNeedS).toBeNull();
  });

  it('is null with fewer than four nights', () => {
    expect(sleepPillar([night(8, 8), night(8, 8), night(8, 8), { asleepS: null, needS: null, consistency: null }])).toBeNull();
  });
});

describe('own baseline comparison', () => {
  it('worked example: a recent HRV mean of 40 against 50 ± 5 is below', () => {
    const comparison = compareToOwnBaseline([45, 50, 55, 45, 55, 50], [40, 41, 39]);
    expect(comparison?.recentMean).toBe(40);
    expect(comparison?.baselineMean).toBe(50);
    expect(comparison?.position).toBe('below');
  });

  it('needs three recent and four baseline nights', () => {
    expect(compareToOwnBaseline([50, 50, 50], [50, 50, 50])).toBeNull();
    expect(compareToOwnBaseline([50, 51, 49, 50], [50, null])).toBeNull();
  });
});

describe('activity pillar', () => {
  const day = (activeMinutes: number, measuredMinutes = 1200) => ({ activeMinutes, measuredMinutes });

  it('worked example: 7 full days of 25 minutes is 175, inside the WHO 150-300 range', () => {
    expect(activityPillar(Array.from({ length: 7 }, () => day(25)))).toEqual({ activeMinutes: 175, measuredDays: 7, fullDays: 7, status: 'in-range' });
  });

  it('only says below when the whole week was measured', () => {
    expect(activityPillar(Array.from({ length: 7 }, () => day(10)))?.status).toBe('below');
    expect(activityPillar([...Array.from({ length: 6 }, () => day(10)), null])?.status).toBe('incomplete');
    expect(activityPillar([...Array.from({ length: 6 }, () => day(10)), day(10, 300)])?.status).toBe('incomplete');
  });

  it('reaches the range early and goes above it past 300 minutes', () => {
    expect(activityPillar([day(160, 300), null])?.status).toBe('in-range');
    expect(activityPillar([day(200), day(120)])?.status).toBe('above-range');
    expect(activityPillar([null, null])).toBeNull();
  });
});
