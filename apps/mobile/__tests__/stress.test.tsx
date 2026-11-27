import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { stressLevel } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import { createFixtureDays } from '@/data/fixtureSource';
import { latestStressDayIndex, latestStressScore, stressForDay, stressTimeline } from '@/data/stressDerived';
import { defaultUserData } from '@/data/userData';
import { formatClock, formatNumber, formatShortDay } from '@/lib/format';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import HomeScreen from '@/app/(tabs)/index';
import MetricsScreen from '@/app/health/metrics';
import StressScreen from '@/app/health/stress';

const days = createFixtureDays(FIXTURE_NOW);

function dayAt(index: number): DayRecord {
  const day = days[index];
  if (!day) throw new Error(`fixture day ${index} missing`);
  return day;
}

const last = dayAt(days.length - 1);

describe('stress derivation', () => {
  it('reads the latest scored window of a day with its level', () => {
    const view = stressForDay(last);
    expect(view.reason).toBeNull();
    expect(view.calibrating).toBe(false);
    expect(view.latest).not.toBeNull();
    const latestWindow = [...view.windows].reverse().find((w) => w.score !== null);
    expect(view.latest?.t).toBe(latestWindow?.t);
    expect(view.latest?.level).toBe(stressLevel(latestWindow?.score ?? 0));
    const total = view.seconds.low + view.seconds.medium + view.seconds.high;
    expect(total).toBe(view.windows.length * 300);
    expect(view.latest?.t ?? Infinity).toBeLessThan(FIXTURE_NOW.getTime() / 1000);
  });

  it('marks the first days as calibrating without a level', () => {
    const view = stressForDay(dayAt(0));
    expect(view.calibrating).toBe(true);
    expect(view.reason).toBe('needs-history');
    expect(view.latest).toBeNull();
    expect(view.windows.length).toBeGreaterThan(0);
  });

  it('gives a reason when the day has no usable or no stored stress', () => {
    expect(stressForDay(dayAt(25)).reason).toBe('low-coverage');
    expect(stressForDay({ ...last, stress: undefined }).reason).toBe('no-data');
    expect(stressForDay({ ...last, stress: null }).reason).toBe('no-data');
    expect(stressForDay(undefined).reason).toBe('no-data');
  });

  it('rejects a malformed stored value instead of showing it', () => {
    const broken = { ...last, stress: { algo: 'x', reason: null, baselineDays: 3, windows: [{ t: 0, hr: 60, rmssd: null, score: 9 }] } };
    expect(stressForDay(broken).reason).toBe('no-data');
  });

  it('places scores on a five-minute grid with gaps as null', () => {
    const start = 1_000_200;
    const grid = stressTimeline(
      [
        { t: 1_000_200, hr: 60, rmssd: null, score: 0.4 },
        { t: 1_001_100, hr: 70, rmssd: 20, score: 2.1 },
        { t: 1_001_400, hr: 70, rmssd: 20, score: null },
      ],
      start,
      start + 1800,
    );
    expect(grid).toEqual([0.4, null, null, 2.1, null, null]);
    expect(stressTimeline([], 10, 10)).toEqual([]);
  });

  it('finds the latest day with a scored window', () => {
    expect(latestStressDayIndex(days)).toBe(days.length - 1);
    expect(latestStressDayIndex(days.slice(0, 3))).toBe(2);
    expect(latestStressScore(days)).toBe(stressForDay(last).latest?.score);
    expect(latestStressScore(days.slice(0, 3))).toBeNull();
  });
});

