import type { LabResult } from '@openhoop/core';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays } from '@/data/fixtureSource';
import { labBand, linkedBehaviours, outOfRangeFirst, summarizeBiomarkers, tallyLabs } from '@/data/labs';
import { rangeScale } from '@/ui/health/RangeBar';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockParams: { id?: string } = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import BiomarkerScreen from '@/app/health/biomarker';

function lab(id: number, patch: Partial<LabResult> = {}): LabResult {
  return { id, biomarker: 'vitaminD', unit: 'ng/mL', value: 45, day: '2026-11-01', refLow: 30, refHigh: 60, note: null, createdAt: id, ...patch };
}

const DAYS = createFixtureDays(FIXTURE_NOW);

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  mockParams.id = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('lab bands', () => {
  it('sorts a value by the range on the report and nothing else', () => {
    expect(labBand(lab(1, { value: 18 }))).toBe('low');
    expect(labBand(lab(1, { value: 61 }))).toBe('high');
    expect(labBand(lab(1, { value: 31 }))).toBe('edge');
    expect(labBand(lab(1, { value: 58 }))).toBe('edge');
    expect(labBand(lab(1, { value: 45 }))).toBe('mid');
    expect(labBand(lab(1, { refLow: null, refHigh: 100, value: 95 }))).toBe('edge');
    expect(labBand(lab(1, { refLow: null, refHigh: 100, value: 80 }))).toBe('mid');
    expect(labBand(lab(1, { refLow: 30, refHigh: null, value: 31 }))).toBe('edge');
    expect(labBand(lab(1, { refLow: null, refHigh: null }))).toBe('none');
  });

  it('counts the latest value per marker and lists out of range first', () => {
    const summaries = summarizeBiomarkers([
      lab(1, { biomarker: 'glucose', unit: 'mmol/L', value: 5, refLow: 3.9, refHigh: 5.6 }),
      lab(2, { biomarker: 'vitaminD', value: 18 }),
      lab(3, { biomarker: 'ferritin', value: 31, refLow: 30, refHigh: 300 }),
      lab(4, { biomarker: 'tsh', unit: 'mIU/L', value: 2, refLow: null, refHigh: null }),
    ]);
    expect(tallyLabs(summaries)).toEqual({ mid: 1, edge: 1, out: 1, none: 1 });
    expect(outOfRangeFirst(summaries).map((s) => s.group)).toEqual(['vitaminD', 'ferritin', 'glucose', 'tsh']);
  });

  it('scales the range bar around the range and the value', () => {
    expect(rangeScale(30, 60, 18)).toEqual({ max: 90, ticks: [0, 30, 60, 90] });
    expect(rangeScale(null, 100, 120).ticks[1]).toBe(100);
  });

  it('puts wearable averages side by side only with two tests and enough band data', () => {
    const first = DAYS[15]?.day ?? '';
    const last = DAYS[DAYS.length - 1]?.day ?? '';
    const linked = linkedBehaviours(DAYS, [lab(1, { day: first }), lab(2, { day: last })]);
    expect(linked?.previousDay).toBe(first);
    expect(linked?.latestDay).toBe(last);
    expect(linked?.rows.length).toBeGreaterThan(0);
    expect(linkedBehaviours(DAYS, [lab(1, { day: last })])).toBeNull();
    expect(linkedBehaviours(DAYS, [lab(1, { day: '2020-01-01' }), lab(2, { day: '2020-02-01' })])).toBeNull();
  });
});

describe('biomarker screen', () => {
  it('shows the value with its status, the range bar and linked behaviours', async () => {
    mockParams.id = 'vitaminD';
    const first = DAYS[15]?.day ?? '';
    const last = DAYS[DAYS.length - 1]?.day ?? '';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: [lab(1, { day: first, value: 25 }), lab(2, { day: last, value: 18 })] }));
    expect(screen.getByTestId('biomarker-hero-value')).toHaveTextContent('18 ng/mL');
    expect(screen.getByTestId('biomarker-hero-status')).toHaveTextContent('! low');
    expect(screen.getByTestId('biomarker-range-bar')).toBeTruthy();
    expect(screen.getByTestId('biomarker-linked')).toHaveTextContent(/does not say one causes the other/);
    expect(screen.queryByTestId('biomarker-linked-none')).toBeNull();
  });

  it('says so when the latest result has no range', async () => {
    mockParams.id = 'vitaminD';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: [lab(1, { refLow: null, refHigh: null })] }));
    expect(screen.getByTestId('biomarker-range-none')).toBeTruthy();
    expect(screen.getByTestId('biomarker-hero-status')).toHaveTextContent('no range');
    expect(screen.getByTestId('biomarker-linked-none')).toBeTruthy();
  });
});
