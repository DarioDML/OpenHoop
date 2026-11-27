import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDevice } from '@/data/fixtureSource';
import { defaultUserData } from '@/data/userData';
import type { Language } from '@/data/types';

import { FIXTURE_NOW, withAppData } from './support/appData';
import { FIRST_NIGHT_NOW_S, FIRST_NIGHT_SYNC_S, firstNightDay } from './support/firstNight';

const mockParams: { value: Record<string, string | string[] | undefined> } = { value: {} };
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.value,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import HomeScreen from '@/app/(tabs)/index';
import PastDayScreen from '@/app/day/[day]';

const device = { ...createFixtureDevice(FIXTURE_NOW), lastSyncAt: FIRST_NIGHT_SYNC_S };
const wrap = (node: ReactNode, language: Language = 'en') => withAppData(node, language, { days: [firstNightDay()], device }, FIRST_NIGHT_NOW_S);

beforeEach(() => {
  mockParams.value = {};
  mockPush.mockClear();
  jest.useFakeTimers({
    now: FIRST_NIGHT_NOW_S * 1000,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('first week on home', () => {
  it('shows Load so far in the compact hero on the open day', async () => {
    await render(withAppData(<HomeScreen />, 'en', { days: [firstNightDay()], device, userData: { ...defaultUserData(), onboardingDone: true, homeHero: 'compact' } }, FIRST_NIGHT_NOW_S));
    const stat = within(screen.getByTestId('stat-load'));
    expect(stat.getByText('4.6')).toBeTruthy();
    expect(stat.getByText('So far')).toBeTruthy();
    expect(stat.queryByText(/Worn/)).toBeNull();
  });
  it('lists what is still building and replaces the calibrating notice', async () => {
    await render(wrap(<HomeScreen />));
    const card = within(screen.getByTestId('card-first-week'));
    expect(card.getByText('Your first week')).toBeTruthy();
    expect(screen.getByTestId('first-week-readiness')).toHaveTextContent('3 more nights');
    expect(screen.getByTestId('first-week-consistency')).toHaveTextContent('1 more night');
    expect(screen.getByTestId('first-week-normalRange')).toHaveTextContent('4 more nights');
    expect(screen.getByTestId('first-week-skinTempChange')).toHaveTextContent('3 more nights');
    expect(screen.getByTestId('first-week-stress')).toHaveTextContent('3 more calm days');
    expect(screen.queryByTestId('calibrating-hint')).toBeNull();
    await fireEvent.press(screen.getByTestId('first-week-consistency'));
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
  });
  it('drops the card once nothing is building', async () => {
    await render(withAppData(<HomeScreen />));
    expect(screen.queryByTestId('card-first-week')).toBeNull();
  });
  it('shows nights left in the readiness ring and Load so far', async () => {
    await render(wrap(<HomeScreen />));
    expect(screen.getByLabelText('Readiness: 3 nights left before the first score')).toBeTruthy();
    expect(within(screen.getByTestId('ring-readiness')).getByText('Nights left')).toBeTruthy();
    expect(within(screen.getByTestId('ring-load')).getByText('4.6')).toBeTruthy();
    expect(within(screen.getByTestId('ring-load')).getByText('So far')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ring-readiness'));
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('why-sheet-backdrop'));
    await fireEvent.press(screen.getByTestId('ring-readiness-label'));
    expect(mockPush).toHaveBeenCalledWith('/recovery');
  });
  it('keeps a past day free of so far, nights left and the first-week card', async () => {
    mockParams.value = { day: '2026-11-26' };
    await render(withAppData(<PastDayScreen />, 'en', { days: [firstNightDay({ day: '2026-11-26' }), firstNightDay()], device }, FIRST_NIGHT_NOW_S));
    expect(within(screen.getByTestId('ring-load')).queryByText('So far')).toBeNull();
    expect(within(screen.getByTestId('ring-load')).getByText('Worn 8 h 2 min of 10 h')).toBeTruthy();
    expect(within(screen.getByTestId('ring-readiness')).getByText('No number yet')).toBeTruthy();
    expect(screen.queryByTestId('card-first-week')).toBeNull();
  });
  it('writes the vitals card, stress tile and weekly plan label', async () => {
    await render(wrap(<HomeScreen />));
    expect(screen.getByTestId('vitals-count')).toHaveTextContent('5/5 measured');
    expect(within(screen.getByTestId('card-vitals')).getByText('Ranges from night 5')).toBeTruthy();
    expect(screen.getByTestId('stress-tile-reason')).toHaveTextContent('Not yet');
    expect(within(screen.getByTestId('card-stress')).getByText('Needs calm, awake time')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('stress-tile-why'));
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalledWith('/health/stress');
    expect(screen.getByLabelText(/^Nights at sleep need: /)).toBeTruthy();
  });
});
