import type { LabResult } from '@openhoop/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { printToFileAsync } from 'expo-print';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import ReportScreen from '@/app/health/report';
import { DEFAULT_REPORT_SECTIONS } from '@/data/healthReport';
import { removeLeftoverReports } from '@/data/reportFiles';
import { ShareUnavailableError, shareReportPdf } from '@/data/reportShare';
import { defaultUserData } from '@/data/userData';
import { darkColors, lightColors } from '@/ui/theme';

import { FIXTURE_NOW, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const mockDelete = jest.fn();
const mockFiles: Array<{ uri: string; name: string; exists: boolean; delete: () => void }> = [];
const mockCreateFile = jest.fn();
const mockWrite = jest.fn();
const mockPick = jest.fn();

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    name: string;
    exists = true;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
      this.name = this.uri.split('/').pop() ?? '';
    }
    delete(): void {
      mockDelete(this.uri);
    }
    async bytes(): Promise<Uint8Array> {
      return new Uint8Array([37, 80, 68, 70]);
    }
    async write(content: Uint8Array): Promise<void> {
      mockWrite(this.uri, content);
    }
  }
  class Directory {
    uri: string;
    exists = true;
    static pickDirectoryAsync = (initialUri?: string): Promise<Directory> => mockPick(initialUri);
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    list(): File[] {
      return mockFiles.map((entry) => Object.assign(new File(entry.uri), { name: entry.name }));
    }
    createFile(name: string, mime: string): File {
      mockCreateFile(name, mime);
      return new File(this.uri, name);
    }
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } };
});

const mockPrint = printToFileAsync as jest.MockedFunction<typeof printToFileAsync>;
const mockAvailable = isAvailableAsync as jest.MockedFunction<typeof isAvailableAsync>;
const mockShare = shareAsync as jest.MockedFunction<typeof shareAsync>;

