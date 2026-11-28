import type { DayRecord } from '@openhoop/core';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createFixtureDays } from '@/data/fixtureSource';
import { defaultLoadBuzzPrefs } from '@/data/loadBuzz';
import { periodStats } from '@/data/activityDerived';
import { addDays, daysInWeek, visibleReadiness, weekStart } from '@/data/derived';
import { aimAt, daysOnTarget, isoWeekNumber } from '@/data/loadDerived';
import { defaultHealthConnectState } from '@/data/healthConnectState';
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
import LoadTargetScreen from '@/app/load/target';
import LoadTrendsScreen from '@/app/load/trends';
import LoadWeekScreen from '@/app/load/week';
import StepsScreen from '@/app/steps';

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
    expect(screen.getByTestId('load-ready-basis')).toHaveTextContent(/^Estimated at \d+ bpm, your usual heart rate in zone 2–3\.$/);
    await view.rerender(withAppData(<LoadScreen />, 'en', { days: withLoad(20.5) }));
    expect(screen.getByTestId('load-ready-advice')).toHaveTextContent("You're past the top of today's target. Keep the rest of the day easy so you recover for tomorrow.");
    expect(screen.getByTestId('load-target-pill-text')).toHaveTextContent(/past the top$/);
    expect(screen.queryByTestId('load-ready-basis')).toBeNull();
    expect(screen.getByTestId('load-usual-status')).toHaveTextContent('Today: above your usual range');
    expect(screen.getByTestId('load-usual-range')).toHaveTextContent(/^Usual range .+, before today's readiness$/);
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

describe('Load target screen', () => {
  it('shows progress to the target with a time estimate', async () => {
    const list = withLoad(1);
    const aim = aimAt(list, list.length - 1);
    await render(withAppData(<LoadTargetScreen />, 'en', { days: list }));
    expect(within(screen.getByTestId('target-ring')).getByText('1.0')).toBeTruthy();
    expect(screen.getByTestId('target-progress-percent')).toHaveTextContent(`${Math.round((1 / (aim?.low ?? 1)) * 100)}%`);
    expect(screen.getByTestId('target-estimate')).toHaveTextContent(/^About \d+ min in zone 2–3 gets you there\.$/);
    expect(screen.getByTestId('target-basis')).toHaveTextContent(/^Estimated at \d+ bpm/);
    expect(screen.getByTestId('target-pill-text')).toHaveTextContent(/to go$/);
    expect(screen.getByTestId('target-today')).toHaveTextContent(`Today's target: ${aim?.low.toFixed(1)}–${aim?.high.toFixed(1)}`);
  });

  it('says when the target is reached or passed', async () => {
    const list = withLoad(20.9);
    const aim = aimAt(list, list.length - 1);
    const view = await render(withAppData(<LoadTargetScreen />, 'en', { days: list }));
    expect(screen.getByTestId('target-estimate')).toHaveTextContent(`You passed the top of today's target (${aim?.high.toFixed(1)}).`);
    expect(screen.getByTestId('target-progress-percent')).toHaveTextContent('100%');
    expect(screen.queryByTestId('target-basis')).toBeNull();
    const inside = withLoad(((aim?.low ?? 0) + (aim?.high ?? 0)) / 2);
    await view.rerender(withAppData(<LoadTargetScreen />, 'en', { days: inside }));
    expect(screen.getByTestId('target-estimate')).toHaveTextContent(/^You reached today's target\./);
  });

  it('says the target needs more days while calibrating', async () => {
    await render(withAppData(<LoadTargetScreen />, 'en', { days: days.slice(0, 3) }));
    expect(screen.getByTestId('target-estimate')).toHaveTextContent(/needs a few more days of load/);
    expect(screen.queryByTestId('target-progress-percent')).toBeNull();
    expect(screen.getByTestId('buzz-availability')).toHaveTextContent('There is no target yet, so nothing buzzes until your target appears.');
  });

  it('stores both buzz switches', async () => {
    const updateUserData = jest.fn(async () => true);
    const view = await render(withAppData(<LoadTargetScreen />, 'en', { days: withLoad(1), updateUserData }));
    await fireEvent(screen.getByTestId('buzz-target'), 'valueChange', true);
    expect(updateUserData).toHaveBeenLastCalledWith({ loadBuzz: { ...defaultLoadBuzzPrefs(), atTarget: true } });
    await fireEvent(screen.getByTestId('buzz-top'), 'valueChange', true);
    expect(updateUserData).toHaveBeenLastCalledWith({ loadBuzz: { ...defaultLoadBuzzPrefs(), overTop: true } });
    expect(screen.getByTestId('buzz-availability')).toHaveTextContent(/Checks after every sync/);
    const list = withLoad(9);
    const nowS = todayClock(lastDay(list));
    const userData = { ...defaultUserData(), loadBuzz: { atTarget: true, overTop: true, lastTarget: lastDay(list).day, lastTop: null } };
    await view.rerender(withAppData(<LoadTargetScreen />, 'en', { days: list, userData }, nowS));
    expect(screen.getByText(/· done today$/)).toBeTruthy();
    expect(screen.getByText(/^Two buzzes, warns above \d/)).toBeTruthy();
  });

  it('names the last sync when a real band is paired', async () => {
    await render(withAppData(<LoadTargetScreen />, 'en', { settings: { language: 'en', dataSource: 'band', ownerSince: null, units: 'metric' } }));
    expect(screen.getByTestId('buzz-availability')).toHaveTextContent(/^Checks after every sync and during a live activity\. The band must be connected\. Last sync \d{2}:\d{2}\.$/);
  });

  it('keeps the explanations and the start button', async () => {
    await render(withAppData(<LoadTargetScreen />));
    expect(screen.getByText('Where this range comes from')).toBeTruthy();
    expect(screen.getByTestId('target-usual')).toHaveTextContent(/^Usually between/);
    expect(screen.getByTestId('target-advice')).toBeTruthy();
    expect(screen.getByTestId('target-level')).toHaveTextContent(/Muscular load is not included yet/);
    await fireEvent.press(screen.getByTestId('target-progress-name'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('target-start'));
    expect(router.push).toHaveBeenCalledWith('/activity/start');
  });
});

describe('Steps screen', () => {
  it('shows a ring against the goal, the hours of today and the last 7 days', async () => {
    const last = lastDay();
    const goal = 20_000;
    await render(withAppData(<StepsScreen />, 'en', { userData: { ...defaultUserData(), stepsGoal: goal } }));
    expect(screen.getByTestId('steps-today')).toHaveTextContent(String(last.steps));
    const steps = last.steps ?? 0;
    expect(screen.getByTestId('steps-goal-line')).toHaveTextContent(`${Math.round((steps / goal) * 100)}% of ${goal} · ${goal - steps} to go`);
    const hours = last.stepsByHour ?? [];
    expect(hours.length).toBeGreaterThan(0);
    for (const hour of hours) expect(screen.getByTestId(`steps-by-hour-${hour.t}`)).toBeTruthy();
    expect(screen.getByTestId(`steps-by-hour-${hours[0]?.t}`).props.accessibilityLabel).toBe(`7:00: ${hours[0]?.steps}`);
    const week = days.slice(-7);
    for (const day of week) expect(screen.getByTestId(`steps-week-${day.day}`)).toBeTruthy();
    expect(screen.getByTestId(`steps-week-${last.day}`)).toHaveTextContent(new RegExp(`^${(Math.round(steps / 100) / 10).toFixed(1).replace('.', '\\.')}`));
    expect(screen.getByTestId('steps-avg-short')).toHaveTextContent(/^avg \d+\.\dk$/);
    expect(screen.getByTestId('steps-level')).toHaveTextContent(/not measured yet/);
  });

  it('says the goal is reached', async () => {
    await render(withAppData(<StepsScreen />, 'en', { userData: { ...defaultUserData(), stepsGoal: 1000 } }));
    expect(screen.getByTestId('steps-goal-line')).toHaveTextContent(/goal reached$/);
  });

  it('explains a missing split per hour', async () => {
    const last = lastDay();
    const view = await render(withAppData(<StepsScreen />, 'en', { days: [...days.slice(0, -1), { ...last, stepsByHour: undefined }] }));
    expect(screen.getByTestId('steps-hour-note')).toHaveTextContent('The split per hour appears after the next sync.');
    await view.rerender(withAppData(<StepsScreen />, 'en', { days: [...days.slice(0, -1), { ...last, steps: null, stepsByHour: [] }] }));
    expect(screen.getByTestId('steps-today-none')).toBeTruthy();
    expect(screen.getByTestId('steps-hour-note')).toHaveTextContent('The band has not counted any steps yet today.');
    const healthConnect = { availability: 'available' as const, granted: [], state: { ...defaultHealthConnectState(), steps: [{ day: last.day, steps: 4_321, origins: [] }] }, syncing: false };
    await view.rerender(withAppData(<StepsScreen />, 'en', { days: [...days.slice(0, -1), { ...last, steps: null }], healthConnect }));
    expect(screen.getByTestId('steps-hour-note')).toHaveTextContent(/Health Connect only gives a day total/);
  });

  it('switches to 30 days', async () => {
    await render(withAppData(<StepsScreen />));
    await fireEvent.press(screen.getByText('30 days'));
    expect(screen.getByText('Last 30 days')).toBeTruthy();
    expect(screen.queryByTestId('steps-week')).toBeNull();
  });
});

describe('Load trends screen', () => {
  it('draws load against readiness with a legend and four tiles', async () => {
    const week = days.slice(-7);
    const stats = periodStats(week);
    const target = daysOnTarget(days, days.length - 7, days.length);
    await render(withAppData(<LoadTrendsScreen />));
    expect(screen.getByTestId('trend-chart').props.children).toBeTruthy();
    expect(screen.getByLabelText('Load and readiness over 7 days')).toBeTruthy();
    expect(screen.getByTestId('trend-chart-avg')).toHaveTextContent(`avg ${(stats.load ?? 0).toFixed(1)}`);
    expect(screen.getByTestId('trend-legend')).toHaveTextContent(`Load (0–21)Readiness (%) · avg ${Math.round(stats.readiness ?? 0)}`);
    expect(screen.getByTestId('trend-avg-value')).toHaveTextContent((stats.load ?? 0).toFixed(1));
    expect(screen.getByTestId('trend-peak-value')).toHaveTextContent((stats.peakLoad?.value ?? 0).toFixed(1));
    expect(screen.getByTestId('trend-ontarget-value')).toHaveTextContent(`${target.on}/${target.measured}`);
    expect(screen.getByText(`${Math.round((target.on / target.measured) * 100)}% on target`)).toBeTruthy();
    const total = week.reduce((sum, d) => sum + (d.load.value ?? 0), 0);
    expect(screen.getByTestId('trend-total-value')).toHaveTextContent(total.toFixed(1));
    expect(screen.getByTestId('trend-loaddays')).toHaveTextContent(/^\d of 7 days were load days\.$/);
    expect(screen.getByText('A load day is a day with a load of 7 or more.')).toBeTruthy();
  });

  it('shows the start and end date on longer ranges', async () => {
    await render(withAppData(<LoadTrendsScreen />));
    await fireEvent.press(screen.getByText('1M'));
    expect(screen.getByLabelText('Load and readiness over 30 days')).toBeTruthy();
    const month = days.slice(-30);
    expect(screen.getByText(`${Number(month[0]?.day.slice(5, 7))}/${Number(month[0]?.day.slice(8))}`)).toBeTruthy();
  });

  it('says on-target days need history', async () => {
    await render(withAppData(<LoadTrendsScreen />, 'en', { days: days.slice(0, 3) }));
    expect(screen.getByTestId('trends-few')).toBeTruthy();
    expect(screen.getByTestId('trend-ontarget-reason')).toBeTruthy();
  });
});

describe('Weekly overview', () => {
  it('shows the week number, a combined chart and daily blocks', async () => {
    const start = weekStart(lastDay().day);
    const week = daysInWeek(days, start);
    await render(withAppData(<LoadWeekScreen />));
    expect(screen.getByText(`Week ${isoWeekNumber(start)}`)).toBeTruthy();
    expect(screen.getByTestId('week-chart')).toBeTruthy();
    week.forEach((d, i) => {
      const load = d?.load.value ?? null;
      expect(screen.getByTestId(`week-load-${i}`)).toHaveTextContent(load === null ? '' : load.toFixed(1));
      const readiness = d === null ? null : visibleReadiness(d).value;
      expect(screen.getByTestId(`week-readiness-${i}`)).toHaveTextContent(readiness === null ? '' : String(Math.round(readiness)));
    });
    expect(screen.getByTestId('week-legend')).toHaveTextContent('Readiness %Load');
    week.forEach((d, i) => {
      const date = addDays(start, i);
      if (d === null && date > lastDay().day) expect(screen.getByTestId(`week-gap-${date}`)).toHaveTextContent(/: still to come$/);
    });
    const index = week.findIndex((d) => d !== null);
    await fireEvent.press(screen.getByTestId(`week-day-${index}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/day/[day]', params: { day: addDays(start, index) } });
  });

  it('gives each empty block its own reason', async () => {
    const start = weekStart(lastDay().day);
    const monday = days.find((d) => d.day === start);
    if (monday === undefined) throw new Error('fixture week');
    const index = days.indexOf(monday);
    const latest = { ...lastDay(), load: { ...lastDay().load, value: null, reason: 'low-coverage' }, loadSoFar: 4.2 };
    const list = [
      ...days.slice(0, index),
      { ...monday, readinessCalibrating: true, load: { ...monday.load, value: null, reason: 'no-data' } },
      ...days.slice(index + 2, -1),
      latest,
    ];
    await render(withAppData(<LoadWeekScreen />, 'en', { days: list }));
    expect(screen.getByTestId(`week-gap-${start}`)).toHaveTextContent(/^Mo: load: no data, readiness calibrating$/);
    expect(screen.getByTestId(`week-gap-${addDays(start, 1)}`)).toHaveTextContent(/^Tu: no data$/);
    expect(screen.getByTestId(`week-gap-${latest.day}`)).toHaveTextContent(/: load still open, 4\.2 so far$/);
    await fireEvent.press(screen.getByTestId('week-info'));
    expect(screen.getByText(/each line on its own scale/)).toBeTruthy();
  });

  it('goes to the previous week and opens the explanation', async () => {
    const start = weekStart(lastDay().day);
    await render(withAppData(<LoadWeekScreen />));
    await fireEvent.press(screen.getByLabelText('Previous week'));
    expect(screen.getByText(`Week ${isoWeekNumber(addDays(start, -7))}`)).toBeTruthy();
    expect(screen.getByTestId('week-summary')).toHaveTextContent(/^Total load/);
    await fireEvent.press(screen.getByTestId('week-info'));
    expect(within(screen.getByTestId('week-about')).getByText('About this week')).toBeTruthy();
  });
});
