import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import BodyScreen from '@/app/onboarding/body';
import PairConnectedScreen from '@/app/onboarding/connected';
import GoalsScreen from '@/app/onboarding/goals';
import WelcomeScreen from '@/app/onboarding/index';
import OfficialAppScreen from '@/app/onboarding/official-app';
import PairScanScreen from '@/app/onboarding/pair';
import PermissionsScreen from '@/app/onboarding/permissions';
import ProfileScreen from '@/app/onboarding/profile';
import { defaultHealthConnectState } from '@/data/healthConnectState';
import { HC_EXPORT_TYPES } from '@/lib/healthConnectMapping';

import { fixtureAppData, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

let mockParams: Record<string, string> = {};

interface MockPermission {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

const mockGetLocation = jest.fn(async (): Promise<MockPermission> => ({ granted: false, canAskAgain: true, status: 'undetermined' }));
const mockRequestLocation = jest.fn(async (): Promise<MockPermission> => ({ granted: true, canAskAgain: true, status: 'granted' }));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: () => mockGetLocation(),
  requestForegroundPermissionsAsync: () => mockRequestLocation(),
}));

jest.mock('@openhoop/core', () => ({
  DisconnectedError: class DisconnectedError extends Error {},
  CommandTimeoutError: class CommandTimeoutError extends Error {},
  CommandFailedError: class CommandFailedError extends Error {},
  OwnerSinceRequiredError: class OwnerSinceRequiredError extends Error {},
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('Welcome (A1)', () => {
  it('shows the mockup chips, the first of three steps and all three ways in', async () => {
    await render(withAppData(<WelcomeScreen />));
    expect(screen.getByTestId('onboarding-dots').props.accessibilityLabel).toBe('About you, step 1 of 3');
    expect(screen.getByText('Works with 5.0 and MG')).toBeTruthy();
    expect(screen.getByText('Open source')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('welcome-start'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/profile');
    expect(screen.getByTestId('welcome-have-data')).toBeTruthy();
    expect(screen.getByTestId('welcome-demo')).toBeTruthy();
  });
});

describe('Profile (A2)', () => {
  it('saves the trimmed name and shows the optional account honestly as not built', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<ProfileScreen />, 'en', { updateUserData }));
    expect(screen.getByTestId('onboarding-dots').props.accessibilityLabel).toBe('About you, step 2 of 3');
    expect(screen.getByTestId('account-not-built')).toHaveTextContent('Not built yet');
    expect(screen.queryByRole('switch')).toBeNull();
    await fireEvent.press(screen.getByTestId('account-row'));
    expect(openURL).toHaveBeenCalledWith('https://github.com/DarioDML/OpenHoop/issues/28');
    expect(screen.getByTestId('privacy-promise')).toHaveTextContent(/No telemetry, no ads, no tracking/);
    await fireEvent.changeText(screen.getByTestId('name-input'), '  Alex  ');
    await fireEvent.press(screen.getByTestId('onboarding-primary'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/body'));
    expect(updateUserData).toHaveBeenCalledWith({ name: 'Alex' });
    openURL.mockRestore();
  });
});

describe('Body (A3)', () => {
  it('switches units, converting the typed values and writing the setting', async () => {
    const base = fixtureAppData();
    const updateSettings = jest.fn(async () => undefined);
    await render(
      withAppData(<BodyScreen />, 'en', { updateSettings, settings: { ...base.settings, units: 'metric' }, userData: { ...base.userData, heightCm: 180, weightKg: 80 } }),
    );
    expect(screen.getByTestId('height-input').props.value).toBe('180');
    await fireEvent.press(screen.getByTestId('units-imperial'));
    expect(updateSettings).toHaveBeenCalledWith({ units: 'imperial' });
    expect(screen.getByTestId('height-input').props.value).toBe('70.9');
    expect(screen.getByTestId('weight-input').props.value).toBe('176.4');
    expect(screen.getByText('lb')).toBeTruthy();
  });

  it('stores the full birth date, sex and measures in metric', async () => {
    const base = fixtureAppData();
    const updateProfile = jest.fn(async () => undefined);
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<BodyScreen />, 'en', { updateProfile, updateUserData, settings: { ...base.settings, units: 'imperial' } }));
    await fireEvent.changeText(screen.getByTestId('height-input'), '70');
    await fireEvent.changeText(screen.getByTestId('weight-input'), '176');
    await fireEvent.changeText(screen.getByTestId('birth-day-input'), '14');
    await fireEvent.changeText(screen.getByTestId('birth-month-input'), '03');
    await fireEvent.changeText(screen.getByTestId('birth-year-input'), '2003');
    await fireEvent.press(screen.getByTestId('sex-female'));
    expect(screen.getByTestId('max-hr-input')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('onboarding-primary'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/goals'));
    expect(updateProfile).toHaveBeenCalledWith({ birthYear: 2003, birthDate: '2003-03-14', maxHeartRate: null });
    expect(updateUserData).toHaveBeenCalledWith({ heightCm: 177.8, weightKg: 79.83, sex: 'female' });
  });

  it('keeps "prefer not to say" as no stored sex and keeps the other option', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<BodyScreen />, 'en', { updateUserData }));
    expect(screen.getByTestId('sex-other')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sex-none'));
    await fireEvent.press(screen.getByTestId('onboarding-primary'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ sex: null })));
  });

  it('rejects a date that does not exist', async () => {
    const updateProfile = jest.fn(async () => undefined);
    await render(withAppData(<BodyScreen />, 'en', { updateProfile }));
    await fireEvent.changeText(screen.getByTestId('birth-day-input'), '31');
    await fireEvent.changeText(screen.getByTestId('birth-month-input'), '02');
    await fireEvent.changeText(screen.getByTestId('birth-year-input'), '2000');
    await fireEvent.press(screen.getByTestId('onboarding-primary'));
    expect(await screen.findByTestId('body-invalid')).toHaveTextContent(/a real birth date/);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

describe('Goals (A4)', () => {
  it('offers the mockup goals as check pills next to the existing ones and saves the picks', async () => {
    const base = fixtureAppData();
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<GoalsScreen />, 'en', { updateUserData, userData: { ...base.userData, goals: ['sleep'] } }));
    for (const goal of ['performance', 'sleep', 'longevity', 'stress', 'strength', 'cycle', 'recovery', 'fitness', 'health']) {
      expect(screen.getByTestId(`goal-${goal}`)).toBeTruthy();
    }
    expect(screen.getByTestId('goal-sleep').props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByTestId('goal-longevity'));
    await fireEvent.press(screen.getByTestId('goal-cycle'));
    await fireEvent.press(screen.getByTestId('goal-sleep'));
    expect(screen.getByTestId('goal-longevity').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('goals-control')).toHaveTextContent(/You stay in control/);
    await fireEvent.press(screen.getByTestId('onboarding-primary'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/permissions'));
    expect(updateUserData).toHaveBeenCalledWith({ goals: ['longevity', 'cycle'] });
  });
});

describe('Permissions (A5)', () => {
  it('switches Health Connect on for measured values through one permission request', async () => {
    const setHealthConnectTypes = jest.fn(async () => true);
    await render(withAppData(<PermissionsScreen />, 'en', { setHealthConnectTypes }));
    expect(screen.getByTestId('permission-bluetooth')).toHaveTextContent(/Required/);
    await fireEvent(screen.getByTestId('permission-health-connect-toggle'), 'valueChange', true);
    expect(setHealthConnectTypes).toHaveBeenCalledWith(HC_EXPORT_TYPES, true);
  });

  it('says which permissions Health Connect left out', async () => {
    const base = fixtureAppData();
    const state = { ...defaultHealthConnectState(), export: { ...defaultHealthConnectState().export, heartRate: true } };
    await render(withAppData(<PermissionsScreen />, 'en', { healthConnect: { ...base.healthConnect, state, granted: [] } }));
    expect(screen.getByTestId('permission-health-connect-toggle').props.value).toBe(true);
    expect(screen.getByTestId('permission-health-connect-missing')).toBeTruthy();
  });

  it('offers to install Health Connect when it is missing', async () => {
    const base = fixtureAppData();
    const installHealthConnect = jest.fn(async () => undefined);
    await render(withAppData(<PermissionsScreen />, 'en', { installHealthConnect, healthConnect: { ...base.healthConnect, availability: 'not-installed' } }));
    expect(screen.queryByTestId('permission-health-connect-toggle')).toBeNull();
    await fireEvent.press(screen.getByTestId('permission-health-connect-install'));
    expect(installHealthConnect).toHaveBeenCalled();
  });

  it('stays honest on phones without Health Connect', async () => {
    const base = fixtureAppData();
    await render(withAppData(<PermissionsScreen />, 'en', { healthConnect: { ...base.healthConnect, availability: 'unsupported' } }));
    expect(screen.getByTestId('permission-health-connect')).toHaveTextContent(/Android only/);
  });

  it('asks for location when the switch goes on', async () => {
    await render(withAppData(<PermissionsScreen />));
    await waitFor(() => expect(mockGetLocation).toHaveBeenCalled());
    expect(screen.getByTestId('permission-location-toggle').props.value).toBe(false);
    await fireEvent(screen.getByTestId('permission-location-toggle'), 'valueChange', true);
    await waitFor(() => expect(screen.getByTestId('permission-location-toggle').props.value).toBe(true));
    expect(mockRequestLocation).toHaveBeenCalled();
    expect(screen.getByTestId('permission-location-revoke')).toBeTruthy();
  });

  it('points to the phone settings when location is blocked', async () => {
    mockGetLocation.mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied' });
    await render(withAppData(<PermissionsScreen />));
    expect(await screen.findByTestId('permission-location-blocked')).toBeTruthy();
  });
});

describe('Official app (A11)', () => {
  it('stores the radio choice and shows the guidance for it', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<OfficialAppScreen />, 'en', { updateUserData }));
    expect(screen.getByTestId('onboarding-dots').props.accessibilityLabel).toBe('Your band, step 1 of 4');
    expect(screen.getByTestId('official-only').props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(screen.getByTestId('official-guide')).toHaveTextContent(/Before you pair/);
    await fireEvent.press(screen.getByTestId('official-switch'));
    expect(updateUserData).toHaveBeenCalledWith({ officialAppMode: 'switch' });
    expect(screen.getByTestId('official-guide')).toHaveTextContent(/Switching back later/);
    expect(screen.getByTestId('official-firmware')).toHaveTextContent(/update firmware there/);
    expect(screen.getByTestId('official-firmware-note')).toHaveTextContent('Reading the band was checked on firmware 50.43.2.0 (MG). Your band last reported 50.36.2.0.');
    await fireEvent.press(screen.getByTestId('onboarding-primary'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/pair'));
  });

  it('remembers an earlier choice', async () => {
    const base = fixtureAppData();
    await render(withAppData(<OfficialAppScreen />, 'en', { userData: { ...base.userData, officialAppMode: 'switch' }, device: { ...base.device, firmware: null } }));
    expect(screen.getByTestId('official-switch').props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(screen.getByTestId('official-firmware-note')).toHaveTextContent(/Setup records the version/);
  });
});

describe('Pair scan (A6)', () => {
  const BANDS = [
    { id: 'AA:BB:CC:DD:EE:19', name: 'WHOOP MG', rssi: -71 },
    { id: '5B:01:3C:44:91:A7', name: 'WHOOP 5.0', rssi: -48 },
    { id: 'C0:FF:EE:00:00:01', name: 'WHOOP 5.0', rssi: 0 },
  ];

  it('lists found bands strongest first with their signal and a Pair button each', async () => {
    const scan = jest.fn(async () => BANDS);
    await render(withAppData(<PairScanScreen />, 'en', { scan }));
    expect(screen.getByTestId('pair-illustration')).toBeTruthy();
    expect(screen.getByTestId('scan-button')).toHaveTextContent(/Search for bands/i);
    await fireEvent.press(screen.getByTestId('scan-button'));
    await waitFor(() => expect(screen.getByTestId('band-row-5B:01:3C:44:91:A7')).toBeTruthy());
    expect(screen.getByTestId('band-row-5B:01:3C:44:91:A7')).toHaveTextContent(/5B01…A7 · strong signal \(-48 dBm\)/);
    expect(screen.getByTestId('band-row-AA:BB:CC:DD:EE:19')).toHaveTextContent(/AABB…19 · medium signal \(-71 dBm\)/);
    expect(screen.getByTestId('band-row-C0:FF:EE:00:00:01')).toHaveTextContent(/C0FF…01 · signal unknown/);
    expect(screen.getAllByText('Pair')).toHaveLength(3);
    expect(screen.getByTestId('scan-button')).toHaveTextContent(/Scan again/i);
  });

  it('asks since when the band was worn, then pairs and opens the connected screen with the signal', async () => {
    const pair = jest.fn(async () => undefined);
    await render(withAppData(<PairScanScreen />, 'en', { scan: async () => BANDS, pair }));
    await fireEvent.press(screen.getByTestId('scan-button'));
    await fireEvent.press(await screen.findByTestId('pair-5B:01:3C:44:91:A7'));
    expect(screen.getByTestId('since-warning')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('since-input'), '2026-11-01');
    await fireEvent.press(screen.getByTestId('bond-button'));
    await waitFor(() => expect(pair).toHaveBeenCalledWith('5B:01:3C:44:91:A7', '2026-11-01'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/onboarding/connected', params: { id: '5B:01:3C:44:91:A7', rssi: '-48' } });
  });

  it('keeps the demo band, the help and the other-app note, with the switch guidance when chosen', async () => {
    const base = fixtureAppData();
    const updateSettings = jest.fn(async () => undefined);
    await render(withAppData(<PairScanScreen />, 'en', { updateSettings, userData: { ...base.userData, officialAppMode: 'switch' } }));
    expect(screen.getByTestId('pair-other-app')).toHaveTextContent(/Paired to another app\?/);
    expect(screen.getByTestId('pair-switch-note')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pair-help'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/official-app');
    await fireEvent.press(screen.getByTestId('pair-demo'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding/setup'));
    expect(updateSettings).toHaveBeenCalledWith({ dataSource: 'demo' });
  });

  it('says when no band was found', async () => {
    await render(withAppData(<PairScanScreen />));
    await fireEvent.press(screen.getByTestId('scan-button'));
    expect(await screen.findByTestId('pair-none')).toBeTruthy();
  });
});

describe('Pair connected (A7)', () => {
  it('shows the success line and the band facts as tiles, with the signal from pairing', async () => {
    mockParams = { id: '5B:01:3C:44:91:A7', rssi: '-48' };
    await render(withAppData(<PairConnectedScreen />));
    expect(screen.getByTestId('connected-success')).toHaveTextContent('Demoband · 5B01…A7 connected');
    expect(screen.getByTestId('fact-model-value')).toHaveTextContent('5.0');
    expect(screen.getByTestId('fact-battery-value')).toHaveTextContent(/72/);
    expect(screen.getByTestId('fact-firmware-value')).toHaveTextContent('50.36.2.0');
    expect(screen.getByTestId('fact-firmware-chip')).toHaveTextContent('Logged');
    expect(screen.getByTestId('fact-signal-value')).toHaveTextContent(/-48/);
    expect(screen.getByTestId('fact-lock')).toBeTruthy();
    expect(screen.getByTestId('connected-read-only')).toBeTruthy();
  });

  it('says when the signal is not known and keeps the locked-band warning', async () => {
    const base = fixtureAppData();
    await render(withAppData(<PairConnectedScreen />, 'en', { device: { ...base.device, lockState: 'locked' } }));
    expect(screen.getByTestId('fact-signal-missing')).toHaveTextContent('Unknown');
    expect(screen.getByTestId('connected-locked')).toBeTruthy();
  });
});
