import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { applyConfigWrite, buildSnapshot, parseBandConfig, serializeSnapshot, type BandConfigSnapshot, type ConfigEntry } from '@/data/bandConfig';
import { createFixtureDevice } from '@/data/fixtureSource';
import type { AppData, DeviceStatus } from '@/data/types';

import { fixtureBandActions, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import BandConfigScreen from '@/app/settings/band-config';

const NOW_S = Math.floor(Date.now() / 1000);

const entry = (key: string, valueText: string | null, valueHex: string | null = null): ConfigEntry => ({ key, valueText, valueHex });

function appData(configSnapshot: string | null, overrides: Partial<AppData> = {}, device: Partial<DeviceStatus> = {}): Partial<AppData> {
  return { device: { ...createFixtureDevice(new Date()), configSnapshot, ...device }, ...overrides };
}

const SNAPSHOT_JSON = serializeSnapshot(
  buildSnapshot(
    NOW_S - 3 * 3_600,
    'demo',
    [entry('enable_r22_v4_packets', '1'), entry('make_hrfm_visible', '2'), entry('future_flag', 'zz'), entry('enable_sig12', null, '0102')],
    [entry('enable_rfid', '2'), entry('enable_raw_data_w_ecg', null, null), entry('new_setting', '5')],
  ),
);

function parsedSnapshot(): BandConfigSnapshot {
  const state = parseBandConfig(SNAPSHOT_JSON);
  if (state.status !== 'ok') throw new Error('fixture snapshot does not parse');
  return state.snapshot;
}

describe('BandConfigScreen', () => {
  it('shows an honest not-read-yet state without a snapshot', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(null)));
    expect(screen.getByTestId('config-state-missing')).toBeTruthy();
    expect(screen.getByText('Not read yet')).toBeTruthy();
    expect(screen.queryByTestId('config-flags')).toBeNull();
    expect(screen.getByTestId('config-unverified-note')).toBeTruthy();
  });

  it('shows could-not-read for a damaged snapshot and never throws', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData('{"version":1,')));
    expect(screen.getByTestId('config-state-malformed')).toBeTruthy();
    expect(screen.getByText('Could not read')).toBeTruthy();
    expect(screen.queryByTestId('config-flags')).toBeNull();
  });

  it('says so when the snapshot holds no fields', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(serializeSnapshot(buildSnapshot(NOW_S, 'band', [], [])))));
    expect(screen.getByTestId('config-state-empty')).toBeTruthy();
    expect(screen.getByText('No fields returned')).toBeTruthy();
  });

  it('lists known fields with readable labels and decoded values', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(screen.getByText('R22 packets, v4')).toBeTruthy();
    expect(screen.getByText('enable_r22_v4_packets')).toBeTruthy();
    expect(screen.getByText('HRFM visible')).toBeTruthy();
    expect(screen.getByText('RFID')).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.getAllByText('Off')).toHaveLength(1);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows the raw hex or an unreadable notice when a value has no text', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(screen.getByText('raw 0102')).toBeTruthy();
    expect(screen.getByText('Value could not be read')).toBeTruthy();
  });

  it('lists unknown fields raw in their own section', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(screen.getByTestId('config-other')).toBeTruthy();
    expect(screen.getByText('future_flag')).toBeTruthy();
    expect(screen.getByText('zz')).toBeTruthy();
    expect(screen.getByText('new_setting')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('shows no unverified chips now that the read was checked on a band, and says the demo values are simulated', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(screen.queryByText('Unverified')).toBeNull();
    expect(screen.getByTestId('config-source').props.children).toBe('These values come from the simulated band, not from a real WHOOP.');
  });

  it('says where the values came from when they were read from a band', async () => {
    const json = serializeSnapshot(buildSnapshot(NOW_S, 'band', [entry('enable_sig12', '2')], []));
    await render(withAppData(<BandConfigScreen />, 'en', appData(json)));
    expect(screen.getByTestId('config-source').props.children).toMatch(/read from your band/);
  });

  it('shows when the configuration was read', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(screen.getByTestId('config-read-at')).toBeTruthy();
    expect(screen.getByText('3 h ago')).toBeTruthy();
  });

  it('reads the configuration on request and disables the button while reading', async () => {
    let finish: () => void = () => undefined;
    const readBandConfig = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await render(withAppData(<BandConfigScreen />, 'en', appData(null, { readBandConfig })));
    await fireEvent.press(screen.getByTestId('read-config-button'));
    expect(readBandConfig).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('read-config-button').props.accessibilityState.disabled).toBe(true));
    finish();
    await waitFor(() => expect(screen.getByTestId('read-config-button').props.accessibilityState.disabled).toBe(false));
  });

  it('offers a change only for known on/off values', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(screen.getByTestId('config-change-enable_r22_v4_packets')).toBeTruthy();
    expect(screen.getByTestId('config-change-make_hrfm_visible')).toBeTruthy();
    expect(screen.getByTestId('config-change-enable_rfid')).toBeTruthy();
    expect(screen.queryByTestId('config-change-enable_sig12')).toBeNull();
    expect(screen.queryByTestId('config-change-future_flag')).toBeNull();
    expect(screen.queryByTestId('config-change-new_setting')).toBeNull();
    expect(screen.queryByTestId('not-built-bandConfig')).toBeNull();
  });

  it('writes only after the confirmation word is typed', async () => {
    const writeConfig = jest.fn(async () => true);
    const bandActions = { ...fixtureBandActions(), writeConfig };
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON, { bandActions })));
    await fireEvent.press(screen.getByTestId('config-change-make_hrfm_visible'));
    expect(screen.getByText(/This writes On to make_hrfm_visible \(now Off\)/)).toBeTruthy();
    expect(screen.getByTestId('danger-confirm').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('danger-input'), 'change');
    expect(screen.getByTestId('danger-confirm').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('danger-input'), 'CHANGE');
    await fireEvent.press(screen.getByTestId('danger-confirm'));
    expect(writeConfig).toHaveBeenCalledWith('flag', 'make_hrfm_visible', '1');
  });

  it('writes from the keyboard Done key once the word matches', async () => {
    const writeConfig = jest.fn(async () => true);
    const bandActions = { ...fixtureBandActions(), writeConfig };
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON, { bandActions })));
    await fireEvent.press(screen.getByTestId('config-change-enable_rfid'));
    expect(screen.getByText('Type the word')).toBeTruthy();
    await fireEvent(screen.getByTestId('danger-input'), 'submitEditing');
    expect(writeConfig).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('danger-input'), 'CHANGE');
    await fireEvent(screen.getByTestId('danger-input'), 'submitEditing');
    expect(writeConfig).toHaveBeenCalledWith('config', 'enable_rfid', '1');
  });

  it('marks a value changed here and puts it back in one tap', async () => {
    const restoreConfig = jest.fn(async () => true);
    const bandActions = { ...fixtureBandActions(), restoreConfig };
    const changed = applyConfigWrite(parsedSnapshot(), 'config', 'enable_rfid', '2', '1', NOW_S);
    await render(withAppData(<BandConfigScreen />, 'en', appData(serializeSnapshot(changed), { bandActions })));
    expect(screen.getByText('Changed here, was 2')).toBeTruthy();
    expect(screen.queryByTestId('config-change-enable_rfid')).toBeNull();
    await fireEvent.press(screen.getByTestId('config-restore-enable_rfid'));
    expect(restoreConfig).toHaveBeenCalledWith('config', 'enable_rfid');
  });

  it('labels the flag count as flags read and names what the hero counts', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(screen.getByTestId('config-flags-count')).toHaveTextContent('3 of 16 read');
    expect(screen.getByTestId('config-summary')).toHaveTextContent('3 of 3 values unchanged by OpenHoop');
    expect(screen.getByTestId('config-summary-explained')).toHaveTextContent(/^Counts the 3 values OpenHoop can change/);
  });

  it('lines the change link up with the flag name', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(StyleSheet.flatten(screen.getByTestId('config-change-make_hrfm_visible').props.style).paddingHorizontal).toBe(0);
  });

  it('counts the values OpenHoop left unchanged and marks each one', async () => {
    const changed = applyConfigWrite(parsedSnapshot(), 'flag', 'make_hrfm_visible', '2', '1', NOW_S - 60);
    await render(withAppData(<BandConfigScreen />, 'en', appData(serializeSnapshot(changed))));
    expect(screen.getByTestId('config-summary').props.children).toBe('2 of 3 values unchanged by OpenHoop');
    expect(screen.getByTestId('config-unchanged-enable_r22_v4_packets')).toBeTruthy();
    expect(screen.queryByTestId('config-unchanged-make_hrfm_visible')).toBeNull();
    expect(screen.getByTestId('config-changed-make_hrfm_visible')).toBeTruthy();
    expect(screen.getByTestId('snapshot-read')).toBeTruthy();
    expect(screen.getByTestId('snapshot-make_hrfm_visible')).toBeTruthy();
  });

  it('puts back every changed value, one key at a time, after the word is typed', async () => {
    const restoreConfig = jest.fn(async () => true);
    const bandActions = { ...fixtureBandActions(), restoreConfig };
    const changed = applyConfigWrite(applyConfigWrite(parsedSnapshot(), 'flag', 'make_hrfm_visible', '2', '1', NOW_S - 60), 'config', 'enable_rfid', '2', '1', NOW_S - 30);
    await render(withAppData(<BandConfigScreen />, 'en', appData(serializeSnapshot(changed), { bandActions })));
    await fireEvent.press(screen.getByTestId('put-back-all'));
    expect(screen.getByText(/make_hrfm_visible, enable_rfid/)).toBeTruthy();
    expect(restoreConfig).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('danger-input'), 'CHANGE');
    await fireEvent.press(screen.getByTestId('danger-confirm'));
    await waitFor(() => expect(restoreConfig).toHaveBeenCalledTimes(2));
    expect(restoreConfig).toHaveBeenNthCalledWith(1, 'flag', 'make_hrfm_visible');
    expect(restoreConfig).toHaveBeenNthCalledWith(2, 'config', 'enable_rfid');
  });

  it('reports a partial put-back when one write fails', async () => {
    const restoreConfig = jest.fn(async (_kind: string, key: string) => key !== 'enable_rfid');
    const bandActions = { ...fixtureBandActions(), restoreConfig };
    const changed = applyConfigWrite(applyConfigWrite(parsedSnapshot(), 'flag', 'make_hrfm_visible', '2', '1', NOW_S - 60), 'config', 'enable_rfid', '2', '1', NOW_S - 30);
    await render(withAppData(<BandConfigScreen />, 'en', appData(serializeSnapshot(changed), { bandActions })));
    await fireEvent.press(screen.getByTestId('put-back-all'));
    await fireEvent.changeText(screen.getByTestId('danger-input'), 'CHANGE');
    await fireEvent.press(screen.getByTestId('danger-confirm'));
    expect(await screen.findByText('Put back 1 of 2. The rest still have the value OpenHoop wrote.')).toBeTruthy();
  });

  it('puts one value back from its snapshot only after confirming', async () => {
    const restoreConfig = jest.fn(async () => true);
    const bandActions = { ...fixtureBandActions(), restoreConfig };
    const changed = applyConfigWrite(parsedSnapshot(), 'config', 'enable_rfid', '2', '1', NOW_S - 30);
    await render(withAppData(<BandConfigScreen />, 'en', appData(serializeSnapshot(changed), { bandActions })));
    await fireEvent.press(screen.getByTestId('snapshot-enable_rfid'));
    expect(restoreConfig).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('danger-input'), 'CHANGE');
    await fireEvent.press(screen.getByTestId('danger-confirm'));
    await waitFor(() => expect(restoreConfig).toHaveBeenCalledWith('config', 'enable_rfid'));
  });

  it('keeps Put back off when nothing was changed', async () => {
    await render(withAppData(<BandConfigScreen />, 'en', appData(SNAPSHOT_JSON)));
    expect(screen.getByTestId('put-back-all').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('put-back-none')).toBeTruthy();
  });

  it('renders in Dutch', async () => {
    await render(withAppData(<BandConfigScreen />, 'nl', appData(SNAPSHOT_JSON)));
    expect(screen.getByText('R22-pakketten, v4')).toBeTruthy();
    expect(screen.getByText('Aan')).toBeTruthy();
    expect(screen.getByText('Overige velden')).toBeTruthy();
    expect(screen.queryByText('Niet geverifieerd')).toBeNull();
  });
});
