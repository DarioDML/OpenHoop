import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ActivityRow, DayRecord, StrengthSession } from '@openhoop/core';

import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData, parseUserData } from '@/data/userData';
import {
  defaultPlan,
  isFineTuned,
  isoWeek,
  parseWeeklyPlan,
  planAdvice,
  planWeek,
  presetTargets,
  setTarget,
  strengthIntervals,
  toggleGoal,
  withLevel,
  type PlanInput,
  type WeeklyPlan,
} from '@/data/weeklyPlan';

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

import PlanSetupScreen from '@/app/plan/setup';

const days = createFixtureDays(FIXTURE_NOW);
const today = days[days.length - 1]?.day ?? '2026-11-25';

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return { days, sessions: [], activities: [], steps: [], today, nowS: FIXTURE_NOW.getTime() / 1000, tzOffsetS: 0, ...overrides };
}

function withScore(source: readonly DayRecord[], day: string, score: number): DayRecord[] {
  return source.map((d) => (d.day === day ? { ...d, sleep: { ...d.sleep, score: { value: score, reason: null, coverage: 1, algo: 'x' } } } : d));
}

describe('weekly plan model', () => {
  it('reads old plans as load and sleep goals', () => {
    expect(parseWeeklyPlan({ loadDays: 4, sleepNights: 5 })).toEqual({ ...presetTargets('balanced', null), goals: ['loadDays', 'sleepScore'], level: 'balanced', loadDays: 4, sleepNights: 5 });
    expect(parseWeeklyPlan({ loadDays: 0, sleepNights: 3 })?.goals).toEqual(['sleepScore']);
    expect(parseWeeklyPlan({ loadDays: 9, sleepNights: 3 })).toBeNull();
    expect(parseUserData(JSON.stringify({ weeklyPlan: { goals: ['steps', 'bogus', 'strength'], level: 'hard', steps: 12000 } })).weeklyPlan).toEqual({
      ...presetTargets('hard', null),
      goals: ['strength', 'steps'],
      level: 'hard',
      steps: 12000,
    });
  });

  it('keeps at most three goals', () => {
    const plan = defaultPlan(null);
    expect(toggleGoal(plan, 'steps', true)).toBe(plan);
    expect(toggleGoal(toggleGoal(plan, 'strength', false), 'steps', true).goals).toEqual(['loadDays', 'sleepScore', 'steps']);
  });

  it('scales targets with the difficulty and spots fine-tuning', () => {
    const plan = defaultPlan(10000);
    expect(plan.steps).toBe(10000);
    expect(withLevel(plan, 'easy', 10000)).toMatchObject({ level: 'easy', loadDays: 2, sleepScoreMin: 70, strengthMinutes: 45, steps: 7500 });
    expect(withLevel(plan, 'hard', null)).toMatchObject({ level: 'hard', loadDays: 5, sleepScoreMin: 90, steps: 10000 });
    expect(isFineTuned(plan, 10000)).toBe(false);
    expect(isFineTuned(setTarget(plan, 'loadDays', 6), 10000)).toBe(true);
    expect(isFineTuned(setTarget(plan, 'steps', 12000), 10000)).toBe(false);
    expect(setTarget(plan, 'strengthMinutes', 1000).strengthMinutes).toBe(600);
    expect(setTarget(plan, 'steps', 8260).steps).toBe(8500);
  });

  it('numbers weeks the ISO way', () => {
    expect(isoWeek('2026-11-23')).toBe(48);
    expect(isoWeek('2026-11-29')).toBe(48);
    expect(isoWeek('2021-01-03')).toBe(53);
    expect(isoWeek('2026-01-01')).toBe(1);
  });
});

