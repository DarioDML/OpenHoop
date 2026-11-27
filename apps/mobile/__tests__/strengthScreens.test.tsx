import type { StrengthData, StrengthSession, StrengthSet, StrengthTemplate } from '@openhoop/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData } from '@/data/userData';
import { defaultPlan } from '@/data/weeklyPlan';
import type { StrengthActions } from '@/data/types';
import { WeekCard } from '@/ui/daily/cards';

import { FIXTURE_NOW, fixtureStrengthActions, withAppData, type AppDataOverrides } from './support/appData';

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

import StrengthBuilderScreen from '@/app/strength/builder';
import StrengthExerciseScreen from '@/app/strength/exercise';
import StrengthHomeScreen from '@/app/strength/index';
import StrengthLiveScreen from '@/app/strength/live';
import StrengthSummaryScreen from '@/app/strength/summary';
import StrengthTrendsScreen from '@/app/strength/trends';

const NOW_S = Math.floor(FIXTURE_NOW.getTime() / 1000);
let nextId = 1;

function set(session: number, key: string, name: string, muscle: StrengthSet['muscle'], reps: number, weightKg: number, rpe: number | null = null): StrengthSet {
  return { id: nextId++, sessionId: session, exerciseKey: key, exerciseName: name, muscle, reps, weightKg, rpe, doneAt: NOW_S };
}

function finished(id: number, day: string, startedAt: number, sets: StrengthSet[], name = `Push ${id}`): StrengthSession {
  return { id, templateId: null, name, day, startedAt, endedAt: startedAt + 3_000, exercises: [], sets };
}

const DAY_1 = finished(1, '2026-11-18', NOW_S - 7 * 86_400, [
  set(1, 'lib:bench_press', 'Bench press', 'chest', 5, 80),
  set(1, 'lib:bench_press', 'Bench press', 'chest', 5, 80),
]);
const DAY_2 = finished(2, '2026-11-24', NOW_S - 86_400, [
  set(2, 'lib:bench_press', 'Bench press', 'chest', 5, 85),
  set(2, 'lib:bench_press', 'Bench press', 'chest', 3, 90),
  set(2, 'lib:back_squat', 'Back squat', 'quads', 5, 100),
  set(2, 'lib:crunch', 'Crunch', 'core', 15, 0),
]);

const TEMPLATE: StrengthTemplate = {
  id: 7,
  name: 'Push day',
  createdAt: 1,
  updatedAt: 2,
  items: [{ exerciseKey: 'lib:bench_press', exerciseName: 'Bench press', muscle: 'chest', sets: 3, reps: 8, weightKg: 60 }],
};

function data(overrides: Partial<StrengthData> = {}): StrengthData {
  return { customExercises: [], templates: [], sessions: [], ...overrides };
}

function actions(overrides: Partial<StrengthActions> = {}): StrengthActions {
  return { ...fixtureStrengthActions(), ...overrides };
}

function app(strength: StrengthData, strengthActions: StrengthActions, extra: AppDataOverrides = {}): AppDataOverrides {
  return { strength, strengthActions, ...extra };
}

beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
  mockReplace.mockClear();
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('strength home', () => {
  it('shows honest empty states with no invented numbers', async () => {
    await render(withAppData(<StrengthHomeScreen />, 'en', app(data(), actions())));
    expect(screen.getByTestId('strength-templates-empty')).toBeTruthy();
    expect(screen.getByTestId('strength-recent-empty')).toBeTruthy();
    expect(screen.getByTestId('strength-exercises-empty')).toBeTruthy();
    expect(within(screen.getByTestId('strength-week-count')).getByText(/0/)).toBeTruthy();
  });

  it('lists templates and sessions and counts the sessions of this week', async () => {
    await render(withAppData(<StrengthHomeScreen />, 'en', app(data({ templates: [TEMPLATE], sessions: [DAY_1, DAY_2] }), actions())));
    expect(screen.getByText('Push day')).toBeTruthy();
    expect(within(screen.getByTestId('strength-week-count')).getByText(/1/)).toBeTruthy();
    expect(screen.getByTestId('session-2')).toBeTruthy();
    expect(screen.getAllByText(/4 sets · 1195 kg/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('session-2'));
  });

  it('starts an empty workout and opens the live screen', async () => {
    const startSession = jest.fn(async () => 5);
    await render(withAppData(<StrengthHomeScreen />, 'en', app(data(), actions({ startSession }))));
    await fireEvent.press(screen.getByTestId('strength-start-empty'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/strength/live'));
    expect(startSession).toHaveBeenCalledWith(null, 'Workout', []);
  });

  it('starts a template with its exercises', async () => {
    const startSession = jest.fn(async () => 5);
    await render(withAppData(<StrengthHomeScreen />, 'en', app(data({ templates: [TEMPLATE] }), actions({ startSession }))));
    await fireEvent.press(screen.getByTestId('template-start-7'));
    await waitFor(() => expect(startSession).toHaveBeenCalledWith(7, 'Push day', TEMPLATE.items));
  });

  it('offers to resume a running workout instead of starting another', async () => {
    const running: StrengthSession = { ...DAY_1, id: 9, endedAt: null, name: 'Legs' };
    await render(withAppData(<StrengthHomeScreen />, 'en', app(data({ templates: [TEMPLATE], sessions: [running] }), actions())));
    expect(screen.getByTestId('strength-active')).toBeTruthy();
    expect(screen.queryByTestId('strength-start-empty')).toBeNull();
    await fireEvent.press(screen.getByTestId('strength-resume'));
    expect(mockPush).toHaveBeenCalledWith('/strength/live');
  });

  it('exports the data through the existing export', async () => {
    const exportData = jest.fn(async () => undefined);
    await render(withAppData(<StrengthHomeScreen />, 'en', app(data(), actions(), { exportData })));
    await fireEvent.press(screen.getByTestId('strength-export'));
    expect(exportData).toHaveBeenCalled();
  });

  it('is available in Dutch', async () => {
    await render(withAppData(<StrengthHomeScreen />, 'nl', app(data(), actions())));
    expect(screen.getByText('Sessies deze week')).toBeTruthy();
  });
});

describe('workout builder', () => {
  it('asks for a name, an exercise and valid targets before saving', async () => {
    const saveTemplate = jest.fn(async () => 1);
    await render(withAppData(<StrengthBuilderScreen />, 'en', app(data(), actions({ saveTemplate }))));
    await fireEvent.press(screen.getByTestId('builder-save'));
    expect(screen.getByTestId('builder-error')).toHaveTextContent(/name of 1 to 60/);
    await fireEvent.changeText(screen.getByTestId('builder-name'), 'Leg day');
    await fireEvent.press(screen.getByTestId('builder-save'));
    expect(screen.getByTestId('builder-error')).toHaveTextContent(/at least one exercise/);

    await fireEvent.press(screen.getByTestId('builder-add'));
    await fireEvent.press(screen.getByTestId('pick-lib:back_squat'));
    await fireEvent.changeText(screen.getByTestId('builder-sets-0'), '0');
    await fireEvent.changeText(screen.getByTestId('builder-reps-0'), '101');
    await fireEvent.changeText(screen.getByTestId('builder-weight-0'), '-3');
    await fireEvent.press(screen.getByTestId('builder-save'));
    expect(screen.getByTestId('builder-error')).toHaveTextContent(/Check the highlighted numbers/);
    expect(saveTemplate).not.toHaveBeenCalled();
  });

  it('saves a template with parsed numbers in the chosen order', async () => {
    const saveTemplate = jest.fn(async () => 1);
    await render(withAppData(<StrengthBuilderScreen />, 'en', app(data(), actions({ saveTemplate }))));
    await fireEvent.changeText(screen.getByTestId('builder-name'), '  Leg   day ');
    await fireEvent.press(screen.getByTestId('builder-add'));
    await fireEvent.press(screen.getByTestId('pick-lib:back_squat'));
    await fireEvent.press(screen.getByTestId('builder-add'));
    await fireEvent.press(screen.getByTestId('pick-lib:leg_curl'));
    await fireEvent.changeText(screen.getByTestId('builder-sets-0'), '4');
    await fireEvent.changeText(screen.getByTestId('builder-reps-0'), '6');
    await fireEvent.changeText(screen.getByTestId('builder-weight-0'), '102,5');
    await fireEvent.press(screen.getByTestId('builder-up-1'));
    await fireEvent.press(screen.getByTestId('builder-save'));
    await waitFor(() => expect(saveTemplate).toHaveBeenCalledTimes(1));
    expect(saveTemplate).toHaveBeenCalledWith(null, {
      name: 'Leg day',
      items: [
        { exerciseKey: 'lib:leg_curl', exerciseName: 'Leg curl', muscle: 'hamstrings', sets: 3, reps: 8, weightKg: 0 },
        { exerciseKey: 'lib:back_squat', exerciseName: 'Back squat', muscle: 'quads', sets: 4, reps: 6, weightKg: 102.5 },
      ],
    });
  });

  it('edits and deletes an existing template', async () => {
    mockParams = { id: '7' };
    const saveTemplate = jest.fn(async () => 7);
    const removeTemplate = jest.fn(async () => true);
    await render(withAppData(<StrengthBuilderScreen />, 'en', app(data({ templates: [TEMPLATE] }), actions({ saveTemplate, removeTemplate }))));
    expect(screen.getByTestId('builder-name').props.value).toBe('Push day');
    expect(screen.getByTestId('builder-weight-0').props.value).toBe('60');
    await fireEvent.changeText(screen.getByTestId('builder-weight-0'), '62.5');
    await fireEvent.press(screen.getByTestId('builder-save'));
    await waitFor(() => expect(saveTemplate).toHaveBeenCalledWith(7, { name: 'Push day', items: [{ ...TEMPLATE.items[0], weightKg: 62.5 }] }));
    await fireEvent.press(screen.getByTestId('builder-delete'));
    await fireEvent.press(screen.getByTestId('builder-confirm-delete'));
    await waitFor(() => expect(removeTemplate).toHaveBeenCalledWith(7));
  });

  it('creates a custom exercise and refuses a duplicate name', async () => {
    const saveExercise = jest.fn(async () => true);
    await render(withAppData(<StrengthBuilderScreen />, 'en', app(data(), actions({ saveExercise }))));
    await fireEvent.press(screen.getByTestId('builder-add'));
    await fireEvent.changeText(screen.getByTestId('picker-name'), 'bench PRESS');
    await fireEvent.press(screen.getByTestId('picker-create'));
    expect(screen.getByText('An exercise with that name exists already.')).toBeTruthy();
    expect(saveExercise).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('picker-name'), 'Sled push');
    await fireEvent.press(screen.getByTestId('picker-muscle-quads'));
    await fireEvent.press(screen.getByTestId('picker-create'));
    await waitFor(() => expect(saveExercise).toHaveBeenCalledWith({ name: 'Sled push', muscle: 'quads' }));
  });

  it('does not offer save-and-start while a workout is running', async () => {
    const running: StrengthSession = { ...DAY_1, id: 9, endedAt: null };
    await render(withAppData(<StrengthBuilderScreen />, 'en', app(data({ sessions: [running] }), actions())));
    expect(screen.getByTestId('builder-save-start').props.accessibilityState.disabled).toBe(true);
  });

  it('says so when the template no longer exists', async () => {
    mockParams = { id: '99' };
    await render(withAppData(<StrengthBuilderScreen />, 'en', app(data(), actions())));
    expect(screen.getByTestId('builder-missing')).toBeTruthy();
  });
});

describe('live session', () => {
  const running: StrengthSession = {
    id: 3,
    templateId: 7,
    name: 'Push day',
    day: '2026-11-25',
    startedAt: NOW_S - 125,
    endedAt: null,
    exercises: [{ id: 11, sessionId: 3, position: 0, exerciseKey: 'lib:bench_press', exerciseName: 'Bench press', muscle: 'chest', sets: 3, reps: 8, weightKg: 60 }],
    sets: [],
  };

  it('shows a calm state without a running workout', async () => {
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data(), actions())));
    expect(screen.getByTestId('live-none')).toBeTruthy();
  });

  it('works without a band: no heart rate invented, offer to show it', async () => {
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions())));
    expect(within(screen.getByTestId('live-hr')).getByText(/–/)).toBeTruthy();
    expect(screen.getByTestId('live-hr-off')).toBeTruthy();
    expect(within(screen.getByTestId('live-elapsed')).getByText(/2:05/)).toBeTruthy();
  });

  it('shows the live heart rate when the live path is active', async () => {
    const live = { active: true, heartRate: 128, lastRrMs: 470, updatedAt: 1 };
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions(), { live })));
    expect(within(screen.getByTestId('live-hr')).getByText(/128/)).toBeTruthy();
    expect(screen.queryByTestId('live-hr-off')).toBeNull();
  });

  it('starts the live heart rate on request', async () => {
    const startLive = jest.fn(async () => undefined);
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions(), { startLive })));
    await fireEvent.press(screen.getByTestId('live-hr-start'));
    expect(startLive).toHaveBeenCalled();
  });

  it('prefills the plan, rejects bad numbers and logs a valid set', async () => {
    const logSet = jest.fn(async () => true);
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions({ logSet }))));
    expect(screen.getByTestId('live-reps-lib:bench_press').props.value).toBe('8');
    expect(screen.getByTestId('live-weight-lib:bench_press').props.value).toBe('60');
    await fireEvent.changeText(screen.getByTestId('live-reps-lib:bench_press'), '0');
    await fireEvent.press(screen.getByTestId('live-log-lib:bench_press'));
    expect(logSet).not.toHaveBeenCalled();
    expect(screen.getByText('Check the highlighted numbers.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('live-reps-lib:bench_press'), '7');
    await fireEvent.changeText(screen.getByTestId('live-rpe-lib:bench_press'), '12');
    await fireEvent.press(screen.getByTestId('live-log-lib:bench_press'));
    expect(logSet).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('live-rpe-lib:bench_press'), '8.5');
    await fireEvent.press(screen.getByTestId('live-log-lib:bench_press'));
    await waitFor(() =>
      expect(logSet).toHaveBeenCalledWith(3, { exerciseKey: 'lib:bench_press', exerciseName: 'Bench press', muscle: 'chest', reps: 7, weightKg: 60, rpe: 8.5 }),
    );
  });

  it('starts the rest timer after a logged set and lets you skip it', async () => {
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions())));
    expect(screen.getByTestId('live-rest-state')).toHaveTextContent(/Starts after each logged set/);
    await fireEvent.press(screen.getByTestId('live-rest-120'));
    await fireEvent.press(screen.getByTestId('live-log-lib:bench_press'));
    await waitFor(() => expect(screen.getByTestId('live-rest-value')).toHaveTextContent('2:00'));
    expect(screen.getByTestId('live-rest-state')).toHaveTextContent(/Resting/);
    await fireEvent.press(screen.getByTestId('live-rest-skip'));
    expect(screen.getByTestId('live-rest-state')).toHaveTextContent(/Starts after/);
  });

  it('lists logged sets, follows the last one and deletes a set', async () => {
    const removeSet = jest.fn(async () => true);
    const withSet: StrengthSession = { ...running, sets: [set(3, 'lib:bench_press', 'Bench press', 'chest', 6, 62.5, 8)] };
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [withSet] }), actions({ removeSet }))));
    expect(screen.getByText(/Set 1: 6 × 62.5 kg · RPE 8/)).toBeTruthy();
    expect(screen.getByTestId('live-reps-lib:bench_press').props.value).toBe('6');
    await fireEvent.press(screen.getByTestId(`live-delete-set-${withSet.sets[0]?.id}`));
    expect(removeSet).toHaveBeenCalledWith(withSet.sets[0]?.id);
  });

  it('cannot finish without a set, then finishes and opens the summary', async () => {
    const finishSession = jest.fn(async () => true);
    const view = await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions({ finishSession }))));
    expect(screen.getByTestId('live-finish-hint')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('live-finish'));
    expect(finishSession).not.toHaveBeenCalled();
    const withSet: StrengthSession = { ...running, sets: [set(3, 'lib:bench_press', 'Bench press', 'chest', 6, 62.5)] };
    await view.rerender(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [withSet] }), actions({ finishSession }))));
    await fireEvent.press(screen.getByTestId('live-finish'));
    await waitFor(() => expect(finishSession).toHaveBeenCalledWith(3));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/strength/summary', params: { id: '3' } }));
  });

  it('discards after a confirmation', async () => {
    const removeSession = jest.fn(async () => true);
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions({ removeSession }))));
    await fireEvent.press(screen.getByTestId('live-discard'));
    expect(removeSession).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('live-confirm-discard'));
    await waitFor(() => expect(removeSession).toHaveBeenCalledWith(3));
  });

  it('adds an exercise from the library mid-session', async () => {
    const addSessionExercise = jest.fn(async () => true);
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions({ addSessionExercise }))));
    await fireEvent.press(screen.getByTestId('live-add'));
    await fireEvent.press(screen.getByTestId('pick-lib:pull_up'));
    await waitFor(() =>
      expect(addSessionExercise).toHaveBeenCalledWith(3, { exerciseKey: 'lib:pull_up', exerciseName: 'Pull-up', muscle: 'back', sets: 3, reps: 8, weightKg: 0 }),
    );
  });

  it('keeps counting time', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXTURE_NOW);
    jest.spyOn(Date, 'now').mockImplementation(() => new Date().getTime());
    await render(withAppData(<StrengthLiveScreen />, 'en', app(data({ sessions: [running] }), actions())));
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(within(screen.getByTestId('live-elapsed')).getByText(/2:10/)).toBeTruthy();
    jest.useRealTimers();
  });
});

