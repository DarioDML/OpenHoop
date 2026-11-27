import type { DayRecord } from '@openhoop/core';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createFixtureDays } from '@/data/fixtureSource';
import { defaultLoadBuzzPrefs } from '@/data/loadBuzz';
import { aimAt } from '@/data/loadDerived';
import { defaultUserData } from '@/data/userData';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';

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

import LoadScreen from '@/app/load/index';

const days = createFixtureDays(FIXTURE_NOW);

function lastDay(list: readonly DayRecord[] = days): DayRecord {
  const day = list[list.length - 1];
  if (day === undefined) throw new Error('fixture');
  return day;
}

function withLoad(value: number): DayRecord[] {
  const last = lastDay();
  return [...days.slice(0, -1), { ...last, load: { ...last.load, value } }];
}

function todayClock(day: DayRecord): number {
  const noon = day.start + 12 * 3600;
  expect(unixToIsoDate(noon, deviceTzOffsetS(new Date(noon * 1000)))).toBe(day.day);
  return noon;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Load screen', () => {
  it('shows the ring with the target range and how far there is to go', async () => {
    const list = withLoad(1);
    const aim = aimAt(list, list.length - 1);
    expect(aim).not.toBeNull();
    await render(withAppData(<LoadScreen />, 'en', { days: list }));
    expect(screen.getByTestId('ring-load-detail-target')).toBeTruthy();
    expect(within(screen.getByTestId('ring-load-detail')).getByText('Day load · of 21')).toBeTruthy();
    const toGo = ((aim?.low ?? 0) - 1).toFixed(1);
    expect(screen.getByTestId('load-target-pill-text')).toHaveTextContent(`Target ${aim?.low.toFixed(1)}–${aim?.high.toFixed(1)} · ${toGo} to go`);
    await fireEvent.press(screen.getByTestId('load-target-pill'));
    expect(router.push).toHaveBeenCalledWith('/load/target');
  });

  it('gives a time-based advice below the target and plain advice inside or above it', async () => {
    const view = await render(withAppData(<LoadScreen />, 'en', { days: withLoad(1) }));
    expect(screen.getByTestId('load-ready-advice')).toHaveTextContent(/min in zone 2–3 lands you inside/);
    await view.rerender(withAppData(<LoadScreen />, 'en', { days: withLoad(20.5) }));
    expect(screen.getByTestId('load-ready-advice')).toHaveTextContent("You're past the top of today's target. Keep the rest of the day easy so you recover for tomorrow.");
    expect(screen.getByTestId('load-target-pill-text')).toHaveTextContent(/past the top$/);
  });

  it('says the target is calibrating with too few days', async () => {
    const short = days.slice(0, 3);
    await render(withAppData(<LoadScreen />, 'en', { days: short }));
    expect(screen.getByTestId('load-target-pill-text')).toHaveTextContent('Your target appears after a few days of load');
    expect(screen.getByTestId('load-ready-advice')).toHaveTextContent(/needs a few more days of load/);
    expect(screen.queryByTestId('ring-load-detail-target')).toBeNull();
  });

  it('starts an activity from the ready card', async () => {
    await render(withAppData(<LoadScreen />));
    await fireEvent.press(screen.getByTestId('load-start'));
    expect(router.push).toHaveBeenCalledWith('/activity/start');
  });

  it('turns Buzz at target on and marks a threshold already passed today', async () => {
    const list = withLoad(20);
    const updateUserData = jest.fn(async () => true);
    const nowS = todayClock(lastDay(list));
    await render(withAppData(<LoadScreen />, 'en', { days: list, updateUserData }, nowS));
    expect(screen.getByTestId('load-buzz').props.accessibilityState).toEqual({ checked: false });
    expect(screen.queryByTestId('load-buzz-note')).toBeNull();
    await fireEvent.press(screen.getByTestId('load-buzz'));
    expect(updateUserData).toHaveBeenCalledWith({ loadBuzz: { ...defaultLoadBuzzPrefs(), atTarget: true, lastTarget: lastDay(list).day } });
  });

  it('turns Buzz at target off and says when it can run', async () => {
    const updateUserData = jest.fn(async () => true);
    const userData = { ...defaultUserData(), loadBuzz: { ...defaultLoadBuzzPrefs(), atTarget: true } };
    await render(withAppData(<LoadScreen />, 'en', { userData, updateUserData }));
    expect(screen.getByTestId('load-buzz').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('load-buzz-note')).toHaveTextContent(/Checks after every sync and during a live activity\. .*Demo data/);
    await fireEvent.press(screen.getByTestId('load-buzz'));
    expect(updateUserData).toHaveBeenCalledWith({ loadBuzz: defaultLoadBuzzPrefs() });
  });

  it('asks to pair a band before buzzing on band data', async () => {
    const userData = { ...defaultUserData(), loadBuzz: { ...defaultLoadBuzzPrefs(), atTarget: true } };
    await render(
      withAppData(<LoadScreen />, 'en', {
        userData,
        settings: { language: 'en', dataSource: 'band', ownerSince: null, units: 'metric' },
        device: { name: null, model: null, firmware: null, batteryPercent: null, lastSyncAt: null, backlogPages: null, lastSyncCounts: null, lockState: 'unknown', connection: 'disconnected', configSnapshot: null, batteryPack: null, band: null, hrBroadcast: null },
      }),
    );
    expect(screen.getByTestId('load-buzz-note')).toHaveTextContent('Pair your band first. Until then nothing can buzz.');
  });

  it('shows the live day load during an activity', async () => {
    const list = withLoad(3);
    const nowS = todayClock(lastDay(list));
    await render(withAppData(<LoadScreen />, 'en', { days: list, live: { active: true, heartRate: 150, lastRrMs: 400, updatedAt: nowS * 1000, dayLoad: 6.4 } }, nowS));
    const ring = within(screen.getByTestId('ring-load-detail'));
    expect(ring.getByText('6.4')).toBeTruthy();
    expect(ring.getByText('Live · of 21')).toBeTruthy();
  });

  it('keeps zones, heart rate, steps, calories, history and links', async () => {
    await render(withAppData(<LoadScreen />, 'en', { userData: { ...defaultUserData(), stepsGoal: 8000 } }));
    for (const zone of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`load-zone-${zone}`)).toBeTruthy();
    expect(screen.getByTestId('hr-avg')).toBeTruthy();
    expect(screen.getByTestId('steps-card-value')).toHaveTextContent(String(lastDay().steps));
    expect(screen.getByText(new RegExp(`^${Math.round(((lastDay().steps ?? 0) / 8000) * 100)}% of 8000$`))).toBeTruthy();
    expect(screen.getByTestId('calories-tile')).toBeTruthy();
    expect(screen.getByTestId('calories-card')).toBeTruthy();
    expect(screen.getByText('Load, last 14 days')).toBeTruthy();
    expect(screen.getByText('Load trends')).toBeTruthy();
    expect(screen.getByTestId('load-level')).toHaveTextContent(/Cardio load only/);
    await fireEvent.press(screen.getByTestId('steps-card'));
    expect(router.push).toHaveBeenCalledWith('/steps');
    await fireEvent.press(screen.getByTestId('load-target-card'));
    expect(router.push).toHaveBeenCalledWith('/load/target');
  });
});
