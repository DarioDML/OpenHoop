import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays } from '@/data/fixtureSource';
import { addDays } from '@/data/derived';
import { formatMinutes, isDayString, monthGrid, planBedtime, readinessImpacts, shiftMonth, singleParam, vitalsSummary, weekProgress } from '@/data/dailyDerived';

import { FIXTURE_NOW, withAppData } from './support/appData';

let mockParams: Record<string, string | string[] | undefined> = {};
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href), back: jest.fn(), replace: (href: string) => mockReplace(href), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import ActionCenterScreen from '@/app/action-center';
import HomeScreen from '@/app/(tabs)/index';
import PastDayScreen from '@/app/day/[day]';
import CustomizeScreen from '@/app/home/customize';
import DatePickerScreen from '@/app/home/date-picker';
import MorningBriefScreen from '@/app/home/morning-brief';
import NotificationsScreen from '@/app/home/notifications';
import WidgetsScreen from '@/app/home/widgets';
import ReadinessScreen from '@/app/recovery/index';
import ImpactsScreen from '@/app/recovery/impacts';
import MetricDetailScreen from '@/app/recovery/metric/[metric]';
import RecoveryTrendsScreen from '@/app/recovery/trends';
import SleepAlarmScreen from '@/app/sleep/alarm';
import SleepScreen from '@/app/sleep/index';
import LastNightScreen from '@/app/sleep/last-night';
import SleepPlannerScreen from '@/app/sleep/planner';
import SleepTrendsScreen from '@/app/sleep/trends';
import { defaultUserData } from '@/data/userData';

const days = createFixtureDays(FIXTURE_NOW);
const last = days[days.length - 1];
const previous = days[days.length - 2];

beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
  mockReplace.mockClear();
});

describe('dailyDerived', () => {
  it('validates day strings and params', () => {
    expect(isDayString('2026-11-25')).toBe(true);
    expect(isDayString('2026-02-30')).toBe(false);
    expect(isDayString('nope')).toBe(false);
    expect(isDayString(null)).toBe(false);
    expect(singleParam(['a', 'b'])).toBe('a');
    expect(singleParam('x'.repeat(100))).toBeNull();
  });

  it('builds Monday-first month grids and shifts months', () => {
    const weeks = monthGrid(2026, 11);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]?.[6]?.day).toBe('2026-11-01');
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('plans a bedtime from need, typical wake and time awake in bed', () => {
    const plan = planBedtime(days, days.length - 1, 8 * 3600);
    expect(plan).not.toBeNull();
    if (plan) {
      const slept = (((plan.wakeMinutes - plan.bedMinutes) % 1440) + 1440) % 1440;
      expect(Math.abs(slept - (480 + plan.awakeInBedS / 60))).toBeLessThanOrEqual(1);
    }
    expect(formatMinutes(-30)).toBe('23:30');
  });

  it('summarises vitals and weeks from real days only', () => {
    const summary = vitalsSummary(days, days.length - 1);
    expect(summary.inRange).toBeLessThanOrEqual(summary.measured);
    const week = weekProgress(days, last?.day ?? '');
    expect(week.loadDots).toHaveLength(7);
    expect(week.recorded).toBeGreaterThan(0);
  });

  it('only reports impacts with enough days in both groups', () => {
    for (const impact of readinessImpacts(days)) {
      expect(impact.nHigh).toBeGreaterThanOrEqual(4);
      expect(impact.nLow).toBeGreaterThanOrEqual(4);
    }
    expect(readinessImpacts(days.slice(0, 5))).toEqual([]);
  });
});

