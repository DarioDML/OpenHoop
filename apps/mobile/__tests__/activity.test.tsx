import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  achievements,
  effectiveMaxHr,
  formatElapsed,
  liveZone,
  parseActivityType,
  parseDecimal,
  parseDayParam,
  parseIndexParam,
  parseWholeNumber,
  periodStats,
  periodWindows,
  resolveWorkout,
  stepsStats,
  trendOf,
  weekProgress,
} from '@/data/activityDerived';
import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import AddActivityScreen from '@/app/activity/add';
import ActivityDetailsScreen from '@/app/activity/details';
import EditActivityScreen from '@/app/activity/edit';
import LiveActivityScreen from '@/app/activity/live';
import StartActivityScreen from '@/app/activity/start';
import LoadScreen from '@/app/load/index';
import LoadTargetScreen from '@/app/load/target';
import LoadTrendsScreen from '@/app/load/trends';
import LoadWeekScreen from '@/app/load/week';
import PlanScreen from '@/app/plan/index';
import MonthlyReportScreen from '@/app/plan/monthly-report';
import PlanSetupScreen from '@/app/plan/setup';
import WeeklyReportScreen from '@/app/plan/weekly-report';
import AchievementsScreen from '@/app/profile/achievements';
import EditProfileScreen from '@/app/profile/edit';
import ProfileScreen from '@/app/profile/index';
import StepsScreen from '@/app/steps';

const days = createFixtureDays(FIXTURE_NOW);

beforeEach(() => {
  mockParams = {};
  jest.clearAllMocks();
});

describe('activityDerived', () => {
  it('validates route params', () => {
    const withWorkout = days.find((d) => d.workouts.length > 0);
    expect(withWorkout).toBeDefined();
    expect(parseDayParam('nope', days)).toBeNull();
    expect(parseDayParam(['2026-11-25'], days)).toBeNull();
    expect(parseDayParam('1999-01-01', days)).toBeNull();
    expect(parseIndexParam('-1', 3)).toBeNull();
    expect(parseIndexParam('3', 3)).toBeNull();
    expect(parseIndexParam('2', 3)).toBe(2);
    expect(resolveWorkout(days, withWorkout?.day, '99')).toBeNull();
    expect(resolveWorkout(days, withWorkout?.day, '0')?.workout).toBe(withWorkout?.workouts[0]);
    expect(parseActivityType('<script>')).toBe('other');
    expect(parseActivityType('running')).toBe('running');
  });

  it('computes live zones from the maximum heart rate', () => {
    expect(liveZone(80, 200)).toBeNull();
    expect(liveZone(100, 200)).toBe(1);
    expect(liveZone(150, 200)).toBe(3);
    expect(liveZone(195, 200)).toBe(5);
    expect(effectiveMaxHr({ birthYear: null, maxHeartRate: 185 }, 2026)).toBe(185);
    expect(effectiveMaxHr({ birthYear: 1996, maxHeartRate: null }, 2026)).toBeCloseTo(187);
  });

  it('parses numbers strictly', () => {
    expect(parseWholeNumber('182')).toBe(182);
    expect(parseWholeNumber('18x')).toBeNull();
    expect(parseDecimal('72,5')).toBe(72.5);
    expect(parseDecimal('72.555')).toBeNull();
  });

  it('formats elapsed time', () => {
    expect(formatElapsed(65)).toBe('01:05');
    expect(formatElapsed(3725)).toBe('1:02:05');
  });

  it('compares periods and flags trends', () => {
    const { current, previous } = periodWindows(days, 7);
    expect(current).toHaveLength(7);
    expect(previous).toHaveLength(7);
    expect(periodStats(current).days).toBe(7);
    expect(trendOf(10, 10)).toBe('stable');
    expect(trendOf(12, 10)).toBe('up');
    expect(trendOf(8, 10)).toBe('down');
  });

  it('counts week progress only over elapsed days', () => {
    const last = days[days.length - 1];
    const progress = weekProgress(days, last?.day ?? '');
    expect(progress.elapsed + progress.remaining).toBe(7);
    expect(progress.daysWithData).toBeLessThanOrEqual(progress.elapsed);
    expect(progress.sleepNightsMet).toBeLessThanOrEqual(progress.sleepNightsMeasured);
  });

  it('derives steps statistics and achievements from real days', () => {
    const stats = stepsStats(days.slice(-7), 8000);
    expect(stats.daysWithData).toBe(7);
    expect(stats.goalDays).not.toBeNull();
    expect(stepsStats(days.slice(-7), null).goalDays).toBeNull();
    const list = achievements(days);
    expect(list.every((a) => a.unlocked === a.current >= a.target)).toBe(true);
    expect(achievements([]).some((a) => a.unlocked)).toBe(false);
  });
});

