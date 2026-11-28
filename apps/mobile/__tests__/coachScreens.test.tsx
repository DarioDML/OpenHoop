import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import { defaultCoachPrefs, type CoachPrefs } from '@/coach/prefs';
import { createFixtureDays } from '@/data/fixtureSource';

import { FIXTURE_NOW, fixtureAppData } from './support/appData';
import { makeController, memoryRepo, withCoach } from './support/coach';

const mockParams: { value: Record<string, string> } = { value: {} };

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.value,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('expo-speech-recognition', () => jest.requireActual<{ speechRecognitionMock: object }>('./support/speech').speechRecognitionMock);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import CoachSettingsScreen from '@/app/coach/settings';

const days = createFixtureDays(FIXTURE_NOW);
const today = days[days.length - 1]?.day ?? '2026-11-25';
const NETWORK_ON = { enabled: true, features: { coach: true, maps: false, labs: false, strava: false } };

function userData(coach: CoachPrefs = defaultCoachPrefs(), extra: Partial<ReturnType<typeof fixtureAppData>['userData']> = {}) {
  return { ...fixtureAppData().userData, network: NETWORK_ON, coach, ...extra };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockParams.value = {};
});

describe('coach settings', () => {
  it('switches the whole coach off and says the on-device model is not available', async () => {
    const updateUserData = jest.fn(async () => true);
    const { controller } = makeController();
    await controller.load();
    await render(withCoach(<CoachSettingsScreen />, controller, { userData: userData(), updateUserData }));
    expect(screen.getByTestId('coach-source-device').props.accessibilityState).toMatchObject({ selected: false, disabled: true });
    expect(screen.getByText(/no language model runs well enough on a phone/)).toBeTruthy();
    expect(screen.getByTestId('coach-source-key').props.accessibilityState.selected).toBe(true);
    await fireEvent(screen.getByTestId('coach-enabled'), 'valueChange', false);
    expect(updateUserData).toHaveBeenCalledWith({ coach: { ...defaultCoachPrefs(), enabled: false } });
  });

  it('stores tone and proactivity, keeping the check-ins switch in step', async () => {
    const updateUserData = jest.fn(async () => true);
    const { controller } = makeController();
    await render(withCoach(<CoachSettingsScreen />, controller, { userData: userData(), updateUserData }));
    await fireEvent.press(screen.getByTestId('coach-tone-direct'));
    expect(updateUserData).toHaveBeenLastCalledWith({ coach: { ...defaultCoachPrefs(), tone: 'direct' } });
    await fireEvent.press(screen.getByTestId('coach-proactivity-weekly'));
    expect(updateUserData).toHaveBeenLastCalledWith({ coach: { ...defaultCoachPrefs(), proactivity: 'weekly', checkIns: true } });
    expect(screen.getByTestId('coach-proactivity-body')).toHaveTextContent(/only answers when you ask/);
  });

  it('limits what the coach sees with the data switches', async () => {
    const updateUserData = jest.fn(async () => true);
    const repo = memoryRepo();
    await repo.addMemory('Runs on Sunday', 'user', 1);
    const { controller } = makeController({ repo });
    await controller.load();
    const journal = { [today]: { alcohol: 2 } };
    const coach = { ...defaultCoachPrefs(), memory: false, access: { scores: false, journal: true, sensors: true } };
    await render(withCoach(<CoachSettingsScreen />, controller, { userData: userData(coach, { journal }), updateUserData }));
    const text = String(screen.getByTestId('coach-sees').props.children);
    expect(text).toContain(`${today}: alcohol 2`);
    expect(text).toContain('respiratoryRate');
    expect(text).not.toContain('day | readiness');
    expect(text).not.toContain('Runs on Sunday');
    await fireEvent(screen.getByTestId('coach-access-scores'), 'valueChange', true);
    expect(updateUserData).toHaveBeenLastCalledWith({ coach: { ...coach, access: { scores: true, journal: true, sensors: true } } });
    await fireEvent(screen.getByTestId('coach-access-memory'), 'valueChange', true);
    expect(updateUserData).toHaveBeenLastCalledWith({ coach: { ...coach, memory: true } });
  });

  it('links to memory with its count and to the check-ins', async () => {
    const repo = memoryRepo();
    await repo.addMemory('One', 'user', 1);
    await repo.addMemory('Two', 'coach', 2);
    const { controller } = makeController({ repo });
    await controller.load();
    await render(withCoach(<CoachSettingsScreen />, controller, { userData: userData() }));
    expect(screen.getByTestId('coach-settings-memory')).toHaveTextContent(/2 entries/);
    await fireEvent.press(screen.getByTestId('coach-settings-memory'));
    expect(router.push).toHaveBeenCalledWith('/coach/memory');
    await fireEvent.press(screen.getByTestId('coach-settings-check-in'));
    expect(router.push).toHaveBeenCalledWith('/coach/check-in');
  });
});
