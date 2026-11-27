import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { JournalAnswer } from '@/data/userData';
import { defaultUserData } from '@/data/userData';
import { createFixtureDays } from '@/data/fixtureSource';
import { addDays } from '@/data/derived';
import { answerIsYes, breathPositionAt, BREATH_PATTERNS, compareBehaviour, latestVitalsIndex, vitalReadings, vitalsSummary, yesRate } from '@/data/healthDerived';
import { todayIso } from '@/lib/format';

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

import EcgScreen from '@/app/health/ecg';
import HeartRateScreen from '@/app/health/heart-rate';
import MetricsScreen from '@/app/health/metrics';
import BodyAgeScreen from '@/app/health/body-age';
import VitalsScreen from '@/app/health/vitals';
import BreathingScreen from '@/app/health/breathing';
import HealthTab from '@/app/(tabs)/health';
import JournalScreen from '@/app/journal/index';
import JournalInsightsScreen from '@/app/journal/insights';
import JournalTrendsScreen from '@/app/journal/trends';

const days = createFixtureDays(FIXTURE_NOW);

describe('healthDerived', () => {
  it('summarises vitals against personal baselines', () => {
    const index = latestVitalsIndex(days);
    expect(index).toBeGreaterThan(0);
    const readings = vitalReadings(days, index);
    const summary = vitalsSummary(readings);
    expect(summary.measured).toBeGreaterThan(0);
    expect(summary.within).toBeLessThanOrEqual(summary.judged);
  });

  it('treats numeric journal answers as yes when above zero', () => {
    expect(answerIsYes(2)).toBe(true);
    expect(answerIsYes(0)).toBe(false);
    expect(answerIsYes(undefined)).toBeNull();
  });

  it('counts yes answers over 30 days', () => {
    const journal = { '2026-11-25': { sauna: true }, '2026-11-24': { sauna: false } };
    const rate = yesRate(journal, 'sauna', '2026-11-25');
    expect(rate.yes).toBe(1);
    expect(rate.answered).toBe(2);
    expect(rate.cells).toHaveLength(30);
  });

  it('requires a minimum on each side before comparing', () => {
    const last = days[days.length - 2];
    const journal: Record<string, Record<string, JournalAnswer>> = last ? { [last.day]: { sauna: true } } : {};
    expect(compareBehaviour(days, journal, 'sauna', 'readiness').enough).toBe(false);
  });

  it('compares the next-morning metric with and without a behaviour', () => {
    const journal: Record<string, Record<string, JournalAnswer>> = {};
    days.slice(-14, -1).forEach((day, i) => {
      journal[day.day] = { sauna: i % 2 === 0 };
    });
    const result = compareBehaviour(days, journal, 'sauna', 'readiness', 2);
    expect(result.nWith + result.nWithout).toBeGreaterThan(0);
  });

  it('walks through the breathing pattern', () => {
    const calm = BREATH_PATTERNS[0];
    if (!calm) throw new Error('no pattern');
    expect(breathPositionAt(calm, 0).phase).toBe('inhale');
    expect(breathPositionAt(calm, 4).phase).toBe('exhale');
    expect(breathPositionAt(calm, 10).phase).toBe('inhale');
  });
});

describe('health screens', () => {
  it('shows real vitals with a personal range chip', async () => {
    await render(withAppData(<VitalsScreen />));
    expect(screen.getByTestId('vitals-hero')).toBeTruthy();
    expect(screen.getByTestId('vital-hrv-value')).toBeTruthy();
    expect(screen.getAllByText(/within|above|below|Calibrating/i).length).toBeGreaterThan(0);
  });

  it('shows the hub with the metric finder and a vitals summary', async () => {
    await render(withAppData(<HealthTab />));
    expect(screen.getByTestId('health-find-metric')).toBeTruthy();
    expect(screen.getByTestId('health-vitals-within')).toBeTruthy();
    expect(screen.getByTestId('health-entry-ecg')).toBeTruthy();
  });

  it('shows 24h heart rate stats from the day record and requests the 5-minute series', async () => {
    const heartRateBetween = jest.fn().mockResolvedValue([]);
    await render(withAppData(<HeartRateScreen />, 'en', { heartRateBetween }));
    expect(screen.getByTestId('hr-avg')).toBeTruthy();
    await waitFor(() => expect(heartRateBetween).toHaveBeenCalled());
    expect(heartRateBetween.mock.calls[0]?.[2]).toBe(300);
  });

  it('filters the metric list and says when a value has no data', async () => {
    await render(withAppData(<MetricsScreen />));
    expect(screen.getByTestId('metric-hrv')).toBeTruthy();
    expect(screen.getByTestId('metric-ecg')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('metrics-search'), 'ecg');
    expect(screen.queryByTestId('metric-hrv')).toBeNull();
    expect(screen.getAllByText('No data').length).toBeGreaterThan(0);
  });

  it('shows body age as two separate cards, not as a NotBuilt page', async () => {
    await render(withAppData(<BodyAgeScreen />));
    expect(screen.getByTestId('body-age-fitness')).toBeTruthy();
    expect(screen.getByTestId('body-age-pheno')).toBeTruthy();
    expect(screen.queryByTestId('not-built-healthspan')).toBeNull();
  });

  it('flags MG-only screens on a 5.0 band and never shows a verdict', async () => {
    await render(withAppData(<EcgScreen />));
    expect(screen.getByTestId('needs-mg')).toBeTruthy();
    expect(screen.getByTestId('ecg-start').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('mg-disclaimer')).toBeTruthy();
  });

  it('renders the breathing timer and starts a session', async () => {
    await render(withAppData(<BreathingScreen />));
    expect(screen.getByTestId('breath-start')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('breath-start'));
    expect(screen.getByTestId('breath-stop')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('breath-stop'));
    expect(screen.getByTestId('breath-start')).toBeTruthy();
  });
});

describe('journal', () => {
  it('saves answers under the chosen day', async () => {
    const updateUserData = jest.fn().mockResolvedValue(undefined);
    await render(withAppData(<JournalScreen />, 'en', { updateUserData }));
    await fireEvent.press(screen.getByTestId('journal-sauna-yes'));
    await fireEvent.press(screen.getByTestId('journal-save'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ journal: { [todayIso(new Date())]: { sauna: true } } }));
  });

  it('shows trends from real journal data', async () => {
    const today = todayIso(new Date());
    const userData = { ...defaultUserData(), journal: { [today]: { sauna: true }, [addDays(today, -1)]: { sauna: false } } };
    await render(withAppData(<JournalTrendsScreen />, 'en', { userData }));
    expect(screen.getByText('Yes on 1 of 2 answered days')).toBeTruthy();
  });

  it('asks for more entries instead of inventing insights', async () => {
    const today = todayIso(new Date());
    const userData = { ...defaultUserData(), journal: { [addDays(today, -1)]: { sauna: true } } };
    await render(withAppData(<JournalInsightsScreen />, 'en', { userData }));
    expect(screen.getAllByText(/Needs more entries/).length).toBeGreaterThan(0);
  });
});
