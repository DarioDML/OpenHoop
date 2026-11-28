import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import JournalCustomizeScreen from '@/app/journal/customize';
import JournalScreen from '@/app/journal/index';
import { addDays } from '@/data/derived';
import { JOURNAL_QUESTIONS } from '@/data/journalQuestions';
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

describe('customize journal', () => {
  it('groups the catalogue by category and searches it', async () => {
    await render(withAppData(<JournalCustomizeScreen />, 'en', { userData: base }));
    expect(screen.getByText('Body and rest')).toBeTruthy();
    expect(screen.getByPlaceholderText(`Search ${JOURNAL_QUESTIONS.length} behaviours`)).toBeTruthy();
    expect(screen.getByTestId('customize-count')).toHaveTextContent('6 of 40 behaviours in your journal');
    await fireEvent.changeText(screen.getByTestId('customize-search'), 'plunge');
    expect(screen.getByTestId('customize-cold-plunge')).toBeTruthy();
    expect(screen.queryByTestId('customize-alcohol')).toBeNull();
    expect(screen.queryByText('Nutrition')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('customize-search'), 'qqqq');
    expect(screen.getByTestId('customize-no-results')).toBeTruthy();
  });

  it('adds and removes behaviours in catalogue order', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<JournalCustomizeScreen />, 'en', { userData: base, updateUserData }));
    expect(screen.getByLabelText('Remove Alcohol')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('customize-toggle-cold-plunge'));
    expect(updateUserData).toHaveBeenLastCalledWith({ journalQuestions: ['alcohol', 'caffeine-late', 'screens-bed', 'read-before-sleep', 'sauna', 'melatonin', 'cold-plunge'] });
    await fireEvent.press(screen.getByTestId('customize-toggle-alcohol'));
    expect(updateUserData).toHaveBeenLastCalledWith({ journalQuestions: ['caffeine-late', 'screens-bed', 'read-before-sleep', 'sauna', 'melatonin'] });
    await fireEvent.press(screen.getByTestId('customize-reset'));
    expect(updateUserData).toHaveBeenLastCalledWith({ journalQuestions: null });
  });

  it('stops adding at the limit but still allows removing', async () => {
    const updateUserData = jest.fn(async () => true);
    const many = JOURNAL_QUESTIONS.slice(0, 40).map((q) => q.id);
    await render(withAppData(<JournalCustomizeScreen />, 'en', { userData: { ...base, journalQuestions: many }, updateUserData }));
    expect(screen.getByTestId('customize-count')).toHaveTextContent(/the most at one time/);
    const last = JOURNAL_QUESTIONS[45];
    if (!last) throw new Error('catalogue too small');
    expect(screen.getByTestId(`customize-toggle-${last.id}`).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('customize-toggle-alcohol'));
    expect(updateUserData).toHaveBeenCalledWith({ journalQuestions: many.filter((id) => id !== 'alcohol') });
  });
});
