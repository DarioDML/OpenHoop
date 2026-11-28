import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays } from '@/data/fixtureSource';
import { CATALOGUE } from '@/data/healthDerived';
import { ageOnDay, healthspanPillars, isPillarId, latestVo2, vo2Trend } from '@/data/healthspanDerived';
import type { Profile } from '@/data/types';
import { defaultUserData, type UserData } from '@/data/userData';
import type { DayRecord } from '@openhoop/core';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockPush = jest.fn();
const mockParams: { id?: string; contributor?: string } = {};

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import PillarScreen from '@/app/health/pillar';
import Vo2maxScreen from '@/app/health/vo2max';

const days = createFixtureDays(FIXTURE_NOW);
const PROFILE: Profile = { birthYear: 1990, maxHeartRate: null };
const MAN: UserData = { ...defaultUserData(), onboardingDone: true, sex: 'male' };

function lastRestingHrs(count: number): number[] {
  return days
    .slice(-count)
    .map((d) => d.restingHr.value)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
}

function medianOf(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function withoutRestingHr(source: readonly DayRecord[]): DayRecord[] {
  return source.map((d) => ({ ...d, restingHr: { ...d.restingHr, value: null, reason: 'no-sleep' } }));
}

describe('healthspan data', () => {
  it('estimates VO2 max from the median resting heart rate of the last 14 nights and Tanaka', () => {
    const view = latestVo2(days, PROFILE, 'male');
    expect(view.result.ok).toBe(true);
    if (!view.result.ok) return;
    const rest = medianOf(lastRestingHrs(14));
    expect(view.result.value.inputs).toMatchObject({ restingHr: rest, maxHrSource: 'age', ageYears: 36 });
    expect(view.result.value.inputs.maxHr).toBeCloseTo(208 - 0.7 * 36, 9);
    expect(view.result.value.vo2max).toBeCloseTo((15.3 * (208 - 0.7 * 36)) / rest, 9);
    expect(view.norm?.norm).toMatchObject({ sex: 'male', ageFrom: 30, mean: 49.1 });
  });

  it('gives reasons for a missing age, sex or resting heart rate', () => {
    expect(latestVo2(days, { birthYear: null, maxHeartRate: null }, 'male').result).toMatchObject({ ok: false, reason: 'no-max-hr' });
    expect(latestVo2(days, { birthYear: null, maxHeartRate: 190 }, 'male')).toMatchObject({ result: { ok: true }, normReason: 'no-age' });
    expect(latestVo2(days, PROFILE, null).normReason).toBe('no-sex');
    expect(latestVo2(days, PROFILE, 'other').normReason).toBe('other-sex');
    expect(latestVo2(withoutRestingHr(days), PROFILE, 'male').result).toMatchObject({ ok: false, reason: 'no-resting-hr', nights: 0 });
    expect(latestVo2([], PROFILE, 'male').day).toBeNull();
  });

  it('only accepts adult ages', () => {
    expect(ageOnDay(PROFILE, '2026-11-25')).toBe(36);
    expect(ageOnDay({ birthYear: 2015, maxHeartRate: null }, '2026-11-25')).toBeNull();
  });

  it('builds a 90-day trend with gaps before there are enough nights', () => {
    const trend = vo2Trend(days, PROFILE);
    expect(trend.points).toHaveLength(90);
    expect(trend.points[0]).toBeNull();
    expect(trend.points[89]).not.toBeNull();
    expect(trend.lastDay).toBe(days[days.length - 1]?.day);
    expect(trend.measured).toBeGreaterThan(0);
    expect(trend.measured).toBeLessThanOrEqual(days.length);
  });

  it('computes all four pillars from the fixture and none from no data', () => {
    const pillars = healthspanPillars(days, PROFILE, 'male');
    expect(pillars.sleep?.nights).toBeGreaterThanOrEqual(4);
    expect(pillars.hrv?.recentCount).toBeGreaterThanOrEqual(3);
    expect(pillars.rhr?.baselineCount).toBeGreaterThanOrEqual(4);
    expect(pillars.activity?.measuredDays).toBe(7);
    expect(pillars.fitness.result.ok).toBe(true);
    const empty = healthspanPillars([], PROFILE, 'male');
    expect(empty).toMatchObject({ endDay: null, sleep: null, hrv: null, rhr: null, activity: null });
  });

  it('leaves days without active minutes out of the activity count', () => {
    const stripped = days.map((d) => ({ ...d, activeMinutes: null }));
    expect(healthspanPillars(stripped, PROFILE, 'male').activity).toBeNull();
  });

  it('accepts only known pillar ids', () => {
    expect(isPillarId('sleep')).toBe(true);
    expect(isPillarId('age')).toBe(false);
    expect(isPillarId(undefined)).toBe(false);
  });

  it('shows the VO2 max estimate in the metric catalogue at level C', () => {
    const item = CATALOGUE.find((entry) => entry.id === 'vo2max');
    expect(item?.level).toBe('C');
    expect(item?.read(days, null, PROFILE).kind).toBe('number');
    expect(item?.read(days, null, { birthYear: null, maxHeartRate: null }).kind).toBe('none');
  });
});

describe('VO2 max screen', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows the reason and a profile link without an age or maximum', async () => {
    await render(withAppData(<Vo2maxScreen />, 'en'));
    expect(screen.getByTestId('vo2-reason')).toBeTruthy();
    expect(screen.queryByTestId('vo2-value')).toBeNull();
    await fireEvent.press(screen.getByTestId('vo2-edit-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');
  });

  it('explains how many nights are missing', async () => {
    await render(withAppData(<Vo2maxScreen />, 'en', { profile: PROFILE, days: withoutRestingHr(days) }));
    expect(screen.getByText('Needs a resting heart rate from at least 5 nights in the last 14 days. Now: 0.')).toBeTruthy();
    expect(screen.queryByTestId('vo2-edit-profile')).toBeNull();
  });

  it('shows the estimate, its error, the norm, the inputs and the method', async () => {
    const view = latestVo2(days, PROFILE, 'male');
    if (!view.result.ok) throw new Error('fixture should give an estimate');
    await render(withAppData(<Vo2maxScreen />, 'en', { profile: PROFILE, userData: MAN }));
    expect(screen.getByText(`${Math.round(view.result.value.vo2max)} mL/kg/min`)).toBeTruthy();
    expect(screen.getByText('Typical error in the original study: ±4.7 mL/kg/min. For you it can be larger.')).toBeTruthy();
    expect(screen.getByText('Men 30 to 39: 49.1 ± 7.5 mL/kg/min (324 people)')).toBeTruthy();
    expect(screen.getByTestId('vo2-norm-position')).toBeTruthy();
    expect(screen.getByText('Predicted from age 36: 208 − 0.7 × age')).toBeTruthy();
    expect(screen.getByText(/fitted on 46 well-trained men/)).toBeTruthy();
    expect(screen.getByTestId('vo2-method-level')).toBeTruthy();
    expect(screen.getByTestId('vo2-chart')).toBeTruthy();
  });

  it('uses the maximum from the profile and says why there is no comparison', async () => {
    await render(withAppData(<Vo2maxScreen />, 'nl', { profile: { birthYear: null, maxHeartRate: 190 }, userData: MAN }));
    expect(screen.getByText('Uit je profiel')).toBeTruthy();
    expect(screen.getByText('Gebruikelijke afwijking in het oorspronkelijke onderzoek: ±2,7 ml/kg/min. Voor jou kan die groter zijn.')).toBeTruthy();
    expect(screen.getByTestId('vo2-norm-reason')).toBeTruthy();
  });
});

