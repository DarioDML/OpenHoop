import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createFixtureSettings } from '@/data/fixtureSource';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import EditProfileScreen from '@/app/profile/edit';

describe('edit profile', () => {
  it('saves a full birth date, resting heart rate and goals', async () => {
    const updateProfile = jest.fn(async () => undefined);
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<EditProfileScreen />, 'en', { updateProfile, updateUserData }));
    await fireEvent.changeText(screen.getByTestId('profile-birth-day'), '15');
    await fireEvent.changeText(screen.getByTestId('profile-birth-month'), '6');
    await fireEvent.changeText(screen.getByTestId('profile-birth-input'), '1990');
    await fireEvent.changeText(screen.getByTestId('profile-resthr-input'), '55');
    await fireEvent.press(screen.getByTestId('profile-goal-sleep'));
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ birthYear: 1990, birthDate: '1990-06-15', maxHeartRate: null, restingHeartRate: 55, zoneMode: 'auto', zoneFloors: null }),
    );
    expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ goals: ['sleep'] }));
    expect(screen.getByTestId('profile-saved')).toBeTruthy();
  });

  it('rejects half a birth date', async () => {
    const updateProfile = jest.fn(async () => undefined);
    await render(withAppData(<EditProfileScreen />, 'en', { updateProfile }));
    await fireEvent.changeText(screen.getByTestId('profile-birth-day'), '15');
    await fireEvent.changeText(screen.getByTestId('profile-birth-input'), '1990');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(screen.getByTestId('profile-invalid')).toBeTruthy());
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('shows auto zones from the entered heart rates', async () => {
    await render(withAppData(<EditProfileScreen />));
    await fireEvent.changeText(screen.getByTestId('profile-maxhr-input'), '195');
    await fireEvent.changeText(screen.getByTestId('profile-resthr-input'), '63');
    expect(screen.getByTestId('zone-range-5')).toHaveTextContent('182–195 bpm');
    expect(screen.getByTestId('zone-range-1')).toHaveTextContent('116–142 bpm');
    expect(screen.getByText('90–100% HRR')).toBeTruthy();
  });

  it('edits custom zones and checks them before saving', async () => {
    const updateProfile = jest.fn(async () => undefined);
    await render(withAppData(<EditProfileScreen />, 'en', { updateProfile, profile: { birthYear: null, maxHeartRate: 195, restingHeartRate: 63 } }));
    await fireEvent.press(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.getByTestId('zone-floor-5').props.value).toBe('182');
    await fireEvent.changeText(screen.getByTestId('zone-floor-3'), '200');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(screen.getByTestId('profile-zones-invalid')).toBeTruthy());
    expect(updateProfile).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('zone-floor-3'), '150');
    expect(screen.getByTestId('zone-range-2')).toHaveTextContent('143–149 bpm');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ zoneMode: 'custom', zoneFloors: [116, 143, 150, 169, 182] })));
  });

  it('edits height and weight in imperial units without drifting', async () => {
    const updateUserData = jest.fn(async () => true);
    const settings = { ...createFixtureSettings('en', FIXTURE_NOW), units: 'imperial' as const };
    await render(withAppData(<EditProfileScreen />, 'en', { updateUserData, settings, userData: { ...defaultUserData(), heightCm: 180, weightKg: 72.5 } }));
    expect(screen.getByTestId('profile-height-input').props.value).toBe('71');
    expect(screen.getByTestId('profile-weight-input').props.value).toBe('159.8');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith(expect.objectContaining({ heightCm: 180, weightKg: 72.5 })));
    await fireEvent.changeText(screen.getByTestId('profile-weight-input'), '165');
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(updateUserData).toHaveBeenLastCalledWith(expect.objectContaining({ heightCm: 180, weightKg: 74.84 })));
  });
});
