import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { formatMinutes } from '@/data/dailyDerived';
import { createFixtureDays } from '@/data/fixtureSource';
import { anchorFromHistory } from '@/data/jetLag';
import { defaultUserData, type SavedJetLagPlan, type UserData } from '@/data/userData';
import type { Language } from '@/data/types';
import { deviceTimeZone } from '@/lib/timeZones';

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

import JetLagScreen from '@/app/sleep/jet-lag';

function has(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

async function pickZone(testID: string, query: string, zone: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(testID));
  await fireEvent.changeText(screen.getByTestId(`${testID}-search`), query);
  await fireEvent.press(screen.getByTestId(`${testID}-option-${zone}`));
}

const history = anchorFromHistory(createFixtureDays(FIXTURE_NOW));

const SAVED: SavedJetLagPlan = {
  departureDate: '2026-03-10',
  departureMinutes: 600,
  homeZone: 'Europe/Brussels',
  destZone: 'Asia/Tokyo',
  preDays: null,
  bedMinutes: 1380,
  wakeMinutes: 420,
  anchorSource: 'entered',
};

interface Rendered {
  update: jest.Mock<Promise<boolean>, [Partial<UserData>]>;
  tree: ReactElement;
}

function setup(options: { saved?: SavedJetLagPlan | null; language?: Language; noHistory?: boolean } = {}): Rendered {
  const update = jest.fn(async (_patch: Partial<UserData>): Promise<boolean> => true);
  const days = options.noHistory ? [] : createFixtureDays(FIXTURE_NOW);
  const userData: UserData = { ...defaultUserData(), onboardingDone: true, jetLagPlan: options.saved ?? null };
  return { update, tree: withAppData(<JetLagScreen />, options.language ?? 'en', { days, userData, updateUserData: update }) };
}

async function fillTrip(): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('jetlag-date'), '2026-03-10');
  await fireEvent.changeText(screen.getByTestId('jetlag-time'), '10:00');
  await pickZone('zone-home', 'brussels', 'Europe/Brussels');
  await fireEvent.press(screen.getByTestId('zone-dest'));
  await fireEvent.changeText(screen.getByTestId('zone-dest-search'), 'tokyo');
  await fireEvent.press(screen.getByTestId('zone-dest-option-Asia/Tokyo'));
}

