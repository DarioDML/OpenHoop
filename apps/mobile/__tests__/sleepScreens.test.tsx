import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays } from '@/data/fixtureSource';
import { formatMinutes, mainNightSpan } from '@/data/dailyDerived';
import type { HeartRatePoint } from '@/data/types';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';

let mockParams: Record<string, string | string[] | undefined> = {};
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import SleepScreen from '@/app/sleep/index';
import LastNightScreen from '@/app/sleep/last-night';

const days = createFixtureDays(FIXTURE_NOW);
const last = days[days.length - 1];

function nightPoints(surges: number): HeartRatePoint[] {
  const span = last === undefined ? null : mainNightSpan(last);
  const start = span?.onset ?? 0;
  const calm = Array.from({ length: 36 }, (_, i) => ({ t: start + i * 300, hr: 54 + (i % 3) }));
  const high = Array.from({ length: surges }, (_, i) => ({ t: start + (40 + i) * 300, hr: 72 }));
  return [...calm, ...high];
}

beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
});

describe('Sleep deep dive', () => {
  it('rates each contributor and computes high sleep stress from the night heart rate', async () => {
    const heartRateBetween = jest.fn(async () => nightPoints(4));
    await render(withAppData(<SleepScreen />, 'en', { heartRateBetween }));
    await waitFor(() => expect(screen.getByTestId('contrib-stress-value')).toHaveTextContent('10%'));
    expect(heartRateBetween).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 300);
    expect(screen.getByTestId('contrib-stress-status-word')).toHaveTextContent('Optimal');
    expect(within(screen.getByTestId('contrib-hours')).getByTestId('contrib-hours-status')).toBeTruthy();
  });

  it('explains a missing sleep stress value instead of a dash', async () => {
    await render(withAppData(<SleepScreen />));
    await waitFor(() => expect(screen.getByTestId('contrib-stress-why')).toHaveTextContent('›', { exact: false }));
  });

  it('asks the coach about the weakest contributor', async () => {
    await render(withAppData(<SleepScreen />, 'en', { heartRateBetween: async () => nightPoints(20) }));
    await waitFor(() => expect(screen.getByTestId('contrib-stress-status-word')).toHaveTextContent('Poor'));
    await fireEvent.press(screen.getByTestId('sleep-coach'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/coach', params: { ask: 'What raised my heart rate while I slept?' } });
  });

  it('breaks the need into parts and links to the need page', async () => {
    await render(withAppData(<SleepScreen />));
    expect(screen.getByTestId('need-bar')).toBeTruthy();
    expect(screen.getByTestId('need-legend-baseline')).toHaveTextContent(/^Baseline 7:44$/);
    expect(screen.getByTestId('need-legend-load')).toHaveTextContent(/^Load \+\d:\d\d$/);
    await fireEvent.press(screen.getByTestId('link-need'));
    expect(mockPush).toHaveBeenCalledWith('/sleep/need');
  });

  it('shows tonight\'s plan and sets the alarm to the planned wake time', async () => {
    await render(withAppData(<SleepScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, sleepGoal: 'getBy' } }));
    expect(screen.getByTestId('planner-goal')).toHaveTextContent('Just get by');
    await fireEvent.press(screen.getByTestId('planner-set-alarm'));
    const href = String(mockPush.mock.calls[0]?.[0]);
    expect(href).toMatch(/^\/sleep\/alarm\?minutes=\d+$/);
    expect(screen.getByTestId('planner-wake')).toHaveTextContent(formatMinutes(Number(href.split('=')[1])));
  });

  it('follows the weekly plan by default once there is one', async () => {
    await render(withAppData(<SleepScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, weeklyPlan: { loadDays: 3, sleepNights: 4 } } }));
    expect(screen.getByTestId('planner-goal')).toHaveTextContent('Follow weekly plan');
  });

  it('opens the score explanation from the header', async () => {
    await render(withAppData(<SleepScreen />));
    await fireEvent.press(screen.getByTestId('sleep-about'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
    expect(screen.getByTestId('sleep-level')).toBeTruthy();
  });
});

describe('Last night', () => {
  const span = last === undefined ? null : mainNightSpan(last);
  const onset = span?.onset ?? 0;
  const stage = (i: number, kind: 'wake' | 'light' | 'deep' | 'rem') => ({ t: onset + i * 30, stage: kind });

  it('shows the heart-rate minimum, time in stage with typical ranges and the night KPIs', async () => {
    const heartRateBetween = jest.fn(async () => [
      { t: onset, hr: 64 },
      { t: onset + 600, hr: 58 },
      { t: onset + 1200, hr: 61 },
    ]);
    const epochs = [stage(0, 'wake'), stage(1, 'wake'), stage(2, 'light'), stage(3, 'deep'), stage(4, 'wake'), stage(5, 'rem'), stage(6, 'light')];
    mockParams = { day: last?.day };
    await render(withAppData(<LastNightScreen />, 'en', { heartRateBetween, sleepStagesBetween: async () => epochs }));
    await waitFor(() => expect(screen.getByTestId('hr-min')).toHaveTextContent('Min58bpm'));
    expect(screen.getByTestId('chart-sleep-hr')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('kpi-latency-value')).toHaveTextContent('1'));
    expect(screen.getByTestId('kpi-disturbances-value')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-restorative-value')).toBeTruthy();
    expect(screen.getByTestId('kpi-resp')).toBeTruthy();
    for (const kind of ['wake', 'light', 'deep', 'rem']) expect(screen.getByTestId(`time-in-stage-${kind}-typical`)).toBeTruthy();
  });

  it('flags a stage outside its typical range', async () => {
    if (last === undefined) throw new Error('no fixture day');
    const totals = { wake: 97 * 60, light: 252 * 60, deep: 70 * 60, rem: 89 * 60 };
    const day = { ...last, sleep: { ...last.sleep, stages: { algo: 'x', reason: null, coverage: 0.9, totals } } };
    mockParams = { day: last.day };
    await render(withAppData(<LastNightScreen />, 'en', { days: [...days.slice(0, -1), day] }));
    expect(screen.getByTestId('time-in-stage-wake-flag')).toHaveTextContent('! above typical 0:00–0:50');
    expect(screen.queryByTestId('time-in-stage-deep-flag')).toBeNull();
    expect(screen.getByTestId('time-in-stage-wake')).toHaveTextContent('1:37');
  });

  it('says why latency is missing on a night without stages and opens the editor from the header', async () => {
    const thin = days.find((d) => d.sleep.stages?.reason === 'low-coverage');
    mockParams = { day: thin?.day };
    await render(withAppData(<LastNightScreen />));
    expect(screen.getByTestId('kpi-latency-why')).toBeTruthy();
    expect(screen.queryByTestId('card-time-in-stage')).toBeNull();
    await fireEvent.press(screen.getByTestId('link-edit-sleep'));
    expect(mockPush).toHaveBeenCalledWith(`/sleep/edit?day=${thin?.day}`);
  });
});