describe('Home', () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: FIXTURE_NOW,
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the three rings with real values and the home cards', async () => {
    await render(withAppData(<HomeScreen />));
    expect(screen.getByTestId('ring-sleep')).toBeTruthy();
    expect(screen.getByTestId('ring-readiness')).toBeTruthy();
    expect(screen.getByTestId('ring-load')).toBeTruthy();
    expect(screen.getByTestId('card-vitals')).toBeTruthy();
    expect(screen.getByTestId('card-stress')).toBeTruthy();
    expect(screen.getByTestId('card-brief')).toBeTruthy();
    expect(screen.getByTestId('card-live')).toBeTruthy();
    expect(screen.getByTestId('dashboard-grid')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByTestId('synced-line')).toBeTruthy();
  });

  it('shows the profile initial from user data and no invented name', async () => {
    await render(withAppData(<HomeScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, name: 'robin' } }));
    expect(screen.getByTestId('avatar-initial').props.children).toBe('R');
    expect(screen.queryByText('Dario')).toBeNull();
  });

  it('renders the compact hero when selected', async () => {
    await render(withAppData(<HomeScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, homeHero: 'compact' } }));
    expect(screen.getByTestId('hero-compact')).toBeTruthy();
    expect(screen.queryByTestId('hero-classic')).toBeNull();
  });

  it('navigates from the day switcher and the rings', async () => {
    await render(withAppData(<HomeScreen />));
    await fireEvent.press(screen.getByTestId('day-prev'));
    expect(mockPush).toHaveBeenCalledWith(`/day/${previous?.day}`);
    await fireEvent.press(screen.getByTestId('ring-readiness'));
    expect(mockPush).toHaveBeenCalledWith('/recovery');
    await fireEvent.press(screen.getByTestId('day-label'));
    expect(mockPush).toHaveBeenCalledWith('/home/date-picker');
  });

  it('shows the empty state without days', async () => {
    await render(withAppData(<HomeScreen />, 'en', { days: [] }));
    expect(screen.getByText('No data yet')).toBeTruthy();
  });

  it('shows how long the band was worn as a dashboard tile, measured by the band', async () => {
    const worn = days.map((d, i) => (i === days.length - 1 ? { ...d, worn: { value: 54_720, reason: null, coverage: 1, algo: 'wear.time@1' } } : d));
    await render(withAppData(<HomeScreen />, 'en', { days: worn, userData: { ...defaultUserData(), onboardingDone: true, dashboardTiles: ['wearTime'] } }));
    expect(screen.getByTestId('tile-wearTime-value')).toHaveTextContent('15 h 12 min');
    expect(within(screen.getByTestId('tile-wearTime')).getByText('Worn')).toBeTruthy();
    expect(within(screen.getByTestId('tile-wearTime')).getByText('A')).toBeTruthy();
  });

  it('says why wear time is missing on a day without wear data', async () => {
    const noWear = days.map((d, i) => (i === days.length - 1 ? { ...d, worn: undefined } : d));
    await render(withAppData(<HomeScreen />, 'en', { days: noWear, userData: { ...defaultUserData(), onboardingDone: true, dashboardTiles: ['wearTime'] } }));
    expect(screen.getByTestId('tile-wearTime-reason')).toBeTruthy();
    expect(screen.queryByTestId('tile-wearTime-value')).toBeNull();
  });

  it('shows why calories are missing and the stress tile has a value instead of a not-built notice', async () => {
    await render(withAppData(<HomeScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, dashboardTiles: ['hrv', 'calories'] } }));
    expect(screen.getByTestId('tile-calories-reason')).toHaveTextContent('Body profile incomplete');
    expect(screen.queryByText('Issue #13')).toBeNull();
    expect(screen.queryByText('Issue #15')).toBeNull();
    expect(screen.getByTestId('stress-tile-level')).toBeTruthy();
  });
});

