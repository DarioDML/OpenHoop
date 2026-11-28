import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LabResult } from '@openhoop/core';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { PHENO_MARKERS, PHENO_WINDOW_DAYS, fitnessBand, latestFitnessAge, latestPhenoAge } from '@/data/bodyAgeDerived';
import { createFixtureDays } from '@/data/fixtureSource';
import { CATALOGUE } from '@/data/healthDerived';
import { latestVo2 } from '@/data/healthspanDerived';
import type { Profile } from '@/data/types';
import { defaultUserData, type UserData } from '@/data/userData';
import { CLOUD_CLEAR, cloudClearWidth, cloudDots } from '@/ui/health/DotCloud';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import BodyAgeScreen from '@/app/health/body-age';

const days = createFixtureDays(FIXTURE_NOW);
const PROFILE: Profile = { birthYear: 1981, maxHeartRate: null };
const MAN: UserData = { ...defaultUserData(), onboardingDone: true, sex: 'male' };

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

function panel(day = '2026-11-01', patch: Record<string, Partial<LabResult>> = {}): LabResult[] {
  return PANEL.map((entry, i) => ({ id: i + 1, day, refLow: null, refHigh: null, note: null, createdAt: i + 1, ...entry, ...patch[entry.biomarker] }));
}

describe('fitness age data', () => {
  it('turns the VO2 max estimate into a band with the estimate error', () => {
    const vo2 = latestVo2(days, PROFILE, 'male');
    const view = latestFitnessAge(days, PROFILE, 'male');
    if (!vo2.result.ok || view.fitness === null) throw new Error('fixture should give an estimate');
    expect(view.fitness.vo2max).toBeCloseTo(vo2.result.value.vo2max, 9);
    expect(view.fitness.seeMlKgMin).toBe(4.7);
    expect(view.ageYears).toBe(45);
  });

  it('needs a sex the norms are published for', () => {
    expect(latestFitnessAge(days, PROFILE, null)).toMatchObject({ fitness: null, reason: 'no-sex' });
    expect(latestFitnessAge(days, PROFILE, 'other')).toMatchObject({ fitness: null, reason: 'other-sex' });
    expect(latestFitnessAge(days, { birthYear: null, maxHeartRate: null }, 'male')).toMatchObject({ fitness: null, vo2: { ok: false, reason: 'no-max-hr' } });
  });

  it('describes open-ended bands', () => {
    const base = { sex: 'male' as const, vo2max: 50, seeMlKgMin: 4.7, point: { kind: 'age' as const, age: 33 } };
    expect(fitnessBand({ ...base, younger: { kind: 'age', age: 25 }, older: { kind: 'age', age: 45 } })).toEqual({ kind: 'range', low: 25, high: 45 });
    expect(fitnessBand({ ...base, younger: { kind: 'younger-than', age: 25 }, older: { kind: 'age', age: 40 } })).toEqual({ kind: 'below', age: 40 });
    expect(fitnessBand({ ...base, younger: { kind: 'age', age: 70 }, older: { kind: 'older-than', age: 75 } })).toEqual({ kind: 'above', age: 70 });
    expect(fitnessBand({ ...base, younger: { kind: 'younger-than', age: 25 }, older: { kind: 'older-than', age: 75 } })).toEqual({ kind: 'wide', low: 25, high: 75 });
  });
});

