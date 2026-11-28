import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Platform } from 'react-native';

import { scanForCheckIns } from '@/coach/checkIns';
import { defaultCoachPrefs, withCheckInReply, withProactivity, type CoachPrefs } from '@/coach/prefs';
import type { GatedFetch } from '@/net/gate';
import { createFixtureDays } from '@/data/fixtureSource';

import { FIXTURE_NOW, fixtureAppData } from './support/appData';
import { jsonResponse, makeController, memoryRepo, replyBody, withCoach } from './support/coach';
import { emitSpeech, resetSpeech, speechCalls } from './support/speech';

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

import CoachScreen from '@/app/coach/index';
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

function replying(text: string) {
  return jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(async () => jsonResponse(200, replyBody({ chips: [{ metric: 'hrv', day: today }], text })));
}

describe('coach chat', () => {
  it('opens settings from the header and sends a quick prompt straight away', async () => {
    const send = replying('Your week looks steady.');
    const { controller } = makeController({ send });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    await fireEvent.press(screen.getByTestId('coach-settings-link'));
    expect(router.push).toHaveBeenCalledWith('/coach/settings');
    await fireEvent.press(screen.getByTestId('coach-prompt-compare'));
    await waitFor(() => expect(screen.getByText('Your week looks steady.')).toBeTruthy());
    expect(String(send.mock.calls[0]?.[2].body)).toContain('Compare to last week');
    expect(screen.getByTestId('coach-continuing')).toHaveTextContent(/Continuing "Compare to last week"/);
    const replyId = controller.getState().messages[1]?.id;
    expect(screen.getByTestId(`coach-reply-chips-${replyId}`)).toBeTruthy();
  });

  it('stops a running answer and gives the question back', async () => {
    const send = jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(
      (_feature, _url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const { controller } = makeController({ send });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    await fireEvent.changeText(screen.getByTestId('coach-input'), 'Slow one?');
    await fireEvent.press(screen.getByTestId('coach-send'));
    expect(await screen.findByTestId('coach-thinking')).toHaveTextContent(/Reading your last 7 days/);
    await fireEvent.press(screen.getByTestId('coach-stop'));
    await waitFor(() => expect(screen.queryByTestId('coach-thinking')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('coach-input').props.value).toBe('Slow one?'));
    expect(screen.queryByTestId('coach-error')).toBeNull();
  });

  it('puts a free-text question from elsewhere in the input without sending it', async () => {
    mockParams.value = { ask: 'Why was my sleep short?' };
    const send = replying('x');
    const { controller } = makeController({ send });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    await waitFor(() => expect(screen.getByTestId('coach-input').props.value).toBe('Why was my sleep short?'));
    expect(send).not.toHaveBeenCalled();
  });

  it('answers a check-in reply in a conversation and remembers which one', async () => {
    const latest = days[days.length - 1];
    if (!latest) throw new Error('fixture has no days');
    const changed = [...days.slice(0, -1), { ...latest, hrv: { ...latest.hrv, value: 5 } }];
    const scan = scanForCheckIns(changed, []);
    const id = scan.status === 'ok' ? scan.checkIns.find((c) => c.metric === 'hrv')?.id : undefined;
    if (id === undefined) throw new Error('expected an hrv check-in');
    mockParams.value = { ask: id, reply: 'tired' };
    const send = replying('Take it easy today.');
    const updateUserData = jest.fn(async () => true);
    const coach = withCheckInReply(withProactivity(defaultCoachPrefs(), 'patterns'), { id, reply: 'tired', conversationId: null });
    const { controller } = makeController({ send });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { days: changed, userData: userData(coach), updateUserData }));
    await waitFor(() => expect(screen.getByText('Take it easy today.')).toBeTruthy());
    expect(String(send.mock.calls[0]?.[2].body)).toContain('just tired');
    const conversationId = controller.getState().activeId;
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ coach: withCheckInReply(coach, { id, reply: 'tired', conversationId: conversationId ?? -1 }) }));
  });

  it('shows the switched-off state and sends nothing', async () => {
    const send = replying('x');
    const { controller } = makeController({ send });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData({ ...defaultCoachPrefs(), enabled: false }) }));
    expect(screen.getByTestId('coach-state-off')).toBeTruthy();
    expect(screen.getByTestId('coach-input').props.editable).toBe(false);
    await fireEvent.press(screen.getByText('Open coach settings'));
    expect(router.push).toHaveBeenCalledWith('/coach/settings');
    expect(send).not.toHaveBeenCalled();
  });

  it('dictates into the input with the on-phone recogniser', async () => {
    resetSpeech();
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
    const { controller } = makeController();
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    await waitFor(() => expect(screen.getByTestId('coach-mic').props.accessibilityState.disabled).toBe(false));
    await fireEvent.press(screen.getByTestId('coach-mic'));
    await waitFor(() => expect(speechCalls.start).toHaveBeenCalledTimes(1));
    await act(async () => emitSpeech('start', null));
    expect(await screen.findByTestId('coach-mic-status')).toHaveTextContent(/Listening/);
    await act(async () => emitSpeech('result', { isFinal: true, results: [{ transcript: 'How was my HRV?', confidence: 1, segments: [] }] }));
    expect(screen.getByTestId('coach-input').props.value).toBe('How was my HRV?');
    expect(screen.getByTestId('coach-send')).toBeTruthy();
    jest.restoreAllMocks();
  });
});
