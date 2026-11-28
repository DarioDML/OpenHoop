import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import WelcomeScreen from '@/app/onboarding/index';
import BodyScreen from '@/app/onboarding/body';
import ProfileScreen from '@/app/onboarding/profile';

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