describe('Phenotypic Age data', () => {
  it('converts every marker to the paper units and reproduces the calculator example', () => {
    const view = latestPhenoAge(panel(), PROFILE);
    if (!view.result.ok) throw new Error(view.result.reason);
    const crp = view.markers.find((m) => m.id === 'crp');
    expect(crp?.value).toBeCloseTo(0.15, 9);
    expect(view.markers.find((m) => m.id === 'creatinine')?.value).toBeCloseTo(0.9 * 88.42, 9);
    expect(view.markers.find((m) => m.id === 'albumin')?.value).toBeCloseTo(43, 9);
    expect(view.ageYears).toBe(45);
    expect(view.result.value.phenoAge).toBeGreaterThan(38.45);
    expect(view.result.value.phenoAge).toBeLessThan(38.65);
    expect(view).toMatchObject({ newestDay: '2026-11-01', oldestDay: '2026-11-01' });
  });

  it('uses the newest value of each marker', () => {
    const older = panel('2026-06-01').map((r) => ({ ...r, id: r.id + 100, value: r.value * 2 }));
    const view = latestPhenoAge([...older, ...panel()], PROFILE);
    expect(view.markers.find((m) => m.id === 'mcv')?.value).toBe(90);
  });

  it('lists missing and stale markers instead of computing', () => {
    const results = panel().filter((r) => r.biomarker !== 'rdw');
    const stale = results.map((r) => (r.biomarker === 'alp' ? { ...r, day: '2026-07-01' } : r));
    const view = latestPhenoAge(stale, PROFILE);
    expect(view.result).toEqual({ ok: false, reason: 'incomplete' });
    expect(view.markers.find((m) => m.id === 'rdw')?.status).toBe('missing');
    expect(view.markers.find((m) => m.id === 'alp')?.status).toBe('stale');
    expect(view.markers.filter((m) => m.status === 'ok')).toHaveLength(PHENO_MARKERS.length - 2);
  });

  it('accepts markers exactly at the edge of the window', () => {
    const view = latestPhenoAge(panel('2026-11-01', { alp: { day: '2026-08-03' } }), PROFILE);
    expect(PHENO_WINDOW_DAYS).toBe(90);
    expect(view.result.ok).toBe(true);
    expect(view.oldestDay).toBe('2026-08-03');
  });

  it('refuses a CRP of 0 and asks for an age', () => {
    expect(latestPhenoAge(panel('2026-11-01', { crp: { value: 0 } }), PROFILE).result).toEqual({ ok: false, reason: 'crp-not-positive' });
    expect(latestPhenoAge(panel(), { birthYear: null, maxHeartRate: null }).result).toEqual({ ok: false, reason: 'no-age' });
  });

  it('reports a unit that cannot be converted', () => {
    const view = latestPhenoAge(panel('2026-11-01', { mcv: { unit: 'µm³' } }), PROFILE);
    expect(view.markers.find((m) => m.id === 'mcv')?.status).toBe('unit');
  });

  it('marks body age as level C in the metric catalogue', () => {
    expect(CATALOGUE.find((entry) => entry.id === 'bodyAge')?.level).toBe('C');
  });
});

describe('Body age screen', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows two separate cards with the fitness band and the Phenotypic Age', async () => {
    const pheno = latestPhenoAge(panel(), PROFILE);
    if (!pheno.result.ok) throw new Error(pheno.result.reason);
    await render(withAppData(<BodyAgeScreen />, 'en', { profile: PROFILE, userData: MAN, labResults: panel() }));
    expect(screen.getByTestId('body-age-fitness')).toBeTruthy();
    expect(screen.getByTestId('body-age-fitness-value')).toBeTruthy();
    expect(screen.getByText(/Your VO₂ max estimate ± 4.7 mL\/kg\/min/)).toBeTruthy();
    expect(screen.getByText('Men (Loe 2013)')).toBeTruthy();
    expect(screen.getByText(`${Math.round(pheno.result.value.phenoAge)} years`)).toBeTruthy();
    expect(screen.getByText('Blood draw of 2026-11-01')).toBeTruthy();
    expect(screen.getByText(/Your age at the blood draw: 45/)).toBeTruthy();
    expect(screen.getByText('2026-11-01 · used as 0.15 mg/dL')).toBeTruthy();
    expect(screen.getByText(/Levine et al., Aging 2018/)).toBeTruthy();
    expect(screen.getByTestId('body-age-fitness-method-level')).toBeTruthy();
    expect(screen.getByTestId('body-age-pheno-method-level')).toBeTruthy();
    expect(screen.queryByTestId('not-built-healthspan')).toBeNull();
  });

  it('explains what is missing in Dutch and links to adding results', async () => {
    await render(withAppData(<BodyAgeScreen />, 'nl', { profile: PROFILE, userData: { ...MAN, sex: null }, labResults: panel().filter((r) => r.biomarker !== 'wbc') }));
    expect(screen.getByTestId('body-age-fitness-reason')).toBeTruthy();
    expect(screen.getByTestId('body-age-fitness-profile')).toBeTruthy();
    expect(screen.getByText(/Ontbreekt of te oud: Witte bloedcellen\./)).toBeTruthy();
    expect(screen.getByTestId('body-age-pheno-wbc')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('body-age-pheno-add'));
    expect(mockPush).toHaveBeenCalledWith('/health/labs-upload');
  });

  it('refuses a zero CRP and sends a missing birth year to the profile', async () => {
    await render(withAppData(<BodyAgeScreen />, 'en', { profile: PROFILE, userData: MAN, labResults: panel('2026-11-01', { crp: { value: 0 } }) }));
    expect(screen.getByText(/Your CRP is 0/)).toBeTruthy();
    await render(withAppData(<BodyAgeScreen />, 'en', { profile: { birthYear: null, maxHeartRate: 190 }, userData: MAN, labResults: panel() }));
    expect(screen.getByText(/Add your birth year/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('body-age-pheno-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');
  });

  it('shows the VO2 max reason without data', async () => {
    await render(withAppData(<BodyAgeScreen />, 'en', { days: [], profile: PROFILE, userData: MAN }));
    expect(screen.getByTestId('body-age-fitness-reason')).toBeTruthy();
    expect(screen.getAllByText('Missing')).toHaveLength(PHENO_MARKERS.length);
  });
});

