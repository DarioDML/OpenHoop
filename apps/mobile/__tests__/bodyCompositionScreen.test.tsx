import type { BodyMeasurement, BodyMeasurementInput } from '@openhoop/core';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import BodyCompositionScreen from '@/app/health/body-composition';
import { defaultUserData } from '@/data/userData';

import { FIXTURE_NOW, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function entry(id: number, day: string, weightKg: number, bodyFatPct: number | null = null): BodyMeasurement {
  return { id, day, weightKg, bodyFatPct, createdAt: id, source: 'manual', origin: null };
}

const userData = { ...defaultUserData(), onboardingDone: true, heightCm: 180 };

describe('body composition screen', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows an empty state with honest reasons and no invented numbers', async () => {
    await render(withAppData(<BodyCompositionScreen />, 'en', { userData }));
    expect(screen.getByTestId('body-entries-empty')).toBeTruthy();
    expect(within(screen.getByTestId('body-latest')).getByText('Not set')).toBeTruthy();
    expect(within(screen.getByTestId('body-bmi')).getByText('Not set')).toBeTruthy();
    expect(screen.getByTestId('body-entered-note')).toBeTruthy();
  });

  it('shows the latest value, change, BMI and lean mass from the entries, labelled as entered', async () => {
    const bodyMeasurements = [entry(1, '2026-10-30', 82, 22), entry(2, '2026-11-24', 80, 20)];
    await render(withAppData(<BodyCompositionScreen />, 'en', { userData, bodyMeasurements }));
    expect(within(screen.getByTestId('body-latest')).getByText(/80.0/)).toBeTruthy();
    expect(within(screen.getByTestId('body-change')).getByText(/−2.0/)).toBeTruthy();
    expect(within(screen.getByTestId('body-bmi')).getByText(/24.7/)).toBeTruthy();
    expect(within(screen.getByTestId('body-lean')).getByText(/64.0/)).toBeTruthy();
    expect(screen.getByTestId('body-fat-change')).toBeTruthy();
    expect(screen.getByText(/Entered by you, not measured by the band/)).toBeTruthy();
  });

  it('explains why BMI and lean mass are missing', async () => {
    await render(
      withAppData(<BodyCompositionScreen />, 'en', { userData: { ...userData, heightCm: null }, bodyMeasurements: [entry(1, '2026-11-24', 80)] }),
    );
    expect(screen.getByTestId('body-bmi-reason')).toBeTruthy();
    expect(screen.getByTestId('body-lean-reason')).toBeTruthy();
    expect(screen.getByTestId('body-change-few')).toBeTruthy();
  });

  it('switches the range and leaves out entries older than the period', async () => {
    const bodyMeasurements = [entry(1, '2026-01-10', 90), entry(2, '2026-11-24', 80)];
    await render(withAppData(<BodyCompositionScreen />, 'en', { userData, bodyMeasurements }));
    expect(screen.getByTestId('body-change-few')).toBeTruthy();
    await fireEvent.press(screen.getByText('1Y'));
    expect(within(screen.getByTestId('body-change')).getByText(/−10.0/)).toBeTruthy();
  });

  it('rejects invalid input without saving and marks the fields', async () => {
    const save = jest.fn<Promise<boolean>, [number | null, BodyMeasurementInput]>(async () => true);
    await render(withAppData(<BodyCompositionScreen />, 'en', { userData, saveBodyMeasurement: save }));
    await fireEvent.changeText(screen.getByTestId('body-input-weight'), '20');
    await fireEvent.changeText(screen.getByTestId('body-input-fat'), '80');
    await fireEvent.changeText(screen.getByTestId('body-input-day'), '2026-11-26');
    await fireEvent.press(screen.getByTestId('body-save'));
    expect(save).not.toHaveBeenCalled();
  });

  it('saves a valid entry as a new row and clears the form', async () => {
    const save = jest.fn<Promise<boolean>, [number | null, BodyMeasurementInput]>(async () => true);
    await render(withAppData(<BodyCompositionScreen />, 'en', { userData, saveBodyMeasurement: save }));
    await fireEvent.changeText(screen.getByTestId('body-input-weight'), '80,5');
    await fireEvent.changeText(screen.getByTestId('body-input-fat'), '19.5');
    await fireEvent.press(screen.getByTestId('body-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null, { day: '2026-11-25', weightKg: 80.5, bodyFatPct: 19.5 }));
    await waitFor(() => expect(screen.getByTestId('body-input-weight').props.value).toBe(''));
  });

  it('edits an existing entry by id', async () => {
    const save = jest.fn<Promise<boolean>, [number | null, BodyMeasurementInput]>(async () => true);
    await render(
      withAppData(<BodyCompositionScreen />, 'en', {
        userData,
        bodyMeasurements: [entry(7, '2026-11-20', 81, 21)],
        saveBodyMeasurement: save,
      }),
    );
    await fireEvent.press(screen.getByTestId('body-edit-7'));
    expect(screen.getByTestId('body-input-weight').props.value).toBe('81');
    expect(screen.getByTestId('body-input-fat').props.value).toBe('21');
    await fireEvent.changeText(screen.getByTestId('body-input-weight'), '80');
    await fireEvent.press(screen.getByTestId('body-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(7, { day: '2026-11-20', weightKg: 80, bodyFatPct: 21 }));
  });

  it('asks for confirmation before it deletes an entry', async () => {
    const remove = jest.fn<Promise<boolean>, [number]>(async () => true);
    await render(
      withAppData(<BodyCompositionScreen />, 'en', { userData, bodyMeasurements: [entry(3, '2026-11-20', 81)], removeBodyMeasurement: remove }),
    );
    await fireEvent.press(screen.getByTestId('body-delete-3'));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('body-keep-3'));
    expect(screen.getByTestId('body-delete-3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('body-delete-3'));
    await fireEvent.press(screen.getByTestId('body-confirm-3'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(3));
  });

  it('shows weight in pounds and saves it in kilograms for imperial units', async () => {
    const save = jest.fn<Promise<boolean>, [number | null, BodyMeasurementInput]>(async () => true);
    const settings = { language: 'en' as const, dataSource: 'demo' as const, ownerSince: null, units: 'imperial' as const };
    await render(withAppData(<BodyCompositionScreen />, 'en', { userData, settings, bodyMeasurements: [entry(1, '2026-11-24', 80)], saveBodyMeasurement: save }));
    expect(within(screen.getByTestId('body-latest')).getByText(/176.4/)).toBeTruthy();
    expect(screen.getAllByText(/lb/).length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByTestId('body-input-weight'), '176.4');
    await fireEvent.press(screen.getByTestId('body-save'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null, { day: '2026-11-25', weightKg: 80.01, bodyFatPct: null }));
  });

  it('colours the weight change by an optional goal and stores the goal', async () => {
    const updateUserData = jest.fn(async () => true);
    const bodyMeasurements = [entry(1, '2026-10-30', 82, 22), entry(2, '2026-11-24', 80, 20)];
    await render(withAppData(<BodyCompositionScreen />, 'en', { userData: { ...userData, weightGoalKg: 75 }, bodyMeasurements, updateUserData }));
    expect(screen.getByTestId('body-latest-chip')).toHaveTextContent('↓ 2.0 kg');
    expect(screen.getByTestId('body-goal-line')).toHaveTextContent(/75.0 kg/);
    await fireEvent.press(screen.getByTestId('body-goal'));
    await fireEvent.changeText(screen.getByTestId('body-goal-input'), '78');
    await fireEvent.press(screen.getByTestId('body-goal-save'));
    expect(updateUserData).toHaveBeenCalledWith({ weightGoalKg: 78 });
  });

  it('pauses the weight goal in pregnancy mode', async () => {
    const bodyMeasurements = [entry(1, '2026-10-30', 82), entry(2, '2026-11-24', 80)];
    await render(
      withAppData(<BodyCompositionScreen />, 'en', {
        userData: { ...userData, weightGoalKg: 75, pregnancyPrefs: { hideLoadTargets: false, pauseWeightGoals: true } },
        cycle: { periods: [], symptoms: [], pregnancy: { dueDay: '2027-03-01', createdAt: 1 } },
        bodyMeasurements,
      }),
    );
    expect(screen.getByText('Paused while pregnancy mode is on')).toBeTruthy();
    expect(screen.queryByTestId('body-goal-line')).toBeNull();
  });

  it('names Health Connect and the scale app as the source', async () => {
    const synced: BodyMeasurement = { ...entry(5, '2026-11-24', 80), source: 'health_connect', origin: 'Withings' };
    await render(withAppData(<BodyCompositionScreen />, 'en', { userData, bodyMeasurements: [synced] }));
    expect(screen.getByText('Health Connect · Withings')).toBeTruthy();
    expect(screen.getByTestId('body-source-5')).toBeTruthy();
  });

  it('renders in Dutch', async () => {
    await render(withAppData(<BodyCompositionScreen />, 'nl', { userData, bodyMeasurements: [entry(1, '2026-11-24', 80.5)] }));
    expect(within(screen.getByTestId('body-latest')).getByText(/80,5/)).toBeTruthy();
    expect(screen.getByText(/niet gemeten door de band/)).toBeTruthy();
  });
});