describe('workout summary', () => {
  it('shows volume per exercise, muscular load (level C) and a new record', async () => {
    mockParams = { id: '2' };
    await render(withAppData(<StrengthSummaryScreen />, 'en', app(data({ sessions: [DAY_1, DAY_2] }), actions())));
    expect(within(screen.getByTestId('summary-sets')).getByText(/4/)).toBeTruthy();
    expect(within(screen.getByTestId('summary-reps')).getByText(/28/)).toBeTruthy();
    expect(within(screen.getByTestId('summary-volume')).getByText(/1195/)).toBeTruthy();
    expect(within(screen.getByTestId('summary-duration')).getByText(/50 min/)).toBeTruthy();
    expect(screen.getByTestId('summary-exercise-lib:bench_press')).toBeTruthy();
    expect(screen.getByTestId('summary-record-lib:bench_press')).toBeTruthy();
    expect(screen.queryByTestId('summary-record-lib:back_squat')).toBeNull();
    const chest = screen.getByTestId('summary-load-rows-chest');
    expect(within(chest).getByText('2 sets · 695 kg')).toBeTruthy();
    expect(within(screen.getByTestId('summary-load-rows-core')).getByText('1 sets · 0 kg')).toBeTruthy();
    expect(screen.getByText(/not a measure of physiological strain/)).toBeTruthy();
  });

  it('shows heart-rate stats from the samples in the session window', async () => {
    mockParams = { id: '2' };
    const heartRateBetween = jest.fn(async () => [
      { t: 1, hr: 100 },
      { t: 11, hr: 140 },
    ]);
    await render(withAppData(<StrengthSummaryScreen />, 'en', app(data({ sessions: [DAY_2] }), actions(), { heartRateBetween })));
    await waitFor(() => expect(within(screen.getByTestId('summary-hr-avg')).getByText(/120/)).toBeTruthy());
    expect(within(screen.getByTestId('summary-hr-max')).getByText(/140/)).toBeTruthy();
    expect(heartRateBetween).toHaveBeenCalledWith(DAY_2.startedAt, DAY_2.endedAt, 10);
  });

  it('says so when there are no heart-rate samples', async () => {
    mockParams = { id: '2' };
    await render(withAppData(<StrengthSummaryScreen />, 'en', app(data({ sessions: [DAY_2] }), actions())));
    await waitFor(() => expect(screen.getByTestId('summary-hr-none')).toBeTruthy());
  });

  it('falls back to the latest finished session and to an empty state', async () => {
    await render(withAppData(<StrengthSummaryScreen />, 'en', app(data({ sessions: [DAY_1, DAY_2] }), actions())));
    expect(screen.getByText(/Push 2/)).toBeTruthy();
  });

  it('shows an empty state without a finished session', async () => {
    await render(withAppData(<StrengthSummaryScreen />, 'en', app(data(), actions())));
    expect(screen.getByTestId('summary-empty')).toBeTruthy();
  });

  it('deletes the workout after a confirmation', async () => {
    mockParams = { id: '2' };
    const removeSession = jest.fn(async () => true);
    await render(withAppData(<StrengthSummaryScreen />, 'en', app(data({ sessions: [DAY_2] }), actions({ removeSession }))));
    await fireEvent.press(screen.getByTestId('summary-delete'));
    expect(removeSession).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('summary-confirm-delete'));
    await waitFor(() => expect(removeSession).toHaveBeenCalledWith(2));
  });
});

