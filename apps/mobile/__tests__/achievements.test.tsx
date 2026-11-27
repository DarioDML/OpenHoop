import type { DayRecord } from '@openhoop/core';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { achievements, levelOf, lifetimeStats, longestRun, longestStreak, type Achievement } from '@/data/activityDerived';
import { createFixtureDays } from '@/data/fixtureSource';
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

import AchievementsScreen from '@/app/profile/achievements';

const days = createFixtureDays(FIXTURE_NOW);

function badge(group: Achievement['group'], tier: number, unlocked: boolean): Achievement {
  return { id: `${group}-${tier}`, group, tier, target: tier, current: unlocked ? tier : 0, unlocked };
}

describe('achievement model', () => {
  it('adds steps, high load and readiness streak badges with tiers', () => {
    const list = achievements(days);
    expect(new Set(list.map((a) => a.group))).toEqual(new Set(['streak', 'nights', 'workouts', 'steps10k', 'highLoad', 'readyStreak']));
    expect(list.find((a) => a.id === 'streak-30')?.tier).toBe(4);
    expect(list.find((a) => a.id === 'steps10k-1')?.tier).toBe(1);
    expect(list.every((a) => a.unlocked === a.current >= a.target)).toBe(true);
  });

  it('counts runs of consecutive days only', () => {
    const at = (day: string, steps: number | null): DayRecord => ({ ...(days[0] as DayRecord), day, steps });
    const run = [at('2026-11-01', 5), at('2026-11-02', 5), at('2026-11-04', 5), at('2026-11-05', 5), at('2026-11-06', 5), at('2026-11-07', null)];
    expect(longestRun(run, (d) => d.steps !== null)).toBe(3);
    expect(longestStreak(days)).toBeGreaterThan(0);
  });

  it('turns badge points into a level, three points a level', () => {
    expect(levelOf([])).toEqual({ level: 1, points: 0, maxPoints: 0, toNext: null, unlocked: 0, total: 0 });
    const list = [badge('streak', 1, true), badge('streak', 2, true), badge('streak', 3, false), badge('nights', 1, true)];
    expect(levelOf(list)).toEqual({ level: 2, points: 4, maxPoints: 7, toNext: 2, unlocked: 3, total: 4 });
    expect(levelOf(list.map((a) => ({ ...a, unlocked: true }))).toNext).toBeNull();
  });

  it('adds up hours worn only from measured days', () => {
    const worn = (day: DayRecord, value: number | null): DayRecord => ({ ...day, worn: { value, reason: null, coverage: 1, algo: 'x' } });
    const [a, b] = days;
    expect(lifetimeStats([worn(a as DayRecord, 3600), worn(b as DayRecord, 7200)]).wornS).toBe(10800);
    expect(lifetimeStats([worn(a as DayRecord, null)]).wornS).toBeNull();
  });
});

describe('achievements screen', () => {
  it('shows a badge grid and opens the details of a badge', async () => {
    await render(withAppData(<AchievementsScreen />));
    expect(screen.getByTestId('achievement-grid')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ach-nights-90'));
    const sheet = screen.getByTestId('achievement-sheet');
    expect(within(sheet).getByText('Worth 3 points toward your level.')).toBeTruthy();
    expect(within(sheet).getByTestId('achievement-sheet-progress')).toHaveTextContent(/of 90$/);
  });

  it('keeps the count on unlocked badges and fills badge text from the thresholds', async () => {
    await render(withAppData(<AchievementsScreen />));
    const unlocked = achievements(days).filter((a) => a.unlocked);
    expect(unlocked.length).toBeGreaterThan(0);
    for (const a of unlocked) expect(screen.getByTestId(`ach-${a.id}-progress`)).toHaveTextContent(`${a.target} of ${a.target}`);
    expect(screen.getByText('First 10K day')).toBeTruthy();
    expect(screen.getByText('Load 15+ ×10')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ach-steps10k-50'));
    expect(within(screen.getByTestId('achievement-sheet')).getByText(`50 days with ${formatNumber(10000, 0, 'en')} steps or more`)).toBeTruthy();
  });

  it('dims locked badges and shows their progress', async () => {
    await render(withAppData(<AchievementsScreen />));
    await fireEvent.press(screen.getByRole('tab', { name: 'Locked' }));
    const locked = achievements(days).filter((a) => !a.unlocked);
    expect(locked.length).toBeGreaterThan(0);
    for (const a of locked) expect(screen.getByTestId(`ach-${a.id}-progress`)).toBeTruthy();
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(locked.length - 1);
  });
});