describe('load screens', () => {
  it('shows the real load, zones and workouts on /load', async () => {
    await render(withAppData(<LoadScreen />));
    const latest = days[days.length - 1];
    expect(screen.getByTestId('hr-max')).toBeTruthy();
    expect(screen.getByText('Time per heart rate zone')).toBeTruthy();
    expect(screen.getByTestId('calories-card')).toBeTruthy();
    if (latest && latest.workouts.length > 0) expect(screen.getByTestId(`entry-w:${latest.workouts[0]?.start}`)).toBeTruthy();
    else expect(screen.getByText('No workouts on this day.')).toBeTruthy();
  });

  it('shows the target, trends and week screens', async () => {
    await render(withAppData(<LoadTargetScreen />));
    expect(screen.getByTestId('target-advice')).toBeTruthy();
    expect(screen.queryByTestId('not-built-activities')).toBeNull();
    await fireEvent.press(screen.getByTestId('target-start'));
    expect(router.push).toHaveBeenCalledWith('/activity/start');
  });

  it('switches trend ranges', async () => {
    await render(withAppData(<LoadTrendsScreen />));
    expect(screen.getByTestId('trend-avg')).toBeTruthy();
    await fireEvent.press(screen.getByText('6M'));
    expect(screen.getByTestId('trends-few')).toBeTruthy();
  });

  it('renders the weekly overview', async () => {
    await render(withAppData(<LoadWeekScreen />));
    expect(screen.getByTestId('week-range')).toBeTruthy();
    expect(screen.getByTestId('week-load-0')).toBeTruthy();
  });
});

describe('activity screens', () => {
  it('filters the activity list and rejects unknown types', async () => {
    await render(withAppData(<AddActivityScreen />));
    await fireEvent.changeText(screen.getByTestId('activity-search'), 'yoga');
    expect(screen.getByTestId('activity-type-yoga')).toBeTruthy();
    expect(screen.queryByTestId('activity-type-running')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('activity-search'), 'zzzz');
    expect(screen.getByTestId('activity-none')).toBeTruthy();
  });

  it('starts an activity with a validated type', async () => {
    mockParams = { type: 'running' };
    await render(withAppData(<StartActivityScreen />));
    expect(screen.getByTestId('start-type').props.children).toBe('Running');
    expect(screen.getByTestId('start-route')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('start-begin'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/live', params: { type: 'running' } });
  });

  it('shows live heart rate and the zone', async () => {
    mockParams = { type: 'running' };
    const startLive = jest.fn(async () => undefined);
    const stopLive = jest.fn(async () => undefined);
    await render(
      withAppData(<LiveActivityScreen />, 'en', {
        live: { active: true, heartRate: 150, lastRrMs: 400, updatedAt: 1 },
        profile: { birthYear: null, maxHeartRate: 200 },
        startLive,
        stopLive,
      }),
    );
    expect(screen.getByTestId('live-hr')).toBeTruthy();
    expect(screen.getByTestId('live-hr')).toHaveTextContent(/150/);
    expect(screen.getByText('Zone 2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('live-begin'));
    await waitFor(() => expect(startLive).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('live-stop'));
    await waitFor(() => expect(stopLive).toHaveBeenCalled());
    expect(await screen.findByTestId('live-short')).toBeTruthy();
  });

  it('shows the real workout on the details screen', async () => {
    const withWorkout = days.find((d) => d.workouts.length > 0);
    const workout = withWorkout?.workouts[0];
    mockParams = { day: withWorkout?.day ?? '', index: '0' };
    await render(withAppData(<ActivityDetailsScreen />));
    expect(screen.getByTestId('detail-avg')).toBeTruthy();
    expect(screen.getByTestId('detail-avg')).toHaveTextContent(new RegExp(String(workout?.avgHr)));
  });

  it('does not crash on invalid details params', async () => {
    mockParams = { day: 'x', index: '9' };
    await render(withAppData(<ActivityDetailsScreen />));
    expect(screen.getByText('Activity not found')).toBeTruthy();
  });
});

describe('steps', () => {
  it('shows today steps and asks for a goal when none is set', async () => {
    await render(withAppData(<StepsScreen />));
    expect(screen.getByTestId('steps-today')).toBeTruthy();
    expect(screen.getByTestId('steps-set-goal')).toBeTruthy();
  });

  it('shows goal progress when a goal is set', async () => {
    await render(withAppData(<StepsScreen />, 'en', { userData: { ...defaultUserData(), stepsGoal: 8000 } }));
    expect(screen.queryByTestId('steps-set-goal')).toBeNull();
    expect(screen.getByTestId('steps-goal-days')).toBeTruthy();
  });
});

describe('plan', () => {
  it('shows a call to action without a plan', async () => {
    await render(withAppData(<PlanScreen />));
    expect(screen.getByTestId('plan-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-cta'));
    expect(router.push).toHaveBeenCalledWith('/plan/setup');
  });

  it('shows progress against the plan', async () => {
    await render(withAppData(<PlanScreen />, 'en', { userData: { ...defaultUserData(), weeklyPlan: { loadDays: 3, sleepNights: 5 } } }));
    expect(screen.getByTestId('plan-goal-load')).toBeTruthy();
    expect(screen.getByTestId('plan-goal-sleep')).toBeTruthy();
  });

  it('saves the plan through updateUserData', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<PlanSetupScreen />, 'en', { updateUserData }));
    await fireEvent.press(screen.getByTestId('plan-load-days-plus'));
    await fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ weeklyPlan: { loadDays: 4, sleepNights: 5 } }));
  });

  it('builds the weekly and monthly reports from real days', async () => {
    await render(withAppData(<WeeklyReportScreen />));
    expect(screen.getByTestId('report-readiness')).toBeTruthy();
    expect(screen.getByTestId('report-loaddays')).toBeTruthy();
    await render(withAppData(<MonthlyReportScreen />));
    expect(screen.getAllByTestId('report-readiness').length).toBeGreaterThan(0);
  });

  it('is honest when there are too few days', async () => {
    await render(withAppData(<WeeklyReportScreen />, 'en', { days: days.slice(-2) }));
    expect(screen.getByTestId('report-few')).toBeTruthy();
    expect(screen.queryByTestId('report-readiness')).toBeNull();
  });
});

