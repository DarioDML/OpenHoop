import type { CycleData } from '@openhoop/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays } from '@/data/fixtureSource';
import { loadReview } from '@/data/eveningReview';
import { defaultPregnancyPrefs, loadTargetsHidden, parsePregnancyPrefs, trimesterOf, weightGoalsPaused } from '@/data/pregnancyPrefs';
import { defaultUserData, parseUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import LoadScreen from '@/app/load/index';
import LoadTargetScreen from '@/app/load/target';
import LoadTrendsScreen from '@/app/load/trends';
import PregnancyScreen from '@/app/health/pregnancy';
import RecoveryScreen from '@/app/recovery/index';

const PREGNANT: CycleData = { periods: [], symptoms: [], pregnancy: { dueDay: '2027-03-01', createdAt: 1 } };
const HIDDEN = { ...defaultUserData(), onboardingDone: true, pregnancyPrefs: { hideLoadTargets: true, pauseWeightGoals: true } };

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pregnancy preferences', () => {
  it('only apply while pregnancy mode is on', () => {
    const on = { hideLoadTargets: true, pauseWeightGoals: true };
    expect(loadTargetsHidden(on, PREGNANT)).toBe(true);
    expect(weightGoalsPaused(on, PREGNANT)).toBe(true);
    expect(loadTargetsHidden(on, { pregnancy: null })).toBe(false);
    expect(weightGoalsPaused(defaultPregnancyPrefs(), PREGNANT)).toBe(false);
  });

  it('are read back safely from stored user data', () => {
    expect(parsePregnancyPrefs({ hideLoadTargets: true, pauseWeightGoals: 'yes' })).toEqual({ hideLoadTargets: true, pauseWeightGoals: false });
    expect(parseUserData(JSON.stringify({ pregnancyPrefs: 3 })).pregnancyPrefs).toEqual(defaultPregnancyPrefs());
  });

  it('name the trimester from the completed weeks', () => {
    expect([0, 13, 14, 27, 28, 41].map(trimesterOf)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('take the target off the evening review', () => {
    const days = createFixtureDays(FIXTURE_NOW);
    const index = days.findIndex((day) => day.load.value !== null);
    expect(loadReview(days, index, true)?.mark ?? null).toBeNull();
  });
});

describe('pregnancy screen', () => {
  it('shows the week, trimester and the adjusted baseline tiles', async () => {
    await render(withAppData(<PregnancyScreen />, 'en', { cycle: PREGNANT }));
    expect(screen.getByTestId('pregnancy-hero-week')).toHaveTextContent('Week 26');
    expect(screen.getByTestId('pregnancy-hero-line')).toHaveTextContent(/Second trimester · due/);
    expect(screen.getByTestId('pregnancy-baselines')).toHaveTextContent(/Readiness itself is not changed/);
    expect(screen.getByTestId('pregnancy-rhr')).toBeTruthy();
    expect(screen.getByTestId('pregnancy-sleep')).toBeTruthy();
  });

  it('stores the two switches', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<PregnancyScreen />, 'en', { cycle: PREGNANT, updateUserData }));
    await fireEvent(screen.getByTestId('pregnancy-hide-targets'), 'valueChange', true);
    expect(updateUserData).toHaveBeenCalledWith({ pregnancyPrefs: { hideLoadTargets: true, pauseWeightGoals: false } });
    await fireEvent(screen.getByTestId('pregnancy-pause-weight'), 'valueChange', true);
    expect(updateUserData).toHaveBeenLastCalledWith({ pregnancyPrefs: { hideLoadTargets: false, pauseWeightGoals: true } });
  });

  it('has no switches while pregnancy mode is off', async () => {
    await render(withAppData(<PregnancyScreen />, 'en'));
    expect(screen.queryByTestId('pregnancy-toggles')).toBeNull();
  });
});

describe('hidden Load targets', () => {
  it('leave the Load screens without a target', async () => {
    await render(withAppData(<LoadScreen />, 'en', { cycle: PREGNANT, userData: HIDDEN }));
    expect(screen.getByTestId('load-target-pill-text')).toHaveTextContent('Load targets hidden in pregnancy mode');
    await render(withAppData(<LoadTargetScreen />, 'en', { cycle: PREGNANT, userData: HIDDEN }));
    expect(screen.getByTestId('target-hidden')).toBeTruthy();
    expect(screen.queryByTestId('target-today')).toBeNull();
  });

  it('leave the Load trends without days on target', async () => {
    await render(withAppData(<LoadTrendsScreen />, 'en', { cycle: PREGNANT, userData: HIDDEN }));
    expect(screen.getByTestId('trend-ontarget-hidden')).toBeTruthy();
    expect(screen.getByTestId('trend-ontarget-note')).toHaveTextContent(/hidden while pregnancy mode is on/);
  });

  it('leave Readiness without a target', async () => {
    await render(withAppData(<RecoveryScreen />, 'en', { cycle: PREGNANT, userData: HIDDEN }));
    expect(screen.getByTestId('card-load-target-hidden')).toBeTruthy();
  });

  it('come back when pregnancy mode is off', async () => {
    await render(withAppData(<LoadTargetScreen />, 'en', { userData: HIDDEN }));
    expect(screen.queryByTestId('target-hidden')).toBeNull();
  });
});
