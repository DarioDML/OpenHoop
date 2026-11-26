import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { BandModel, DonationDay, RemovalCounts } from '@openhoop/core';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import type { BuiltDonation, Language } from '@/data/types';

import { fixtureAppData, withAppData, type AppDataOverrides } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

const openSheet = jest.mocked(WebBrowser.openBrowserAsync);

import AccuracyScreen from '@/app/settings/accuracy';
import DonateDataScreen from '@/app/settings/donate-data';
import SupportScreen from '@/app/settings/support';

function day(date: string, official: boolean, model: BandModel = '5.0'): DonationDay {
  return {
    day: date,
    asleepS: 25_920,
    official,
    bands: [{ deviceId: 1, model, day: date, start: 0, end: 1, tzOffsetS: 3_600, frameEstimate: 86_400 }],
  };
}

function built(parts: number, days: string[] = ['2026-11-24']): BuiltDonation {
  return {
    workspaceUri: 'file:///cache/donation-1',
    code: 'k3f9x2ab',
    parts: Array.from({ length: parts }, (_, i) => ({
      fileName: `openhoop-donation-k3f9x2ab-5.0-part-${i + 1}-of-${parts}.zip`,
      bytes: 1_000,
      model: '5.0',
      part: i + 1,
      parts,
      days,
    })),
    days,
    skippedDays: [],
    officialDays: days,
    models: ['5.0'],
    firmware: ['50.43.2.0'],
    removed: {} as RemovalCounts,
    firstDay: days[0] as string,
    lastDay: days[days.length - 1] as string,
  };
}

const TWO_DAYS = [day('2026-11-24', true), day('2026-11-23', false)];

async function renderDonate(overrides: AppDataOverrides = {}, language: Language = 'en') {
  const base = fixtureAppData(language);
  return render(
    withAppData(<DonateDataScreen />, language, {
      settings: { ...base.settings, dataSource: 'band' },
      listDonationDays: async () => TWO_DAYS,
      ...overrides,
    }),
  );
}

async function chooseFirstDayAndConsent(): Promise<void> {
  await fireEvent.press(await screen.findByTestId('donate-data-day-2026-11-24'));
  await fireEvent.press(screen.getByTestId('donate-data-consent'));
}

beforeEach(() => {
  openSheet.mockClear();
  jest.mocked(router.push).mockClear();
});