describe('plan progress', () => {
  const plan: WeeklyPlan = { ...defaultPlan(null), goals: ['loadDays', 'sleepScore', 'strength'] };

  it('counts load days and the days left in the week', () => {
    const week = planWeek(plan, input());
    expect(week.start).toBe('2026-11-23');
    expect(week.end).toBe('2026-11-29');
    expect(week.elapsed).toBe(3);
    expect(week.remaining).toBe(4);
    const load = week.goals[0];
    expect(load?.dots).toHaveLength(7);
    expect(load?.dots.slice(3)).toEqual(['open', 'open', 'open', 'open']);
    expect(load?.done).toBe(load?.dots.filter((d) => d === 'hit').length);
  });

  it('marks a night below the score as missed and a high one as hit', () => {
    const scored = withScore(withScore(days, '2026-11-23', 40), '2026-11-24', 92);
    const sleep = planWeek({ ...plan, sleepScoreMin: 90 }, input({ days: scored })).goals[1];
    expect(sleep?.dots[0]).toBe('miss');
    expect(sleep?.dots[1]).toBe('hit');
  });

  it('counts strength minutes once when a session and an activity overlap', () => {
    const start = Date.UTC(2026, 10, 24, 18) / 1000;
    const session: StrengthSession = { id: 1, templateId: null, name: 'Legs', day: '2026-11-24', startedAt: start, endedAt: start + 45 * 60, exercises: [], sets: [] };
    const activity: ActivityRow = {
      id: 2,
      deviceId: 1,
      source: 'manual',
      detectedStart: null,
      type: 'strength',
      start: start + 30 * 60,
      end: start + 60 * 60,
      paused: [],
      note: null,
      deletedAt: null,
      createdAt: 0,
      updatedAt: 0,
      metrics: { activeS: 0, load: null, loadReason: null, zoneSeconds: [], avgHr: null, maxHr: null, hrSeconds: 0, activeMinutes: null },
    };
    expect(strengthIntervals([session], [activity], start)).toEqual([{ start, end: start + 3600 }]);
    const strength = planWeek(plan, input({ sessions: [session], activities: [activity] })).goals[2];
    expect(strength).toMatchObject({ goal: 'strength', done: 60, target: 90, left: 30, state: 'onTrack' });
    expect(strength?.dots.slice(0, 3)).toEqual(['miss', 'hit', 'partial']);
  });

  it('averages steps over the week and uses imported steps', () => {
    const stepsPlan: WeeklyPlan = { ...plan, goals: ['steps'], steps: 8000 };
    const steps = [
      { day: '2026-11-23', steps: 10000 },
      { day: '2026-11-24', steps: 9000 },
      { day: '2026-11-25', steps: 2000 },
    ];
    const week = planWeek(stepsPlan, input({ steps }));
    expect(week.goals[0]).toMatchObject({ done: 21000, target: 56000, left: 35000, state: 'onTrack' });
    expect(week.goals[0]?.dots.slice(0, 3)).toEqual(['hit', 'hit', 'partial']);
    expect(planAdvice(stepsPlan, week, null)[0]).toEqual({ key: 'plan.left.steps', params: { steps: 7000 } });
  });

  it('gives plain advice for what is left', () => {
    const week = planWeek(plan, input());
    const lines = planAdvice(plan, week, null);
    expect(lines[lines.length - 1]).toEqual({ key: 'plan.left.daysLeft.other', params: { count: 4 } });
    const sunday = planAdvice(plan, planWeek(plan, input({ today: '2026-11-29' })), null);
    expect(sunday[sunday.length - 1]).toEqual({ key: 'plan.left.lastDay' });
    const done = planAdvice(plan, { ...week, goals: week.goals.map((g) => ({ ...g, state: 'met' as const })) }, null);
    expect(done).toEqual([{ key: 'plan.left.allDone' }]);
  });
});

describe('plan setup screen', () => {
  it('saves the default plan with a changed load target', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<PlanSetupScreen />, 'en', { updateUserData }));
    await fireEvent.press(screen.getByTestId('plan-load-days-plus'));
    await fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ weeklyPlan: { ...defaultPlan(null), loadDays: 4 } }));
  });

  it('allows three goals at most and blocks the fourth switch', async () => {
    await render(withAppData(<PlanSetupScreen />));
    expect(screen.getByTestId('plan-goals-full')).toBeTruthy();
    expect(screen.getByTestId('plan-goal-toggle-steps').props.disabled).toBe(true);
    await fireEvent(screen.getByTestId('plan-goal-toggle-strength'), 'valueChange', false);
    expect(screen.queryByTestId('plan-goals-full')).toBeNull();
    expect(screen.queryByTestId('plan-strength-value')).toBeNull();
    await fireEvent(screen.getByTestId('plan-goal-toggle-steps'), 'valueChange', true);
    expect(screen.getByTestId('plan-steps-value')).toBeTruthy();
  });

  it('sets every target from the difficulty', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<PlanSetupScreen />, 'en', { updateUserData, userData: { ...defaultUserData(), stepsGoal: 10000 } }));
    await fireEvent.press(screen.getByTestId('plan-level-hard'));
    expect(screen.getByTestId('plan-load-days-value')).toHaveTextContent('5');
    expect(screen.getByText('90% or higher, 5 nights')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('plan-load-days-minus'));
    expect(screen.getByTestId('plan-level-note')).toHaveTextContent('You fine-tuned some targets. Picking a difficulty sets them all again.');
    await fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ weeklyPlan: expect.objectContaining({ level: 'hard', loadDays: 4, steps: 12500 }) }));
  });

  it('removes an existing plan', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<PlanSetupScreen />, 'en', { updateUserData, userData: { ...defaultUserData(), weeklyPlan: defaultPlan(null) } }));
    await fireEvent.press(screen.getByTestId('plan-remove'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ weeklyPlan: null }));
  });
});
