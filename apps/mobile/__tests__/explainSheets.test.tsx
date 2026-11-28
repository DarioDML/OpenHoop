import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { createFixtureDevice } from '@/data/fixtureSource';
import type { Language } from '@/data/types';
import { useExplain, type ExplainTarget } from '@/ui/explain/ExplainProvider';
import { MetricName } from '@/ui/explain/MetricName';

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

function Open({ mode, target }: { mode: 'about' | 'why'; target: ExplainTarget }) {
  const explain = useExplain();
  return <Pressable testID="open" onPress={() => (mode === 'about' ? explain.about(target) : explain.why(target))} />;
}

const hrv: ExplainTarget = { term: 'hrv', index: 0, shown: { value: '46', unit: 'ms', reason: null } };

beforeEach(() => {
  mockPush.mockClear();
});

describe('explain sheets', () => {
  it('opens the about sheet from a name with the user value', async () => {
    await render(wrap(<MetricName target={hrv} testID="name-hrv" />));
    expect(screen.getByLabelText('What is HRV?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('name-hrv'));
    const sheet = within(screen.getByTestId('about-sheet'));
    for (const text of ['Heart rate variability', 'Your night', '46', 'ms', 'Often higher after', 'A long night\nA rest day\nA calm evening', 'Level B', 'Your usual range shows after 4 nights'])
      expect(sheet.getByText(text)).toBeTruthy();
    expect(sheet.getByLabelText('1 of 5 nights')).toBeTruthy();
  });

  it('shows the missing status in the about sheet', async () => {
    await render(wrap(<Open mode="about" target={{ term: 'skinTempChange', index: 0, shown: { value: null, unit: null, reason: 'needs-history' } }} />));
    await fireEvent.press(screen.getByTestId('open'));
    expect(within(screen.getByTestId('about-sheet')).getByText('No number until Monday')).toBeTruthy();
  });

  it('links to the coach and to all terms, closing the sheet', async () => {
    await render(wrap(<Open mode="about" target={hrv} />));
    await fireEvent.press(screen.getByTestId('open'));
    await fireEvent.press(screen.getByTestId('about-coach'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/coach', params: { term: 'hrv' } });
    expect(screen.queryByTestId('about-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('open'));
    await fireEvent.press(screen.getByTestId('about-all-terms'));
    expect(mockPush).toHaveBeenCalledWith('/settings/terms');
  });

  it('opens the why sheet for a missing value and switches to about', async () => {
    await render(wrap(<Open mode="why" target={{ term: 'skinTempChange', index: 0, shown: { value: null, unit: null, reason: 'needs-history' } }} />));
    await fireEvent.press(screen.getByTestId('open'));
    const sheet = within(screen.getByTestId('why-sheet'));
    for (const text of ['Skin temp change', 'No number yet', 'Your band is being read', 'Synced 10:21. The night was recorded.', 'It needs more nights', 'Expected Monday morning'])
      expect(sheet.getByText(text)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('why-about'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
  });

  it('says when the band was last synced instead of a check mark', async () => {
    await render(
      withAppData(
        <Open mode="why" target={{ term: 'consistency', index: 0, shown: { value: null, unit: null, reason: 'needs-history' } }} />,
        'en',
        { days: [firstNightDay()], device: { ...device, lastSyncAt: null } },
        FIRST_NIGHT_NOW_S,
      ),
    );
    await fireEvent.press(screen.getByTestId('open'));
    expect(within(screen.getByTestId('why-sheet')).getByText('Not synced yet')).toBeTruthy();
    expect(within(screen.getByTestId('why-sheet')).queryByText('Your band is being read')).toBeNull();
  });

  it('links a missing profile to the profile editor and closes on the backdrop', async () => {
    await render(wrap(<Open mode="why" target={{ term: 'calories', index: 0, shown: { value: null, unit: null, reason: 'no-profile' } }} />));
    await fireEvent.press(screen.getByTestId('open'));
    await fireEvent.press(screen.getByTestId('why-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');
    await fireEvent.press(screen.getByTestId('open'));
    await fireEvent.press(screen.getByTestId('why-sheet-backdrop'));
    expect(screen.queryByTestId('why-sheet')).toBeNull();
  });
});

describe('sheet layout from N3 and N4', () => {
  it('puts the value beside its label, the level beside the method and closes from the round button', async () => {
    await render(wrap(<Open mode="about" target={hrv} />));
    await fireEvent.press(screen.getByTestId('open'));
    const shown = within(screen.getByTestId('about-shown'));
    expect(shown.getByText('Your night')).toBeTruthy();
    expect(shown.getByText('46')).toBeTruthy();
    expect(within(screen.getByTestId('about-level')).getByText('Level B')).toBeTruthy();
    expect(screen.getByTestId('about-coach')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('about-sheet-close'));
    expect(screen.queryByTestId('about-sheet')).toBeNull();
  });

  it('closes the why sheet from its round button too', async () => {
    await render(wrap(<Open mode="why" target={{ term: 'skinTempChange', index: 0, shown: { value: null, unit: null, reason: 'needs-history' } }} />));
    await fireEvent.press(screen.getByTestId('open'));
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('why-sheet-close'));
    expect(screen.queryByTestId('why-sheet')).toBeNull();
  });
});
