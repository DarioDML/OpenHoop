import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays, createFixtureSettings } from '@/data/fixtureSource';
import { addDays } from '@/data/derived';
import {
  formatLongDay,
  formatMinutes,
  isDayString,
  monthGrid,
  planBedtime,
  readinessImpacts,
  shiftMonth,
  singleParam,
  sleepEfficiency,
  typicalAwakeInBedS,
  vitalsSummary,
  weekProgress,
} from '@/data/dailyDerived';
import { defaultPlan } from '@/data/weeklyPlan';
import { DEFAULT_ALARM_PLAN } from '@/data/alarm';
import { moveItem, reorderTarget, shiftFor } from '@/lib/reorder';
import { loggedRecently, morningPlan, worstBehaviour } from '@/ui/daily/briefText';
import { translate } from '@/i18n';
import { eveningSummary, journalRows, loadReview, screensOffMinutes, stepsReview } from '@/data/eveningReview';
import { parseUserData, serializeUserData } from '@/data/userData';

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
import EveningReviewScreen from '@/app/home/evening-review';
import CommunityScreen from '@/app/(tabs)/community';
import { latestShareHref } from '@/ui/daily/shareTarget';
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

  it('counts lying awake after waking as time in bed but not as sleep or as time to plan before sleeping', () => {
    const base = last;
    if (base === undefined) throw new Error('no fixture day');
    const onset = base.start;
    const asleepS = 8 * 3600 + 51 * 60;
    const inBedS = 10 * 3600 + 20 * 60;
    const lieIn = {
      ...base,
      sleep: {
        ...base.sleep,
        periods: [{ onset, offset: onset + asleepS - 1, asleepS, inBedS, nap: false, source: 'detected' as const, editId: null }],
        asleepS,
        inBedS,
        stages: { algo: 'x', reason: null, coverage: 1, totals: { wake: 0, light: asleepS / 2, deep: asleepS / 4, rem: asleepS / 4 } },
      },
    };
    expect(sleepEfficiency(lieIn)).toBe(86);
    expect(typicalAwakeInBedS([lieIn], 0)).toBe(0);
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

  it('keeps goal alerts off for people who saved notification settings before they existed', () => {
    expect(parseUserData(null).notifications.goals).toBe(true);
    expect(parseUserData(serializeUserData(defaultUserData())).notifications.goals).toBe(true);
    const older = parseUserData(JSON.stringify({ notifications: { enabled: true, morningDigest: true, syncProblems: true, quietStart: '22:00', quietEnd: '07:00' } }));
    expect(older.notifications.goals).toBe(false);
    expect(parseUserData(JSON.stringify({ notifications: { enabled: true, goals: true } })).notifications.goals).toBe(true);
  });

  it('works out where a dragged row lands and moves it there', () => {
    const heights = [56, 56, 56, 56];
    expect(reorderTarget(heights, 0, 20)).toBe(0);
    expect(reorderTarget(heights, 0, 30)).toBe(1);
    expect(reorderTarget(heights, 0, 130)).toBe(2);
    expect(reorderTarget(heights, 0, 900)).toBe(3);
    expect(reorderTarget(heights, 3, -60)).toBe(2);
    expect(reorderTarget(heights, 3, -90)).toBe(1);
    expect(reorderTarget(heights, 3, -900)).toBe(0);
    expect(reorderTarget([56, 90, 56], 0, 50)).toBe(1);
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(shiftFor(1, 0, 2, 56)).toBe(-56);
    expect(shiftFor(3, 0, 2, 56)).toBe(0);
    expect(shiftFor(1, 3, 1, 56)).toBe(56);
    expect(shiftFor(0, 0, 2, 56)).toBe(0);
  });

  it('reviews the evening from load, steps and today’s journal answers', () => {
    const index = days.length - 1;
    const load = loadReview(days, index);
    expect(load?.value).toBe(last?.load.value);
    if (load !== null && load.low !== null && load.high !== null) {
      const expected = load.value < load.low ? 'below' : load.value > load.high ? 'above' : 'onTarget';
      expect(load.mark).toBe(expected);
    }
    expect(stepsReview(9_214, 8_000)).toEqual({ steps: 9_214, goal: 8_000, met: true });
    expect(stepsReview(5_000, null)?.met).toBe(false);
    expect(stepsReview(null, 8_000)).toBeNull();
    const journal = { '2026-11-25': { 'caffeine-late': true, 'read-before-sleep': false, alcohol: 2, sauna: true } };
    const rows = journalRows(journal, '2026-11-25', ['alcohol', 'caffeine-late', 'read-before-sleep', 'sauna']);
    expect(rows.map((row) => [row.question.id, row.mark])).toEqual([
      ['alcohol', 'watch'],
      ['caffeine-late', 'late'],
      ['sauna', null],
    ]);
    const onTarget = { value: 9.8, low: 8.2, high: 14, mark: 'onTarget' as const, weekAverage: null };
    expect(eveningSummary(onTarget, null, rows)).toEqual({ lead: 'solid', watch: [rows[0], rows[1]] });
    expect(eveningSummary({ ...onTarget, mark: 'above' }, null, []).lead).toBe('hard');
    expect(eveningSummary({ ...onTarget, mark: 'below' }, stepsReview(9_000, 8_000), []).lead).toBe('solid');
    expect(eveningSummary(null, null, []).lead).toBe('quiet');
    expect(screensOffMinutes(22 * 60 + 50)).toBe(22 * 60 + 5);
    expect(screensOffMinutes(20)).toBe(24 * 60 - 25);
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

  it('draws the mockup tiles: vitals check tile, stress number tile, sleep row and the sync line under the dials', async () => {
    await render(withAppData(<HomeScreen />));
    expect(screen.getByTestId('vitals-count')).toHaveTextContent(/metrics in range/);
    expect(screen.getByTestId('stress-tile-score')).toBeTruthy();
    expect(screen.getByTestId('row-last-sleep')).toBeTruthy();
    expect(screen.getByTestId('synced-line')).toHaveTextContent(/pull to sync/);
    await fireEvent.press(screen.getByTestId('btn-add-activity'));
    expect(mockPush).toHaveBeenCalledWith('/action-center');
    await fireEvent.press(screen.getByTestId('btn-start-activity'));
    expect(mockPush).toHaveBeenCalledWith('/activity/start');
  });

  it('shows tonight’s haptic alarm as a large time with its mode and band state', async () => {
    const alarm = { plan: { ...DEFAULT_ALARM_PLAN, enabled: true, minutes: 6 * 60 + 50, mode: 'goal' as const }, armed: null, events: [], problem: null, smartAvailable: true };
    await render(withAppData(<HomeScreen />, 'en', { alarm }));
    expect(screen.getByTestId('tonight-alarm-time')).toHaveTextContent('06:50');
    expect(screen.getByTestId('tonight-alarm-state')).toHaveTextContent('Not on the band yet');
    expect(screen.getByTestId('tonight-note')).toHaveTextContent(/Alarm mode: Sleep goal/);
    await fireEvent.press(screen.getByTestId('tonight-alarm'));
    expect(mockPush).toHaveBeenCalledWith('/sleep/alarm');
    await fireEvent.press(screen.getByTestId('tonight-planner'));
    expect(mockPush).toHaveBeenCalledWith('/sleep/planner');
  });

  it('builds the week card from the weekly plan, one row per goal', async () => {
    const plan = { ...defaultPlan(null), goals: ['loadDays' as const, 'sleepScore' as const, 'steps' as const], sleepScoreMin: 75 };
    await render(withAppData(<HomeScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, weeklyPlan: plan } }));
    expect(screen.getByTestId('week-load')).toHaveTextContent(/^\d\/3 days$/);
    expect(screen.getByTestId('week-sleep')).toHaveTextContent(/^\d\/4 nights$/);
    expect(screen.getByText('A night counts at a sleep score of 75% or more')).toBeTruthy();
    expect(screen.getByTestId('week-steps-bar')).toBeTruthy();
    expect(screen.queryByTestId('week-strength')).toBeNull();
    expect(screen.getByTestId('week-load-dots')).toBeTruthy();
  });

  it('offers to set up the plan when it has no goals', async () => {
    await render(withAppData(<HomeScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, weeklyPlan: { ...defaultPlan(null), goals: [] } } }));
    await fireEvent.press(screen.getByTestId('week-set-up'));
    expect(mockPush).toHaveBeenCalledWith('/plan/setup');
  });

  it('keeps the fixed week rows with a visible sleep definition when there is no plan', async () => {
    await render(withAppData(<HomeScreen />));
    expect(screen.getByTestId('week-sleep')).toHaveTextContent(/^(1 night|(\d*[02-9]|\d{2,}) nights)$/);
    expect(screen.getByText('Nights at sleep need')).toBeTruthy();
    expect(screen.getByTestId('week-strength')).toHaveTextContent(/× · \d+ min$/);
  });

  it('moves a long week count below the dots instead of crushing them', async () => {
    await render(withAppData(<HomeScreen />));
    expect(within(screen.getByTestId('week-strength-row')).getByTestId('week-strength-trail')).toBeTruthy();
    await fireEvent(screen.getByTestId('week-strength-row'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 296, height: 28 } } });
    await fireEvent(screen.getByTestId('week-strength-trail'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 130, height: 20 } } });
    expect(within(screen.getByTestId('week-strength-row')).queryByTestId('week-strength-trail')).toBeNull();
    expect(screen.getByTestId('week-strength')).toHaveTextContent(/× · \d+ min$/);
  });

  it('says the alarm is off on the Tonight card when none is set', async () => {
    await render(withAppData(<HomeScreen />));
    expect(screen.getByTestId('tonight-alarm-time')).toHaveTextContent('Off');
    expect(screen.getByTestId('tonight-alarm-state')).toHaveTextContent('No alarm set');
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
    expect(screen.getByTestId('tile-calories-reason')).toHaveTextContent('Body profile incomplete ›');
    expect(screen.queryByText('Issue #13')).toBeNull();
    expect(screen.queryByText('Issue #15')).toBeNull();
    expect(screen.getByTestId('stress-tile-level')).toBeTruthy();
  });
});

