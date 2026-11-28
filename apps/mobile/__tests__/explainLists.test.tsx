import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import MetricDetailScreen from '@/app/recovery/metric/[metric]';
import MetricsScreen from '@/app/health/metrics';
import VitalsScreen from '@/app/health/vitals';
import { createFixtureDevice } from '@/data/fixtureSource';
import { CATALOGUE } from '@/data/healthDerived';
import { TERMS, termLine } from '@/data/terms';
import { translate } from '@/i18n';
import type { Language } from '@/data/types';
import { StatRow } from '@/ui/daily/bits';
import { MetricTile } from '@/ui/MetricTile';

import { FIXTURE_NOW, withAppData } from './support/appData';
import { FIRST_NIGHT_NOW_S, FIRST_NIGHT_SYNC_S, firstNightDay } from './support/firstNight';

const mockPush = jest.fn();
const mockParams: { value: Record<string, string> } = { value: {} };

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.value,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const device = { ...createFixtureDevice(FIXTURE_NOW), lastSyncAt: FIRST_NIGHT_SYNC_S };
const wrap = (node: ReactNode, language: Language = 'en') => withAppData(node, language, { days: [firstNightDay()], device }, FIRST_NIGHT_NOW_S);

beforeEach(() => {
  mockPush.mockClear();
  mockParams.value = {};
});

describe('explain on lists', () => {
  it('opens about from a tile name without navigating', async () => {
    await render(wrap(<MetricTile testID="t" label="HRV" value={46.4} unit="ms" level="B" href="/recovery/metric/hrv" explain={{ term: 'hrv', index: 0 }} />));
    await fireEvent.press(screen.getByTestId('t-name'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('says how many nights a missing tile needs and opens why', async () => {
    await render(wrap(<MetricTile testID="t" label="Skin temp change" value={null} reason="needs-history" level="A" explain={{ term: 'skinTempChange', index: 0 }} />));
    expect(screen.getByTestId('t-reason')).toHaveTextContent('3 more nights ›');
    await fireEvent.press(screen.getByTestId('t-why'));
    expect(screen.getByTestId('why-sheet')).toBeTruthy();
  });
  it('opens about from a row name without navigating', async () => {
    await render(wrap(<StatRow testID="r" label="HRV" value="46 ms" href="/recovery/metric/hrv" explain={{ term: 'hrv', index: 0, shown: { value: '46', unit: 'ms', reason: null } }} />));
    await fireEvent.press(screen.getByTestId('r-name'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('puts an info button on the metric detail and explains a missing value', async () => {
    mockParams.value = { metric: 'hrv' };
    await render(withAppData(<MetricDetailScreen />, 'en', { days: [firstNightDay({ hrv: { value: null, reason: 'low-coverage', coverage: null, algo: 'x' } })], device }, FIRST_NIGHT_NOW_S));
    expect(screen.getByTestId('metric-why')).toHaveTextContent('Too little signal ›');
    await fireEvent.press(screen.getByTestId('metric-about'));
    expect(within(screen.getByTestId('about-sheet')).getByText('Heart rate variability')).toBeTruthy();
  });
  it('explains vitals in place on the first night', async () => {
    await render(wrap(<VitalsScreen />));
    expect(screen.getByTestId('vitals-ranges-after')).toHaveTextContent('Your usual ranges show after 4 nights');
    expect(screen.getByText('Tap a name to see what it means.')).toBeTruthy();
    expect(within(screen.getByTestId('vital-hrv')).getByText('Rest signal from your heartbeat')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vital-hrv-name'));
    expect(screen.getByTestId('about-sheet')).toBeTruthy();
  });
  it('keeps All metrics rows compact and moves the one-liner into the About sheet', async () => {
    await render(wrap(<MetricsScreen />));
    expect(within(screen.getByTestId('metric-hrv')).queryByText(translate('en', termLine('hrv')))).toBeNull();
    await fireEvent.press(screen.getByTestId('metric-hrv-about'));
    expect(within(screen.getByTestId('about-sheet')).getByText(translate('en', 'metricDetail.meaning.hrv'))).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('reaches the full description of every All metrics row with a term from its About sheet', async () => {
    await render(withAppData(<MetricsScreen />, 'en'));
    const rows = CATALOGUE.flatMap((item) => (item.term === null ? [] : [{ id: item.id, term: item.term }]));
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(within(screen.getByTestId(`metric-${row.id}`)).queryByText(translate('en', termLine(row.term)))).toBeNull();
      await fireEvent.press(screen.getByTestId(`metric-${row.id}-about`));
      expect(within(screen.getByTestId('about-sheet')).getAllByText(translate('en', TERMS[row.term].body)).length).toBeGreaterThan(0);
      await fireEvent.press(screen.getByTestId('about-sheet-close'));
      expect(screen.queryByTestId('about-sheet')).toBeNull();
    }
    expect(mockPush).not.toHaveBeenCalled();
  });
});
