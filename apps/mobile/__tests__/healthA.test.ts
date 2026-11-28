import type { BodyMeasurement, DayRecord, LabResult, StrengthSession } from '@openhoop/core';

import { PACE_MIN_DAYS, bodyAgeHeadline, latestFitnessAge, latestPhenoAge, paceOfAging, phenoAgeHistory, yearsDifference } from '@/data/bodyAgeDerived';
import { CONTRIBUTOR_IDS, CONTRIBUTOR_WINDOW_DAYS, STEPS_TARGET, bodyAgeContributors, contributorById, statusFor, type ContributorInput } from '@/data/contributors';
import { addDays } from '@/data/derived';
import { createFixtureDays } from '@/data/fixtureSource';
import { FITNESS_LEVELS, fitnessLevel, scalePosition } from '@/data/healthspanDerived';
import type { Profile } from '@/data/types';
import { todayIso } from '@/lib/format';

import { FIXTURE_NOW } from './support/appData';

const days = createFixtureDays(FIXTURE_NOW);
const today = todayIso(FIXTURE_NOW);
const PROFILE: Profile = { birthYear: 1981, maxHeartRate: null };
const NO_AGE: Profile = { birthYear: null, maxHeartRate: null };

const PANEL: ReadonlyArray<Pick<LabResult, 'biomarker' | 'unit' | 'value'>> = [
  { biomarker: 'albumin', unit: 'g/dL', value: 4.3 },
  { biomarker: 'creatinine', unit: 'mg/dL', value: 0.9 },
  { biomarker: 'glucose', unit: 'mg/dL', value: 90 },
  { biomarker: 'crp', unit: 'mg/L', value: 1.5 },
  { biomarker: 'lymphocytePct', unit: '%', value: 30 },
  { biomarker: 'mcv', unit: 'fL', value: 90 },
  { biomarker: 'rdw', unit: '%', value: 13 },
  { biomarker: 'alp', unit: 'U/L', value: 70 },
  { biomarker: 'wbc', unit: '10^3/µL', value: 6 },
];

function panel(day: string, firstId: number, patch: Record<string, number> = {}): LabResult[] {
  return PANEL.map((entry, i) => ({ id: firstId + i, day, refLow: null, refHigh: null, note: null, createdAt: firstId + i, ...entry, value: patch[entry.biomarker] ?? entry.value }));
}

function input(overrides: Partial<ContributorInput> = {}): ContributorInput {
  return { days, profile: PROFILE, sex: 'male', sessions: [], bodyMeasurements: [], today, ...overrides };
}

describe('body age headline', () => {
  it('prefers the blood-test age and never merges the two ages', () => {
    const pheno = latestPhenoAge(panel('2026-11-01', 1), PROFILE);
    const fitness = latestFitnessAge(days, PROFILE, 'male');
    const headline = bodyAgeHeadline(fitness, pheno);
    if (!pheno.result.ok || headline.kind !== 'age') throw new Error('expected a PhenoAge');
    expect(headline.source).toBe('pheno');
    expect(headline.age).toBe(pheno.result.value.phenoAge);
    expect(yearsDifference(headline)).toBeCloseTo(45 - pheno.result.value.phenoAge, 9);
  });

  it('falls back to the fitness age point estimate', () => {
    const fitness = latestFitnessAge(days, PROFILE, 'male');
    const headline = bodyAgeHeadline(fitness, latestPhenoAge([], PROFILE));
    expect(headline.kind === 'age' || headline.kind === 'bound').toBe(true);
    if (headline.kind !== 'none') expect(headline.source).toBe('fitness');
  });

  it('says why there is no body age', () => {
    expect(bodyAgeHeadline(latestFitnessAge(days, NO_AGE, 'male'), latestPhenoAge([], NO_AGE))).toEqual({ kind: 'none', reason: 'no-vo2' });
    expect(bodyAgeHeadline(latestFitnessAge(days, PROFILE, null), latestPhenoAge([], PROFILE))).toEqual({ kind: 'none', reason: 'no-sex' });
  });

  it('has no difference without a known age', () => {
    expect(yearsDifference({ kind: 'age', source: 'fitness', age: 30, ownAge: null, day: null })).toBeNull();
  });
});

describe('pace of aging', () => {
  it('needs two complete blood panels far enough apart', () => {
    const one = phenoAgeHistory(panel('2026-01-10', 1), PROFILE);
    expect(one).toHaveLength(1);
    expect(paceOfAging(one)).toEqual({ ok: false, reason: 'needs-two-draws', draws: 1 });
    const close = phenoAgeHistory([...panel('2026-01-10', 1), ...panel(addDays('2026-01-10', PACE_MIN_DAYS - 10), 20)], PROFILE);
    expect(paceOfAging(close)).toMatchObject({ ok: false, reason: 'too-close' });
  });

  it('divides the change in Phenotypic Age by the calendar time between draws', () => {
    const history = phenoAgeHistory([...panel('2025-11-01', 1), ...panel('2026-11-01', 20, { crp: 0.5 })], PROFILE);
    expect(history).toHaveLength(2);
    const pace = paceOfAging(history);
    if (!pace.ok) throw new Error(pace.reason);
    const [first, last] = history;
    if (first === undefined || last === undefined) throw new Error('history');
    expect(pace.pace).toBeCloseTo((last.phenoAge - first.phenoAge) / (365 / 365.25), 9);
  });

  it('skips draw days whose panel is incomplete or too old', () => {
    const partial = panel('2026-03-01', 40).slice(0, 3);
    expect(phenoAgeHistory([...panel('2025-11-01', 1), ...partial], PROFILE).map((p) => p.day)).toEqual(['2025-11-01']);
  });
});

