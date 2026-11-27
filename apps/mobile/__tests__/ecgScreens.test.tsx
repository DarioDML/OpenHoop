import type { EcgSummary } from '@openhoop/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ecgCsv, ecgStrips, stripLength, traceColumns, traceRange } from '@/data/ecg';
import { createFixtureDevice } from '@/data/fixtureSource';

import { FIXTURE_NOW, fixtureEcgActions, withAppData } from './support/appData';

let mockParams: Record<string, string | undefined> = {};
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

jest.mock('@/data/ecgShare', () => ({ shareEcgCsv: jest.fn(async () => undefined), removeLeftoverEcgFiles: jest.fn() }));

import BloodPressureScreen from '@/app/health/blood-pressure';
import EcgResultScreen from '@/app/health/ecg-result';
import EcgScreen from '@/app/health/ecg';
import IrregularRhythmScreen from '@/app/health/irregular-rhythm';

const MG = { ...createFixtureDevice(FIXTURE_NOW), model: 'MG' as const };
const RECORDING: EcgSummary = { id: 4, deviceId: 1, t: 1_795_700_000, durationMs: 30_000, sampleCount: 3840, rateHz: 128, wrist: 'left' };
const OLDER: EcgSummary = { ...RECORDING, id: 2, t: 1_795_600_000, wrist: 'right' };

beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
});

describe('ECG recording screen', () => {
  it('records on the chosen wrist and opens the result', async () => {
    const start = jest.fn(async () => 9);
    await render(withAppData(<EcgScreen />, 'en', { device: MG, ecgActions: { ...fixtureEcgActions(), start } }));
    expect(screen.queryByTestId('needs-mg')).toBeNull();
    await fireEvent.press(screen.getByText('Right wrist'));
    await fireEvent.press(screen.getByTestId('ecg-start'));
    expect(start).toHaveBeenCalledWith('right');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/health/ecg-result', params: { id: '9' } }));
  });

  it('starts on the wrist chosen last time', async () => {
    const start = jest.fn(async () => null);
    await render(withAppData(<EcgScreen />, 'en', { device: MG, ecgWrist: 'right', ecgActions: { ...fixtureEcgActions(), start } }));
    await fireEvent.press(screen.getByTestId('ecg-start'));
    expect(start).toHaveBeenCalledWith('right');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows progress and a stop button while recording', async () => {
    const stop = jest.fn();
    await render(
      withAppData(<EcgScreen />, 'en', {
        device: MG,
        ecgActions: { ...fixtureEcgActions(), stop },
        ecgLive: { active: true, elapsedMs: 12_400, samples: 1500, tail: [1, 5, 2] },
      }),
    );
    expect(screen.getByTestId('ecg-elapsed').props.children).toBe('Recording: 12 of 30 s');
    expect(screen.getByText('1500 samples received')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ecg-stop'));
    expect(stop).toHaveBeenCalled();
  });
});

describe('ECG result screen', () => {
  it('asks for a first recording when there is none', async () => {
    await render(withAppData(<EcgResultScreen />));
    expect(screen.getByTestId('ecg-none')).toBeTruthy();
  });

  it('draws the chosen recording in strips with the band heart rate and no verdict', async () => {
    mockParams = { id: '4' };
    const samples = jest.fn(async () => Array.from({ length: 3840 }, (_, i) => Math.round(Math.sin(i / 10) * 500)));
    const heartRateBetween = jest.fn(async () => [{ t: 1, hr: 60 }, { t: 2, hr: 64 }]);
    await render(
      withAppData(<EcgResultScreen />, 'en', { ecgRecordings: [RECORDING, OLDER], ecgActions: { ...fixtureEcgActions(), samples }, heartRateBetween }),
    );
    await waitFor(() => expect(screen.getByTestId('ecg-strip-5')).toBeTruthy());
    expect(screen.queryByTestId('ecg-strip-6')).toBeNull();
    expect(screen.getByText('62 bpm average')).toBeTruthy();
    expect(heartRateBetween).toHaveBeenCalledWith(RECORDING.t, RECORDING.t + 30, 1);
    expect(screen.getByText('Left wrist')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ecg-item-2'));
    await waitFor(() => expect(screen.getByText('Right wrist')).toBeTruthy());
    expect(screen.queryByText(/normal|sinus|atrial|irregular/i)).toBeNull();
  });
});

describe('screens OpenHoop does not offer', () => {
  it.each([
    ['irregular rhythm', IrregularRhythmScreen],
    ['blood pressure', BloodPressureScreen],
  ])('%s says it is not part of OpenHoop', async (_name, Screen) => {
    await render(withAppData(<Screen />));
    expect(screen.getByTestId('not-offered')).toBeTruthy();
    expect(screen.queryByTestId('not-built-mg')).toBeNull();
  });
});

describe('ECG helpers', () => {
  it('splits into strips of five seconds, or evenly without a rate', () => {
    const samples = Array.from({ length: 1300 }, (_, i) => i);
    expect(ecgStrips(samples, 128, 10_000).map((s) => s.length)).toEqual([640, 640, 20]);
    expect(ecgStrips(samples, null, 10_000).map((s) => s.length)).toEqual([650, 650]);
    expect(ecgStrips([], 128, 0)).toEqual([]);
  });

  it('takes one amplitude range for all strips and ignores the extreme tails', () => {
    const samples = [-30000, ...Array.from({ length: 198 }, (_, i) => (i % 2 === 0 ? -100 : 100)), 30000];
    expect(traceRange(samples)).toEqual({ low: -100, high: 100 });
    expect(traceRange([5, 5, 5])).toEqual({ low: 4, high: 6 });
    expect(traceRange([])).toBeNull();
    expect(stripLength(1300, 128, 10_000)).toBe(640);
  });

  it('keeps the peaks when it reduces samples to columns', () => {
    expect(traceColumns([0, 9, 0, -9, 0, 0], 2)).toEqual([
      { min: 0, max: 9 },
      { min: -9, max: 0 },
    ]);
    expect(traceColumns([3], 10)).toEqual([{ min: 3, max: 3 }]);
  });

  it('writes index, time and value per sample', () => {
    expect(ecgCsv(RECORDING, [10, -20])).toBe('index,t_ms,value\r\n0,0,10\r\n1,8,-20\r\n');
    expect(ecgCsv({ ...RECORDING, rateHz: null }, [1])).toBe('index,t_ms,value\r\n0,,1\r\n');
  });
});
