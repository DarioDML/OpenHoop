import type { LabResultInput } from '@openhoop/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { detectDelimiter, parseLabCsv, splitCsvLine } from '@/data/labImport/csv';
import type { CsvPick } from '@/data/labImport/files';

import { FIXTURE_NOW } from './support/appData';
import { makeController, withCoach } from './support/coach';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ source: 'csv' }),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockCsv = jest.fn<Promise<CsvPick>, []>();

jest.mock('@/data/labImport/files', () => ({
  pickCsvFile: () => mockCsv(),
  pickReportFile: jest.fn(),
  takeReportPhoto: jest.fn(),
  discardReport: jest.fn(),
}));

jest.mock('@/data/labImport/reader', () => ({
  onDeviceAvailable: () => true,
  readOnDevice: jest.fn(),
  uploadFor: jest.fn(),
}));

import LabsImportScreen from '@/app/health/labs-import';

const TODAY = '2026-11-25';

const EXPORT = [
  'Test;Result;Unit;Reference range;Date',
  'Vitamin D (25-OH);18;ng/mL;30-60;02-11-2026',
  '"Ferritine";24;ng/mL;30 - 300;02-11-2026',
  'HbA1c;5,1;%;< 5.4;02-11-2026',
  'Zinc;12;umol/L;;02-11-2026',
  'Comment;see your doctor;;;',
].join('\r\n');

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  mockCsv.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('lab CSV parsing', () => {
  it('splits quoted cells and finds the delimiter', () => {
    expect(splitCsvLine('"a, b",c,"say ""hi"""', ',')).toEqual(['a, b', 'c', 'say "hi"']);
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a\tb')).toBe('\t');
    expect(detectDelimiter('single')).toBe(',');
  });

  it('reads a lab export with a header, its ranges and its date', () => {
    const parsed = parseLabCsv(EXPORT, TODAY);
    expect(parsed.day).toBe('2026-11-02');
    expect(parsed.candidates.map((c) => [c.biomarker, c.value, c.unit, c.refLow, c.refHigh])).toEqual([
      ['vitaminD', 18, 'ng/mL', 30, 60],
      ['ferritin', 24, 'ng/mL', 30, 300],
      ['hba1c', 5.1, '%', null, 5.4],
      [null, 12, 'µmol/L', null, null],
    ]);
  });

  it('takes low and high columns and a value with the unit attached', () => {
    const parsed = parseLabCsv('name,value,low,high\nGlucose,5.2 mmol/L,3.9,5.6\nGlucose,<0.1 mmol/L,,', TODAY);
    expect(parsed.candidates[0]).toMatchObject({ biomarker: 'glucose', value: 5.2, unit: 'mmol/L', refLow: 3.9, refHigh: 5.6, day: null });
    expect(parsed.candidates[1]).toMatchObject({ censored: '<', value: 0.1 });
  });

  it('reads rows as report lines when there is no header it knows', () => {
    const parsed = parseLabCsv('Glucose,5.2,mmol/L,3.9-5.6\nLDL,3.1,mmol/L,<3.0', TODAY);
    expect(parsed.candidates.map((c) => c.biomarker)).toEqual(['glucose', 'ldl']);
  });

  it('keeps a quoted cell that spans lines and reads headers with a unit in brackets', () => {
    const text = 'Analyte,Value (mmol/L),Unit,Reference range [lab]\n"Glucose\nfasting",5.2,mmol/L,3.9-5.6\nLDL,3.1,mmol/L,<3.0';
    const parsed = parseLabCsv(text, TODAY);
    expect(parsed.candidates.map((c) => [c.name, c.value, c.refHigh])).toEqual([
      ['Glucose fasting', 5.2, 5.6],
      ['LDL', 3.1, 3],
    ]);
  });

  it('flags a value with a comma before three digits as ambiguous', () => {
    const parsed = parseLabCsv('name,value,unit\nCreatinine,"1,234",µmol/L\nGlucose,5.2,mmol/L', TODAY);
    expect(parsed.candidates.map((c) => c.ambiguous)).toEqual([true, false]);
  });

  it('finds nothing in an empty file', () => {
    expect(parseLabCsv('', TODAY)).toEqual({ candidates: [], day: null });
  });
});

describe('CSV import screen', () => {
  it('picks a CSV, shows what it found and saves the checked rows', async () => {
    mockCsv.mockResolvedValue({ status: 'picked', text: EXPORT });
    const saveLabResult = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true);
    await render(withCoach(<LabsImportScreen />, makeController().controller, { saveLabResult }));
    expect(screen.getByTestId('labs-import-csv')).toBeTruthy();
    expect(screen.queryByTestId('labs-import-choose')).toBeNull();
    await fireEvent.press(screen.getByTestId('labs-import-csv-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-review')).toBeTruthy());
    expect(screen.getByTestId('labs-import-count')).toHaveTextContent('4 results found');
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    await waitFor(() => expect(saveLabResult).toHaveBeenCalledTimes(3));
    expect(saveLabResult).toHaveBeenCalledWith(null, expect.objectContaining({ biomarker: 'vitaminD', value: 18, day: '2026-11-02', refLow: 30, refHigh: 60 }));
  });

  it('explains a file that is not a CSV', async () => {
    mockCsv.mockResolvedValue({ status: 'unsupported' });
    await render(withCoach(<LabsImportScreen />, makeController().controller));
    await fireEvent.press(screen.getByTestId('labs-import-csv-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-error')).toHaveTextContent(/not a CSV/));
  });
});
