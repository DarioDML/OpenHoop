import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createFixtureDevice } from '@/data/fixtureSource';
import { pickDeviceState } from '@/ui/manage/deviceState';
import { checkMeasure, checkProfile, defaultMaxHr } from '@/ui/manage/validation';
import { PARITY } from '@/ui/parity';

import { FIXTURE_NOW, fixtureAppData, withAppData } from './support/appData';

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

jest.mock('@/selftest/runSelfTest', () => ({ runSelfTest: async () => [] }));

import CommunityScreen from '@/app/(tabs)/community';
import MoreScreen from '@/app/(tabs)/more';
import CalibrationScreen from '@/app/onboarding/calibration';
import WelcomeScreen from '@/app/onboarding/index';
import AboutScreen from '@/app/settings/about';
import AccuracyScreen from '@/app/settings/accuracy';
import AppSettingsScreen from '@/app/settings/app';
import BandConfigScreen from '@/app/settings/band-config';
import BatteryPackScreen from '@/app/settings/battery-pack';
import ConnectProviderScreen from '@/app/settings/connect-provider';
import DeviceSettingsScreen from '@/app/settings/device';
import ImportExportScreen from '@/app/settings/import';
import IntegrationsScreen from '@/app/settings/integrations';
import PrivacyScreen from '@/app/settings/privacy';
import SafetyLockScreen from '@/app/settings/safety-lock';
import StatesGalleryScreen from '@/app/settings/states';
import SupportScreen from '@/app/settings/support';