describe('Home stress tile', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows the latest level, score and time as an estimate with level C', async () => {
    const latest = stressForDay(last).latest;
    await render(withAppData(<HomeScreen />));
    const level = screen.getByTestId('stress-tile-level');
    expect(level).toHaveTextContent(/^(Low|Medium|High)$/);
    expect(screen.getByTestId('stress-tile-score')).toHaveTextContent(formatNumber(latest?.score ?? 0, 1, 'en'));
    expect(screen.getByTestId('stress-tile-time')).toHaveTextContent(`at ${formatClock(latest?.t ?? 0, last.tzOffsetS)} · Estimate`);
    await fireEvent.press(screen.getByTestId('card-stress'));
    expect(mockPush).toHaveBeenCalledWith('/health/stress');
  });

  it('says calibrating on the first days', async () => {
    await render(withAppData(<HomeScreen />, 'en', { days: days.slice(0, 2) }));
    expect(screen.getByTestId('stress-tile-reason')).toHaveTextContent('Not yet');
  });

  it('shows the reason when stress is missing, in Dutch too', async () => {
    const missing = days.map((d) => ({ ...d, stress: undefined }));
    await render(withAppData(<HomeScreen />, 'nl', { days: missing }));
    expect(screen.getByTestId('stress-tile-reason')).toHaveTextContent('Geen data');
  });
});

describe('Stress screen', () => {
  it('shows the latest level, the timeline, time per level and the disclaimer', async () => {
    const view = stressForDay(last);
    await render(withAppData(<StressScreen />));
    expect(screen.getByTestId('stress-day')).toHaveTextContent(formatShortDay(last.day, 'en'));
    expect(screen.getByTestId('stress-latest-level')).toHaveTextContent(/^(Low|Medium|High)$/);
    expect(screen.getByTestId('stress-latest-time')).toHaveTextContent(
      `at ${formatClock(view.latest?.t ?? 0, last.tzOffsetS)} · Compared with your last ${view.baselineDays} days`,
    );
    expect(screen.getByTestId('stress-chart')).toBeTruthy();
    expect(screen.getByTestId('stress-levels')).toBeTruthy();
    expect(screen.getByTestId('stress-time-low')).toBeTruthy();
    expect(screen.getByTestId('stress-disclaimer')).toHaveTextContent(/not a diagnosis/);
    expect(screen.getByText('Estimate')).toBeTruthy();
    expect(screen.queryByTestId('not-built-stress')).toBeNull();
    expect(screen.queryByTestId('stress-calibrating')).toBeNull();
  });

  it('steps back to a calibrating day and explains it', async () => {
    await render(withAppData(<StressScreen />, 'en', { days: days.slice(0, 4) }));
    expect(screen.getByTestId('stress-day')).toHaveTextContent(formatShortDay(dayAt(3).day, 'en'));
    await fireEvent.press(screen.getByTestId('stress-prev'));
    expect(screen.getByTestId('stress-day')).toHaveTextContent(formatShortDay(dayAt(2).day, 'en'));
    expect(screen.getByTestId('stress-calibrating')).toBeTruthy();
    expect(screen.getByText(/It needs 3 days/)).toBeTruthy();
    expect(screen.queryByTestId('stress-chart')).toBeNull();
  });

  it('says there were no still moments on a low-coverage day', async () => {
    await render(withAppData(<StressScreen />, 'en', { days: days.slice(25, 26) }));
    expect(screen.getByTestId('stress-reason')).toHaveTextContent('No still, awake moments to score on this day');
  });

  it('renders in Dutch without days', async () => {
    await render(withAppData(<StressScreen />, 'nl', { days: [], userData: { ...defaultUserData(), onboardingDone: true } }));
    expect(screen.getByTestId('stress-reason')).toHaveTextContent('Geen data');
    expect(screen.getByTestId('stress-disclaimer')).toHaveTextContent(/geen diagnose/);
  });
});

describe('metric list', () => {
  it('lists the latest stress score with level C', async () => {
    await render(withAppData(<MetricsScreen />));
    expect(screen.getByTestId('metric-stress')).toHaveTextContent(`StressHow far your heart rate and HRV drift from your calm level while you are awake and still.${formatNumber(latestStressScore(days) ?? 0, 1, 'en')}C`);
  });
});
