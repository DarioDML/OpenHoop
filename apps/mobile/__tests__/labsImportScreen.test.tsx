import type { LabResultInput } from '@openhoop/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LabsImportScreen from '@/app/health/labs-import';
import type { PickOutcome } from '@/data/labImport/files';
import type { DeviceReadResult, UploadResult } from '@/data/labImport/reader';
import { defaultUserData } from '@/data/userData';
import type { GatedFetch } from '@/net/gate';

import { FIXTURE_NOW } from './support/appData';
import { TEST_KEY, jsonResponse, makeController, messageBody, withCoach } from './support/coach';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPick = jest.fn<Promise<PickOutcome>, []>();
const mockPhoto = jest.fn<Promise<PickOutcome>, []>();
const mockDiscard = jest.fn<void, [string]>();
const mockRead = jest.fn<Promise<DeviceReadResult>, [unknown, (lines: readonly string[]) => boolean]>();
const mockUpload = jest.fn<Promise<UploadResult>, [unknown]>();
const mockDeviceReady = jest.fn<boolean, []>(() => true);
const mockLoadKey = jest.fn<Promise<string | null>, []>(async () => TEST_KEY);
const mockNetFetch = jest.fn<Promise<Response>, Parameters<GatedFetch>>();

jest.mock('@/data/labImport/files', () => ({
  pickReportFile: () => mockPick(),
  takeReportPhoto: () => mockPhoto(),
  discardReport: (uri: string) => mockDiscard(uri),
}));

jest.mock('@/data/labImport/reader', () => ({
  onDeviceAvailable: () => mockDeviceReady(),
  readOnDevice: (file: unknown, useful: (lines: readonly string[]) => boolean) => mockRead(file, useful),
  uploadFor: (file: unknown) => mockUpload(file),
}));

jest.mock('@/coach/keyStore', () => ({
  secureKeyStore: { load: () => mockLoadKey(), save: async () => true, remove: async () => undefined },
}));

jest.mock('@/net', () => ({
  netFetch: (...args: Parameters<GatedFetch>) => mockNetFetch(...args),
  currentNetworkPrefs: () => ({ enabled: false, features: { coach: false, maps: false, labs: false } }),
  setNetworkPrefs: () => undefined,
}));

jest.setTimeout(30_000);