const NOW_S = Math.floor(FIXTURE_NOW.getTime() / 1000);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('More', () => {
  it('shows the real device model and battery, and a neutral profile row without a name', async () => {
    const device = createFixtureDevice(FIXTURE_NOW);
    await render(withAppData(<MoreScreen />));
    expect(screen.getByTestId('more-device')).toBeTruthy();
    if (device.model !== null) expect(screen.getByText(new RegExp(device.model))).toBeTruthy();
    expect(screen.getByText('Your profile')).toBeTruthy();
    expect(screen.queryByText('Dario')).toBeNull();
  });

  it('greets by the stored name', async () => {
    const base = fixtureAppData();
    await render(withAppData(<MoreScreen />, 'en', { userData: { ...base.userData, name: 'Alex' } }));
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('shows no device value when nothing is known', async () => {
    const base = fixtureAppData();
    await render(withAppData(<MoreScreen />, 'en', { device: { ...base.device, model: null, batteryPercent: null } }));
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

describe('Device settings', () => {
  it('syncs and links to pairing', async () => {
    const sync = jest.fn(async () => undefined);
    await render(withAppData(<DeviceSettingsScreen />, 'en', { sync }));
    await fireEvent.press(screen.getByTestId('sync-button'));
    expect(sync).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('pair-link'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/pair');
    await fireEvent.press(screen.getByTestId('danger-entry'));
    expect(router.push).toHaveBeenCalledWith('/settings/safety-lock');
  });

  it('shows the locked card for a locked band', async () => {
    const base = fixtureAppData();
    await render(withAppData(<DeviceSettingsScreen />, 'en', { device: { ...base.device, lockState: 'locked' } }));
    expect(screen.getByText('The band is withholding its data')).toBeTruthy();
  });
});

describe('Safety lock', () => {
  it('keeps confirm disabled until the command is typed', async () => {
    await render(withAppData(<SafetyLockScreen />));
    await fireEvent.press(screen.getByTestId('safety-entry'));
    const confirm = screen.getByTestId('danger-confirm');
    expect(confirm.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('danger-input'), 'ERASE');
    expect(screen.getByTestId('danger-confirm').props.accessibilityState.disabled).toBe(false);
  });
});

describe('Not built screens', () => {
  it.each([
    ['band-config', BandConfigScreen, 'not-built-bandConfig'],
    ['battery-pack', BatteryPackScreen, 'not-built-battery'],
    ['import', ImportExportScreen, 'not-built-import'],
    ['integrations', IntegrationsScreen, 'not-built-integrations'],
    ['connect-provider', ConnectProviderScreen, 'not-built-integrations'],
    ['community', CommunityScreen, 'not-built-community'],
  ])('%s shows the not built notice', async (_name, Screen, testID) => {
    await render(withAppData(<Screen />));
    expect(screen.getByTestId(testID)).toBeTruthy();
  });
});

describe('App settings', () => {
  it('switches language and stores notification preferences', async () => {
    const updateSettings = jest.fn(async () => undefined);
    const updateUserData = jest.fn(async () => undefined);
    await render(withAppData(<AppSettingsScreen />, 'en', { updateSettings, updateUserData }));
    await fireEvent.press(screen.getByText('Nederlands'));
    expect(updateSettings).toHaveBeenCalledWith({ language: 'nl' });
    fireEvent(screen.getByTestId('toggle-morning-digest'), 'valueChange', false);
    expect(updateUserData).toHaveBeenCalledWith({
      notifications: { morningDigest: false, syncProblems: true, quietStart: '22:00', quietEnd: '07:00' },
    });
    expect(screen.getByTestId('not-built-notifications')).toBeTruthy();
  });
});

describe('Data and privacy', () => {
  it('exports on request', async () => {
    const exportData = jest.fn(async () => undefined);
    await render(withAppData(<PrivacyScreen />, 'en', { exportData }));
    await fireEvent.press(screen.getByTestId('export-button'));
    await waitFor(() => expect(exportData).toHaveBeenCalled());
  });

  it('rejects an invalid owner-since date and saves an earlier one without a prompt', async () => {
    const updateSettings = jest.fn(async () => undefined);
    const base = fixtureAppData();
    await render(withAppData(<PrivacyScreen />, 'en', { updateSettings, settings: { ...base.settings, ownerSince: '2026-05-01' } }));
    await fireEvent.changeText(screen.getByTestId('owner-since-input'), '2026-13-40');
    await fireEvent.press(screen.getByTestId('owner-since-save'));
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid date that is not in the future.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('owner-since-input'), '2026-04-01');
    await fireEvent.press(screen.getByTestId('owner-since-save'));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ ownerSince: '2026-04-01' }));
  });
});

describe('About, accuracy and support', () => {
  it('shows the app version from the config', async () => {
    await render(withAppData(<AboutScreen />));
    expect(screen.getByText('Version 1.2.3')).toBeTruthy();
    expect(screen.getAllByText(/not a medical device/i).length).toBeGreaterThan(0);
  });

  it('lists every parity value as not measured, with no invented numbers', async () => {
    await render(withAppData(<AccuracyScreen />));
    for (const key of Object.keys(PARITY)) expect(screen.getByTestId(`accuracy-${key}`)).toBeTruthy();
    expect(screen.getAllByText('Not measured yet').length).toBeGreaterThanOrEqual(Object.keys(PARITY).length);
    expect(screen.queryByText(/±/)).toBeNull();
  });

  it('has no payment links on the support page', async () => {
    await render(withAppData(<SupportScreen />));
    expect(screen.getByTestId('support-repo')).toBeTruthy();
    expect(screen.queryByText(/€|donate|paypal/i)).toBeNull();
  });
});

describe('System states', () => {
  it('shows every example state labelled as an example', async () => {
    await render(withAppData(<StatesGalleryScreen />));
    for (const id of ['notConnected', 'syncing', 'lowBattery', 'charging', 'calibrating', 'noData', 'needsMg', 'offline', 'dataAtRisk', 'firstDay']) {
      expect(screen.getByTestId(`state-example-${id}`)).toBeTruthy();
    }
    expect(screen.getAllByText('Example')).toHaveLength(10);
  });

  it('picks the right device state', () => {
    const device = createFixtureDevice(FIXTURE_NOW);
    const days = fixtureAppData().days;
    const base = { device: { ...device, connection: 'connected' as const, batteryPercent: 80, lastSyncAt: NOW_S - 60 }, days, syncProgress: null, nowS: NOW_S };
    expect(pickDeviceState(base)).toBeNull();
    expect(pickDeviceState({ ...base, device: { ...base.device, lastSyncAt: NOW_S - 8 * 86400 } })).toBe('dataAtRisk');
    expect(pickDeviceState({ ...base, device: { ...base.device, batteryPercent: 10 } })).toBe('lowBattery');
    expect(pickDeviceState({ ...base, device: { ...base.device, lastSyncAt: null }, days: [] })).toBe('notConnected');
    expect(pickDeviceState({ ...base, days: days.slice(0, 1) })).toBe('firstDay');
    expect(pickDeviceState({ ...base, device: { ...base.device, connection: 'syncing' } })).toBe('syncing');
  });
});

describe('Onboarding', () => {
  it('lets the demo band finish the flow from the welcome screen', async () => {
    const updateSettings = jest.fn(async () => undefined);
    const updateUserData = jest.fn(async () => undefined);
    await render(withAppData(<WelcomeScreen />, 'en', { updateSettings, updateUserData }));
    await fireEvent.press(screen.getByTestId('welcome-demo'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(updateSettings).toHaveBeenCalledWith({ dataSource: 'demo' });
    expect(updateUserData).toHaveBeenCalledWith({ onboardingDone: true });
  });

  it('marks onboarding done on the calibration screen', async () => {
    const updateUserData = jest.fn(async () => undefined);
    await render(withAppData(<CalibrationScreen />, 'en', { updateUserData }));
    await fireEvent.press(screen.getByTestId('calibration-finish'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(updateUserData).toHaveBeenCalledWith({ onboardingDone: true });
  });
});

describe('Body validation', () => {
  it('validates birth year and max heart rate', () => {
    expect(checkProfile('1990', '185', 2026)).toEqual({ ok: true, birthYear: 1990, maxHeartRate: 185 });
    expect(checkProfile('', '', 2026)).toEqual({ ok: true, birthYear: null, maxHeartRate: null });
    expect(checkProfile('1800', '', 2026).ok).toBe(false);
    expect(checkProfile('2090', '', 2026).ok).toBe(false);
    expect(checkProfile('1990', '300', 2026).ok).toBe(false);
    expect(checkProfile('abc', '', 2026).ok).toBe(false);
    expect(defaultMaxHr('1990', 2026)).toBe(183);
    expect(defaultMaxHr('', 2026)).toBeNull();
  });

  it('validates body measures', () => {
    expect(checkMeasure('180,5', { min: 80, max: 250 })).toEqual({ ok: true, value: 180.5 });
    expect(checkMeasure('', { min: 80, max: 250 })).toEqual({ ok: true, value: null });
    expect(checkMeasure('30', { min: 80, max: 250 }).ok).toBe(false);
    expect(checkMeasure('1e5', { min: 80, max: 250 }).ok).toBe(false);
  });
});