describe('exercise details', () => {
  it('shows the estimated 1RM with its formula, history and heaviest set', async () => {
    mockParams = { key: 'lib:bench_press' };
    await render(withAppData(<StrengthExerciseScreen />, 'en', app(data({ sessions: [DAY_1, DAY_2] }), actions())));
    expect(screen.getByTestId('exercise-rm-value')).toHaveTextContent('99.2 kg');
    expect(screen.getByText('Estimate')).toBeTruthy();
    expect(screen.getByText(/Epley’s formula \(1985\)/)).toBeTruthy();
    expect(within(screen.getByTestId('exercise-heaviest')).getByText(/90/)).toBeTruthy();
    expect(within(screen.getByTestId('exercise-total-sets')).getByText(/4/)).toBeTruthy();
    expect(screen.getByTestId('exercise-entry-2')).toBeTruthy();
    expect(screen.getByTestId('exercise-entry-1')).toBeTruthy();
  });

  it('gives no estimate for bodyweight work', async () => {
    mockParams = { key: 'lib:crunch' };
    await render(withAppData(<StrengthExerciseScreen />, 'en', app(data({ sessions: [DAY_2] }), actions())));
    expect(screen.getByTestId('exercise-rm-none')).toBeTruthy();
    expect(screen.queryByTestId('exercise-rm-value')).toBeNull();
  });

  it('lists trained exercises without a key and handles an unknown key', async () => {
    await render(withAppData(<StrengthExerciseScreen />, 'en', app(data({ sessions: [DAY_2] }), actions())));
    expect(screen.getByTestId('exercise-pick-lib:back_squat')).toBeTruthy();
    mockParams = { key: 'lib:deadlift' };
    await render(withAppData(<StrengthExerciseScreen />, 'en', app(data({ sessions: [DAY_2] }), actions())));
    expect(screen.getByTestId('exercise-not-found')).toBeTruthy();
  });
});

