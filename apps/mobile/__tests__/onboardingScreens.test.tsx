import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import WelcomeScreen from '@/app/onboarding/index';
import BodyScreen from '@/app/onboarding/body';
import GoalsScreen from '@/app/onboarding/goals';
import PermissionsScreen from '@/app/onboarding/permissions';
import ProfileScreen from '@/app/onboarding/profile';

import { defaultHealthConnectState } from '@/data/healthConnectState';
import { HC_EXPORT_TYPES } from '@/lib/healthConnectMapping';

import { fixtureAppData, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  jest.clearAllMocks();
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
