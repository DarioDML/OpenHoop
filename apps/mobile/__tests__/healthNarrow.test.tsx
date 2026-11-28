import type { EcgSummary, LabResult } from '@openhoop/core';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockWindow = { width: 360, height: 780, scale: 3, fontScale: 1.3 };
let mockParams: Record<string, string | undefined> = {};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/data/ecgShare', () => ({ shareEcgCsv: jest.fn(async () => undefined), removeLeftoverEcgFiles: jest.fn() }));
jest.mock('@/data/reportShare', () => ({ shareReportPdf: jest.fn(async () => undefined), ShareUnavailableError: class extends Error {} }));

import BiomarkerScreen from '@/app/health/biomarker';
import CycleScreen from '@/app/health/cycle';
import EcgResultScreen from '@/app/health/ecg-result';

const RECORDING: EcgSummary = { id: 4, deviceId: 1, t: 1_795_700_000, durationMs: 30_000, sampleCount: 3840, rateHz: 128, wrist: 'left', symptoms: [], movementG: null };

function lab(id: number, patch: Partial<LabResult> = {}): LabResult {
  return { id, biomarker: 'ldl', unit: 'mg/dL', value: 84, day: '2026-09-09', refLow: null, refHigh: 115, note: null, createdAt: id, ...patch };
}

function style(id: string): ViewStyle & TextStyle {
  return StyleSheet.flatten<ViewStyle & TextStyle>(screen.getByTestId(id).props.style) ?? {};
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  mockParams = {};
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Health screens at 360 dp and 1.3x text', () => {
  it('puts the lab status pill under the value and date', async () => {
    mockParams = { id: 'ldl' };
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: [lab(1)] }));
    expect(screen.getByTestId('biomarker-value-1')).toHaveTextContent('84\u00a0mg/dL');
    expect(screen.getByTestId('biomarker-day-1')).toHaveTextContent('9/9');
    expect(screen.getByTestId('biomarker-status-1')).toBeTruthy();
    expect(style('biomarker-entry-row-1').flexDirection).toBe('column');
    expect(screen.getByTestId('biomarker-band')).toBeTruthy();
    expect(screen.queryByTestId('biomarker-no-band')).toBeNull();
  });

  it('stacks every ECG summary row', async () => {
    mockParams = { id: '4' };
    await render(withAppData(<EcgResultScreen />, 'en', { ecgRecordings: [RECORDING] }));
    expect(style('ecg-rate').flexDirection).toBeUndefined();
    expect(style('ecg-band-hr').flexDirection).toBeUndefined();
  });

  it('shows missing cycle averages as body text', async () => {
    await render(withAppData(<CycleScreen />, 'en'));
    expect(style('cycle-average-missing').fontSize).toBeLessThan(20);
    expect(style('cycle-tile-temp-header').marginVertical).toBeCloseTo(-(44 - 14 * 1.3) / 2, 5);
  });
});
