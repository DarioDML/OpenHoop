import type { BodyMeasurement, DayRecord, LabResult, StrengthSession } from '@openhoop/core';

import { PACE_MIN_DAYS, bodyAgeHeadline, fractionalAge, latestFitnessAge, latestPhenoAge, paceFromLabs, paceOfAging, phenoAgeHistory, yearsDifference } from '@/data/bodyAgeDerived';
import { CONTRIBUTOR_IDS, CONTRIBUTOR_WINDOW_DAYS, STEPS_TARGET, bodyAgeContributors, contributorById, contributorScale, statusFor, type ContributorInput } from '@/data/contributors';
import { addDays } from '@/data/derived';
import { createFixtureDays } from '@/data/fixtureSource';
import { FITNESS_LEVELS, fitnessLevel, scalePosition } from '@/data/healthspanDerived';
import { bucketSpo2, hrStats, nearestPoint, pointsIn, restingSeries, tabWindows, windowSpan } from '@/data/heartRateView';
import type { Profile } from '@/data/types';
import { translate } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { contributorSource, contributorStatus, contributorTone, zoneTone } from '@/ui/health/contributorText';
import { bodyAgeCaption } from '@/ui/health/hubTiles';
import { todayIso } from '@/lib/format';

import { FIXTURE_NOW } from './support/appData';

