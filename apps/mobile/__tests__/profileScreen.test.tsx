import type { DayRecord } from '@openhoop/core';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { achievements, currentRun, levelOf } from '@/data/activityDerived';
import { createFixtureDays, createFixtureDevice, createFixtureSettings } from '@/data/fixtureSource';
import { bodyAgeSummary, streaks } from '@/data/profileSummary';
import { defaultUserData } from '@/data/userData';
import { formatNumber } from '@/lib/format';

import { FIXTURE_NOW, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import ProfileScreen from '@/app/profile/index';

const days = createFixtureDays(FIXTURE_NOW);

function scored(source: readonly DayRecord[], scores: ReadonlyArray<number | null>): DayRecord[] {
  return source.map((d, i) => ({ ...d, sleep: { ...d.sleep, score: { value: scores[i] ?? null, reason: null, coverage: 1, algo: 'x' } } }));
}

describe('streaks', () => {
  it('counts the run up to today without letting an open today break it', () => {
    const week = days.slice(-4);
    expect(currentRun(scored(week, [80, 80, 80, 80]), (d) => (d.sleep.score.value === null ? null : d.sleep.score.value >= 70))).toBe(4);
    expect(currentRun(scored(week, [80, 50, 80, 80]), (d) => (d.sleep.score.value === null ? null : d.sleep.score.value >= 70))).toBe(2);
    expect(currentRun(scored(week, [80, 80, 80, null]), (d) => (d.sleep.score.value === null ? null : d.sleep.score.value >= 70))).toBe(3);
    expect(currentRun(scored(week, [80, 80, null, 80]), (d) => (d.sleep.score.value === null ? null : d.sleep.score.value >= 70))).toBe(1);
    expect(streaks(scored(week, [80, 80, 80, 80])).sleepScore).toBe(4);
  });

  it('lets a final low score today break the streak unless the day is still open', () => {
    const week = scored(days.slice(-4), [80, 80, 80, 50]);
    const test = (d: DayRecord): boolean | null => (d.sleep.score.value === null ? null : d.sleep.score.value >= 70);
    expect(currentRun(week, test)).toBe(0);
    expect(currentRun(week, test, true)).toBe(3);
    expect(streaks(week).sleepScore).toBe(0);
  });

  it('breaks a run at a missing calendar day', () => {
    const [a, , c] = days.slice(-3);
    const gap = scored([a as DayRecord, c as DayRecord], [80, 80]);
    expect(currentRun(gap, (d) => (d.sleep.score.value ?? 0) >= 70)).toBe(1);
  });
});

describe('body age summary', () => {
  it('asks for a birth date first and explains other gaps', () => {
    expect(bodyAgeSummary(days, [], { birthYear: null, maxHeartRate: null }, null)).toEqual({ kind: 'missing', reason: 'noAge' });
    const withAge = bodyAgeSummary(days, [], { birthYear: 1990, maxHeartRate: null }, null);
    expect(withAge.kind === 'missing' ? withAge.reason : 'value').toMatch(/needsNights|noSex/);
  });

  it('gives an estimate from fitness when age and sex are known', () => {
    const summary = bodyAgeSummary(days, [], { birthYear: 1990, maxHeartRate: null }, 'male');
    if (summary.kind === 'value') {
      expect(summary.source).toBe('fitness');
      expect(summary.ageYears).toBe(36);
    } else {
      expect(summary.reason).toBe('needsNights');
    }
  });
});

describe('profile screen', () => {
  it('shows the dashboard tiles, streaks and lifetime numbers', async () => {
    await render(withAppData(<ProfileScreen />, 'en', { userData: { ...defaultUserData(), name: 'Sam' } }));
    expect(screen.getByTestId('profile-name').props.children).toBe('Sam');
    expect(screen.getByTestId('profile-body-age')).toBeTruthy();
    expect(screen.getByTestId('profile-level-value')).toHaveTextContent(String(levelOf(achievements(days)).level));
    for (const id of ['streak-load', 'streak-readiness', 'streak-sleep', 'profile-streak', 'life-nights', 'life-workouts', 'life-steps', 'life-worn']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByText('Load 7+ days')).toBeTruthy();
    expect(screen.getByText('Sleep score 70%+')).toBeTruthy();
  });

  it('names the band model in the subtitle', async () => {
    const device = { ...createFixtureDevice(FIXTURE_NOW), model: '5.0' as const };
    await render(withAppData(<ProfileScreen />, 'en', { device }));
    expect(screen.getByTestId('profile-since')).toHaveTextContent(/^Data since .* · Band 5\.0$/);
  });

  it('explains how the level is computed', async () => {
    await render(withAppData(<ProfileScreen />));
    const level = levelOf(achievements(days));
    expect(screen.getByTestId('profile-level')).toHaveTextContent(`${level.points} of ${level.maxPoints} points from ${level.unlocked} of ${level.total} badges`, { exact: false });
    await fireEvent.press(screen.getByTestId('profile-level-name'));
    expect(within(screen.getByTestId('about-sheet')).getByText(/Every 3 points is a new level/)).toBeTruthy();
  });

  it('explains hours worn through the wear time term', async () => {
    await render(withAppData(<ProfileScreen />));
    await fireEvent.press(screen.getByTestId('life-worn-name'));
    expect(within(screen.getByTestId('about-sheet')).getByText('Worn')).toBeTruthy();
  });

  it('reads tiles with their value and chip', async () => {
    await render(withAppData(<ProfileScreen />));
    expect(screen.getByTestId('profile-body-age').props.accessibilityLabel).toBe('Body age, Add your birth date');
    const steps = days.reduce((sum, d) => sum + (d.steps ?? 0), 0);
    expect(screen.getByTestId('life-steps-content').props.accessibilityLabel).toBe(`Steps ${formatNumber(steps, 0, 'en')}`);
    expect(screen.getByTestId('life-nights-content').props.accessibilityLabel).toMatch(/^Nights, \d+$/);
  });

  it('asks for a birth date on the body age tile and links to body age', async () => {
    await render(withAppData(<ProfileScreen />));
    expect(screen.getByTestId('profile-body-age-missing')).toHaveTextContent('Add your birth date');
    await fireEvent.press(screen.getByTestId('profile-body-age'));
    expect(router.push).toHaveBeenCalledWith('/health/body-age');
  });

  it('keeps the body details in the chosen units and opens edit from the header', async () => {
    const settings = { ...createFixtureSettings('en', FIXTURE_NOW), units: 'imperial' as const };
    await render(
      withAppData(<ProfileScreen />, 'en', {
        settings,
        userData: { ...defaultUserData(), heightCm: 180, weightKg: 72.5 },
        profile: { birthYear: 1990, maxHeartRate: null, birthDate: '1990-06-15', restingHeartRate: 52, zoneMode: 'custom', zoneFloors: [100, 120, 140, 160, 180] },
      }),
    );
    expect(screen.getByTestId('profile-row-height')).toHaveTextContent(/5′ 11″/);
    expect(screen.getByTestId('profile-row-weight')).toHaveTextContent(/159\.8 lb/);
    expect(screen.getByTestId('profile-row-birth')).toHaveTextContent(/15 June 1990/);
    expect(screen.getByTestId('profile-row-rest')).toHaveTextContent(/52 bpm/);
    expect(screen.getByTestId('profile-row-zones')).toHaveTextContent(/Custom/);
    await fireEvent.press(screen.getByTestId('profile-edit'));
    expect(router.push).toHaveBeenCalledWith('/profile/edit');
  });

  it('opens the achievements with the unlocked count', async () => {
    await render(withAppData(<ProfileScreen />));
    const level = levelOf(achievements(days));
    expect(screen.getByTestId('profile-achievements')).toHaveTextContent(`${level.unlocked} of ${level.total} unlocked`, { exact: false });
    await fireEvent.press(screen.getByTestId('profile-achievements'));
    expect(router.push).toHaveBeenCalledWith('/profile/achievements');
  });
});