function part(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

const PDF: PickOutcome = { status: 'picked', file: { uri: 'file:///cache/report.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 1000 } };

const REPORT = [
  'Datum staalname: 18/11/2026',
  'Glucose nuchter 92 mg/dL 70 - 99',
  'Ferritine 45 µg/L 30 - 400',
  'CRP <0,5 mg/L < 5,0',
  'Hematocriet 42,1 % 40,0 - 50,0',
];

type Save = jest.Mock<Promise<boolean>, [number | null, LabResultInput]>;

function saver(result = true): Save {
  return jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async () => result);
}

async function open(options: { save?: Save; labs?: boolean; key?: string | null; language?: 'en' | 'nl' } = {}): Promise<Save> {
  const save = options.save ?? saver();
  const { controller } = makeController({ key: options.key === undefined ? TEST_KEY : options.key });
  await controller.load();
  const network = { enabled: options.labs === true, features: { coach: false, maps: false, labs: options.labs === true } };
  await render(withCoach(<LabsImportScreen />, controller, { saveLabResult: save, userData: { ...defaultUserData(), onboardingDone: true, network } }, options.language ?? 'en'));
  return save;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  mockDeviceReady.mockReturnValue(true);
  mockLoadKey.mockResolvedValue(TEST_KEY);
  mockPick.mockResolvedValue(PDF);
  mockRead.mockResolvedValue({ ok: true, lines: REPORT, source: 'text' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('lab import on the phone', () => {
  it('reads a report, shows every candidate and saves nothing until confirmed', async () => {
    const save = await open();
    expect(screen.queryByTestId('labs-import-method')).toBeNull();
    expect(screen.getByTestId('labs-import-claude-off')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-review')).toBeTruthy());
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/report.pdf');
    expect(mockNetFetch).not.toHaveBeenCalled();
    expect(screen.getByTestId('labs-import-count')).toHaveTextContent(part('4 results found'));
    expect(screen.getByTestId('labs-import-row-0-status')).toHaveTextContent(part('Read as Glucose'));
    expect(screen.getByTestId('labs-import-row-0-select').props.value).toBe(true);
    expect(screen.getByTestId('labs-import-row-2-select').props.value).toBe(false);
    expect(screen.getByTestId('labs-import-row-2-censored')).toHaveTextContent(part('Your report says <0.5'));
    expect(screen.queryByTestId('labs-import-row-3')).toBeNull();
    expect(screen.getByTestId('labs-import-others')).toHaveTextContent(part('1 other result not recognised'));
    await fireEvent.press(screen.getByTestId('labs-import-others-toggle'));
    expect(screen.getByTestId('labs-import-row-3-status')).toHaveTextContent(part('Not recognised'));
    expect(screen.getByTestId('labs-import-row-3-select').props.value).toBe(false);
    expect(screen.queryByTestId('labs-import-row-3-pick-custom')).toBeNull();
    expect(save).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('labs-import-row-1-value'), '46');
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenNthCalledWith(1, null, { biomarker: 'glucose', unit: 'mg/dL', value: 92, day: '2026-11-18', refLow: 70, refHigh: 99, note: null });
    expect(save).toHaveBeenNthCalledWith(2, null, { biomarker: 'ferritin', unit: 'µg/L', value: 46, day: '2026-11-18', refLow: 30, refHigh: 400, note: null });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/health/labs'));
  });

  it('saves a flagged value with a note and an unmatched row once it is mapped', async () => {
    const save = await open();
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-review')).toBeTruthy());
    await fireEvent(screen.getByTestId('labs-import-row-0-select'), 'valueChange', false);
    await fireEvent(screen.getByTestId('labs-import-row-1-select'), 'valueChange', false);
    await fireEvent(screen.getByTestId('labs-import-row-2-select'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('labs-import-others-toggle'));
    await fireEvent(screen.getByTestId('labs-import-row-3-select'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('labs-import-others-toggle'));
    expect(screen.queryByTestId('labs-import-row-3')).toBeNull();
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId('labs-import-notice')).toHaveTextContent(part('need a fix'));
    expect(screen.getByTestId('labs-import-row-3-biomarker-error')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('labs-import-row-3-pick-custom'));
    expect(screen.getByTestId('labs-import-row-3-name').props.value).toBe('Hematocriet');
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenNthCalledWith(1, null, expect.objectContaining({ biomarker: 'crp', value: 0.5, refHigh: 5, note: 'On the report: <0.5' }));
    expect(save).toHaveBeenNthCalledWith(2, null, expect.objectContaining({ biomarker: 'custom:Hematocriet', unit: '%', value: 42.1 }));
  });

  it('asks for a unit when an unmatched row is mapped to a marker whose units differ', async () => {
    mockRead.mockResolvedValue({ ok: true, lines: ['Hb 8,9 mmol/l 8,5-11,0'], source: 'ocr' });
    const save = await open();
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-review')).toBeTruthy());
    expect(screen.getByTestId('labs-import-row-0-printed')).toHaveTextContent(part('On the report: 8.9 mmol/L'));
    expect(screen.getByTestId('labs-import-day').props.value).toBe('');
    expect(screen.getByText(part('No test date was found'))).toBeTruthy();
    expect(screen.queryByTestId('labs-import-others')).toBeNull();
    await fireEvent.press(screen.getByTestId('labs-import-row-0-change'));
    await fireEvent.press(screen.getByTestId('labs-import-row-0-pick-haemoglobin'));
    expect(screen.getByTestId('labs-import-row-0-status')).toHaveTextContent(part('Biomarker chosen by you'));
    await fireEvent(screen.getByTestId('labs-import-row-0-select'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('labs-import-day'), '2026-11-20');
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    expect(save).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('g/dL'));
    await fireEvent.changeText(screen.getByTestId('labs-import-row-0-value'), '14,3');
    await fireEvent.changeText(screen.getByTestId('labs-import-row-0-low'), '13,7');
    await fireEvent.changeText(screen.getByTestId('labs-import-row-0-high'), '17,7');
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null, expect.objectContaining({ biomarker: 'haemoglobin', unit: 'g/dL', value: 14.3, day: '2026-11-20' })));
  });

  it('keeps rows that failed to save', async () => {
    const save = jest.fn<Promise<boolean>, [number | null, LabResultInput]>(async (_id, input) => input.biomarker !== 'ferritin');
    await open({ save });
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-review')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    await waitFor(() => expect(screen.getByTestId('labs-import-notice')).toHaveTextContent(part('1 results could not be saved')));
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('labs-import-row-0')).toBeNull();
    expect(screen.getByTestId('labs-import-row-1')).toBeTruthy();
  });

  it.each<[string, () => void, string]>([
    ['an encrypted PDF', () => mockRead.mockResolvedValue({ ok: false, error: 'encrypted' }), 'protected with a password'],
    ['a report without results', () => mockRead.mockResolvedValue({ ok: true, lines: ['Pagina 1 van 2'], source: 'ocr' }), 'No results were found'],
    ['a file that is too large', () => mockPick.mockResolvedValue({ status: 'too-large' }), 'too large'],
    ['an unsupported file', () => mockPick.mockResolvedValue({ status: 'unsupported' }), 'cannot be read'],
  ])('explains %s', async (_label, arrange, message) => {
    arrange();
    await open();
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-error')).toHaveTextContent(part(message)));
    await fireEvent.press(screen.getByTestId('labs-import-retry'));
    expect(screen.getByTestId('labs-import-choose')).toBeTruthy();
  });

  it('does nothing when picking is cancelled and explains a refused camera', async () => {
    mockPick.mockResolvedValue({ status: 'cancelled' });
    mockPhoto.mockResolvedValue({ status: 'denied' });
    await open();
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    expect(screen.getByTestId('labs-import-choose')).toBeTruthy();
    expect(mockRead).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('labs-import-camera'));
    await waitFor(() => expect(screen.getByTestId('labs-import-error')).toHaveTextContent(part('may not use the camera')));
  });

  it('says so when reading on the phone is not available', async () => {
    mockDeviceReady.mockReturnValue(false);
    await open();
    expect(screen.getByTestId('labs-import-device-body')).toHaveTextContent(part('not available on this device'));
    expect(screen.getByTestId('labs-import-pick').props.accessibilityState).toEqual({ disabled: true });
  });

  it('renders in Dutch', async () => {
    await open({ language: 'nl' });
    expect(screen.getByText('Kies een pdf of afbeelding')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-count')).toHaveTextContent(part('4 uitslagen gevonden')));
    expect(screen.getByTestId('labs-import-row-2-censored')).toHaveTextContent(part('Op je rapport staat <0,5'));
  });
});

describe('lab import with Claude', () => {
  const claudeReply = JSON.stringify({
    results: [
      { biomarker: 'tsh', name: 'TSH', value: 1.85, censored: null, unit: 'mU/L', refLow: 0.27, refHigh: 4.2, day: '2026-11-18' },
      { biomarker: 'tsh', name: 'Free T4', value: 'high', censored: null, unit: 'pmol/L', refLow: null, refHigh: null, day: null },
    ],
  });

  beforeEach(() => {
    mockUpload.mockResolvedValue({ ok: true, upload: { kind: 'pdf', base64: 'JVBERi0xLjQK' } });
    mockNetFetch.mockResolvedValue(jsonResponse(200, messageBody(claudeReply)));
  });

  it('is not offered without an API key', async () => {
    await open({ labs: true, key: null });
    expect(screen.queryByTestId('labs-import-method')).toBeNull();
    expect(screen.getByTestId('labs-import-claude-off')).toBeTruthy();
  });

  it('is offered with the labs feature on and a key, and says the report leaves the phone', async () => {
    await open({ labs: true });
    expect(screen.getByTestId('labs-import-method')).toBeTruthy();
    await fireEvent.press(screen.getByText('With Claude'));
    expect(screen.getByTestId('labs-import-claude-body')).toHaveTextContent(part('Your report leaves your phone'));
    expect(screen.getByTestId('labs-import-claude-body')).toHaveTextContent(part('claude-sonnet-5-5'));
  });

  it('sends the report through the labs feature and validates the answer', async () => {
    const save = await open({ labs: true });
    await fireEvent.press(screen.getByText('With Claude'));
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-review')).toBeTruthy());
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockNetFetch.mock.calls[0]?.[0]).toBe('labs');
    expect(mockDiscard).toHaveBeenCalledWith('file:///cache/report.pdf');
    expect(screen.getByTestId('labs-import-count')).toHaveTextContent(part('1 result found'));
    expect(screen.getByTestId('labs-import-dropped')).toHaveTextContent(part('1 entries'));
    await fireEvent.press(screen.getByTestId('labs-import-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null, { biomarker: 'tsh', unit: 'mIU/L', value: 1.85, day: '2026-11-18', refLow: 0.27, refHigh: 4.2, note: null }));
  });

  it('shows the Anthropic error in lab words', async () => {
    mockNetFetch.mockResolvedValue(jsonResponse(401, {}));
    await open({ labs: true });
    await fireEvent.press(screen.getByText('With Claude'));
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-error')).toHaveTextContent(part('did not accept the API key')));
    expect(mockDiscard).toHaveBeenCalled();
  });

  it('does not send a file it could not prepare', async () => {
    mockUpload.mockResolvedValue({ ok: false, error: 'too-large' });
    await open({ labs: true });
    await fireEvent.press(screen.getByText('With Claude'));
    await fireEvent.press(screen.getByTestId('labs-import-pick'));
    await waitFor(() => expect(screen.getByTestId('labs-import-error')).toHaveTextContent(part('too large')));
    expect(mockNetFetch).not.toHaveBeenCalled();
  });
});