describe('body age contributors', () => {
  it('lists the nine contributors in order', () => {
    expect(bodyAgeContributors(input()).map((c) => c.id)).toEqual([...CONTRIBUTOR_IDS]);
  });

  it('judges a value against a range or leaves it unjudged', () => {
    expect(statusFor(5, { kind: 'range', low: 7, high: 9, basis: 'adults' })).toBe('below');
    expect(statusFor(8, { kind: 'range', low: 7, high: 9, basis: 'adults' })).toBe('met');
    expect(statusFor(10, { kind: 'range', low: 7, high: null, basis: 'adults' })).toBe('met');
    expect(statusFor(10, { kind: 'range', low: 7, high: 9, basis: 'adults' })).toBe('above');
    expect(statusFor(10, { kind: 'none' })).toBeNull();
  });

  it('uses the step target for the age group and needs an age for it', () => {
    const steps = contributorById(input(), 'steps');
    expect(steps.target).toEqual({ kind: 'range', low: STEPS_TARGET.younger.low, high: STEPS_TARGET.younger.high, basis: 'age' });
    const older = contributorById(input({ profile: { birthYear: 1950, maxHeartRate: null } }), 'steps');
    expect(older.target).toMatchObject({ low: STEPS_TARGET.older.low, high: STEPS_TARGET.older.high });
    const unknown = contributorById(input({ profile: NO_AGE }), 'steps');
    expect(unknown.target).toEqual({ kind: 'none' });
    expect(unknown.targetReason).toBe('no-age');
    expect(unknown.status).toBeNull();
  });

  it('averages zone minutes per worn week and skips today', () => {
    const window = days.filter((d) => d.day >= addDays(today, -CONTRIBUTOR_WINDOW_DAYS) && d.day < today && d.heartRate.avg !== null);
    const seconds = window.reduce((sum, d) => sum + (d.zoneSeconds[4] ?? 0) + (d.zoneSeconds[5] ?? 0), 0);
    const zones = contributorById(input(), 'zones45');
    expect(zones.value).toBeCloseTo((seconds / 60 / window.length) * 7, 9);
    expect(zones.target).toEqual({ kind: 'none' });
    expect(zones.targetReason).toBe('none-published');
  });

  it('says when there are too few days', () => {
    const few: DayRecord[] = days.slice(-3);
    expect(contributorById(input({ days: few }), 'zones13')).toMatchObject({ value: null, reason: 'needs-days' });
    expect(contributorById(input({ days: few }), 'sleepHours')).toMatchObject({ value: null, reason: 'needs-nights' });
  });

  it('counts strength days per week against the WHO two days', () => {
    const session = (id: number, day: string): StrengthSession => ({ id, templateId: null, name: 'Push', day, startedAt: 1000, endedAt: 1000 + 45 * 60, exercises: [], sets: [] });
    const strength = contributorById(input({ sessions: [session(1, addDays(today, -2)), session(2, addDays(today, -9)), session(3, addDays(today, -40))] }), 'strength');
    expect(strength.value).toBeCloseTo(2 / 4, 9);
    expect(strength.minutes).toBeCloseTo(90 / 4, 9);
    expect(strength.status).toBe('below');
    expect(contributorById(input(), 'strength')).toMatchObject({ value: null, reason: 'no-sessions' });
  });

  it('works out lean mass only from a measured body fat', () => {
    const entry = (id: number, bodyFatPct: number | null): BodyMeasurement => ({ id, day: `2026-11-1${id}`, weightKg: 80, bodyFatPct, createdAt: id, source: 'manual', origin: null });
    expect(contributorById(input(), 'leanMass')).toMatchObject({ value: null, reason: 'no-entries' });
    expect(contributorById(input({ bodyMeasurements: [entry(1, null)] }), 'leanMass')).toMatchObject({ value: null, reason: 'no-body-fat' });
    expect(contributorById(input({ bodyMeasurements: [entry(1, 20), entry(2, null)] }), 'leanMass').value).toBeCloseTo(64, 9);
  });

  it('compares VO2 max with the Loe group range and resting heart rate with your own range', () => {
    const vo2 = contributorById(input(), 'vo2max');
    expect(vo2.target).toMatchObject({ kind: 'range', basis: 'ageSex' });
    expect(contributorById(input({ sex: null }), 'vo2max').targetReason).toBe('no-sex');
    const rhr = contributorById(input(), 'restingHr');
    if (rhr.value !== null) expect(rhr.target).toMatchObject({ kind: 'range', basis: 'own' });
  });
});

describe('VO2 max fitness level', () => {
  const men2029 = { sex: 'male' as const, ageFrom: 20, ageTo: 29, mean: 54.4, sd: 8.4, n: 199 };

  it('splits the Loe group into fifths from its mean and SD', () => {
    const view = fitnessLevel(54.4, men2029);
    expect(view.cuts[0]).toBeCloseTo(54.4 - 0.8416212 * 8.4, 6);
    expect(view.cuts[3]).toBeCloseTo(54.4 + 0.8416212 * 8.4, 6);
    expect(view.level).toBe('good');
    expect(fitnessLevel(40, men2029).level).toBe('poor');
    expect(fitnessLevel(view.cuts[0], men2029).level).toBe('fair');
    expect(fitnessLevel(70, men2029).level).toBe('superior');
    expect(FITNESS_LEVELS).toHaveLength(5);
  });

  it('places the marker inside the band of its level', () => {
    const at = (vo2: number): number => scalePosition(vo2, fitnessLevel(vo2, men2029));
    expect(at(54.4)).toBeCloseTo(0.5, 6);
    expect(at(20)).toBe(0);
    expect(at(90)).toBe(1);
    expect(at(48)).toBeGreaterThan(0.2);
    expect(at(48)).toBeLessThan(0.4);
  });
});
