import type { LabResult } from '@openhoop/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { printToFileAsync } from 'expo-print';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { ReactNode } from 'react';

import ReportScreen from '@/app/health/report';
import { removeLeftoverReports } from '@/data/reportFiles';
import { ShareUnavailableError, shareReportPdf } from '@/data/reportShare';
import { defaultUserData } from '@/data/userData';

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
  }
  class Directory {
    uri: string;
    exists = true;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    list(): File[] {
      return mockFiles.map((entry) => Object.assign(new File(entry.uri), { name: entry.name }));
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

  it('removes a section from the preview when it is switched off', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    expect(screen.getByTestId('report-section-vitals')).toBeTruthy();
    await fireEvent(screen.getByTestId('report-toggle-vitals'), 'valueChange', false);
    expect(screen.queryByTestId('report-section-vitals')).toBeNull();
  });

  it('asks for a section when none is selected and disables sharing', async () => {
    await render(withAppData(<ReportScreen />, 'en'));
    for (const id of ['scores', 'sleep', 'vitals', 'energy', 'body', 'labs']) {
      await fireEvent(screen.getByTestId(`report-toggle-${id}`), 'valueChange', false);
    }
    expect(screen.getByTestId('report-preview-empty')).toBeTruthy();
    expect(screen.getByTestId('report-share').props.accessibilityState.disabled).toBe(true);
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
