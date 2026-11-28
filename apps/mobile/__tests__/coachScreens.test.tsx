import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Platform } from 'react-native';

import { scanForCheckIns } from '@/coach/checkIns';
import { defaultCoachPrefs, withCheckInReply, withProactivity, type CoachPrefs } from '@/coach/prefs';
import type { GatedFetch } from '@/net/gate';
import { createFixtureDays } from '@/data/fixtureSource';
import type { UserData } from '@/data/userData';

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

import CoachCheckInScreen from '@/app/coach/check-in';
import CoachScreen from '@/app/coach/index';
import CoachMemoryScreen from '@/app/coach/memory';
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

  it('never sends from a deep link, even one that carries a reply', async () => {
    const latest = days[days.length - 1];
    if (!latest) throw new Error('fixture has no days');
    const changed = [...days.slice(0, -1), { ...latest, hrv: { ...latest.hrv, value: 5 } }];
    const scan = scanForCheckIns(changed, []);
    const id = scan.status === 'ok' ? scan.checkIns.find((c) => c.metric === 'hrv')?.id : undefined;
    if (id === undefined) throw new Error('expected an hrv check-in');
    mockParams.value = { ask: id, reply: 'sick' };
    const send = replying('x');
    const updateUserData = jest.fn(async () => true);
    const { controller } = makeController({ send });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { days: changed, userData: userData(withProactivity(defaultCoachPrefs(), 'patterns')), updateUserData }));
    await waitFor(() => expect(screen.getByTestId('coach-input').props.value).toMatch(/^My HRV on .* was 5 ms/));
    expect(String(screen.getByTestId('coach-input').props.value)).not.toContain('getting sick');
    expect(send).not.toHaveBeenCalled();
    expect(updateUserData).not.toHaveBeenCalled();
  });

  it('fills a tapped check-in reply as a draft and remembers the conversation only after Send', async () => {
    const latest = days[days.length - 1];
    if (!latest) throw new Error('fixture has no days');
    const changed = [...days.slice(0, -1), { ...latest, hrv: { ...latest.hrv, value: 5 } }];
    const send = replying('Take it easy today.');
    const updateUserData = jest.fn(async () => true);
    const coach = withProactivity(defaultCoachPrefs(), 'patterns');
    const { controller } = makeController({ send });
    await controller.load();
    const id = `${latest.day}:hrv`;
    controller.queueDraft({ text: 'My HRV looks lower than usual. I am just tired.', conversationId: null, checkInId: id, reply: 'tired' });
    await render(withCoach(<CoachScreen />, controller, { days: changed, userData: userData(coach), updateUserData }));
    await waitFor(() => expect(screen.getByTestId('coach-input').props.value).toBe('My HRV looks lower than usual. I am just tired.'));
    expect(send).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('coach-send'));
    await waitFor(() => expect(screen.getByText('Take it easy today.')).toBeTruthy());
    const conversationId = controller.getState().activeId;
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ coach: withCheckInReply(coach, { id, reply: 'tired', conversationId: conversationId ?? -1 }) }));
  });

  it('keeps numbers out of a check-in reply when scores are not shared', async () => {
    const latest = days[days.length - 1];
    if (!latest) throw new Error('fixture has no days');
    const changed = [...days.slice(0, -1), { ...latest, hrv: { ...latest.hrv, value: 5 } }];
    const send = replying('Rest well.');
    const coach = { ...withProactivity(defaultCoachPrefs(), 'patterns'), access: { scores: false, journal: false, sensors: false } };
    const { controller } = makeController({ send });
    await controller.load();
    await render(withCoach(<CoachCheckInScreen />, controller, { days: changed, userData: userData(coach) }));
    await fireEvent.press(screen.getByTestId('check-in-reply-sick'));
    expect(router.push).toHaveBeenCalledWith('/coach');
    expect(send).not.toHaveBeenCalled();
    await screen.unmount();
    await render(withCoach(<CoachScreen />, controller, { days: changed, userData: userData(coach) }));
    await waitFor(() => expect(screen.getByTestId('coach-input').props.value).toContain('getting sick'));
    const draft = String(screen.getByTestId('coach-input').props.value);
    expect(draft).not.toMatch(/\d/);
    expect(draft).not.toMatch(/usual \d/);
    expect(send).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('coach-send'));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(send.mock.calls[0]?.[2].body)) as { messages: Array<{ role: string; content: string }>; system: string };
    const question = body.messages[body.messages.length - 1]?.content ?? '';
    expect(question).toContain('getting sick');
    expect(question).not.toMatch(/\d/);
    expect(body.system).not.toContain('day | readiness');
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