describe('profile', () => {
  it('shows the name and initial from user data', async () => {
    await render(withAppData(<ProfileScreen />, 'en', { userData: { ...defaultUserData(), name: 'Sam' } }));
    expect(screen.getByTestId('profile-name').props.children).toBe('Sam');
    expect(screen.getByTestId('profile-initial').props.children).toBe('S');
    expect(screen.getByTestId('life-nights')).toBeTruthy();
  });

  it('does not invent a name', async () => {
    await render(withAppData(<ProfileScreen />));
    expect(screen.queryByTestId('profile-initial')).toBeNull();
    expect(screen.getByText('No name set')).toBeTruthy();
  });

  it('lists achievements computed from the data', async () => {
    await render(withAppData(<AchievementsScreen />));
    expect(screen.getByTestId('ach-nights-7')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Locked' }));
    expect(screen.queryByTestId('ach-nights-7-never')).toBeNull();
    expect(screen.queryAllByText('Unlocked').filter((n) => n.props.accessibilityRole !== 'tab' && n.parent?.props.accessibilityRole !== 'tab')).toHaveLength(0);
  });

  it('rejects invalid profile input and saves valid input', async () => {
    const updateUserData = jest.fn(async () => true);
    const updateProfile = jest.fn(async () => undefined);
    await render(withAppData(<EditProfileScreen />, 'en', { updateUserData, updateProfile }));
    await fireEvent.changeText(screen.getByTestId('profile-height-input'), '20');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(screen.getByTestId('profile-invalid')).toBeTruthy());
    expect(updateUserData).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('profile-height-input'), '180');
    await fireEvent.changeText(screen.getByTestId('profile-weight-input'), '72,5');
    await fireEvent.changeText(screen.getByTestId('profile-birth-input'), '1990');
    await fireEvent.changeText(screen.getByTestId('profile-maxhr-input'), '190');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ birthYear: 1990, maxHeartRate: 190 }));
    expect(updateUserData).toHaveBeenCalledWith({ name: null, heightCm: 180, weightKg: 72.5, sex: null, stepsGoal: null });
  });
});
