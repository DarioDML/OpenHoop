import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import WelcomeScreen from '@/app/onboarding/index';
import ProfileScreen from '@/app/onboarding/profile';

import { withAppData } from './support/appData';

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
