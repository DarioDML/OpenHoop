import type { LabResult, LabResultInput } from '@openhoop/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import BiomarkerScreen from '@/app/health/biomarker';
import LabsUploadScreen from '@/app/health/labs-upload';
import LabsScreen from '@/app/health/labs';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockParams: { biomarker?: string; entry?: string; id?: string } = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function lab(id: number, patch: Partial<LabResult> = {}): LabResult {
  return {
    id,
    biomarker: 'glucose',
    unit: 'mmol/L',
    value: 5,
    day: '2026-11-01',
    refLow: null,
    refHigh: null,
    note: null,
    createdAt: id,
    ...patch,
  };
}

const glucoseHistory: LabResult[] = [
  lab(1, { value: 5.1, day: '2026-08-01', refLow: 3.9, refHigh: 5.6 }),
  lab(2, { value: 6.2, day: '2026-11-10', refLow: 3.9, refHigh: 5.6, note: 'after holiday' }),
];

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  mockParams.biomarker = undefined;
  mockParams.entry = undefined;
  mockParams.id = undefined;
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('labs summary screen', () => {
  it('shows an honest empty state and the entered-by-you note', async () => {
    await render(withAppData(<LabsScreen />, 'en'));
    expect(screen.getByTestId('labs-empty')).toBeTruthy();
    expect(screen.getByTestId('labs-entered-note')).toBeTruthy();
    expect(screen.getByText(/Not a medical device/)).toBeTruthy();
    expect(screen.queryByTestId('not-built-labs')).toBeNull();
  });

  it('lists the latest value per biomarker, out of range first, with a coloured status', async () => {
    const labResults = [
      ...glucoseHistory,
      lab(3, { biomarker: 'ldl', value: 3.2, day: '2026-10-01' }),
      lab(4, { biomarker: 'custom:Zinc', unit: 'umol/L', value: 12, day: '2026-09-01' }),
    ];
    await render(withAppData(<LabsScreen />, 'en', { labResults }));
    expect(screen.getByText(/^6.2 mmol\/L · range 3.9–5.6/)).toBeTruthy();
    expect(within(screen.getByTestId('labs-status-glucose')).getByText('above range')).toBeTruthy();
    expect(within(screen.getByTestId('labs-status-ldl')).getByText('no range')).toBeTruthy();
    expect(screen.getByTestId('labs-gauge-out')).toHaveTextContent('1 out of range');
    expect(screen.getByTestId('labs-source')).toHaveTextContent(/latest .* · 3 markers/);
    const rows = screen.getAllByTestId(/^labs-row-/).map((row) => row.props.testID);
    expect(rows[0]).toBe('labs-row-glucose');
    expect(screen.getByText('Zinc')).toBeTruthy();
    expect(screen.getByText(/2 results/)).toBeTruthy();
  });

  it('says in range or near a limit going by the range from the report', async () => {
    await render(withAppData(<LabsScreen />, 'en', { labResults: [glucoseHistory[0] as LabResult] }));
    expect(within(screen.getByTestId('labs-status-glucose')).getByText('✓ in range')).toBeTruthy();
    await render(withAppData(<LabsScreen />, 'en', { labResults: [lab(9, { value: 5.5, refLow: 3.9, refHigh: 5.6 })] }));
    expect(within(screen.getByTestId('labs-status-glucose')).getByText('near a limit')).toBeTruthy();
    expect(screen.getByTestId('labs-band-note')).toHaveTextContent(/not a medical judgement/);
  });

  it('opens the detail and the entry form', async () => {
    await render(withAppData(<LabsScreen />, 'en', { labResults: glucoseHistory }));
    await fireEvent.press(screen.getByTestId('labs-row-glucose'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/health/biomarker', params: { id: 'glucose' } });
    await fireEvent.press(screen.getByTestId('labs-add'));
    expect(router.push).toHaveBeenCalledWith('/health/labs-upload');
  });

  it('renders in Dutch', async () => {
    await render(withAppData(<LabsScreen />, 'nl', { labResults: glucoseHistory }));
    expect(screen.getByText(/^6,2 mmol\/L · bereik 3,9–5,6/)).toBeTruthy();
    expect(screen.getByText('boven bereik')).toBeTruthy();
    expect(screen.getByText(/Geen medisch hulpmiddel/)).toBeTruthy();
  });
});

describe('biomarker detail screen', () => {
  it('shows an honest message for an unknown biomarker', async () => {
    mockParams.id = 'ldl';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: glucoseHistory }));
    expect(screen.getByTestId('biomarker-not-found')).toBeTruthy();
  });

  it('shows the latest value, the change and the report range band source', async () => {
    mockParams.id = 'glucose';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: glucoseHistory }));
    expect(screen.getByTestId('biomarker-name')).toBeTruthy();
    expect(screen.getByTestId('biomarker-latest')).toHaveTextContent(/6.2 mmol/);
    expect(screen.getByTestId('biomarker-change')).toHaveTextContent(/[+]1.1 mmol/);
    expect(screen.getByTestId('biomarker-band')).toBeTruthy();
    expect(screen.getByTestId('biomarker-range-2')).toHaveTextContent('Range on your report: 3.9 to 5.6 mmol/L');
    expect(screen.getByTestId('biomarker-status-2')).toHaveTextContent("Outside your report's range");
    expect(screen.getByTestId('biomarker-note-2')).toBeTruthy();
    expect(screen.getByTestId('biomarker-entered-note')).toBeTruthy();
    expect(screen.queryByTestId('biomarker-converted')).toBeNull();
  });

  it('says so when no range was entered, instead of inventing a band', async () => {
    mockParams.id = 'glucose';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: [lab(1), lab(2, { value: 5.5, day: '2026-11-05' })] }));
    expect(screen.getByTestId('biomarker-no-band')).toBeTruthy();
    expect(screen.queryByTestId('biomarker-status-1')).toBeNull();
  });

  it('shades a one-sided report range instead of saying there is none', async () => {
    mockParams.id = 'glucose';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: [lab(1, { value: 5.1, day: '2026-09-09', refHigh: 5.6 })] }));
    expect(screen.getByTestId('biomarker-range-bar')).toBeTruthy();
    expect(screen.getByTestId('biomarker-band')).toHaveTextContent('Shaded band: the range on your report of 9/9.');
    expect(screen.queryByTestId('biomarker-no-band')).toBeNull();
  });

  it('keeps each result value in one piece and shows a short date', async () => {
    mockParams.id = 'glucose';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: [lab(1, { value: 5.1, day: '2025-09-09', refHigh: 5.6 }), lab(2, { value: 5.2, day: '2026-09-09', refHigh: 5.6 })] }));
    expect(screen.getByTestId('biomarker-value-2')).toHaveTextContent('5.2 mmol/L');
    expect(screen.getByTestId('biomarker-day-2')).toHaveTextContent('9/9');
    expect(screen.getByTestId('biomarker-day-1')).toHaveTextContent('9/9/2025');
    expect(screen.getAllByText('9/9/2025')).toHaveLength(2);
  });

  it('converts to the other unit and says so', async () => {
    mockParams.id = 'glucose';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: glucoseHistory }));
    await fireEvent.press(screen.getByText('mg/dL'));
    expect(screen.getByTestId('biomarker-latest')).toHaveTextContent(/111.7 mg/);
    expect(screen.getByTestId('biomarker-converted')).toBeTruthy();
    expect(screen.getByText('6.2 mmol/L')).toBeTruthy();
  });

  it('opens the edit form for an entry and asks before it deletes', async () => {
    mockParams.id = 'glucose';
    const remove = jest.fn<Promise<boolean>, [number]>(async () => true);
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: glucoseHistory, removeLabResult: remove }));
    await fireEvent.press(screen.getByTestId('biomarker-edit-2'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/health/labs-upload', params: { entry: '2' } });
    await fireEvent.press(screen.getByTestId('biomarker-delete-2'));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('biomarker-keep-2'));
    await fireEvent.press(screen.getByTestId('biomarker-delete-2'));
    await fireEvent.press(screen.getByTestId('biomarker-confirm-2'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(2));
  });

  it('pre-selects the biomarker when adding another result', async () => {
    mockParams.id = 'glucose';
    await render(withAppData(<BiomarkerScreen />, 'en', { labResults: glucoseHistory }));
    await fireEvent.press(screen.getByTestId('biomarker-add'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/health/labs-upload', params: { biomarker: 'glucose' } });
  });
});

