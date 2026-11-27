import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AboutScreen from '@/app/settings/about';
import TermsScreen from '@/app/settings/terms';
import { createFixtureDevice } from '@/data/fixtureSource';
import type { Language } from '@/data/types';

import { FIXTURE_NOW, withAppData } from './support/appData';
import { FIRST_NIGHT_NOW_S, FIRST_NIGHT_SYNC_S, firstNightDay } from './support/firstNight';

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

const device = { ...createFixtureDevice(FIXTURE_NOW), lastSyncAt: FIRST_NIGHT_SYNC_S };
const wrap = (node: ReactNode, language: Language = 'en') => withAppData(node, language, { days: [firstNightDay()], device }, FIRST_NIGHT_NOW_S);

beforeEach(() => {
  mockPush.mockClear();
});

describe('all terms', () => {
  it('lists every term by section with its one-liner', async () => {
    await render(wrap(<TermsScreen />));
    for (const title of ['Recovery', 'Sleep', 'Effort', 'How a number is made']) expect(screen.getByText(title)).toBeTruthy();
    expect(within(screen.getByTestId('term-stress')).getByText('How far your heart rate and HRV drift from your calm level while you are awake and still.')).toBeTruthy();
  });
  it('searches names and lines in the current language', async () => {
    await render(wrap(<TermsScreen />));
    await fireEvent.changeText(screen.getByTestId('terms-search'), 'debt');
    expect(screen.getByTestId('term-sleepDebt')).toBeTruthy();
    expect(screen.queryByTestId('term-hrv')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('terms-search'), 'zzz');
    expect(screen.getByTestId('terms-none')).toHaveTextContent('No term matches your search.');
  });
  it('finds Dutch words in Dutch', async () => {
    await render(wrap(<TermsScreen />, 'nl'));
    await fireEvent.changeText(screen.getByTestId('terms-search'), 'slaapschuld');
    expect(screen.getByTestId('term-sleepDebt')).toBeTruthy();
  });
  it('opens the about sheet without a personal value', async () => {
    await render(wrap(<TermsScreen />));
    await fireEvent.press(screen.getByTestId('term-hrv'));
    expect(within(screen.getByTestId('about-sheet')).queryByText('Your night')).toBeNull();
  });
  it('is linked from About', async () => {
    await render(wrap(<AboutScreen />));
    await fireEvent.press(screen.getByTestId('about-terms'));
    expect(mockPush).toHaveBeenCalledWith('/settings/terms');
  });
});
