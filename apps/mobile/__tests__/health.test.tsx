import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';
import type { ReactNode } from 'react';

import type { JournalAnswer } from '@/data/userData';
import { defaultUserData } from '@/data/userData';
import { createFixtureDays, createFixtureSettings } from '@/data/fixtureSource';
import { addDays } from '@/data/derived';
import { answerIsYes, breathPositionAt, BREATH_PATTERNS, compareBehaviour, latestHeartRateDayIndex, latestVitalsIndex, vitalReadings, vitalsSummary, yesRate } from '@/data/healthDerived';
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
import { blobPath } from '@/ui/health/BreathBlob';
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

  it('shows the hub with the metric finder, live tiles and every former entry', async () => {
    await render(withAppData(<HealthTab />));
    expect(screen.getByTestId('health-find-metric')).toBeTruthy();
    expect(screen.getByTestId('health-tile-vitals-value')).toBeTruthy();
    expect(screen.getByTestId('health-tile-stress')).toBeTruthy();
    expect(screen.getByTestId('health-tile-ecg-missing').props.children).toBe('Needs an MG band');
    expect(screen.getByTestId('health-tile-labs-missing').props.children).toBe('None entered');
    expect(screen.getByTestId('health-tile-cycle-missing').props.children).toBe('No periods logged');
    expect(screen.getByTestId('health-tile-body-missing').props.children).toBe('No weight yet');
    for (const id of ['heart-rate', 'blood-pressure', 'report', 'breathing', 'journal', 'pillars']) {
      expect(screen.getByTestId(`health-entry-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('health-report-button')).toBeTruthy();
  });

  it('fills the hub tiles from logged labs, periods and weight', async () => {
    await render(
      withAppData(<HealthTab />, 'en', {
        labResults: [
          { id: 1, biomarker: 'glucose', value: 5, unit: 'mmol/L', day: '2026-11-01', refLow: 3.9, refHigh: 5.6, note: null, createdAt: 0 },
        ],
        bodyMeasurements: [{ id: 1, day: '2026-11-20', weightKg: 78, bodyFatPct: null, createdAt: 0, source: 'manual', origin: null }],
        cycle: { periods: [{ id: 1, startDay: '2026-11-10', endDay: '2026-11-14', flow: 2, createdAt: 0 }], symptoms: [], pregnancy: null },
      }),
    );
    expect(screen.getByTestId('health-tile-labs-value')).toHaveTextContent('1/1');
    expect(screen.getByTestId('health-tile-body-value')).toHaveTextContent('78.0 kg');
    expect(screen.getByTestId('health-tile-cycle-value')).toBeTruthy();
  });

  it('keeps the live card hidden until the band already streams and shows band status and level', async () => {
    const startLive = jest.fn();
    await render(withAppData(<VitalsScreen />, 'en', { startLive }));
    expect(screen.queryByTestId('vitals-live')).toBeNull();
    expect(screen.getByTestId('vitals-band-status')).toBeTruthy();
    expect(screen.getByTestId('vitals-level')).toBeTruthy();
    expect(screen.getByTestId('vital-temp')).toBeTruthy();
    expect(startLive).not.toHaveBeenCalled();
  });

  it('shows the live heart rate while the stream runs', async () => {
    await render(withAppData(<VitalsScreen />, 'en', { live: { active: true, heartRate: 72, lastRrMs: 830, updatedAt: 1 } }));
    expect(screen.getByTestId('vitals-live-value')).toHaveTextContent('72 bpm');
  });

  it('shows skin temperature in the chosen unit', async () => {
    await render(withAppData(<VitalsScreen />, 'en', { settings: { ...createFixtureSettings('en', FIXTURE_NOW), units: 'imperial' } }));
    expect(screen.getByTestId('vital-temp')).toHaveTextContent(/°F/);
  });

  it('shows 24h heart rate stats from the day record and requests the 5-minute series', async () => {
    const heartRateBetween = jest.fn().mockResolvedValue([]);
    await render(withAppData(<HeartRateScreen />, 'en', { heartRateBetween }));
    expect(screen.getByTestId('hr-avg')).toBeTruthy();
    await waitFor(() => expect(heartRateBetween).toHaveBeenCalled());
    expect(heartRateBetween.mock.calls[0]?.[2]).toBe(300);
  });

  it('switches heart rate tabs, asks for the night blood oxygen and scrubs the chart', async () => {
    const day = days[latestHeartRateDayIndex(days)];
    if (!day) throw new Error('fixture');
    const points = Array.from({ length: 50 }, (_, i) => ({ t: day.start + i * 1800, hr: 60 + (i % 10) }));
    const heartRateBetween = jest.fn().mockResolvedValue(points);
    const spo2Between = jest.fn().mockResolvedValue([{ t: (day.sleep.periods[0]?.onset ?? day.start) + 60, pct: 96 }]);
    await render(withAppData(<HeartRateScreen />, 'en', { heartRateBetween, spo2Between }));
    await waitFor(() => expect(spo2Between).toHaveBeenCalled());
    expect(screen.getByTestId('hr-spo2')).toBeTruthy();
    expect(screen.getByTestId('hr-scrub-note')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('hr-chart-touch')).toBeTruthy());
    await fireEvent(screen.getByTestId('hr-chart-touch'), 'layout', { nativeEvent: { layout: { width: 300, height: 180, x: 0, y: 0 } } });
    await fireEvent(screen.getByTestId('hr-chart-touch'), 'responderGrant', { nativeEvent: { locationX: 0 } });
    expect(screen.getByTestId('hr-chart-scrub')).toHaveTextContent(/60 bpm/);
    expect(screen.getByTestId('hr-tab-resting').props.accessibilityRole).toBe('tab');
    await fireEvent.press(screen.getByTestId('hr-tab-resting'));
    expect(screen.getByTestId('hr-resting')).toBeTruthy();
    expect(screen.queryByTestId('hr-spo2')).toBeNull();
    await fireEvent.press(screen.getByTestId('hr-tab-workouts'));
    expect(screen.getByTestId('hr-window')).toBeTruthy();
  });

  it('filters all metrics by category chip into one flat list and back', async () => {
    await render(withAppData(<MetricsScreen />));
    await fireEvent.press(screen.getByTestId('metrics-chip-sleep'));
    expect(screen.getByTestId('metric-asleep')).toBeTruthy();
    expect(screen.queryByTestId('metric-hrv')).toBeNull();
    expect(screen.queryByText('Readiness inputs')).toBeNull();
    await fireEvent.press(screen.getByTestId('metrics-chip-sleep'));
    expect(screen.getByTestId('metric-hrv')).toBeTruthy();
    expect(screen.getByText('Readiness inputs')).toBeTruthy();
  });

  it('shows body age in all metrics once it can be worked out', async () => {
    await render(withAppData(<MetricsScreen />, 'en', { profile: { birthYear: 1981, maxHeartRate: null }, userData: { ...defaultUserData(), onboardingDone: true, sex: 'male' } }));
    expect(screen.getByTestId('metric-bodyAge')).toHaveTextContent(/years · Fitness/);
    expect(screen.getByTestId('metric-bodyAge-about')).toBeTruthy();
  });

  it('says why body age is missing in all metrics instead of No data', async () => {
    await render(withAppData(<MetricsScreen />, 'en', { profile: { birthYear: 1981, maxHeartRate: null } }));
    expect(screen.getByTestId('metric-bodyAge')).toHaveTextContent(/Set your sex in your profile/);
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

  it('spells out the breathing pattern under the blob', async () => {
    await render(withAppData(<BreathingScreen />));
    expect(screen.getByTestId('breath-blob')).toBeTruthy();
    expect(screen.getByTestId('breath-steps')).toHaveTextContent('4 seconds in · 6 seconds out');
    expect(blobPath(100, 0.1)).toMatch(/^M.*Z$/);
  });

  it('animates the blob towards the breath', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await render(withAppData(<BreathingScreen />));
    await fireEvent.press(screen.getByTestId('breath-start'));
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1 }));
    await fireEvent.press(screen.getByTestId('breath-stop'));
    timing.mockRestore();
  });

  it('holds the blob still when reduce motion is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(true);
    const timing = jest.spyOn(Animated, 'timing');
    await render(withAppData(<BreathingScreen />));
    await act(async () => undefined);
    timing.mockClear();
    await fireEvent.press(screen.getByTestId('breath-start'));
    expect(timing).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('breath-stop'));
    timing.mockRestore();
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