const days = createFixtureDays(FIXTURE_NOW);
const today = todayIso(FIXTURE_NOW);
const PROFILE: Profile = { birthYear: 1981, maxHeartRate: null };
const NO_AGE: Profile = { birthYear: null, maxHeartRate: null };
const BORN: Profile = { birthYear: 1981, maxHeartRate: null, birthDate: '1981-06-15' };

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
    const one = phenoAgeHistory(panel('2026-01-10', 1), BORN);
    expect(one).toHaveLength(1);
    expect(paceOfAging(one)).toEqual({ ok: false, reason: 'needs-two-draws', draws: 1 });
    const close = phenoAgeHistory([...panel('2026-01-10', 1), ...panel(addDays('2026-01-10', PACE_MIN_DAYS - 10), 20)], BORN);
    expect(paceOfAging(close)).toMatchObject({ ok: false, reason: 'too-close' });
  });

  it('divides the change in Phenotypic Age by the calendar time between draws', () => {
    const history = phenoAgeHistory([...panel('2025-11-01', 1), ...panel('2026-11-01', 20, { crp: 0.5 })], BORN);
    expect(history).toHaveLength(2);
    const pace = paceOfAging(history);
    if (!pace.ok) throw new Error(pace.reason);
    const [first, last] = history;
    if (first === undefined || last === undefined) throw new Error('history');
    expect(pace.pace).toBeCloseTo((last.phenoAge - first.phenoAge) / (365 / 365.25), 9);
  });

  it('ages each draw to the day, so a birthday between identical panels does not jump', () => {
    const history = phenoAgeHistory([...panel('2026-05-01', 1), ...panel(addDays('2026-05-01', 181), 20)], BORN);
    const pace = paceOfAging(history);
    if (!pace.ok) throw new Error(pace.reason);
    expect(pace.pace).toBeGreaterThan(0.85);
    expect(pace.pace).toBeLessThan(0.95);
  });

  it('needs a full birth date, not only a birth year', () => {
    expect(paceFromLabs([...panel('2025-11-01', 1), ...panel('2026-11-01', 20)], PROFILE)).toEqual({ ok: false, reason: 'needs-birth-date', draws: 0 });
    expect(paceFromLabs([...panel('2025-11-01', 1), ...panel('2026-11-01', 20)], BORN).ok).toBe(true);
    expect(fractionalAge(BORN, '2026-06-15')).toBeCloseTo((Date.UTC(2026, 5, 15) - Date.UTC(1981, 5, 15)) / 86_400_000 / 365.25, 9);
    expect(fractionalAge(PROFILE, '2026-06-15')).toBeNull();
  });

  it('skips draw days whose panel is incomplete or too old', () => {
    const partial = panel('2026-03-01', 40).slice(0, 3);
    expect(phenoAgeHistory([...panel('2025-11-01', 1), ...partial], BORN).map((p) => p.day)).toEqual(['2025-11-01']);
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

  it('counts every zone towards the WHO minutes, so a zone 4 runner is not below target', () => {
    const hard: DayRecord[] = days.map((d) => ({ ...d, zoneSeconds: [0, 0, 0, 0, 3600, 0] }));
    const mv = contributorById(input({ days: hard }), 'moderateVigorous');
    expect(mv.value).toBeCloseTo(420, 6);
    expect(mv.status).toBe('above');
    expect(contributorById(input({ days: hard }), 'zones45').value).toBeCloseTo(420, 6);
  });

  it('says when there are too few days', () => {
    const few: DayRecord[] = days.slice(-3);
    expect(contributorById(input({ days: few }), 'moderateVigorous')).toMatchObject({ value: null, reason: 'needs-days' });
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

describe('contributor scale', () => {
  const base = { id: 'moderateVigorous' as const, minutes: null, measured: 10, targetReason: null, status: null, reason: null };

  it('puts a two-sided target in the middle third', () => {
    const scale = contributorScale({ ...base, value: 225, target: { kind: 'range', low: 150, high: 300, basis: 'adults' } });
    expect(scale?.segments.map((s) => s.zone)).toEqual(['below', 'target', 'above']);
    expect(scale?.position).toBeCloseTo(0.5, 9);
    expect(contributorScale({ ...base, value: 0, target: { kind: 'range', low: 150, high: 300, basis: 'adults' } })?.position).toBe(0);
  });

  it('uses two halves for an at-least target and nothing without a target', () => {
    const scale = contributorScale({ ...base, id: 'strength', value: 1, target: { kind: 'range', low: 2, high: null, basis: 'adults' } });
    expect(scale?.segments.map((s) => s.zone)).toEqual(['below', 'target']);
    expect(scale?.position).toBeCloseTo(0.25, 9);
    expect(contributorScale({ ...base, value: 20, target: { kind: 'none' } })).toBeNull();
  });
});

describe('heart rate tabs', () => {
  const day = days[days.length - 2];
  if (day === undefined) throw new Error('fixture');

  it('limits sleep and workout tabs to their windows', () => {
    const sleep = tabWindows(day, 'sleep');
    expect(sleep).toEqual(day.sleep.periods.map((p) => ({ from: p.onset, to: p.offset })));
    expect(tabWindows(day, '24h')).toEqual([{ from: day.start, to: day.end }]);
    const points = [
      { t: 100, hr: 50 },
      { t: 200, hr: 90 },
      { t: 300, hr: 70 },
    ];
    expect(pointsIn(points, [{ from: 150, to: 301 }])).toEqual([points[1], points[2]]);
    expect(hrStats(points)).toEqual({ min: 50, max: 90, avg: 70 });
    expect(hrStats([])).toBeNull();
    expect(windowSpan([{ from: 5, to: 9 }, { from: 1, to: 4 }])).toEqual({ from: 1, to: 9 });
    expect(windowSpan([])).toBeNull();
    expect(nearestPoint(points, 240)).toEqual(points[1]);
  });

  it('averages blood oxygen into ten-minute buckets with gaps as null', () => {
    const buckets = bucketSpo2(
      [
        { t: 0, pct: 96 },
        { t: 60, pct: 94 },
        { t: 1300, pct: 97 },
      ],
      0,
      1800,
    );
    expect(buckets).toEqual([95, null, 97]);
    expect(bucketSpo2([], 10, 5)).toEqual([]);
  });

  it('takes resting heart rate of the last nights up to the day', () => {
    const series = restingSeries(days, days.length - 1, 5);
    expect(series).toHaveLength(5);
    expect(series[4]).toBe(days[days.length - 1]?.restingHr.value ?? null);
  });
});

describe('contributor and hub wording', () => {
  const t: TFunction = (key, params) => translate('en', key, params);

  it('treats a resting heart rate below your own range as good and never calls your range a target', () => {
    const rhr = { id: 'restingHr' as const, value: 50, minutes: null, measured: 7, target: { kind: 'range' as const, low: 52, high: 58, basis: 'own' as const }, targetReason: null, status: 'below' as const, reason: null };
    expect(contributorTone(rhr)).toBe('positive');
    expect(contributorTone({ ...rhr, value: 62, status: 'above' })).toBe('warning');
    expect(contributorStatus(rhr, t)).toBe('Below your usual');
    expect(zoneTone(rhr, 'below')).toBe('info');
  });

  it('keeps the hub body age caption to one short line', () => {
    expect(bodyAgeCaption({ kind: 'age', source: 'pheno', age: 40, ownAge: 43.2, day: null }, { t, language: 'en' })).toBe('3.2 years younger');
    expect(bodyAgeCaption({ kind: 'age', source: 'fitness', age: 40, ownAge: null, day: null }, { t, language: 'en' })).toBe('Fitness');
    expect(bodyAgeCaption({ kind: 'none', reason: 'no-vo2' }, { t, language: 'en' })).toBe('Needs VO₂ max');
  });

  it('picks the custom-zone wording for zone contributors', () => {
    expect(contributorSource('moderateVigorous', true)).toBe('health.contrib.moderateVigorous.sourceCustom');
    expect(contributorSource('moderateVigorous', false)).toBe('health.contrib.moderateVigorous.source');
    expect(contributorSource('steps', true)).toBe('health.contrib.steps.source');
  });
});