describe('Past day', () => {
  it('opens the ring screens for the day being viewed', async () => {
    mockParams = { day: previous?.day };
    await render(withAppData(<PastDayScreen />));
    await fireEvent.press(screen.getByTestId('ring-sleep'));
    expect(mockPush).toHaveBeenCalledWith(`/sleep?day=${previous?.day}`);
    await fireEvent.press(screen.getByTestId('ring-readiness'));
    expect(mockPush).toHaveBeenCalledWith(`/recovery?day=${previous?.day}`);
    await fireEvent.press(screen.getByTestId('ring-load'));
    expect(mockPush).toHaveBeenCalledWith(`/load?day=${previous?.day}`);
  });

  it('renders a recorded day and offers a way back', async () => {
    mockParams = { day: previous?.day };
    await render(withAppData(<PastDayScreen />));
    expect(screen.getByTestId('past-day')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('back-today'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('has a plain title bar with the date, day arrows, a calendar button and a coach pill about that day', async () => {
    mockParams = { day: previous?.day };
    await render(withAppData(<PastDayScreen />));
    const label = formatLongDay(previous?.day ?? '', 'en');
    expect(screen.getByTestId('past-day-title')).toHaveTextContent(label);
    expect(screen.queryByTestId('avatar')).toBeNull();
    await fireEvent.press(screen.getByTestId('past-day-calendar'));
    expect(mockPush).toHaveBeenCalledWith(`/home/date-picker?day=${previous?.day}`);
    await fireEvent.press(screen.getByTestId('day-next'));
    expect(mockReplace).toHaveBeenCalledWith('/');
    await fireEvent.press(screen.getByTestId('past-day-ask'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/coach', params: { ask: `Ask about ${label}` } });
    expect(screen.getByTestId('vitals-count')).toBeTruthy();
    expect(screen.getByTestId('row-last-sleep')).toBeTruthy();
    expect(screen.getByTestId('stress-tile-time')).toHaveTextContent(/· Estimate$/);
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

  it('marks the day being viewed, goes back to today and keeps the hint', async () => {
    mockParams = { day: previous?.day };
    await render(withAppData(<DatePickerScreen />));
    expect(screen.getByTestId(`cal-${previous?.day}`).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(screen.getByTestId(`cal-${last?.day}`).props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    expect(screen.getByText(/^Only days with data can be opened/)).toBeTruthy();
    expect(screen.getByTestId('date-picker-close')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-today'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('writes the dashboard layout and keeps a previous layout', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<CustomizeScreen />, 'en', { updateUserData, userData: { ...defaultUserData(), onboardingDone: true, dashboardTiles: ['hrv', 'steps'], previousDashboardTiles: ['spo2'] } }));
    await fireEvent.press(screen.getByTestId('down-hrv'));
    expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ dashboardTiles: ['steps', 'hrv'] }));
    await fireEvent.press(screen.getByTestId('restore-layout'));
    expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ dashboardTiles: ['spo2'] }));
  });

  it('reorders dashboard metrics by dragging the handle', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<CustomizeScreen />, 'en', { updateUserData, userData: { ...defaultUserData(), onboardingDone: true, dashboardTiles: ['hrv', 'restingHr', 'steps', 'respiratoryRate'] } }));
    const handle = screen.getByTestId('handle-hrv', { includeHiddenElements: true });
    const event = (y: number, at: number, fromY: number, fromAt: number) => ({
      nativeEvent: { touches: [], changedTouches: [], pageX: 0, pageY: y, timestamp: at },
      touchHistory: {
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: at,
        touchBank: [{ touchActive: true, startPageX: 0, startPageY: 0, startTimeStamp: 1, currentPageX: 0, currentPageY: y, currentTimeStamp: at, previousPageX: 0, previousPageY: fromY, previousTimeStamp: fromAt }],
      },
    });
    await act(async () => {
      handle.props.onResponderGrant(event(0, 1, 0, 1));
      handle.props.onResponderMove(event(130, 2, 0, 1));
    });
    expect(screen.getByTestId('screen-scroll').props.scrollEnabled).toBe(false);
    await act(async () => {
      handle.props.onResponderRelease(event(130, 3, 130, 2));
    });
    expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ dashboardTiles: ['restingHr', 'steps', 'hrv', 'respiratoryRate'] }));
    expect(screen.getByTestId('screen-scroll').props.scrollEnabled).toBe(true);
    updateUserData.mockClear();
    const again = screen.getByTestId('handle-hrv', { includeHiddenElements: true });
    await act(async () => {
      again.props.onResponderGrant(event(0, 4, 0, 4));
      again.props.onResponderMove(event(130, 5, 0, 4));
      again.props.onResponderTerminate(event(130, 6, 130, 5));
    });
    expect(updateUserData).not.toHaveBeenCalled();
    expect(screen.getByTestId('screen-scroll').props.scrollEnabled).toBe(true);
  });

  it('builds the morning brief from real numbers', async () => {
    await render(withAppData(<MorningBriefScreen />));
    expect(screen.getByTestId('morning-brief')).toBeTruthy();
    expect(screen.getByTestId('line-readiness')).toBeTruthy();
    expect(screen.getByTestId('stat-readiness')).toHaveTextContent(/^Readiness \d+%$/);
    expect(screen.getByTestId('brief-plan')).toBeTruthy();
    expect(within(screen.getByTestId('line-bedtime')).getByTestId('pill-bedtime')).toHaveTextContent(/^Bedtime \d\d:\d\d$/);
    expect(screen.getByText(/Readiness is a fitted model/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('brief-ask'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/coach', params: expect.objectContaining({ ask: expect.stringMatching(/^Ask /) }) }));
  });

  it('turns a missing readiness into an explainable chip on the brief', async () => {
    await render(withAppData(<MorningBriefScreen />, 'en', { days: days.slice(0, 2) }));
    expect(screen.getByTestId('stat-readiness')).toHaveTextContent(/^Readiness: /);
    await fireEvent.press(screen.getByTestId('stat-readiness'));
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
  });

  it('adds a habit to the plan when the journal links it to lower readiness', async () => {
    const recent = days.slice(-30);
    const values = recent.map((d) => d.readiness.value).filter((v): v is number => v !== null).sort((x, y) => x - y);
    const median = values[Math.floor(values.length / 2)] ?? 50;
    const journal: Record<string, Record<string, boolean>> = {};
    recent.forEach((d, i) => {
      const next = recent[i + 1];
      if (next === undefined || next.readiness.value === null) return;
      journal[d.day] = { 'caffeine-late': next.readiness.value < median };
    });
    const today = last?.day ?? '';
    const logged = { ...journal, [today]: { 'caffeine-late': true } };
    expect(worstBehaviour(days, logged, null, today)?.questionId).toBe('caffeine-late');
    await render(withAppData(<MorningBriefScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, journal: logged } }));
    expect(screen.getByTestId('pill-habit')).toHaveTextContent(/^−\d+% readiness$/);
    expect(worstBehaviour(days, {}, null, today)).toBeNull();
  });

  it('builds the morning plan only from real values and flags a habit only when it was just logged and is not a good one', () => {
    const index = days.length - 1;
    const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
    const plan = morningPlan(t, 'en', days, index, {}, null);
    expect(plan.map((item) => item.id)).toEqual(expect.arrayContaining(['readiness', 'sleep', 'bedtime']));
    expect(plan.every((item) => item.title.length > 0 && item.reason.length > 0)).toBe(true);
    expect(plan.find((item) => item.id === 'bedtime')?.pill).toEqual({ label: expect.stringMatching(/^Bedtime \d\d:\d\d$/), tone: 'purple' });
    expect(plan.some((item) => item.id === 'habit')).toBe(false);
    expect(morningPlan(t, 'en', [], 0, {}, null)).toEqual([]);

    const recent = days.slice(-30);
    const values = recent.map((d) => d.readiness.value).filter((v): v is number => v !== null).sort((x, y) => x - y);
    const median = values[Math.floor(values.length / 2)] ?? 50;
    const linked = (id: string): Record<string, Record<string, boolean>> => {
      const out: Record<string, Record<string, boolean>> = {};
      recent.forEach((d, i) => {
        const next = recent[i + 1];
        if (next === undefined || next.readiness.value === null) return;
        out[d.day] = { [id]: next.readiness.value < median };
      });
      return out;
    };
    const today = last?.day ?? '';
    const old = linked('caffeine-late');
    old[today] = { 'caffeine-late': false };
    old[addDays(today, -1)] = { 'caffeine-late': false };
    expect(loggedRecently(old, 'caffeine-late', today)).toBe(false);
    expect(morningPlan(t, 'en', days, index, old, null).some((item) => item.id === 'habit')).toBe(false);
    const good = { ...linked('read-before-sleep'), [today]: { 'read-before-sleep': true } };
    expect(morningPlan(t, 'en', days, index, good, ['read-before-sleep']).some((item) => item.id === 'habit')).toBe(false);
    const fresh = { ...linked('caffeine-late'), [addDays(today, -1)]: { 'caffeine-late': true } };
    expect(morningPlan(t, 'en', days, index, fresh, null).find((item) => item.id === 'habit')?.pill?.tone).toBe('warning');
  });

  it('reviews the evening with key behaviours, wind-down tips and tonight', async () => {
    const today = last?.day ?? '';
    const userData = { ...defaultUserData(), onboardingDone: true, stepsGoal: 1_000, journal: { [today]: { 'caffeine-late': true } } };
    await render(withAppData(<EveningReviewScreen />, 'en', { userData }));
    expect(screen.getByTestId('evening-summary')).toHaveTextContent(/One thing to watch: caffeine after 14:00\.$/);
    expect(screen.getByTestId('behaviour-caffeine-late-mark')).toHaveTextContent('! late');
    expect(screen.getByTestId('stat-load')).toBeTruthy();
    expect(screen.getByTestId('stat-steps')).toBeTruthy();
    expect(screen.getByTestId('stat-readiness')).toBeTruthy();
    expect(within(screen.getByTestId('card-wind-down')).getByText(/^Keep the room around 18 °C\.$/)).toBeTruthy();
    expect(within(screen.getByTestId('card-wind-down')).getByText(/late caffeine/)).toBeTruthy();
    expect(screen.getByTestId('evening-tonight-note')).toHaveTextContent('Bedtime · No alarm set');
    expect(screen.getByTestId('evening-tonight-need')).toHaveTextContent(/^Need tonight: \d+:\d\d · wake around \d\d:\d\d$/);
    await fireEvent.press(screen.getByTestId('card-evening-tonight'));
    expect(mockPush).toHaveBeenCalledWith('/sleep/planner');
  });

  it('asks for the journal when nothing was logged and uses imperial room temperature', async () => {
    await render(withAppData(<EveningReviewScreen />, 'en', { settings: { ...createFixtureSettings('en', FIXTURE_NOW), units: 'imperial' } }));
    expect(screen.getByTestId('behaviour-journal-empty')).toHaveTextContent(/Nothing logged in your journal today/);
    expect(within(screen.getByTestId('card-wind-down')).getByText(/^Keep the room around 64 °F\.$/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('behaviour-journal-empty'));
    expect(mockPush).toHaveBeenCalledWith('/journal');
  });

  it('no longer marks notifications or widgets as not built', async () => {
    await render(withAppData(<NotificationsScreen />));
    expect(screen.queryByTestId('not-built-notifications')).toBeNull();
    await render(withAppData(<WidgetsScreen />));
    expect(screen.queryByTestId('not-built-widgets')).toBeNull();
  });

  it('lists the quick actions and routes to them', async () => {
    await render(withAppData(<ActionCenterScreen />));
    for (const id of ['start', 'add', 'strength', 'journal', 'planner', 'logSleep', 'breathing', 'ecg', 'symptoms', 'labs']) expect(screen.getByTestId(`action-${id}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('action-journal'));
    expect(mockPush).toHaveBeenCalledWith('/journal');
    await fireEvent.press(screen.getByTestId('action-start'));
    expect(mockPush).toHaveBeenCalledWith('/activity/start');
    await fireEvent.press(screen.getByTestId('action-add'));
    expect(mockPush).toHaveBeenCalledWith('/activity/add');
  });

  it('draws the quick actions as a sheet with an MG badge on ECG and the band status at the bottom', async () => {
    await render(withAppData(<ActionCenterScreen />));
    expect(screen.getByTestId('action-center-close')).toBeTruthy();
    expect(within(screen.getByTestId('action-ecg')).getByText('MG')).toBeTruthy();
    expect(screen.getByTestId('action-ecg').props.accessibilityHint).toBe('Needs MG hardware');
    expect(screen.getByTestId('action-center-status')).toHaveTextContent(/stored locally$/);
  });
});

describe('Community', () => {
  it('links sharing to the latest activity, the report to the weekly report and keeps teams not built', async () => {
    const href = latestShareHref(days, []);
    await render(withAppData(<CommunityScreen />));
    expect(screen.getByText('Teams need a server')).toBeTruthy();
    expect(screen.getByTestId('not-built-community')).toBeTruthy();
    expect(within(screen.getByTestId('community-self-host')).getByText('Plug-in')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('community-report'));
    expect(mockPush).toHaveBeenCalledWith('/plan/weekly-report');
    if (href !== null) {
      await fireEvent.press(screen.getByTestId('community-share'));
      expect(mockPush).toHaveBeenCalledWith(href);
    }
  });

  it('finds the newest workout to share and says when there is none', async () => {
    const withWorkout = days.findLast((d) => d.workouts.length > 0);
    const href = latestShareHref(days, []);
    if (withWorkout === undefined) expect(href).toBeNull();
    else expect(href).toEqual({ pathname: '/activity/share', params: { day: withWorkout.day, index: String(withWorkout.workouts.length - 1) } });
    const none = days.map((d) => ({ ...d, workouts: [] }));
    expect(latestShareHref(none, [])).toBeNull();
    await render(withAppData(<CommunityScreen />, 'en', { days: none }));
    expect(screen.getByText('No activity to share yet')).toBeTruthy();
    expect(screen.getByTestId('community-share').props.accessibilityRole).toBeUndefined();
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
    expect(screen.getByTestId('time-in-stage-deep')).toBeTruthy();
    expect(screen.getByTestId('stage-legend')).toBeTruthy();
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

  it('renders the trend charts and the alarm screen', async () => {
    await render(withAppData(<SleepTrendsScreen />));
    expect(screen.getByTestId('chart-score')).toBeTruthy();
    await fireEvent.press(screen.getByText('6M'));
    expect(screen.getByTestId('chart-asleep')).toBeTruthy();
    expect(screen.getByTestId('card-stages-trend')).toBeTruthy();
    expect(screen.getByTestId('stages-avg-deep')).toBeTruthy();
    await render(withAppData(<SleepAlarmScreen />));
    expect(screen.getByTestId('alarm-status-text').props.children).toBe('Off');
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