describe('Healthspan pillar screen', () => {
  afterEach(() => {
    delete mockParams.id;
    mockPush.mockClear();
  });

  it('lists the four pillars without a combined score and opens one', async () => {
    await render(withAppData(<PillarScreen />, 'en', { profile: PROFILE, userData: MAN }));
    for (const id of ['sleep', 'recovery', 'activity', 'fitness']) expect(screen.getByTestId(`pillar-row-${id}`)).toBeTruthy();
    expect(screen.getByText(/There is no combined score/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pillar-row-activity'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/health/pillar', params: { id: 'activity' } });
  });

  it('says there is not enough data with no days', async () => {
    await render(withAppData(<PillarScreen />, 'en', { days: [] }));
    expect(screen.getAllByText('Not enough data yet')).toHaveLength(4);
  });

  it('shows the sleep pillar with its reference, inputs and method', async () => {
    mockParams.id = 'sleep';
    await render(withAppData(<PillarScreen />, 'en', { profile: PROFILE }));
    expect(screen.getByTestId('health-pillar-sleep')).toBeTruthy();
    expect(screen.getByTestId('pillar-sleep-reference')).toBeTruthy();
    expect(screen.getByText(/Watson et al., Sleep 2015/)).toBeTruthy();
    expect(screen.getByTestId('pillar-method-level')).toBeTruthy();
  });

  it('compares recovery with the own baseline', async () => {
    mockParams.id = 'recovery';
    await render(withAppData(<PillarScreen />, 'en', { profile: PROFILE }));
    expect(screen.getByTestId('pillar-hrv-position')).toBeTruthy();
    expect(screen.getByTestId('pillar-rhr-position')).toBeTruthy();
  });

  it('explains missing recovery nights', async () => {
    mockParams.id = 'recovery';
    await render(withAppData(<PillarScreen />, 'en', { days: withoutRestingHr(days) }));
    expect(screen.getByTestId('pillar-rhr-missing')).toBeTruthy();
  });

  it('shows weekly activity against the WHO range', async () => {
    mockParams.id = 'activity';
    await render(withAppData(<PillarScreen />, 'nl', { profile: PROFILE }));
    expect(screen.getByTestId('pillar-activity-minutes')).toBeTruthy();
    expect(screen.getByText('WHO: 150 tot 300 minuten per week matig intensief bewegen')).toBeTruthy();
  });

  it('links the fitness pillar to the VO2 max screen', async () => {
    mockParams.id = 'fitness';
    await render(withAppData(<PillarScreen />, 'en', { profile: PROFILE, userData: MAN }));
    expect(screen.getByTestId('pillar-fitness-position')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pillar-fitness-open'));
    expect(mockPush).toHaveBeenCalledWith('/health/vo2max');
  });

  it('falls back to the overview for an unknown id', async () => {
    mockParams.id = 'age';
    await render(withAppData(<PillarScreen />, 'en'));
    expect(screen.getByTestId('health-pillar')).toBeTruthy();
  });
});

describe('Contributor detail', () => {
  beforeEach(() => {
    delete mockParams.id;
    mockPush.mockClear();
  });

  it('shows one contributor against the WHO target with advice, labs and the way back to the pillars', async () => {
    mockParams.contributor = 'zones13';
    await render(withAppData(<PillarScreen />, 'en', { profile: PROFILE, userData: MAN }));
    expect(screen.getByTestId('health-contributor-zones13')).toBeTruthy();
    expect(screen.getByTestId('contributor-gauge')).toBeTruthy();
    expect(screen.getByTestId('contributor-target')).toHaveTextContent('150–300 min/wk');
    expect(screen.getByTestId('contributor-basis')).toHaveTextContent('Target for adults');
    expect(screen.getByTestId('contributor-advice')).toHaveTextContent(/How to move it/);
    expect(screen.getByTestId('contributor-labs')).toHaveTextContent(/None uploaded/);
    expect(screen.getByTestId('contributor-source')).toHaveTextContent(/WHO 2020/);
    await fireEvent.press(screen.getByTestId('contributor-pillars'));
    expect(mockPush).toHaveBeenCalledWith('/health/pillar');
  });

  it('says plainly when no target is published and draws no gauge', async () => {
    mockParams.contributor = 'zones45';
    await render(withAppData(<PillarScreen />, 'en', { profile: PROFILE, userData: MAN }));
    expect(screen.queryByTestId('contributor-gauge')).toBeNull();
    expect(screen.getByTestId('contributor-target-reason')).toHaveTextContent('No published target: follow your own trend');
  });

  it('explains a missing value', async () => {
    mockParams.contributor = 'leanMass';
    await render(withAppData(<PillarScreen />, 'en', { profile: PROFILE, userData: MAN }));
    expect(screen.getByTestId('contributor-reason')).toHaveTextContent('No body measurement entered yet');
  });

  it('falls back to the pillar overview for an unknown contributor', async () => {
    mockParams.contributor = 'nonsense';
    await render(withAppData(<PillarScreen />, 'en', { profile: PROFILE, userData: MAN }));
    expect(screen.getByTestId('health-pillar')).toBeTruthy();
    delete mockParams.contributor;
  });
});
