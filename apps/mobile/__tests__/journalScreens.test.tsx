import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import JournalScreen from '@/app/journal/index';
import { addDays } from '@/data/derived';
import { defaultUserData } from '@/data/userData';
import { todayIso } from '@/lib/format';

import { withAppData } from './support/appData';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const base = { ...defaultUserData(), onboardingDone: true };

beforeEach(() => {
  mockPush.mockClear();
});

describe('journal day screen', () => {
  it('switches between today and yesterday and saves under the chosen day', async () => {
    const today = todayIso(new Date());
    const yesterday = addDays(today, -1);
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<JournalScreen />, 'en', { updateUserData, userData: { ...base, journal: { [yesterday]: { alcohol: 2 } } } }));
    expect(screen.getByTestId('journal-day')).toHaveTextContent('Today');
    expect(screen.queryByTestId('journal-alcohol-count')).toBeNull();
    await fireEvent.press(screen.getByTestId('journal-yesterday'));
    expect(screen.getByTestId('journal-day')).toHaveTextContent('Yesterday');
    expect(screen.getByTestId('journal-alcohol-count')).toHaveTextContent('2');
    await fireEvent.press(screen.getByTestId('journal-alcohol-plus'));
    await fireEvent.press(screen.getByTestId('journal-sauna-no'));
    await fireEvent.press(screen.getByTestId('journal-save'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ journal: { [yesterday]: { alcohol: 3, sauna: false } } }));
    await fireEvent.press(screen.getByTestId('journal-today'));
    expect(screen.getByTestId('journal-day')).toHaveTextContent('Today');
  });

  it('keeps the older days reachable with the pager', async () => {
    await render(withAppData(<JournalScreen />, 'en', { userData: base }));
    await fireEvent.press(screen.getByTestId('journal-prev'));
    await fireEvent.press(screen.getByTestId('journal-prev'));
    expect(screen.getByTestId('journal-day')).not.toHaveTextContent('Yesterday');
    await fireEvent.press(screen.getByTestId('journal-next'));
    expect(screen.getByTestId('journal-day')).toHaveTextContent('Yesterday');
  });

  it('opens the voice log for the chosen day and the customize screen from the header', async () => {
    const yesterday = addDays(todayIso(new Date()), -1);
    await render(withAppData(<JournalScreen />, 'en', { userData: base }));
    await fireEvent.press(screen.getByTestId('journal-yesterday'));
    await fireEvent.press(screen.getByTestId('journal-voice'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/journal/log', params: { day: yesterday } });
    await fireEvent.press(screen.getByTestId('journal-edit'));
    expect(mockPush).toHaveBeenCalledWith('/journal/customize');
    await fireEvent.press(screen.getByTestId('journal-trends'));
    expect(mockPush).toHaveBeenCalledWith('/journal/trends');
  });

  it('asks new catalogue behaviours as questions', async () => {
    await render(withAppData(<JournalScreen />, 'nl', { userData: { ...base, journalQuestions: ['cold-plunge'] } }));
    expect(screen.getByText('IJsbad?')).toBeTruthy();
    expect(screen.getByText('Of vertel gewoon wat er gebeurde…')).toBeTruthy();
  });
});