describe('Past day', () => {
  it('renders a recorded day and offers a way back', async () => {
    mockParams = { day: previous?.day };
    await render(withAppData(<PastDayScreen />));
    expect(screen.getByTestId('past-day')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back-today'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('shows the no-data card for unknown or invalid days', async () => {
    mockParams = { day: addDays(last?.day ?? '2026-11-25', 40) };
    await render(withAppData(<PastDayScreen />));
    expect(screen.getByText('No data for this day')).toBeTruthy();
  });

  it('rejects an invalid day param', async () => {
    mockParams = { day: '../../etc' };
    await render(withAppData(<PastDayScreen />));
    expect(screen.getByText('That is not a valid day.')).toBeTruthy();
  });
});

describe('Home sub-screens', () => {
  it('picks a day from the calendar', async () => {
    await render(withAppData(<DatePickerScreen />));
    await fireEvent.press(screen.getByTestId(`cal-${previous?.day}`));
    expect(mockReplace).toHaveBeenCalledWith(`/day/${previous?.day}`);
  });

  it('writes the dashboard layout and keeps a previous layout', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<CustomizeScreen />, 'en', { updateUserData, userData: { ...defaultUserData(), onboardingDone: true, dashboardTiles: ['hrv', 'steps'], previousDashboardTiles: ['spo2'] } }));
    await fireEvent.press(screen.getByTestId('down-hrv'));
    expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ dashboardTiles: ['steps', 'hrv'] }));
    await fireEvent.press(screen.getByTestId('restore-layout'));
    expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ dashboardTiles: ['spo2'] }));
  });

  it('builds the morning brief from real numbers', async () => {
    await render(withAppData(<MorningBriefScreen />));
    expect(screen.getByTestId('morning-brief')).toBeTruthy();
    expect(screen.getByTestId('line-readiness')).toBeTruthy();
  });

  it('no longer marks notifications or widgets as not built', async () => {
    await render(withAppData(<NotificationsScreen />));
    expect(screen.queryByTestId('not-built-notifications')).toBeNull();
    await render(withAppData(<WidgetsScreen />));
    expect(screen.queryByTestId('not-built-widgets')).toBeNull();
  });

  it('lists the quick actions and routes to them', async () => {
    await render(withAppData(<ActionCenterScreen />));
    await fireEvent.press(screen.getByTestId('action-journal'));
    expect(mockPush).toHaveBeenCalledWith('/journal');
    await fireEvent.press(screen.getByTestId('action-start'));
    expect(mockPush).toHaveBeenCalledWith('/activity/start');
  });
});

describe('Sleep', () => {
  it('shows the score ring, contributors and timeline', async () => {
    await render(withAppData(<SleepScreen />));
    expect(screen.getByTestId('ring-sleep-score')).toBeTruthy();
    expect(screen.getByTestId('card-contributors')).toBeTruthy();
    expect(screen.getByTestId('tile-asleep')).toBeTruthy();
  });

  it('links to the jet lag plan', async () => {
    await render(withAppData(<SleepScreen />));
    await fireEvent.press(screen.getByTestId('link-jet-lag'));
    expect(mockPush).toHaveBeenCalledWith('/sleep/jet-lag');
  });

  it('shows last night with its hypnogram and stage totals', async () => {
    mockParams = { day: last?.day };
    const main = last?.sleep.periods.find((p) => !p.nap);
    const sleepStagesBetween = jest.fn(async () =>
      main === undefined ? [] : [{ t: main.onset, stage: 'wake' as const }, { t: main.onset + 30, stage: 'deep' as const }],
    );
    await render(withAppData(<LastNightScreen />, 'en', { sleepStagesBetween }));
    expect(screen.getByTestId('asleep-total')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('hypnogram')).toBeTruthy());
    expect(sleepStagesBetween).toHaveBeenCalledWith(main?.onset, (main?.offset ?? 0) + 1);
    expect(screen.getByTestId('stage-split-deep')).toBeTruthy();
    expect(screen.getByText(/Deep sleep tends to read high/)).toBeTruthy();
    expect(screen.queryByTestId('not-built-stages')).toBeNull();
  });

  it('gives the reason instead of stages for a night with too few readings', async () => {
    const thin = days.find((d) => d.sleep.stages?.reason === 'low-coverage');
    mockParams = { day: thin?.day };
    const sleepStagesBetween = jest.fn(async () => []);
    await render(withAppData(<LastNightScreen />, 'en', { sleepStagesBetween }));
    expect(screen.getByTestId('stages-reason').props.children).toBe('Not enough readings');
    expect(screen.queryByTestId('stage-split')).toBeNull();
    expect(sleepStagesBetween).not.toHaveBeenCalled();
  });

  it('shows the stage split on the sleep deep dive', async () => {
    await render(withAppData(<SleepScreen />));
    expect(screen.getByTestId('card-stages')).toBeTruthy();
    expect(screen.getByTestId('stage-split-rem')).toBeTruthy();
  });

  it('refuses an invalid day on last night', async () => {
    mockParams = { day: 'abc' };
    await render(withAppData(<LastNightScreen />));
    expect(screen.getByText('That is not a valid day.')).toBeTruthy();
  });

  it('plans a bedtime and explains what it used', async () => {
    await render(withAppData(<SleepPlannerScreen />));
    expect(screen.getByTestId('plan-bed')).toBeTruthy();
    expect(screen.getByTestId('plan-basis')).toBeTruthy();
    const before = screen.getByTestId('plan-wake').props.children;
    await fireEvent.press(screen.getByTestId('wake-later'));
    expect(screen.getByTestId('plan-wake').props.children).not.toBe(before);
  });

  it('renders the trend charts and the alarm placeholder', async () => {
    await render(withAppData(<SleepTrendsScreen />));
    expect(screen.getByTestId('chart-score')).toBeTruthy();
    await fireEvent.press(screen.getByText('6M'));
    expect(screen.getByTestId('chart-asleep')).toBeTruthy();
    expect(screen.getByTestId('card-stages-trend')).toBeTruthy();
    expect(screen.getByTestId('stages-avg-deep')).toBeTruthy();
    await render(withAppData(<SleepAlarmScreen />));
    expect(screen.getByTestId('not-built-alarm')).toBeTruthy();
  });
});

