import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import LoadScreen from '@/app/load';
import ReadinessScreen from '@/app/recovery';
import SleepScreen from '@/app/sleep';
import { sleepEfficiency } from '@/data/dailyDerived';
import { createFixtureDevice } from '@/data/fixtureSource';
import type { Language } from '@/data/types';
import { Ring } from '@/ui/Ring';

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

const staged = (wake: number) => firstNightDay({ sleep: { ...firstNightDay().sleep, asleepS: 27_000, inBedS: 28_800, stages: { algo: 'x', reason: null, coverage: 0.9, totals: { wake, light: 14_400, deep: 5_400, rem: 5_400 } } } });

describe('explain on screens', () => {
  it('computes efficiency from stages when they exist', () => {
    expect(sleepEfficiency(staged(3_600))).toBe(88);
    expect(sleepEfficiency(firstNightDay({ sleep: { ...staged(0).sleep, stages: undefined } }))).toBe(94);
    expect(sleepEfficiency(staged(40_000))).toBe(0);
    expect(sleepEfficiency(firstNightDay({ sleep: { ...firstNightDay().sleep, inBedS: null } }))).toBeNull();
  });
  it('draws a segmented ring', async () => {
    await render(wrap(<Ring testID="r" fraction={null} color="red" segments={{ count: 4, filled: 1 }} />));
    expect(screen.getAllByTestId(/^r-segment-/)).toHaveLength(4);
  });
  it('uses stage wake for the sleep efficiency row and explains consistency', async () => {
    await render(withAppData(<SleepScreen />, 'en', { days: [staged(3_600)], device }, FIRST_NIGHT_NOW_S));
    expect(screen.getByTestId('contrib-efficiency')).toHaveTextContent('88%', { exact: false });
    expect(screen.getByTestId('contrib-consistency')).toHaveTextContent('1 more night ›', { exact: false });
    await fireEvent.press(screen.getByTestId('contrib-consistency-why'));
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
  });
  it('hides readiness on the first night and says how many nights are left', async () => {
    await render(wrap(<ReadinessScreen />));
    const ring = within(screen.getByTestId('ring-readiness-detail'));
    expect(ring.getByText('3')).toBeTruthy();
    expect(ring.getByText('Nights left')).toBeTruthy();
    expect(ring.queryByText('46')).toBeNull();
    expect(screen.queryByTestId('band-chip')).toBeNull();
    expect(screen.queryByTestId('calibrating-hint')).toBeNull();
    expect(screen.getByTestId('contributions-why')).toHaveTextContent('3 more nights', { exact: false });
    await fireEvent.press(screen.getByTestId('ring-readiness-detail-why'));
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
  });
  it('says Night left when one night remains', async () => {
    const days = ['2026-11-25', '2026-11-26', '2026-11-27'].map((d) => firstNightDay({ day: d }));
    await render(withAppData(<ReadinessScreen />, 'en', { days, device }, FIRST_NIGHT_NOW_S));
    expect(within(screen.getByTestId('ring-readiness-detail')).getByText('Night left')).toBeTruthy();
  });
  it('shows Load so far on the open day', async () => {
    await render(wrap(<LoadScreen />));
    const ring = within(screen.getByTestId('ring-load-detail'));
    expect(ring.getByText('4.6')).toBeTruthy();
    expect(ring.getByText('So far · of 21')).toBeTruthy();
    expect(screen.getByText('So far today · synced 10:21')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('load-about'));
    expect(within(screen.getByTestId('about-sheet')).getByText('How hard your heart worked')).toBeTruthy();
  });
});