describe('lab entry screen', () => {
  type Save = jest.Mock<Promise<boolean>, [number | null, LabResultInput]>;

  async function open(save: Save, extra: Partial<Parameters<typeof withAppData>[2]> = {}): Promise<void> {
    await render(withAppData(<LabsUploadScreen />, 'en', { saveLabResult: save, ...extra }));
    if (screen.queryByTestId('labs-choose-manual') !== null) await fireEvent.press(screen.getByTestId('labs-choose-manual'));
  }

  it('starts with a chooser for CSV, a PDF or photo, or typing it in', async () => {
    await render(withAppData(<LabsUploadScreen />, 'en'));
    expect(screen.queryByTestId('labs-form')).toBeNull();
    expect(screen.getByText('Recommended')).toBeTruthy();
    expect(screen.getByTestId('labs-booking')).toHaveTextContent(/Lab booking isn't included/);
    await fireEvent.press(screen.getByTestId('labs-choose-csv'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/health/labs-import', params: { source: 'csv' } });
    await fireEvent.press(screen.getByTestId('labs-import-open'));
    expect(router.push).toHaveBeenCalledWith('/health/labs-import');
    await fireEvent.press(screen.getByTestId('labs-choose-manual'));
    expect(screen.getByTestId('labs-form')).toBeTruthy();
  });

  it('goes straight to the form when it adds to a known biomarker', async () => {
    mockParams.biomarker = 'hba1c';
    await render(withAppData(<LabsUploadScreen />, 'en'));
    expect(screen.getByTestId('labs-form')).toBeTruthy();
  });

  it('offers importing a report instead of a not-built note', async () => {
    await open(jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true));
    expect(screen.queryByTestId('labs-file-not-built')).toBeNull();
    expect(screen.queryByText(/not built yet/)).toBeNull();
    await fireEvent.press(screen.getByTestId('labs-import-open'));
    expect(router.push).toHaveBeenCalledWith('/health/labs-import');
  });

  it('hides the import entry while editing an existing result', async () => {
    mockParams.entry = '2';
    await open(jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true), { labResults: glucoseHistory });
    expect(screen.queryByTestId('labs-import-entry')).toBeNull();
  });

  it('does not save invalid input', async () => {
    const save: Save = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true);
    await open(save);
    await fireEvent.press(screen.getByTestId('labs-pick-glucose'));
    await fireEvent.changeText(screen.getByTestId('labs-input-value'), 'abc');
    await fireEvent.press(screen.getByTestId('labs-save'));
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('labs-input-value'), '5');
    await fireEvent.changeText(screen.getByTestId('labs-input-low'), '6');
    await fireEvent.changeText(screen.getByTestId('labs-input-high'), '4');
    await fireEvent.press(screen.getByTestId('labs-save'));
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('labs-input-high'), '');
    await fireEvent.changeText(screen.getByTestId('labs-input-day'), '2026-11-26');
    await fireEvent.press(screen.getByTestId('labs-save'));
    expect(save).not.toHaveBeenCalled();
  });

  it('requires a biomarker', async () => {
    const save: Save = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true);
    await open(save);
    await fireEvent.changeText(screen.getByTestId('labs-input-value'), '5');
    await fireEvent.press(screen.getByTestId('labs-save'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId('labs-biomarker-error')).toBeTruthy();
  });

  it('saves a catalogue result with its range and note, then leaves the form', async () => {
    const save: Save = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true);
    await open(save);
    await fireEvent.press(screen.getByTestId('labs-pick-glucose'));
    await fireEvent.changeText(screen.getByTestId('labs-input-value'), '5,2');
    await fireEvent.changeText(screen.getByTestId('labs-input-low'), '3.9');
    await fireEvent.changeText(screen.getByTestId('labs-input-high'), '5.6');
    await fireEvent.changeText(screen.getByTestId('labs-input-note'), 'fasting');
    await fireEvent.press(screen.getByTestId('labs-save'));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(null, {
        biomarker: 'glucose',
        unit: 'mmol/L',
        value: 5.2,
        day: '2026-11-25',
        refLow: 3.9,
        refHigh: 5.6,
        note: 'fasting',
      }),
    );
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('switches the unit and shows the converted value without changing what was typed', async () => {
    const save: Save = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true);
    await open(save);
    await fireEvent.press(screen.getByTestId('labs-pick-glucose'));
    await fireEvent.changeText(screen.getByTestId('labs-input-value'), '90');
    await fireEvent.press(screen.getByText('mg/dL'));
    expect(screen.getByTestId('labs-input-value').props.value).toBe('90');
    expect(screen.getByTestId('labs-convert-mmol/L')).toHaveTextContent('About 4.996 mmol/L');
    await fireEvent.press(screen.getByTestId('labs-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null, expect.objectContaining({ unit: 'mg/dL', value: 90 })));
  });

  it('saves a custom biomarker with its own unit', async () => {
    const save: Save = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true);
    await open(save);
    await fireEvent.press(screen.getByTestId('labs-pick-custom'));
    await fireEvent.changeText(screen.getByTestId('labs-input-name'), 'Vitamin B12');
    await fireEvent.changeText(screen.getByTestId('labs-input-custom-unit'), 'pmol/L');
    await fireEvent.changeText(screen.getByTestId('labs-input-value'), '310');
    await fireEvent.press(screen.getByTestId('labs-save'));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(null, {
        biomarker: 'custom:Vitamin B12',
        unit: 'pmol/L',
        value: 310,
        day: '2026-11-25',
        refLow: null,
        refHigh: null,
        note: null,
      }),
    );
  });

  it('pre-selects the biomarker from the route', async () => {
    mockParams.biomarker = 'hba1c';
    await open(jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true));
    expect(screen.getByTestId('labs-pick-hba1c').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('mmol/mol')).toBeTruthy();
  });

  it('edits an existing result by id', async () => {
    const save: Save = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true);
    mockParams.entry = '2';
    await open(save, { labResults: glucoseHistory });
    expect(screen.getByTestId('labs-input-value').props.value).toBe('6.2');
    expect(screen.getByTestId('labs-input-low').props.value).toBe('3.9');
    expect(screen.getByTestId('labs-input-note').props.value).toBe('after holiday');
    await fireEvent.changeText(screen.getByTestId('labs-input-value'), '5.9');
    await fireEvent.press(screen.getByTestId('labs-save'));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(2, {
        biomarker: 'glucose',
        unit: 'mmol/L',
        value: 5.9,
        day: '2026-11-10',
        refLow: 3.9,
        refHigh: 5.6,
        note: 'after holiday',
      }),
    );
  });

  it('says so when the result to edit no longer exists', async () => {
    mockParams.entry = '99';
    await open(jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => true), { labResults: glucoseHistory });
    expect(screen.getByTestId('labs-upload-not-found')).toBeTruthy();
    expect(screen.queryByTestId('labs-save')).toBeNull();
  });

  it('stays on the form when saving fails', async () => {
    const save: Save = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => false);
    await open(save);
    await fireEvent.press(screen.getByTestId('labs-pick-glucose'));
    await fireEvent.changeText(screen.getByTestId('labs-input-value'), '5');
    await fireEvent.press(screen.getByTestId('labs-save'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(router.back).not.toHaveBeenCalled();
  });
});
