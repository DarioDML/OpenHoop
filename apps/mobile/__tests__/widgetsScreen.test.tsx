import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as AndroidWidget from 'react-native-android-widget';

import WidgetsScreen from '@/app/home/widgets';
import { defaultUserData } from '@/data/userData';

import { withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-android-widget', () => ({
  requestPinWidget: jest.fn(async () => true),
}));

const mocked = jest.mocked(AndroidWidget);

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('widgets screen on Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('previews both widgets from the current values and explains what is stored', async () => {
    await render(withAppData(<WidgetsScreen />));
    expect(screen.getByTestId('widget-preview-OpenHoopScores')).toBeTruthy();
    expect(screen.getByTestId('widget-preview-OpenHoopOverview-restingHr')).toBeTruthy();
    expect(screen.getByTestId('widgets-how')).toBeTruthy();
    expect(screen.getByTestId('widgets-privacy')).toBeTruthy();
    expect(screen.queryByTestId('widgets-android-only')).toBeNull();
    expect(screen.queryByTestId('not-built-widgets')).toBeNull();
  });

  it('turns widget values off', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<WidgetsScreen />, 'en', { updateUserData }));
    await fireEvent(screen.getByTestId('widgets-values-toggle'), 'valueChange', false);
    expect(updateUserData).toHaveBeenCalledWith({ widgetValues: false });
  });

  it('shows no numbers in the preview when values are off', async () => {
    await render(withAppData(<WidgetsScreen />, 'nl', { userData: { ...defaultUserData(), onboardingDone: true, widgetValues: false } }));
    expect(screen.getAllByText('Waarden staan uit').length).toBe(2);
    expect(screen.queryByTestId('widget-preview-OpenHoopScores-readiness')).toBeNull();
  });

  it('asks the launcher to pin a widget and refreshes it', async () => {
    const refreshWidgets = jest.fn(async () => undefined);
    await render(withAppData(<WidgetsScreen />, 'en', { refreshWidgets }));
    await fireEvent.press(screen.getByTestId('widget-pin-OpenHoopOverview'));
    expect(mocked.requestPinWidget).toHaveBeenCalledWith({ widgetName: 'OpenHoopOverview' });
    expect(refreshWidgets).toHaveBeenCalledTimes(1);
  });

  it('explains how to add it when the launcher cannot pin', async () => {
    mocked.requestPinWidget.mockResolvedValueOnce(false);
    await render(withAppData(<WidgetsScreen />));
    await fireEvent.press(screen.getByTestId('widget-pin-OpenHoopScores'));
    expect(screen.getByText(/Your launcher did not add the widget/)).toBeTruthy();
  });
});

describe('widgets screen on iOS', () => {
  it('says widgets are Android only and offers no pin or toggle', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(withAppData(<WidgetsScreen />, 'nl'));
    expect(screen.getByTestId('widgets-android-only')).toBeTruthy();
    expect(screen.queryByTestId('widget-pin-OpenHoopScores')).toBeNull();
    expect(screen.queryByTestId('widgets-values-toggle')).toBeNull();
  });
});