describe('coach memory groups', () => {
  it('sorts notes into goals, lifestyle, preferences and events, with older notes guessed or under Other', async () => {
    const repo = memoryRepo();
    await repo.addMemory('Run a sub-50 10K in spring', 'coach', 1);
    await repo.addMemory('Desk job, sits most of the day', 'user', 2);
    await repo.addMemory('Bench 80 kg', 'user', 3);
    const { controller } = makeController({ repo });
    await controller.load();
    const bench = controller.getState().memory[2];
    if (!bench) throw new Error('missing note');
    await render(withCoach(<CoachMemoryScreen />, controller, { userData: userData() }));
    expect(screen.getByTestId('coach-memory-group-goals')).toHaveTextContent(/Run a sub-50 10K/);
    expect(screen.getByTestId('coach-memory-group-lifestyle')).toHaveTextContent(/Desk job/);
    expect(screen.getByTestId('coach-memory-group-other')).toHaveTextContent(/Bench 80 kg/);
    expect(screen.getByTestId('coach-memory-group-events')).toBeTruthy();
    expect(screen.getByText('Added by the coach')).toBeTruthy();
  });

  it('stores the group of a new note and moves a note to another group', async () => {
    const updateUserData = jest.fn(async () => true);
    const repo = memoryRepo();
    await repo.addMemory('Bench 80 kg', 'user', 3);
    const { controller } = makeController({ repo });
    await controller.load();
    const bench = controller.getState().memory[0];
    if (!bench) throw new Error('missing note');
    await render(withCoach(<CoachMemoryScreen />, controller, { userData: userData(), updateUserData }));
    await fireEvent.press(screen.getByTestId('coach-memory-add-events'));
    await fireEvent.changeText(screen.getByTestId('coach-memory-input'), 'Race on 4 May');
    await fireEvent.press(screen.getByTestId('coach-memory-add'));
    const added = await waitFor(() => {
      const note = controller.getState().memory.find((n) => n.text === 'Race on 4 May');
      if (!note) throw new Error('not added yet');
      return note;
    });
    await waitFor(() => expect(updateUserData).toHaveBeenCalledWith({ coach: { ...defaultCoachPrefs(), memoryCategories: { [`${added.id}@${added.createdAt}`]: 'events' } } }));
    await fireEvent.press(screen.getByTestId(`coach-memory-edit-button-${bench.id}`));
    await fireEvent.press(screen.getByTestId('coach-memory-category-goals'));
    await fireEvent.press(screen.getByTestId('coach-memory-edit-save'));
    await waitFor(() => expect(updateUserData).toHaveBeenLastCalledWith({ coach: expect.objectContaining({ memoryCategories: expect.objectContaining({ [`${bench.id}@${bench.createdAt}`]: 'goals' }) }) }));
  });
});

describe('proactive check-in screen', () => {
  function changedDays() {
    const latest = days[days.length - 1];
    if (!latest) throw new Error('fixture has no days');
    return [...days.slice(0, -1), { ...latest, hrv: { ...latest.hrv, value: 5 } }];
  }

  function hrvCheckInId(list: ReturnType<typeof changedDays>): string {
    const scan = scanForCheckIns(list, []);
    const id = scan.status === 'ok' ? scan.checkIns.find((c) => c.metric === 'hrv')?.id : undefined;
    if (id === undefined) throw new Error('expected an hrv check-in');
    return id;
  }

  it('shows the coach message with data chips and turns a reply into a draft for the chat', async () => {
    const list = changedDays();
    const id = hrvCheckInId(list);
    const updateUserData = jest.fn(async () => true);
    const coach = withProactivity(defaultCoachPrefs(), 'patterns');
    const { controller } = makeController();
    await render(withCoach(<CoachCheckInScreen />, controller, { days: list, userData: userData(coach), updateUserData }));
    expect(screen.getByTestId('check-in-banner')).toHaveTextContent(/HRV is lower than usual/);
    expect(screen.getByTestId('check-in-message')).toHaveTextContent(/Your HRV is 5 ms, against your usual/);
    expect(screen.getByTestId('check-in-chips')).toHaveTextContent(/HRV 5 ms/);
    expect(screen.getByTestId(`check-in-${id}`)).toBeTruthy();
    expect(screen.queryByTestId('check-in-answered')).toBeNull();
    await fireEvent.press(screen.getByTestId('check-in-reply-tired'));
    expect(updateUserData).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/coach');
    const draft = controller.takeDraft();
    expect(draft).toMatchObject({ checkInId: id, reply: 'tired', conversationId: null });
    expect(draft?.text).toMatch(/My HRV on .* was 5 ms.*just tired/);
  });

  it('continues the earlier conversation of an answered check-in', async () => {
    const list = changedDays();
    const id = hrvCheckInId(list);
    const coach = withCheckInReply(withProactivity(defaultCoachPrefs(), 'patterns'), { id, reply: 'tired', conversationId: 7 });
    const { controller } = makeController();
    await render(withCoach(<CoachCheckInScreen />, controller, { days: list, userData: userData(coach) }));
    expect(screen.getByTestId('check-in-answered')).toHaveTextContent('You answered: Just tired');
    expect(screen.getByTestId('check-in-reply-tired').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('check-in-reply-sick'));
    expect(controller.takeDraft()).toMatchObject({ checkInId: id, reply: 'sick', conversationId: 7 });
  });

  it('puts the check-in away for today with Not now and points to the settings', async () => {
    const list = changedDays();
    const id = hrvCheckInId(list);
    const updateUserData = jest.fn<Promise<boolean>, [Partial<UserData>]>(async () => true);
    const coach = withProactivity(defaultCoachPrefs(), 'patterns');
    const { controller } = makeController();
    await render(withCoach(<CoachCheckInScreen />, controller, { days: list, userData: userData(coach), updateUserData }));
    await fireEvent.press(screen.getByTestId('check-in-reply-later'));
    const saved = updateUserData.mock.calls[0]?.[0];
    expect(saved?.coach?.dismissedCheckIns).toContain(id);
    expect(saved?.coach?.checkInReplies).toEqual([{ id, reply: 'later', conversationId: null }]);
    expect(router.push).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/coach' }));
    await fireEvent.press(screen.getByTestId('check-in-footnote'));
    expect(router.push).toHaveBeenCalledWith('/coach/settings');
  });

  it('says plainly when the coach itself is off', async () => {
    const { controller } = makeController();
    await render(withCoach(<CoachCheckInScreen />, controller, { days: changedDays(), userData: userData({ ...withProactivity(defaultCoachPrefs(), 'patterns'), enabled: false }) }));
    expect(screen.getByTestId('coach-check-in-status')).toHaveTextContent(/switched off in Coach settings/);
    expect(screen.queryByTestId('check-in-banner')).toBeNull();
  });
});
