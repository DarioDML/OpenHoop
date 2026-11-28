import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { addDays, visibleReadiness } from '@/data/derived';
import { createFixtureDays, createFixtureSettings } from '@/data/fixtureSource';
import type { JournalAnswer } from '@/data/userData';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';

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

import ReadinessScreen from '@/app/recovery/index';
import RecoveryTrendsScreen from '@/app/recovery/trends';
import ImpactsScreen from '@/app/recovery/impacts';
import MetricDetailScreen from '@/app/recovery/metric/[metric]';

const days = createFixtureDays(FIXTURE_NOW);

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockParams = {};
});

function scoredDays(value: number) {
  return days.map((d, i) => (i === days.length - 1 ? { ...d, readiness: { ...d.readiness, value, reason: null }, readinessCalibrating: false } : d));
}

describe('Readiness screen', () => {
  it('shows the band inside the ring and a verdict built from the contributors', async () => {
    await render(withAppData(<ReadinessScreen />, 'en', { days: scoredDays(52) }));
    const ring = within(screen.getByTestId('ring-readiness-detail'));
    expect(ring.getByText('Medium')).toBeTruthy();
    expect(screen.getByTestId('readiness-verdict')).toHaveTextContent(/Train, but keep it moderate\.$/);
  });

  it('shows the day passed in the link instead of today', async () => {
    const past = days.map((d, i) => (i === days.length - 2 ? { ...d, readiness: { ...d.readiness, value: 84, reason: null }, readinessCalibrating: false } : i === days.length - 1 ? { ...d, readiness: { ...d.readiness, value: 52, reason: null }, readinessCalibrating: false } : d));
    const day = past[past.length - 2]?.day;
    mockParams = { day };
    await render(withAppData(<ReadinessScreen />, 'en', { days: past }));
    expect(screen.getByTestId('readiness-verdict')).toHaveTextContent('Your body has recovered well. A good day to push.');
    await fireEvent.press(screen.getByTestId('row-hrv'));
    expect(mockPush).toHaveBeenCalledWith(`/recovery/metric/hrv?day=${day}`);
  });

  it('praises a high score', async () => {
    await render(withAppData(<ReadinessScreen />, 'en', { days: scoredDays(84) }));
    expect(screen.getByTestId('readiness-verdict')).toHaveTextContent('Your body has recovered well. A good day to push.');
  });

  it('links the load target card to the target screen', async () => {
    await render(withAppData(<ReadinessScreen />));
    expect(screen.getByTestId('card-load-target-range')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('card-load-target'));
    expect(mockPush).toHaveBeenCalledWith('/load/target');
  });

  it('says the load target is still calibrating without load history', async () => {
    await render(withAppData(<ReadinessScreen />, 'en', { days: days.slice(-2) }));
    expect(screen.getByTestId('card-load-target-calibrating')).toBeTruthy();
  });

  it('lists every contributor against its baseline and links to its detail', async () => {
    await render(withAppData(<ReadinessScreen />));
    for (const id of ['hrv', 'rhr', 'sleep', 'resp', 'spo2', 'temp']) expect(screen.getByTestId(`row-${id}`)).toBeTruthy();
    expect(screen.getByTestId('row-hrv-caption')).toHaveTextContent(/^Baseline \d+ ms$/);
    expect(screen.getByTestId('row-hrv-chip')).toHaveTextContent(/^(= normal|↑ \d+% higher|↓ \d+% lower)$/);
    await fireEvent.press(screen.getByTestId('row-hrv'));
    expect(mockPush).toHaveBeenCalledWith('/recovery/metric/hrv');
    await fireEvent.press(screen.getByTestId('row-sleep'));
    expect(mockPush).toHaveBeenCalledWith('/sleep');
  });

  it('explains a contributor in place without navigating', async () => {
    await render(withAppData(<ReadinessScreen />));
    await fireEvent.press(screen.getByTestId('row-rhr-name'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('scrolls the selected metric tab into view', async () => {
    const scrollTo = jest.fn();
    const proto = ScrollView.prototype as { scrollTo: (options: { x: number; animated: boolean }) => void };
    const original = proto.scrollTo;
    proto.scrollTo = scrollTo;
    try {
      mockParams = { metric: 'temp' };
      await render(withAppData(<MetricDetailScreen />));
      await fireEvent(screen.getByTestId('pill-wrap-hrv'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 60, height: 40 } } });
      expect(scrollTo).not.toHaveBeenCalled();
      await fireEvent(screen.getByTestId('pill-wrap-temp'), 'layout', { nativeEvent: { layout: { x: 380, y: 0, width: 110, height: 40 } } });
      expect(scrollTo).toHaveBeenCalledWith({ x: 364, animated: false });
    } finally {
      proto.scrollTo = original;
    }
  });

  it('shows skin temperature as a deviation in the chosen units', async () => {
    const last = days[days.length - 1];
    if (last === undefined) throw new Error('no fixture day');
    const tempDays = [...days.slice(0, -1), { ...last, skinTempDeviationC: { ...last.skinTempDeviationC, value: -0.4, reason: null } }];
    await render(withAppData(<ReadinessScreen />, 'en', { days: tempDays, settings: { ...createFixtureSettings('en', FIXTURE_NOW), units: 'imperial' } }));
    expect(screen.getByTestId('row-temp-value')).toHaveTextContent('−0.7 °F');
    expect(screen.getByTestId('row-temp-caption')).toHaveTextContent('Deviation from baseline');
  });

  it('links impacts and trends and draws the last seven days', async () => {
    await render(withAppData(<ReadinessScreen />));
    expect(screen.getAllByTestId(/^chart-readiness-week-/)).toHaveLength(7);
    await fireEvent.press(screen.getByTestId('link-impacts'));
    expect(mockPush).toHaveBeenCalledWith('/recovery/impacts');
    await fireEvent.press(screen.getByTestId('link-trends'));
    expect(mockPush).toHaveBeenCalledWith('/recovery/trends');
  });

  it('keeps the signed contributions, the explanation and the level note', async () => {
    await render(withAppData(<ReadinessScreen />));
    expect(screen.getByTestId('card-contributions')).toBeTruthy();
    expect(screen.getByText('How it is computed')).toBeTruthy();
    expect(screen.getByTestId('readiness-level')).toHaveTextContent(/not measured yet/);
    await fireEvent.press(screen.getByTestId('readiness-about'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
  });
});

describe('Readiness trends', () => {
  function trendDays(values: ReadonlyArray<number | null>) {
    const tail = days.slice(-values.length);
    return tail.map((d, i) => ({ ...d, readiness: { ...d.readiness, value: values[i] ?? null, reason: values[i] === null ? 'no-data' : null }, readinessCalibrating: false }));
  }

  it('draws a bar per day with an average and a band split', async () => {
    await render(withAppData(<RecoveryTrendsScreen />, 'en', { days: trendDays([71, 48, 29, 80, 66, 54, 62]) }));
    expect(screen.getAllByTestId(/^chart-readiness-\d{4}/)).toHaveLength(7);
    expect(screen.getByTestId('avg-readiness')).toHaveTextContent('avg 59%');
    expect(screen.getByTestId('count-high')).toHaveTextContent('2 high days');
    expect(screen.getByTestId('count-medium')).toHaveTextContent('4 medium');
    expect(screen.getByTestId('count-low')).toHaveTextContent('1 low');
    expect(screen.getByTestId('card-hrv')).toBeTruthy();
    expect(screen.getByTestId('card-rhr')).toBeTruthy();
  });

  it('asks the coach about the lowest day', async () => {
    const data = trendDays([71, 48, 29, 80, 66, 54, 62]);
    const lowDay = data[2]?.day ?? '';
    await render(withAppData(<RecoveryTrendsScreen />, 'en', { days: data }));
    const weekday = new Date(`${lowDay}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
    const question = `What dragged ${weekday} down?`;
    expect(screen.getByTestId('trends-coach')).toHaveTextContent(question);
    await fireEvent.press(screen.getByTestId('trends-coach'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/coach', params: { ask: question } });
  });

  it('averages per week on the month view', async () => {
    await render(withAppData(<RecoveryTrendsScreen />));
    await fireEvent.press(screen.getByRole('tab', { name: '1M' }));
    expect(screen.getByText('Weekly average')).toBeTruthy();
    expect(screen.getAllByTestId(/^chart-readiness-\d{4}/).length).toBeLessThanOrEqual(6);
  });
});

describe('Readiness impacts', () => {
  function taggedJournal(): Record<string, Record<string, JournalAnswer>> {
    const journal: Record<string, Record<string, JournalAnswer>> = {};
    const scored = days.map((d) => visibleReadiness(d).value).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const median = scored[Math.floor(scored.length / 2)] ?? 60;
    let tagged = 0;
    for (const d of days) {
      const value = visibleReadiness(d).value;
      if (value === null) continue;
      journal[addDays(d.day, -1)] = { sauna: value >= median, alcohol: value < median ? 2 : 0, ...(tagged < 2 ? { 'late-meal': true } : {}) };
      tagged += 1;
    }
    return journal;
  }

  it('ranks journal behaviours by their effect on next-day readiness', async () => {
    await render(withAppData(<ImpactsScreen />, 'en', { userData: { ...defaultUserData(), onboardingDone: true, journal: taggedJournal() } }));
    expect(screen.getByTestId('behaviour-sauna-value')).toHaveTextContent(/^\+\d+%$/);
    expect(screen.getByTestId('behaviour-alcohol-value')).toHaveTextContent(/^−\d+%$/);
    expect(screen.getByTestId('behaviour-sauna-caption')).toHaveTextContent(/^\d+ logged days · (High|Medium|Low) confidence$/);
    expect(screen.getByTestId('behaviour-sauna-bar')).toBeTruthy();
    expect(screen.getByTestId('needs-late-meal')).toHaveTextContent('Late meal: 2 of 5 days logged.');
    expect(screen.queryByTestId('needs-melatonin')).toBeNull();
  });

  it('explains how impacts work from the header', async () => {
    await render(withAppData(<ImpactsScreen />));
    await fireEvent.press(screen.getByTestId('impacts-info'));
    expect(within(screen.getByTestId('impacts-info-sheet')).getByText('Correlation, not proof')).toBeTruthy();
  });

  it('sends an empty journal to the journal and keeps the computed impacts', async () => {
    await render(withAppData(<ImpactsScreen />));
    expect(screen.getByTestId('behaviours-empty')).toBeTruthy();
    expect(screen.queryByTestId('needs-more')).toBeNull();
    expect(screen.getAllByTestId(/^impact-(sleep|load)$/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText('Open journal'));
    expect(mockPush).toHaveBeenCalledWith('/journal');
  });
});

describe('Metric detail', () => {
  it('shows one status chip under the value and the level note as footer', async () => {
    mockParams = { metric: 'hrv' };
    await render(withAppData(<MetricDetailScreen />));
    expect(screen.getAllByTestId('chip-status')).toHaveLength(1);
    expect(screen.getByTestId('chip-status')).toHaveTextContent(/^(✓ within range|! \d+% (over|under) baseline)$/);
    expect(screen.getByTestId('baseline-pct')).toBeTruthy();
    expect(screen.getByTestId('metric-level')).toHaveTextContent(/beat-to-beat timing/);
    expect(screen.getByText(/^HRV · 30 days$/)).toBeTruthy();
  });

  it('labels the metric tabs with short names and switches between them', async () => {
    mockParams = { metric: 'rhr' };
    await render(withAppData(<MetricDetailScreen />));
    expect(within(screen.getByTestId('pill-rhr')).getByText('Resting HR')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pill-spo2'));
    expect(mockReplace).toHaveBeenCalledWith('/recovery/metric/spo2');
  });

  it('shows skin temperature as a deviation and keeps the measured value, in the chosen units', async () => {
    const last = days[days.length - 1];
    if (last === undefined) throw new Error('no fixture day');
    const tempDays = [...days.slice(0, -1), { ...last, skinTempC: { ...last.skinTempC, value: 34, reason: null }, skinTempDeviationC: { ...last.skinTempDeviationC, value: -0.4, reason: null } }];
    mockParams = { metric: 'temp' };
    await render(withAppData(<MetricDetailScreen />, 'en', { days: tempDays, settings: { ...createFixtureSettings('en', FIXTURE_NOW), units: 'imperial' } }));
    expect(screen.getByTestId('metric-value')).toHaveTextContent('−0.7 °F');
    expect(screen.getByTestId('metric-absolute')).toHaveTextContent('Measured skin temperature: 93.2 °F');
    expect(screen.getByTestId('baseline-range')).toHaveTextContent(/°F$/);
  });
});