function lab(id: number, patch: Partial<LabResult> = {}): LabResult {
  return { id, biomarker: 'glucose', unit: 'mmol/L', value: 5.8, day: '2026-11-20', refLow: 3.9, refHigh: 5.6, note: null, createdAt: id, ...patch };
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  jest.clearAllMocks();
  mockFiles.length = 0;
  mockAvailable.mockResolvedValue(true);
  mockShare.mockResolvedValue(undefined);
  mockPrint.mockResolvedValue({ uri: 'file:///cache/Print/abc.pdf', numberOfPages: 1 });
  mockPick.mockImplementation(async () => {
    const { Directory } = jest.requireMock<{ Directory: new (uri: string) => object }>('expo-file-system');
    return new Directory('content://downloads');
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('health report screen', () => {
  it('previews the values with coverage, parity level and the footer', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    expect(screen.getByTestId('health-report')).toBeTruthy();
    expect(screen.getByTestId('report-section-scores')).toBeTruthy();
    expect(screen.getByTestId('report-average-readiness')).toBeTruthy();
    expect(screen.getByTestId('report-row-hrv')).toBeTruthy();
    expect(screen.getAllByText(/of 30 days/).length).toBeGreaterThan(5);
    expect(screen.getByTestId('report-footer').props.children).toContain('Not a medical device');
  });

  it('draws the summary as a light paper document in both themes', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    const background: unknown = StyleSheet.flatten(screen.getByTestId('report-summary').props.style).backgroundColor;
    expect([darkColors.paper.surface, lightColors.paper.surface]).toContain(background);
    expect(darkColors.paper.surface).not.toBe(darkColors.surface);
    expect(lightColors.paper.ink).toBe(lightColors.text);
  });

  it('shows the reason instead of a number when data is missing', async () => {
    await render(withAppData(<ReportScreen />, 'en', { days: [] }));
    expect(screen.getByTestId('report-missing-readiness')).toBeTruthy();
    expect(screen.queryByTestId('report-average-readiness')).toBeNull();
    expect(screen.getByTestId('report-missing-weight')).toBeTruthy();
  });

  it('switches to 90 days', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    await fireEvent.press(screen.getByText('90 days'));
    expect(screen.getAllByText(/of 90 days/).length).toBeGreaterThan(5);
  });

  it('removes a section from the preview and the summary when its chip is switched off', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    expect(screen.getByTestId('report-section-vitals')).toBeTruthy();
    expect(screen.getByTestId('report-stat-rhr')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('report-toggle-vitals'));
    expect(screen.queryByTestId('report-section-vitals')).toBeNull();
    expect(screen.queryByTestId('report-stat-rhr')).toBeNull();
    expect(screen.getByTestId('report-stat-asleep')).toBeTruthy();
  });

  it('asks for a section when none is selected and disables both actions', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    for (const id of DEFAULT_REPORT_SECTIONS) {
      await fireEvent.press(screen.getByTestId(`report-toggle-${id}`));
    }
    expect(screen.getByTestId('report-preview-empty')).toBeTruthy();
    expect(screen.getByTestId('report-summary-empty')).toBeTruthy();
    expect(screen.getByTestId('report-share').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('report-export').props.accessibilityState.disabled).toBe(true);
  });

  it('summarises the period with stats and the ECG count', async () => {
    const ecgRecordings = [{ id: 7, deviceId: 1, t: Math.floor(FIXTURE_NOW.getTime() / 1000) - 86_400, durationMs: 30_000, sampleCount: 3840, rateHz: 128, wrist: 'left' as const, symptoms: [], movementG: null }];
    await render(withAppData(<ReportScreen />, 'en', { ecgRecordings }));
    expect(screen.queryByTestId('report-section-ecg')).toBeNull();
    await fireEvent.press(screen.getByTestId('report-toggle-ecg'));
    expect(screen.getByTestId('report-stat-ecg-value')).toHaveTextContent('1');
    expect(screen.getByTestId('report-stat-hrv-value')).toHaveTextContent(/ms/);
    expect(screen.getByTestId('report-section-ecg')).toHaveTextContent(/\d{4}-\d{2}-\d{2} at \d{2}:\d{2} · .+ · band on left wrist/);
  });

  it('leaves cycle out until its chip is chosen', async () => {
    const cycle = { periods: [{ id: 1, startDay: '2026-11-10', endDay: '2026-11-14', flow: 2 as const, createdAt: 0 }], symptoms: [], pregnancy: null };
    await render(withAppData(<ReportScreen />, 'en', { cycle }));
    expect(screen.queryByTestId('report-section-cycle')).toBeNull();
    await fireEvent.press(screen.getByTestId('report-toggle-cycle'));
    expect(screen.getByTestId('report-section-cycle')).toHaveTextContent(/2026-11-10/);
  });

  it('builds a custom period and blocks the actions while the dates are wrong', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    await fireEvent.press(screen.getByTestId('report-period-custom'));
    await fireEvent.changeText(screen.getByTestId('report-custom-from'), '2026-11-11');
    await fireEvent.changeText(screen.getByTestId('report-custom-to'), '2026-11-20');
    expect(screen.getAllByText(/of 10 days/).length).toBeGreaterThan(3);
    await fireEvent.changeText(screen.getByTestId('report-custom-to'), '2027-01-01');
    expect(screen.getByTestId('report-share').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('report-custom-hint')).toHaveTextContent(/Check the dates/);
  });

  it('exports the PDF into a chosen folder without opening a share sheet', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    await fireEvent.press(screen.getByTestId('report-export'));
    expect(await screen.findByTestId('report-saved')).toBeTruthy();
    expect(mockCreateFile).toHaveBeenCalledWith(expect.stringMatching(/^openhoop-health-report-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/), 'application/pdf');
    expect(screen.getByTestId('report-saved')).toHaveTextContent(/Saved as openhoop-health-report-.*\.pdf/);
    expect(mockWrite).toHaveBeenCalled();
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/Print/abc.pdf');
  });

  it('does nothing when the folder picker is cancelled', async () => {
    mockPick.mockRejectedValue(Object.assign(new Error('cancel'), { code: 'ERR_PICKER_CANCELLED' }));
    await render(withAppData(<ReportScreen />, 'en'));
    await fireEvent.press(screen.getByTestId('report-export'));
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    expect(mockPrint).not.toHaveBeenCalled();
    expect(screen.queryByTestId('report-error')).toBeNull();
    expect(screen.queryByTestId('report-saved')).toBeNull();
  });

  it('only offers the name when one is set', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    expect(screen.getByTestId('report-name-missing')).toBeTruthy();
    expect(screen.getByTestId('report-toggle-name').props.disabled).toBe(true);
  });

  it('shows entered lab values with the range from the report', async () => {
    await render(withAppData(<ReportScreen />, 'en', { labResults: [lab(1)] }));
    expect(screen.getByTestId('report-lab-glucose')).toBeTruthy();
    expect(screen.getByText("Outside your report's range")).toBeTruthy();
  });

  it('prints the report with the chosen options, shares the PDF and deletes the file', async () => {
    const userData = { ...defaultUserData(), name: 'Sam <b>', onboardingDone: true };
    await render(withAppData(<ReportScreen />, 'nl', { userData }));
    await fireEvent(screen.getByTestId('report-toggle-name'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('report-share'));
    await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));

    const options = mockPrint.mock.calls[0]?.[0];
    expect(options?.html).toContain('lang="nl"');
    expect(options?.html).toContain('Sam &lt;b&gt;');
    expect(options?.html).not.toContain('Sam <b>');
    expect(options?.html).toContain('Geen medisch hulpmiddel.');
    expect(mockShare).toHaveBeenCalledWith('file:///cache/Print/abc.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('file:///cache/Print/abc.pdf'));
  });

  it('leaves the name out of the PDF unless chosen', async () => {
    const userData = { ...defaultUserData(), name: 'Sam', onboardingDone: true };
    await render(withAppData(<ReportScreen />, 'en', { userData }));
    await fireEvent.press(screen.getByTestId('report-share'));
    await waitFor(() => expect(mockPrint).toHaveBeenCalled());
    expect(mockPrint.mock.calls[0]?.[0]?.html).not.toContain('Sam');
  });

  it('shows an error and deletes nothing when the PDF cannot be made', async () => {
    mockPrint.mockRejectedValue(new Error('boom'));
    await render(withAppData(<ReportScreen />, 'en'));
    await fireEvent.press(screen.getByTestId('report-share'));
    expect(await screen.findByTestId('report-error')).toBeTruthy();
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('still deletes the PDF when the share sheet fails', async () => {
    mockShare.mockRejectedValue(new Error('cancelled'));
    await render(withAppData(<ReportScreen />, 'en'));
    await fireEvent.press(screen.getByTestId('report-share'));
    expect(await screen.findByTestId('report-error')).toBeTruthy();
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/Print/abc.pdf');
  });
});

describe('shareReportPdf', () => {
  it('refuses when sharing is unavailable and prints nothing', async () => {
    mockAvailable.mockResolvedValue(false);
    await expect(shareReportPdf('<html></html>')).rejects.toBeInstanceOf(ShareUnavailableError);
    expect(mockPrint).not.toHaveBeenCalled();
  });
});

describe('removeLeftoverReports', () => {
  it('deletes old PDFs from the print folder only', () => {
    mockFiles.push({ uri: 'file:///cache/Print/old.pdf', name: 'old.pdf', exists: true, delete: jest.fn() });
    mockFiles.push({ uri: 'file:///cache/Print/keep.txt', name: 'keep.txt', exists: true, delete: jest.fn() });
    removeLeftoverReports();
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/Print/old.pdf');
  });
});