describe('Readiness', () => {
  it('shows contributions and baseline rows', async () => {
    await render(withAppData(<ReadinessScreen />));
    expect(screen.getByTestId('ring-readiness-detail')).toBeTruthy();
    expect(screen.getByTestId('card-contributions')).toBeTruthy();
    expect(screen.getByTestId('row-hrv')).toBeTruthy();
  });

  it('renders trends and an honest impacts screen', async () => {
    await render(withAppData(<RecoveryTrendsScreen />));
    expect(screen.getByTestId('card-band-counts')).toBeTruthy();
    await render(withAppData(<ImpactsScreen />, 'en', { days: days.slice(0, 5) }));
    expect(screen.getByTestId('impacts-empty')).toBeTruthy();
  });

  it('shows the metric detail with a normal range for each metric', async () => {
    for (const metric of ['hrv', 'rhr', 'resp', 'spo2', 'temp']) {
      mockParams = { metric };
      await render(withAppData(<MetricDetailScreen />));
      expect(screen.getByTestId('metric-detail')).toBeTruthy();
      expect(screen.getByTestId('chart-metric')).toBeTruthy();
    }
  });

  it('rejects an unknown metric', async () => {
    mockParams = { metric: 'bp' };
    await render(withAppData(<MetricDetailScreen />));
    expect(screen.getByText('This metric does not exist.')).toBeTruthy();
  });
});

describe('home sections', () => {
  it('shows only the chosen sections in the chosen order', async () => {
    const userData = { ...defaultUserData(), onboardingDone: true, homeSections: ['week' as const, 'brief' as const] };
    await render(withAppData(<HomeScreen />, 'en', { userData }));
    expect(screen.getByTestId('card-week')).toBeTruthy();
    expect(screen.getByTestId('card-brief')).toBeTruthy();
    expect(screen.queryByTestId('card-tonight')).toBeNull();
    expect(screen.queryByTestId('card-vitals')).toBeNull();
  });

  it('saves section changes from the customize screen', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<CustomizeScreen />, 'en', { updateUserData }));
    fireEvent(screen.getByTestId('section-toggle-coach'), 'valueChange', false);
    expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ homeSections: expect.not.arrayContaining(['coach']) }));
  });
});
