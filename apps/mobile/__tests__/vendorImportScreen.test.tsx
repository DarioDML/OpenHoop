import type { VendorData } from '@openhoop/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { strToU8 } from 'fflate';
import type { ReactNode } from 'react';

import ImportExportScreen from '@/app/settings/import';
import OfficialAppScreen from '@/app/onboarding/official-app';
import type { VendorImportResult } from '@/data/vendorExport/summary';
import { pickVendorFiles } from '@/data/vendorExport/pickFiles';
import { allTranslations } from '@/i18n';

import { fixtureAppData, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/data/vendorExport/pickFiles', () => ({ pickVendorFiles: jest.fn() }));

const pick = jest.mocked(pickVendorFiles);

const CYCLES_CSV = [
  'Cycle start time,Cycle end time,Cycle timezone,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Skin temp (celsius),Blood oxygen %,Day Strain,Sleep onset,Wake onset',
  '2024-01-14 22:10:00,2024-01-15 22:05:00,UTC+01:00,62,51,74.5,33.4,96.5,11.3,2024-01-14 22:20:00,2024-01-15 06:30:00',
  '2024-01-16 22:00:00,2024-01-17 22:00:00,UTC+01:00,70,50,70,33.4,96.5,10.1,,',
].join('\n');

const cycle = (startT: number, day: string, recoveryPct: number | null) => ({
  startT,
  endT: null,
  tzOffsetS: 3_600,
  day,
  recoveryPct,
  restingHr: 51,
  hrvMs: 74.5,
  skinTempC: 33.4,
  spo2Pct: 96.5,
  respiratoryRate: 14.2,
  dayStrain: 11.3,
});

function stored(): VendorData {
  return {
    cycles: [cycle(1_700_000_000, '2023-11-14', 62), cycle(1_700_086_400, '2023-11-15', 71)],
    sleeps: [
      {
        onset: 1_700_000_100,
        wake: 1_700_028_900,
        tzOffsetS: 3_600,
        day: '2023-11-14',
        nap: false,
        performancePct: 88,
        asleepMin: 440,
        inBedMin: 480,
        lightMin: 220,
        deepMin: 90,
        remMin: 130,
        awakeMin: 40,
        efficiencyPct: 91,
        consistencyPct: null,
        respiratoryRate: null,
      },
    ],
    workouts: [{ startT: 1_700_040_000, endT: 1_700_043_600, tzOffsetS: 3_600, day: '2023-11-15', activity: 'Running', strain: 9.4, avgHr: 142, maxHr: 171 }],
    journal: [{ cycleStart: 1_700_000_000, tzOffsetS: 3_600, day: '2023-11-14', question: 'Did you drink alcohol?', answeredYes: true, notes: 'one' }],
  };
}

const outcome: VendorImportResult = {
  counts: {
    cycles: { imported: 2, skipped: 1, invalid: 3 },
    sleeps: { imported: 0, skipped: 0, invalid: 0 },
    workouts: { imported: 0, skipped: 0, invalid: 0 },
    journal: { imported: 1, skipped: 0, invalid: 0 },
  },
  files: [
    { name: 'physiological_cycles.csv', kind: 'cycles', rows: 6, invalid: 3, problem: null },
    { name: 'notes.pdf', kind: null, rows: 0, invalid: 0, problem: 'unsupported' },
  ],
};

describe('import screen', () => {
  beforeEach(() => {
    pick.mockReset();
  });

  it('is no longer a not-built placeholder and says the file is read locally', async () => {
    await render(withAppData(<ImportExportScreen />));
    expect(screen.queryByTestId('not-built-import')).toBeNull();
    expect(screen.getByTestId('import-choose')).toBeTruthy();
    expect(screen.getByText(/never contacts the official app's servers/)).toBeTruthy();
    expect(screen.getByTestId('import-stored-empty')).toBeTruthy();
  });

  it('picks files, previews what was found, then imports and shows the counts', async () => {
    const files = [{ name: 'physiological_cycles.csv', bytes: strToU8(CYCLES_CSV) }];
    const rejected = [{ name: 'big.zip', kind: null, rows: 0, invalid: 0, problem: 'too-large' as const }];
    pick.mockResolvedValue({ picked: true, files, rejected });
    const importVendorFiles = jest.fn(async () => outcome);
    await render(withAppData(<ImportExportScreen />, 'en', { importVendorFiles }));
    await fireEvent.press(screen.getByTestId('import-choose'));
    await waitFor(() => expect(screen.getByTestId('import-file')).toBeTruthy());
    expect(within(screen.getByTestId('import-file')).getByText('physiological_cycles.csv')).toBeTruthy();
    expect(screen.getByTestId('found-cycles-value')).toHaveTextContent('2');
    expect(screen.getByTestId('found-sleeps-value')).toHaveTextContent('0');
    expect(within(screen.getByTestId('import-problems')).getByText('big.zip: is over 25 MB')).toBeTruthy();
    expect(importVendorFiles).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('import-run'));
    await waitFor(() => expect(screen.getByTestId('import-result')).toBeTruthy());
    expect(importVendorFiles).toHaveBeenCalledWith(files, rejected, { fromDay: null });
    expect(screen.getByTestId('import-result-cycles').props.children).toBe('Cycles: 2 imported, 1 skipped, 3 invalid');
    expect(screen.getByTestId('import-result-journal')).toBeTruthy();
    expect(screen.queryByTestId('import-result-sleeps')).toBeNull();
    expect(screen.getByTestId('import-file-0').props.children).toBe('physiological_cycles.csv: Cycles, 6 rows, 3 invalid');
    expect(screen.getByTestId('import-file-1').props.children).toBe('notes.pdf: is not a ZIP or CSV file');
  });

  it('does nothing when the picker is cancelled', async () => {
    pick.mockResolvedValue({ picked: false });
    const importVendorFiles = jest.fn(async () => outcome);
    await render(withAppData(<ImportExportScreen />, 'en', { importVendorFiles }));
    await fireEvent.press(screen.getByTestId('import-choose'));
    await waitFor(() => expect(pick).toHaveBeenCalled());
    expect(importVendorFiles).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-result')).toBeNull();
    expect(screen.getByTestId('import-choose').props.accessibilityState.disabled).toBeFalsy();
  });

  it('says plainly when nothing in the file can be imported and keeps the button off', async () => {
    pick.mockResolvedValue({ picked: true, files: [{ name: 'a.csv', bytes: strToU8(['hello,world', '1,2'].join('\n')) }], rejected: [] });
    const importVendorFiles = jest.fn(async () => outcome);
    await render(withAppData(<ImportExportScreen />, 'en', { importVendorFiles }));
    await fireEvent.press(screen.getByTestId('import-choose'));
    await waitFor(() => expect(screen.getByTestId('import-nothing')).toBeTruthy());
    expect(screen.getByTestId('import-run').props.accessibilityState.disabled).toBe(true);
  });

  it('calls a repeated import already up to date, not a failure', async () => {
    pick.mockResolvedValue({ picked: true, files: [{ name: 'physiological_cycles.csv', bytes: strToU8(CYCLES_CSV) }], rejected: [] });
    const again: VendorImportResult = {
      counts: { ...outcome.counts, cycles: { imported: 0, skipped: 5, invalid: 0 }, journal: { imported: 0, skipped: 0, invalid: 0 } },
      files: [],
    };
    await render(withAppData(<ImportExportScreen />, 'en', { importVendorFiles: async () => again }));
    await fireEvent.press(screen.getByTestId('import-choose'));
    await fireEvent.press(await screen.findByTestId('import-run'));
    await waitFor(() => expect(screen.getByText('Already up to date: these rows were imported before')).toBeTruthy());
    expect(screen.queryByText('Nothing could be imported')).toBeNull();
  });

  it('imports only days from the start of OpenHoop when history is switched off, and stores the choices', async () => {
    pick.mockResolvedValue({ picked: true, files: [{ name: 'physiological_cycles.csv', bytes: strToU8(CYCLES_CSV) }], rejected: [] });
    const importVendorFiles = jest.fn(async () => outcome);
    const updateUserData = jest.fn(async () => true);
    const base = fixtureAppData();
    const userData = { ...base.userData, vendorUse: { accuracy: true, history: false } };
    const settings = { ...base.settings, ownerSince: '2024-01-16' };
    await render(withAppData(<ImportExportScreen />, 'en', { importVendorFiles, updateUserData, userData, settings }));
    await fireEvent.press(screen.getByTestId('import-choose'));
    expect(await screen.findByText('Only days from 2024-01-16 on are imported.')).toBeTruthy();
    expect(screen.getByTestId('import-run')).toHaveTextContent('Import 1 days');
    await fireEvent(screen.getByTestId('use-accuracy'), 'valueChange', false);
    expect(updateUserData).toHaveBeenCalledWith({ vendorUse: { accuracy: false, history: false } });
    await fireEvent.press(screen.getByTestId('import-run'));
    await waitFor(() => expect(importVendorFiles).toHaveBeenCalledWith(expect.any(Array), [], { fromDay: '2024-01-16' }));
  });

  it('shows imported values labelled as the official app’s, apart from anything else', async () => {
    await render(withAppData(<ImportExportScreen />, 'en', { vendorData: stored() }));
    expect(screen.getByTestId('import-stored-counts').props.children).toBe('2 cycles, 1 sleeps, 1 workouts, 1 journal answers');
    expect(screen.getByTestId('import-stored-range').props.children).toBe('2023-11-14 to 2023-11-15');
    expect(screen.getByTestId('import-stored-note').props.children).toMatch(/official app's own numbers/);
    expect(screen.getByTestId('import-chart-card')).toBeTruthy();
    const newest = screen.getByTestId('import-cycle-1700086400');
    expect(within(newest).getByText('Official app export')).toBeTruthy();
    expect(within(newest).getByText('Cycle starting 2023-11-15')).toBeTruthy();
    expect(within(newest).getByText('Recovery 71% · Strain 11.3')).toBeTruthy();
    expect(within(newest).getByText('Resting HR 51 bpm · HRV 74.5 ms')).toBeTruthy();
  });

  it('lists imported cycles newest first', async () => {
    await render(withAppData(<ImportExportScreen />, 'en', { vendorData: stored() }));
    const rows = screen.getAllByTestId(/^import-cycle-/);
    expect(rows.map((r) => r.props.testID)).toEqual(['import-cycle-1700086400', 'import-cycle-1700000000']);
  });

  it('switches between sleeps, workouts and journal, each labelled with its source', async () => {
    await render(withAppData(<ImportExportScreen />, 'en', { vendorData: stored() }));
    await fireEvent.press(screen.getByText('Sleeps'));
    const sleep = screen.getByTestId('import-sleep-1700000100');
    expect(within(sleep).getByText('Official app export')).toBeTruthy();
    expect(within(sleep).getByText('Asleep 7 h 20 min · In bed 8 h')).toBeTruthy();
    expect(within(sleep).getByText('Sleep performance 88% · Efficiency 91%')).toBeTruthy();
    await fireEvent.press(screen.getByText('Workouts'));
    const workout = screen.getByTestId('import-workout-1700040000');
    expect(within(workout).getByText('Running')).toBeTruthy();
    expect(within(workout).getByText('Official app export')).toBeTruthy();
    expect(within(workout).getByText('Strain 9.4 · Avg HR 142 bpm · Max HR 171 bpm')).toBeTruthy();
    await fireEvent.press(screen.getByText('Journal'));
    const entry = screen.getByTestId('import-journal-1700000000');
    expect(within(entry).getByText('Did you drink alcohol?')).toBeTruthy();
    expect(within(entry).getByText('2023-11-14: Yes')).toBeTruthy();
  });

  it('pages long histories', async () => {
    const data: VendorData = { ...stored(), cycles: Array.from({ length: 25 }, (_, i) => cycle(1_700_000_000 + i * 86_400, '2023-11-14', 50)) };
    await render(withAppData(<ImportExportScreen />, 'en', { vendorData: data }));
    expect(screen.getAllByTestId(/^import-cycle-/)).toHaveLength(20);
    await fireEvent.press(screen.getByTestId('import-show-all'));
    expect(screen.getAllByTestId(/^import-cycle-/)).toHaveLength(25);
  });

  it('removes all imported data only after a confirmation', async () => {
    const removeVendorData = jest.fn(async () => true);
    await render(withAppData(<ImportExportScreen />, 'en', { vendorData: stored(), removeVendorData }));
    await fireEvent.press(screen.getByTestId('import-remove'));
    expect(removeVendorData).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove 5 imported rows/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('import-remove-keep'));
    expect(screen.getByTestId('import-remove')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('import-remove'));
    await fireEvent.press(screen.getByTestId('import-remove-confirm'));
    await waitFor(() => expect(removeVendorData).toHaveBeenCalledTimes(1));
  });

  it('renders in Dutch', async () => {
    await render(withAppData(<ImportExportScreen />, 'nl', { vendorData: stored() }));
    expect(screen.getByText('Kies exportbestanden')).toBeTruthy();
    expect(within(screen.getByTestId('import-cycle-1700086400')).getByText('Export officiële app')).toBeTruthy();
  });
});

describe('official app onboarding step', () => {
  it('points to the import and keeps the labelling promise', async () => {
    await render(withAppData(<OfficialAppScreen />));
    expect(screen.getByTestId('onboarding-import-card')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-import'));
    expect(router.push).toHaveBeenCalledWith('/settings/import');
    expect(allTranslations.en['onboarding.official.importBody']).toMatch(/never mixes with OpenHoop's scores/);
  });
});