describe('strength trends', () => {
  it('shows weekly sessions, volume and volume per muscle group', async () => {
    await render(withAppData(<StrengthTrendsScreen />, 'en', app(data({ sessions: [DAY_1, DAY_2] }), actions())));
    expect(within(screen.getByTestId('trends-total')).getByText(/2/)).toBeTruthy();
    expect(screen.getByTestId('trends-sessions-chart')).toBeTruthy();
    expect(screen.getByTestId('trends-volume-chart')).toBeTruthy();
    expect(screen.getByTestId('trends-volume-total')).toHaveTextContent(/1995 kg/);
    expect(screen.getByTestId('trends-muscle-rows-chest')).toBeTruthy();
    await fireEvent.press(screen.getByText('4 weeks'));
    expect(within(screen.getByTestId('trends-total')).getByText(/2/)).toBeTruthy();
  });

  it('leaves out sessions older than the chosen period', async () => {
    const old = finished(5, '2026-08-01', NOW_S - 100 * 86_400, [set(5, 'lib:bench_press', 'Bench press', 'chest', 5, 80)]);
    await render(withAppData(<StrengthTrendsScreen />, 'en', app(data({ sessions: [old] }), actions())));
    expect(screen.getByTestId('trends-empty')).toBeTruthy();
  });

  it('shows an empty state without sessions', async () => {
    await render(withAppData(<StrengthTrendsScreen />, 'en', app(data(), actions())));
    expect(screen.getByTestId('trends-empty')).toBeTruthy();
  });
});