describe('jet lag screen', () => {
  it('starts empty, with the device time zone and your own sleep times filled in', async () => {
    expect(history).not.toBeNull();
    const { tree } = setup();
    await render(tree);
    expect(screen.getByTestId('sleep-jet-lag')).toBeTruthy();
    expect(screen.getByTestId('jetlag-date').props.value).toBe('');
    expect(screen.getByTestId('jetlag-bed').props.value).toBe(formatMinutes(history?.bedMinutes ?? -1));
    expect(screen.getByTestId('jetlag-wake').props.value).toBe(formatMinutes(history?.wakeMinutes ?? -1));
    expect(screen.getByTestId('jetlag-anchor-note').props.children).toContain('Filled in from your last');
    const zone = deviceTimeZone();
    if (zone !== null) expect(screen.getByTestId('zone-home')).toHaveTextContent(has(zone));
    expect(screen.queryByTestId('jetlag-summary')).toBeNull();
    expect(screen.queryByTestId('jetlag-problem')).toBeNull();
    expect(screen.getByTestId('jetlag-save')).toBeDisabled();
    expect(screen.getAllByText('General guidance').length).toBe(2);
    expect(screen.getAllByText(/not medical advice/).length).toBeGreaterThan(0);
  });

  it('uses the times you enter and says so when there is no sleep history', async () => {
    const { tree } = setup({ noHistory: true });
    await render(tree);
    expect(screen.getByTestId('jetlag-bed').props.value).toBe('');
    expect(screen.getByTestId('jetlag-anchor-note')).toHaveTextContent(has('not enough sleep history'));
    await fillTrip();
    expect(screen.getByTestId('jetlag-problem')).toHaveTextContent(has('Enter your usual bedtime'));
    await fireEvent.changeText(screen.getByTestId('jetlag-bed'), '23:00');
    await fireEvent.changeText(screen.getByTestId('jetlag-wake'), '07:00');
    expect(screen.queryByTestId('jetlag-problem')).toBeNull();
    expect(screen.getByTestId('jetlag-summary')).toBeTruthy();
  });

  it('builds an eastward plan day by day in both time zones', async () => {
    const { tree } = setup();
    await render(tree);
    await fillTrip();
    await fireEvent.changeText(screen.getByTestId('jetlag-bed'), '23:00');
    await fireEvent.changeText(screen.getByTestId('jetlag-wake'), '07:00');
    expect(screen.getByTestId('jetlag-direction')).toHaveTextContent(has('8 h ahead of home'));
    expect(screen.getByTestId('jetlag-direction')).toHaveTextContent(has('earlier by about 1 h per day'));
    expect(screen.getByTestId('jetlag-departure')).toHaveTextContent(has('Home 10:00 · Destination 18:00'));
    for (const offset of [-3, -2, -1, 0, 1, 2, 3, 4]) expect(screen.getByTestId(`jetlag-day-${offset}`)).toBeTruthy();
    expect(screen.getByTestId('jetlag-bed--3')).toHaveTextContent(has('Home 22:00 · Destination 06:00'));
    expect(screen.getByTestId('jetlag-seek--3')).toBeTruthy();
    expect(screen.getByTestId('jetlag-avoid--3')).toBeTruthy();
    expect(screen.getByTestId('jetlag-bed-4')).toHaveTextContent(has('Destination 23:00'));
    expect(screen.queryByTestId('jetlag-seek-4')).toBeNull();
    expect(screen.getByText('3 days before')).toBeTruthy();
    expect(screen.getByText('Travel day')).toBeTruthy();
  });

  it('changes the number of days to adjust before leaving', async () => {
    const { tree } = setup();
    await render(tree);
    await fillTrip();
    await fireEvent.changeText(screen.getByTestId('jetlag-bed'), '23:00');
    await fireEvent.changeText(screen.getByTestId('jetlag-wake'), '07:00');
    expect(screen.getByTestId('predays-value')).toHaveTextContent(has('Automatic (3)'));
    await fireEvent.press(screen.getByTestId('predays-less'));
    expect(screen.getByTestId('predays-value')).toHaveTextContent(has('2 days'));
    expect(screen.queryByTestId('jetlag-day--3')).toBeNull();
    expect(screen.getByTestId('jetlag-day--2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('predays-auto'));
    expect(screen.getByTestId('predays-value')).toHaveTextContent(has('Automatic (3)'));
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByTestId('predays-less'));
    expect(screen.getByTestId('predays-value')).toHaveTextContent(has('0 days'));
    expect(screen.getByTestId('predays-less')).toBeDisabled();
  });

  it('does not offer more days to adjust than the shift needs', async () => {
    const { tree } = setup();
    await render(tree);
    await fireEvent.changeText(screen.getByTestId('jetlag-date'), '2026-03-10');
    await fireEvent.changeText(screen.getByTestId('jetlag-time'), '10:00');
    await pickZone('zone-home', 'brussels', 'Europe/Brussels');
    await pickZone('zone-dest', 'athens', 'Europe/Athens');
    await fireEvent.changeText(screen.getByTestId('jetlag-bed'), '23:00');
    await fireEvent.changeText(screen.getByTestId('jetlag-wake'), '07:00');
    expect(screen.getByTestId('predays-more')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('predays-less'));
    expect(screen.getByTestId('predays-value')).toHaveTextContent(has('0 days'));
    await fireEvent.press(screen.getByTestId('predays-more'));
    expect(screen.getByTestId('predays-value')).toHaveTextContent(has('1 day'));
    expect(screen.getByTestId('predays-more')).toBeDisabled();
  });

  it('shows a westward plan with later bedtimes', async () => {
    const { tree } = setup();
    await render(tree);
    await fireEvent.changeText(screen.getByTestId('jetlag-date'), '2026-06-10');
    await fireEvent.changeText(screen.getByTestId('jetlag-time'), '10:00');
    await pickZone('zone-home', 'brussels', 'Europe/Brussels');
    await pickZone('zone-dest', 'new_york', 'America/New_York');
    await fireEvent.changeText(screen.getByTestId('jetlag-bed'), '23:00');
    await fireEvent.changeText(screen.getByTestId('jetlag-wake'), '07:00');
    expect(screen.getByTestId('jetlag-direction')).toHaveTextContent(has('6 h behind home'));
    expect(screen.getByTestId('jetlag-direction')).toHaveTextContent(has('later by about 1.5 h per day'));
    expect(screen.getByTestId('jetlag-bed--3')).toHaveTextContent(has('Home 00:30 · Destination 18:30'));
  });

  it('crosses the date line and names the destination date', async () => {
    const { tree } = setup();
    await render(tree);
    await fireEvent.changeText(screen.getByTestId('jetlag-date'), '2026-01-10');
    await fireEvent.changeText(screen.getByTestId('jetlag-time'), '10:00');
    await pickZone('zone-home', 'honolulu', 'Pacific/Honolulu');
    await pickZone('zone-dest', 'auckland', 'Pacific/Auckland');
    await fireEvent.changeText(screen.getByTestId('jetlag-bed'), '23:00');
    await fireEvent.changeText(screen.getByTestId('jetlag-wake'), '07:00');
    expect(screen.getByTestId('jetlag-direction')).toHaveTextContent(has('1 h behind home'));
    expect(screen.getByTestId('jetlag-departure')).toHaveTextContent(has('Home 10:00 · Destination 09:00 ('));
  });

  it('says no shift is needed for the same time and shows no days', async () => {
    const { tree } = setup();
    await render(tree);
    await fireEvent.changeText(screen.getByTestId('jetlag-date'), '2026-03-10');
    await fireEvent.changeText(screen.getByTestId('jetlag-time'), '10:00');
    await pickZone('zone-home', 'brussels', 'Europe/Brussels');
    await pickZone('zone-dest', 'paris', 'Europe/Paris');
    expect(screen.getByTestId('jetlag-none')).toBeTruthy();
    expect(screen.queryByTestId('jetlag-day-0')).toBeNull();
  });

  it('flags the clock change at home inside the plan', async () => {
    const { tree } = setup({ saved: { ...SAVED, departureDate: '2026-03-30', destZone: 'America/New_York' } });
    await render(tree);
    expect(screen.getByTestId('jetlag-dst-home--1')).toHaveTextContent(has('Clocks change at home'));
    expect(screen.queryByTestId('jetlag-dst-home-0')).toBeNull();
  });

  it('names what is wrong instead of making a plan', async () => {
    const { tree } = setup();
    await render(tree);
    await fireEvent.changeText(screen.getByTestId('jetlag-date'), '2026-02-30');
    expect(screen.getByTestId('jetlag-problem')).toHaveTextContent(has('Enter the departure date as YYYY-MM-DD'));
    await fireEvent.changeText(screen.getByTestId('jetlag-date'), '2026-03-10');
    expect(screen.getByTestId('jetlag-problem')).toHaveTextContent(has('Enter the departure time'));
    await fireEvent.changeText(screen.getByTestId('jetlag-time'), '10:00');
    expect(screen.getByTestId('jetlag-problem')).toHaveTextContent(has('Choose both time zones'));
    expect(screen.getByTestId('jetlag-save')).toBeDisabled();
  });

  it('saves one active plan, then clears it', async () => {
    const { tree, update } = setup();
    await render(tree);
    await fillTrip();
    await fireEvent.changeText(screen.getByTestId('jetlag-bed'), '23:00');
    await fireEvent.changeText(screen.getByTestId('jetlag-wake'), '07:00');
    await fireEvent.press(screen.getByTestId('jetlag-save'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({ jetLagPlan: SAVED });
    expect(screen.queryByTestId('jetlag-clear')).toBeNull();
  });

  it('opens a saved plan and offers to clear it', async () => {
    const { tree, update } = setup({ saved: SAVED });
    await render(tree);
    expect(screen.getByTestId('jetlag-date').props.value).toBe('2026-03-10');
    expect(screen.getByTestId('jetlag-time').props.value).toBe('10:00');
    expect(screen.getByTestId('jetlag-bed').props.value).toBe('23:00');
    expect(screen.getByText('Active plan')).toBeTruthy();
    expect(screen.getByTestId('jetlag-save')).toBeDisabled();
    expect(screen.getByTestId('jetlag-direction')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('jetlag-clear'));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ jetLagPlan: null }));
  });

  it('reports a failed clear', async () => {
    const { tree, update } = setup({ saved: SAVED });
    update.mockResolvedValue(false);
    await render(tree);
    await fireEvent.press(screen.getByTestId('jetlag-clear'));
    await waitFor(() => expect(screen.getByTestId('jetlag-save-failed')).toBeTruthy());
  });

  it('is available in Dutch', async () => {
    const { tree } = setup({ saved: SAVED, language: 'nl' });
    await render(tree);
    expect(screen.getByText('Jetlagplan')).toBeTruthy();
    expect(screen.getByTestId('jetlag-direction')).toHaveTextContent(has('loopt 8 h voor op thuis'));
    expect(screen.getByText('3 dagen ervoor')).toBeTruthy();
    expect(screen.getByText('Reisdag')).toBeTruthy();
    expect(screen.getAllByText(/geen medisch advies/).length).toBeGreaterThan(0);
  });
});
