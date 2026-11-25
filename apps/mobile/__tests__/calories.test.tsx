import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { bodyProfileFor, caloriesForDay } from '@/data/energyDerived';
import { createFixtureDays } from '@/data/fixtureSource';
import type { Profile } from '@/data/types';
import { defaultUserData, type UserData } from '@/data/userData';
import { formatNumber } from '@/lib/format';
import type { DayRecord } from '@openhoop/core';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import HomeScreen from '@/app/(tabs)/index';
import LoadScreen from '@/app/load/index';

const days = createFixtureDays(FIXTURE_NOW);
const PROFILE: Profile = { birthYear: 1990, maxHeartRate: null };
const BODY: UserData = { ...defaultUserData(), onboardingDone: true, heightCm: 180, weightKg: 80, sex: 'male', dashboardTiles: ['calories'] };

function kcal(value: number | undefined): RegExp {
  return new RegExp(`${formatNumber(value ?? Number.NaN, 0, 'en')} kcal`);
}

function latest(): DayRecord {
  const day = days[days.length - 1];
  if (!day) throw new Error('fixture has no days');
  return day;
}

describe('calories derivation', () => {
  it('builds the body profile from user data and the birth year', () => {
    expect(bodyProfileFor(BODY, PROFILE, 2026)).toEqual({ weightKg: 80, heightCm: 180, sex: 'male', ageYears: 36 });
    expect(bodyProfileFor({ ...BODY, sex: null }, PROFILE, 2026)).toBeNull();
    expect(bodyProfileFor(BODY, { ...PROFILE, birthYear: null }, 2026)).toBeNull();
    expect(bodyProfileFor(BODY, { ...PROFILE, birthYear: 2012 }, 2026)).toBeNull();
  });

  it('estimates a demo day with a complete profile', () => {
    const view = caloriesForDay(latest(), BODY, PROFILE);
    expect(view.reason).toBeNull();
    expect(view.estimate?.restingKcal).toBeCloseTo(10 * 80 + 6.25 * 180 - 5 * 36 + 5, 6);
    expect(view.estimate?.totalKcal).toBeGreaterThan(view.estimate?.restingKcal ?? Infinity);
    expect(view.coverage).toBeCloseTo(1380 / 1440, 6);
  });

  it('gives a reason instead of a number when data or profile is missing', () => {
    expect(caloriesForDay(latest(), defaultUserData(), PROFILE).reason).toBe('no-profile');
    expect(caloriesForDay({ ...latest(), activeMinutes: undefined }, BODY, PROFILE).reason).toBe('missing-signal');
    const lowCoverage = days[25];
    if (!lowCoverage) throw new Error('fixture day 25 missing');
    expect(caloriesForDay(lowCoverage, BODY, PROFILE).reason).toBe('low-coverage');
  });
});

describe('calories tile', () => {
  it('shows the estimate with its level and label on the dashboard', async () => {
    const expected = caloriesForDay(latest(), BODY, PROFILE).estimate?.totalKcal ?? 0;
    await render(withAppData(<HomeScreen />, 'en', { userData: BODY, profile: PROFILE }));
    expect(screen.getByTestId('tile-calories-value')).toHaveTextContent(formatNumber(expected, 0, 'en'));
    expect(screen.getByText('Estimate')).toBeTruthy();
    expect(screen.getAllByText('C').length).toBeGreaterThan(0);
  });
});

describe('calories on the load deep dive', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows total, resting and active energy with the method', async () => {
    const estimate = caloriesForDay(latest(), BODY, PROFILE).estimate;
    await render(withAppData(<LoadScreen />, 'en', { userData: BODY, profile: PROFILE }));
    expect(screen.getByTestId('calories-total')).toHaveTextContent(kcal(estimate?.totalKcal));
    expect(screen.getByTestId('calories-resting')).toHaveTextContent(kcal(estimate?.restingKcal));
    expect(screen.getByTestId('calories-active')).toHaveTextContent(kcal(estimate?.activeKcal));
    expect(screen.getByTestId('calories-coverage')).toHaveTextContent(/covered 96%/);
    expect(screen.getByText(/Keytel et al\. \(2005\)/)).toBeTruthy();
    expect(screen.queryByTestId('calories-other')).toBeNull();
  });

  it('states that sex other uses the mean of both equations', async () => {
    await render(withAppData(<LoadScreen />, 'nl', { userData: { ...BODY, sex: 'other' }, profile: PROFILE }));
    expect(screen.getByTestId('calories-other')).toHaveTextContent(/gemiddelde van de formules/);
    expect(screen.getByText('Schatting')).toBeTruthy();
  });

  it('asks for the body profile when it is incomplete', async () => {
    await render(withAppData(<LoadScreen />, 'en', { userData: { ...BODY, weightKg: null }, profile: PROFILE }));
    expect(screen.getByTestId('calories-reason')).toHaveTextContent('Body profile incomplete');
    expect(screen.queryByTestId('calories-total')).toBeNull();
    await fireEvent.press(screen.getByTestId('calories-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');
  });
});