describe('home week card', () => {
  it('shows the Strength row with this week’s sessions', async () => {
    const days = createFixtureDays(FIXTURE_NOW);
    await render(withAppData(<WeekCard days={days} index={days.length - 1} />, 'en', app(data({ sessions: [DAY_1, DAY_2] }), actions())));
    expect(screen.getByTestId('week-strength')).toHaveTextContent(/^1× · \d+ min$/);
    expect(screen.getByText('Strength')).toBeTruthy();
    expect(screen.queryByTestId('week-strength-bar')).toBeNull();
  });

  it('shows strength minutes as a bar against the weekly goal and seals a met goal', async () => {
    const days = createFixtureDays(FIXTURE_NOW);
    const minutes = 50;
    const withGoal = (goal: number): AppDataOverrides =>
      app(data({ sessions: [DAY_1, DAY_2] }), actions(), {
        userData: { ...defaultUserData(), onboardingDone: true, weeklyPlan: { ...defaultPlan(null), goals: ['strength'], strengthMinutes: goal } },
      });
    await render(withAppData(<WeekCard days={days} index={days.length - 1} />, 'en', withGoal(minutes + 30)));
    expect(screen.getByTestId('week-strength')).toHaveTextContent(`${minutes}/${minutes + 30} min`);
    expect(screen.queryByTestId('week-load')).toBeNull();
    expect(screen.getByTestId('week-strength-bar')).toBeTruthy();
    expect(screen.queryByTestId('week-strength-seal')).toBeNull();
    await render(withAppData(<WeekCard days={days} index={days.length - 1} />, 'en', withGoal(Math.max(1, minutes))));
    expect(screen.getByTestId('week-strength-seal')).toBeTruthy();
  });

  it('shows zero when there is no session this week', async () => {
    const days = createFixtureDays(FIXTURE_NOW);
    await render(withAppData(<WeekCard days={days} index={days.length - 1} />, 'en', app(data(), actions())));
    expect(screen.getByTestId('week-strength')).toHaveTextContent('0× · 0 min');
  });
});
