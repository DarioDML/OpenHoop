import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays, createFixtureSettings } from '@/data/fixtureSource';

import { FIXTURE_NOW, withAppData } from './support/appData';

let mockParams: Record<string, string | string[] | undefined> = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href), back: jest.fn(), replace: (href: unknown) => mockReplace(href), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import ReadinessScreen from '@/app/recovery/index';

const days = createFixtureDays(FIXTURE_NOW);

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockParams = {};
});

function scoredDays(value: number) {
  return days.map((d, i) => (i === days.length - 1 ? { ...d, readiness: { ...d.readiness, value, reason: null }, readinessCalibrating: false } : d));
}

describe('Readiness screen', () => {
  it('shows the band inside the ring and a verdict built from the contributors', async () => {
    await render(withAppData(<ReadinessScreen />, 'en', { days: scoredDays(52) }));
    const ring = within(screen.getByTestId('ring-readiness-detail'));
    expect(ring.getByText('Medium')).toBeTruthy();
    expect(screen.getByTestId('readiness-verdict')).toHaveTextContent(/Train, but keep it moderate\.$/);
  });

  it('praises a high score', async () => {
    await render(withAppData(<ReadinessScreen />, 'en', { days: scoredDays(84) }));
    expect(screen.getByTestId('readiness-verdict')).toHaveTextContent('Your body has recovered well. A good day to push.');
  });

  it('links the load target card to the target screen', async () => {
    await render(withAppData(<ReadinessScreen />));
    expect(screen.getByTestId('card-load-target-range')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('card-load-target'));
    expect(mockPush).toHaveBeenCalledWith('/load/target');
  });

  it('says the load target is still calibrating without load history', async () => {
    await render(withAppData(<ReadinessScreen />, 'en', { days: days.slice(-2) }));
    expect(screen.getByTestId('card-load-target-calibrating')).toBeTruthy();
  });

  it('lists every contributor against its baseline and links to its detail', async () => {
    await render(withAppData(<ReadinessScreen />));
    for (const id of ['hrv', 'rhr', 'sleep', 'resp', 'spo2', 'temp']) expect(screen.getByTestId(`row-${id}`)).toBeTruthy();
    expect(screen.getByTestId('row-hrv-caption')).toHaveTextContent(/^Baseline \d+ ms$/);
    expect(screen.getByTestId('row-hrv-chip')).toHaveTextContent(/^(= normal|↑ \d+% higher|↓ \d+% lower)$/);
    await fireEvent.press(screen.getByTestId('row-hrv'));
    expect(mockPush).toHaveBeenCalledWith('/recovery/metric/hrv');
    await fireEvent.press(screen.getByTestId('row-sleep'));
    expect(mockPush).toHaveBeenCalledWith('/sleep');
  });

  it('explains a contributor in place without navigating', async () => {
    await render(withAppData(<ReadinessScreen />));
    await fireEvent.press(screen.getByTestId('row-rhr-name'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows skin temperature as a deviation in the chosen units', async () => {
    const last = days[days.length - 1];
    if (last === undefined) throw new Error('no fixture day');
    const tempDays = [...days.slice(0, -1), { ...last, skinTempDeviationC: { ...last.skinTempDeviationC, value: -0.4, reason: null } }];
    await render(withAppData(<ReadinessScreen />, 'en', { days: tempDays, settings: { ...createFixtureSettings('en', FIXTURE_NOW), units: 'imperial' } }));
    expect(screen.getByTestId('row-temp-value')).toHaveTextContent('−0.7 °F');
    expect(screen.getByTestId('row-temp-caption')).toHaveTextContent('Deviation from baseline');
  });

  it('links impacts and trends and draws the last seven days', async () => {
    await render(withAppData(<ReadinessScreen />));
    expect(screen.getAllByTestId(/^chart-readiness-week-/)).toHaveLength(7);
    await fireEvent.press(screen.getByTestId('link-impacts'));
    expect(mockPush).toHaveBeenCalledWith('/recovery/impacts');
    await fireEvent.press(screen.getByTestId('link-trends'));
    expect(mockPush).toHaveBeenCalledWith('/recovery/trends');
  });

  it('keeps the signed contributions, the explanation and the level note', async () => {
    await render(withAppData(<ReadinessScreen />));
    expect(screen.getByTestId('card-contributions')).toBeTruthy();
    expect(screen.getByText('How it is computed')).toBeTruthy();
    expect(screen.getByTestId('readiness-level')).toHaveTextContent(/not measured yet/);
    await fireEvent.press(screen.getByTestId('readiness-about'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
  });
});
