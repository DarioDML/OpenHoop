import { describe, expect, it } from 'vitest';
import { PHENO_AGE, UTH_SEE_ML_KG_MIN, fitnessAge, fitnessAgeAt, fitnessAnchors, phenotypicAge } from '../src';
import type { PhenoAgeInputs } from '../src';

describe('fitness age from the Loe 2013 norms', () => {
  it('anchors each age group at its midpoint, the open 70+ group at 75', () => {
    expect(fitnessAnchors('male').map((a) => a.age)).toEqual([25, 35, 45, 55, 65, 75]);
    expect(fitnessAnchors('female')[0]).toEqual({ age: 25, mean: 43.0 });
  });

  it('returns the midpoint age when the estimate equals a group mean', () => {
    expect(fitnessAgeAt(47.2, 'male')).toEqual({ kind: 'age', age: 45 });
    expect(fitnessAgeAt(34.4, 'female')).toEqual({ kind: 'age', age: 55 });
  });

  it('interpolates linearly between midpoints', () => {
    const point = fitnessAgeAt(45, 'male');
    expect(point?.kind).toBe('age');
    expect(point?.age).toBeCloseTo(45 + (10 * (47.2 - 45)) / (47.2 - 42.6), 9);
  });

  it('only says younger or older outside the norm span', () => {
    expect(fitnessAgeAt(60, 'male')).toEqual({ kind: 'younger-than', age: 25 });
    expect(fitnessAgeAt(20, 'female')).toEqual({ kind: 'older-than', age: 75 });
    expect(fitnessAgeAt(Number.NaN, 'male')).toBeNull();
  });

  it('turns the estimate error into an age band', () => {
    const result = fitnessAge(42.6, UTH_SEE_ML_KG_MIN.setting, 'male');
    expect(result?.point).toEqual({ kind: 'age', age: 55 });
    expect(result?.younger.age).toBeCloseTo(45 + (10 * (47.2 - 45.3)) / (47.2 - 42.6), 9);
    expect(result?.older.age).toBeCloseTo(55 + (10 * (42.6 - 39.9)) / (42.6 - 39.2), 9);
    expect(fitnessAge(42.6, -1, 'male')).toBeNull();
  });
});

const CALCULATOR_EXAMPLE: PhenoAgeInputs = {
  albuminGL: 43,
  creatinineUmolL: 0.9 * 88.42,
  glucoseMmolL: 90 / 18.016,
  crpMgDl: 0.15,
  lymphocytePct: 30,
  mcvFl: 90,
  rdwPct: 13,
  alpUL: 70,
  wbc10e3PerUl: 6,
  ageYears: 45,
};

describe('Levine Phenotypic Age', () => {
  it('reproduces the published calculator example (38.6 years, 10-year mortality 1.7%)', () => {
    const result = phenotypicAge(CALCULATOR_EXAMPLE);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.phenoAge).toBeGreaterThan(38.45);
    expect(result.value.phenoAge).toBeLessThan(38.65);
    expect(result.value.mortalityScore).toBeCloseTo(0.0166, 3);
  });

  it('matches a hand calculation with the unrounded BioAge constants', () => {
    const inputs: PhenoAgeInputs = { ...CALCULATOR_EXAMPLE, albuminGL: 45, creatinineUmolL: 80, glucoseMmolL: 5, crpMgDl: 0.1, ageYears: 40 };
    const result = phenotypicAge(inputs);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.linearPredictor).toBeCloseTo(-9.87658681016632, 9);
    expect(result.value.mortalityScore).toBeCloseTo(0.01007864786815782, 9);
    expect(result.value.phenoAge).toBeCloseTo(32.926277040559796, 6);
  });

  it('uses exp(120 γ) - 1 ≈ 1.51714 from the corrected equation', () => {
    expect(Math.expm1(PHENO_AGE.horizonMonths * PHENO_AGE.gamma)).toBeCloseTo(1.51714, 5);
  });

  it('rises with age and with CRP', () => {
    const base = phenotypicAge(CALCULATOR_EXAMPLE);
    const older = phenotypicAge({ ...CALCULATOR_EXAMPLE, ageYears: 55 });
    const inflamed = phenotypicAge({ ...CALCULATOR_EXAMPLE, crpMgDl: 1.5 });
    if (!base.ok || !older.ok || !inflamed.ok) throw new Error('expected estimates');
    expect(older.value.phenoAge).toBeGreaterThan(base.value.phenoAge);
    expect(inflamed.value.phenoAge).toBeGreaterThan(base.value.phenoAge);
  });

  it('refuses a CRP of zero instead of taking ln(0), and other impossible inputs', () => {
    expect(phenotypicAge({ ...CALCULATOR_EXAMPLE, crpMgDl: 0 })).toEqual({ ok: false, reason: 'crp-not-positive' });
    expect(phenotypicAge({ ...CALCULATOR_EXAMPLE, lymphocytePct: 120 })).toEqual({ ok: false, reason: 'invalid-input' });
    expect(phenotypicAge({ ...CALCULATOR_EXAMPLE, albuminGL: Number.NaN })).toEqual({ ok: false, reason: 'invalid-input' });
  });
});