describe('Body age hero, pace and contributors', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows the blood-test age in the hero with the difference to your age', async () => {
    const pheno = latestPhenoAge(panel(), PROFILE);
    if (!pheno.result.ok) throw new Error(pheno.result.reason);
    await render(withAppData(<BodyAgeScreen />, 'en', { profile: PROFILE, userData: MAN, labResults: panel() }));
    expect(screen.getByTestId('body-age-value')).toHaveTextContent(pheno.result.value.phenoAge.toFixed(1));
    const diff = 45 - pheno.result.value.phenoAge;
    expect(screen.getByTestId('body-age-diff')).toHaveTextContent(`${Math.abs(diff).toFixed(1)} years ${diff > 0 ? 'younger' : 'older'} than your age`);
    expect(screen.getByTestId('body-age-pace-note')).toHaveTextContent(/full birth date/);
  });

  it('shows a pace of aging from two panels a year apart', async () => {
    const labs = [...panel('2025-11-01'), ...panel('2026-11-01').map((r) => ({ ...r, id: r.id + 100 }))];
    await render(withAppData(<BodyAgeScreen />, 'en', { profile: { ...PROFILE, birthDate: '1981-03-02' }, userData: MAN, labResults: labs }));
    expect(screen.getByTestId('body-age-pace-value')).toHaveTextContent(/×$/);
  });

  it('keeps the dot cloud out of the clear middle where the text sits', () => {
    const inner = Math.min(...cloudDots(170).map((dot) => Math.hypot(dot.x - 0.5, dot.y - 0.5)));
    expect(inner).toBeGreaterThanOrEqual(CLOUD_CLEAR / 2 - 1e-9);
    expect(cloudClearWidth(280)).toBeLessThan(280 * CLOUD_CLEAR);
  });

  it('says why there is no body age and lists nine contributors that open their detail', async () => {
    await render(withAppData(<BodyAgeScreen />, 'en', { profile: PROFILE, userData: { ...MAN, sex: null } }));
    expect(screen.getByTestId('body-age-missing')).toHaveTextContent('Set your sex in your profile');
    expect(StyleSheet.flatten(screen.getByTestId('body-age-missing').props.style).maxWidth).toBeLessThanOrEqual(cloudClearWidth(280));
    expect(screen.getByText('9 contributors · last 4 weeks')).toBeTruthy();
    expect(screen.getByTestId('body-age-contrib-leanMass')).toHaveTextContent(/No body measurement entered yet/);
    await fireEvent.press(screen.getByTestId('body-age-contrib-zones45'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/health/pillar', params: { contributor: 'zones45' } });
    await fireEvent.press(screen.getByTestId('body-age-about'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
  });
});
