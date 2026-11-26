/**
 * Body age, OpenHoop's own methods (parity C). Two separate ages, never merged into one number.
 *
 * Fitness age: the age at which the Loe 2013 norm mean VO2max for the user's sex equals the user's estimate
 * (Loe H, et al. PLoS One 2013;8(5):e64319, Table 2), linear between age-group midpoints (25, 35, ... 75; the open
 * 70+ group is taken as 70-79). Outside that span it is only "younger than 25" or "older than 75". The band applies
 * the VO2max estimate's SEE (Uth 2004, see healthspan.ts) to both sides before converting.
 *
 * Phenotypic Age: Levine ME, Lu AT, Quach A, et al. "An epigenetic biomarker of aging for lifespan and healthspan."
 * Aging 2018;10(4):573-591, Table 1 and supplementary methods. Equations as corrected in Liu Z, et al.
 * PLoS Med 2018;15(12):e1002718, correction PLoS Med 2019;16(2):e1002760.
 *   xb = -19.907 - 0.0336 albumin(g/L) + 0.0095 creatinine(µmol/L) + 0.1953 glucose(mmol/L) + 0.0954 ln CRP(mg/dL)
 *        - 0.0120 lymphocyte(%) + 0.0268 MCV(fL) + 0.3306 RDW(%) + 0.00188 ALP(U/L) + 0.0554 WBC(10^3/µL)
 *        + 0.0804 age(years)
 *   M = 1 - exp(-exp(xb) (exp(120 γ) - 1) / γ), γ = 0.0076927   (10-year mortality score)
 *   PhenoAge = 141.50 + ln(-0.00553 ln(1 - M)) / 0.090165
 * Unrounded constants from the BioAge R package (Kwon D, Belsky DW. GeroScience 2021;43:2795-2808,
 * github.com/dayoonkwon/BioAge, R/phenoage_calc.R, orig = TRUE). The correction notice prints the divisor as
 * 0.09165; 0.090165 is what BioAge uses and what reproduces published calculator output.
 */

import { LOE_2013_NORMS, type NormSex } from './healthspan';

export interface FitnessAnchor {
  age: number;
  mean: number;
}

function midpoint(ageFrom: number, ageTo: number | null): number {
  return (ageFrom + (ageTo ?? ageFrom + 9) + 1) / 2;
}

export function fitnessAnchors(sex: NormSex): FitnessAnchor[] {
  return LOE_2013_NORMS.filter((n) => n.sex === sex)
    .map((n) => ({ age: midpoint(n.ageFrom, n.ageTo), mean: n.mean }))
    .sort((a, b) => a.age - b.age);
}

export type FitnessAgePoint = { kind: 'age'; age: number } | { kind: 'younger-than'; age: number } | { kind: 'older-than'; age: number };

export function fitnessAgeAt(vo2max: number, sex: NormSex): FitnessAgePoint | null {
  const anchors = fitnessAnchors(sex);
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!Number.isFinite(vo2max) || first === undefined || last === undefined) return null;
  if (vo2max > first.mean) return { kind: 'younger-than', age: first.age };
  if (vo2max < last.mean) return { kind: 'older-than', age: last.age };
  for (let i = 1; i < anchors.length; i++) {
    const lo = anchors[i - 1];
    const hi = anchors[i];
    if (lo === undefined || hi === undefined || vo2max < hi.mean) continue;
    const fraction = (lo.mean - vo2max) / (lo.mean - hi.mean);
    return { kind: 'age', age: lo.age + fraction * (hi.age - lo.age) };
  }
  return { kind: 'age', age: last.age };
}

export interface FitnessAge {
  sex: NormSex;
  vo2max: number;
  seeMlKgMin: number;
  point: FitnessAgePoint;
  younger: FitnessAgePoint;
  older: FitnessAgePoint;
}

export function fitnessAge(vo2max: number, seeMlKgMin: number, sex: NormSex): FitnessAge | null {
  if (!Number.isFinite(seeMlKgMin) || seeMlKgMin < 0) return null;
  const point = fitnessAgeAt(vo2max, sex);
  const younger = fitnessAgeAt(vo2max + seeMlKgMin, sex);
  const older = fitnessAgeAt(vo2max - seeMlKgMin, sex);
  if (point === null || younger === null || older === null) return null;
  return { sex, vo2max, seeMlKgMin, point, younger, older };
}

export const PHENO_AGE = {
  intercept: -19.90667,
  albuminGL: -0.03359355,
  creatinineUmolL: 0.009506491,
  glucoseMmolL: 0.1953192,
  lnCrpMgDl: 0.09536762,
  lymphocytePct: -0.01199984,
  mcvFl: 0.02676401,
  rdwPct: 0.3306156,
  alpUL: 0.001868778,
  wbc10e3PerUl: 0.05542406,
  ageYears: 0.08035356,
  gamma: 0.007692696,
  horizonMonths: 120,
  transformOffset: 141.50225,
  transformScale: 0.0055305,
  transformRate: 0.090165,
} as const;

export interface PhenoAgeInputs {
  albuminGL: number;
  creatinineUmolL: number;
  glucoseMmolL: number;
  crpMgDl: number;
  lymphocytePct: number;
  mcvFl: number;
  rdwPct: number;
  alpUL: number;
  wbc10e3PerUl: number;
  ageYears: number;
}

export interface PhenoAgeEstimate {
  phenoAge: number;
  mortalityScore: number;
  linearPredictor: number;
}

export type PhenoAgeReason = 'crp-not-positive' | 'invalid-input' | 'out-of-range';

export type PhenoAgeResult = { ok: true; value: PhenoAgeEstimate } | { ok: false; reason: PhenoAgeReason };

const PERCENT_INPUTS: ReadonlyArray<keyof PhenoAgeInputs> = ['lymphocytePct', 'rdwPct'];

export function phenotypicAge(inputs: PhenoAgeInputs): PhenoAgeResult {
  if (!Number.isFinite(inputs.crpMgDl) || inputs.crpMgDl <= 0) return { ok: false, reason: 'crp-not-positive' };
  const keys = Object.keys(inputs) as Array<keyof PhenoAgeInputs>;
  if (keys.some((key) => !Number.isFinite(inputs[key]) || inputs[key] <= 0 || (PERCENT_INPUTS.includes(key) && inputs[key] > 100))) {
    return { ok: false, reason: 'invalid-input' };
  }
  const c = PHENO_AGE;
  const xb =
    c.intercept +
    c.albuminGL * inputs.albuminGL +
    c.creatinineUmolL * inputs.creatinineUmolL +
    c.glucoseMmolL * inputs.glucoseMmolL +
    c.lnCrpMgDl * Math.log(inputs.crpMgDl) +
    c.lymphocytePct * inputs.lymphocytePct +
    c.mcvFl * inputs.mcvFl +
    c.rdwPct * inputs.rdwPct +
    c.alpUL * inputs.alpUL +
    c.wbc10e3PerUl * inputs.wbc10e3PerUl +
    c.ageYears * inputs.ageYears;
  const cumulativeHazard = (Math.exp(xb) * Math.expm1(c.horizonMonths * c.gamma)) / c.gamma;
  const mortalityScore = -Math.expm1(-cumulativeHazard);
  const phenoAge = c.transformOffset + Math.log(c.transformScale * cumulativeHazard) / c.transformRate;
  if (!Number.isFinite(phenoAge) || !(mortalityScore > 0 && mortalityScore < 1)) return { ok: false, reason: 'out-of-range' };
  return { ok: true, value: { phenoAge, mortalityScore, linearPredictor: xb } };
}