describe('donate your data', () => {
  it('lists days, marks official ones and keeps Donate disabled until consent', async () => {
    await renderDonate();
    expect(await screen.findByTestId('donate-data-day-2026-11-24')).toHaveTextContent(/Official values ✓/);
    expect(screen.getByTestId('donate-data-day-2026-11-23')).not.toHaveTextContent(/Official values ✓/);
    expect(screen.getByText('Tue 24 Nov')).toBeTruthy();
    expect(screen.getByTestId('donate-data-go')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('donate-data-day-2026-11-24'));
    expect(screen.getByTestId('donate-data-go')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('donate-data-consent'));
    expect(screen.getByTestId('donate-data-go')).toBeEnabled();
    expect(screen.getByTestId('donate-data-summary')).toHaveTextContent(/^Band 5\.0 · 1 day · about .+ MB · 1 file$/);
  });

  it('selects every day with Select all and names the range in the consent', async () => {
    await renderDonate();
    await fireEvent.press(await screen.findByTestId('donate-data-all'));
    expect(screen.getByTestId('donate-data-day-2026-11-23')).toBeChecked();
    expect(screen.getByTestId('donate-data-summary')).toHaveTextContent(/· 2 days ·/);
    expect(screen.getByTestId('donate-data-consent')).toHaveTextContent(/2 days, from Mon 23 Nov to Tue 24 Nov/);
    await fireEvent.press(screen.getByTestId('donate-data-all'));
    expect(screen.getByTestId('donate-data-day-2026-11-23')).not.toBeChecked();
  });

  it('builds, saves and opens the prefilled GitHub form', async () => {
    const donation = built(1);
    const buildDonation = jest.fn(async () => donation);
    const saveDonation = jest.fn(async () => ({ kind: 'saved' as const, folderUri: 'content://downloads' }));
    await renderDonate({ buildDonation, saveDonation });
    await chooseFirstDayAndConsent();
    await fireEvent.press(screen.getByTestId('donate-data-go'));
    await waitFor(() => expect(openSheet).toHaveBeenCalledWith(expect.stringContaining('template=data-donation.yml'), expect.anything()));
    expect(buildDonation).toHaveBeenCalledWith(['2026-11-24'], expect.any(Function), expect.any(AbortSignal));
    expect(saveDonation).toHaveBeenCalledWith(donation);
    expect(screen.getByText(/Attach it to the post/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('donate-data-github'));
    expect(openSheet).toHaveBeenCalledTimes(2);
  });

  it('starts one build on a double tap', async () => {
    const buildDonation = jest.fn(() => new Promise<BuiltDonation>(() => undefined));
    await renderDonate({ buildDonation });
    await chooseFirstDayAndConsent();
    await fireEvent.press(screen.getByTestId('donate-data-go'));
    await fireEvent.press(screen.getByTestId('donate-data-go'));
    expect(buildDonation).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('donate-data-cancel')).toBeTruthy();
  });

  it('aborts the build when the screen closes', async () => {
    let signal: AbortSignal | null = null;
    const buildDonation = jest.fn((_days: readonly string[], _progress: unknown, given: AbortSignal) => {
      signal = given;
      return new Promise<BuiltDonation>(() => undefined);
    });
    const view = await renderDonate({ buildDonation });
    await chooseFirstDayAndConsent();
    await fireEvent.press(screen.getByTestId('donate-data-go'));
    await waitFor(() => expect(signal).not.toBeNull());
    await view.unmount();
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
  });

  it('removes the prepared files when the screen closes after saving', async () => {
    const donation = built(1);
    const discardDonation = jest.fn();
    const view = await renderDonate({
      buildDonation: async () => donation,
      saveDonation: async () => ({ kind: 'saved', folderUri: 'content://downloads' }),
      discardDonation,
    });
    await chooseFirstDayAndConsent();
    await fireEvent.press(screen.getByTestId('donate-data-go'));
    await screen.findByTestId('donate-data-github');
    await view.unmount();
    expect(discardDonation).toHaveBeenCalledWith(donation);
  });

  it('offers one share button per part when the folder cannot be used', async () => {
    const donation = built(2);
    const shareDonationPart = jest.fn(async () => undefined);
    await renderDonate({ buildDonation: async () => donation, saveDonation: async () => ({ kind: 'shareEach' }), shareDonationPart });
    await chooseFirstDayAndConsent();
    await fireEvent.press(screen.getByTestId('donate-data-go'));
    expect(await screen.findByTestId('donate-data-share-1')).toHaveTextContent('Save part 1 of 2');
    expect(screen.getByTestId('donate-data-share-2')).toHaveTextContent('Save part 2 of 2');
    await fireEvent.press(screen.getByTestId('donate-data-share-2'));
    expect(shareDonationPart).toHaveBeenCalledWith(donation, 'openhoop-donation-k3f9x2ab-5.0-part-2-of-2.zip');
    expect(openSheet).not.toHaveBeenCalled();
  });

  it('keeps the files when no folder was chosen and lets the donor try again', async () => {
    const saveDonation = jest
      .fn()
      .mockResolvedValueOnce({ kind: 'cancelled' })
      .mockResolvedValueOnce({ kind: 'saved', folderUri: 'content://downloads' });
    await renderDonate({ buildDonation: async () => built(1), saveDonation });
    await chooseFirstDayAndConsent();
    await fireEvent.press(screen.getByTestId('donate-data-go'));
    await fireEvent.press(await screen.findByTestId('donate-data-save-again'));
    await waitFor(() => expect(openSheet).toHaveBeenCalled());
    expect(saveDonation).toHaveBeenCalledTimes(2);
  });

  it('shows an error and keeps the selection when building fails', async () => {
    await renderDonate({ buildDonation: async () => Promise.reject(new Error('disk full')) });
    await chooseFirstDayAndConsent();
    await fireEvent.press(screen.getByTestId('donate-data-go'));
    expect(await screen.findByTestId('donate-data-error')).toHaveTextContent(/enough free space/);
    expect(screen.getByTestId('donate-data-day-2026-11-24')).toBeChecked();
  });

  it('explains that demo data cannot be donated', async () => {
    const base = fixtureAppData('en');
    await render(withAppData(<DonateDataScreen />, 'en', { settings: { ...base.settings, dataSource: 'demo' } }));
    expect(await screen.findByTestId('donate-data-demo')).toBeTruthy();
    expect(screen.queryByTestId('donate-data-go')).toBeNull();
  });

  it('shows the Dutch texts', async () => {
    await renderDonate({}, 'nl');
    expect(await screen.findByText('Alles selecteren')).toBeTruthy();
    expect(screen.getByText('Kies dagen')).toBeTruthy();
    expect(screen.getByText('di 24 nov')).toBeTruthy();
  });

  it('opens the donation screen from Support and Accuracy', async () => {
    const support = await render(withAppData(<SupportScreen />));
    await fireEvent.press(screen.getByTestId('support-donate-data'));
    expect(router.push).toHaveBeenLastCalledWith('/settings/donate-data');
    await support.unmount();
    await render(withAppData(<AccuracyScreen />));
    await fireEvent.press(screen.getByTestId('accuracy-donate-data'));
    expect(router.push).toHaveBeenLastCalledWith('/settings/donate-data');
  });
});
