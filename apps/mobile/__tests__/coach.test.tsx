import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, ScrollView, type AlertButton } from 'react-native';

import { defaultCoachPrefs } from '@/coach/prefs';
import { createFixtureDays } from '@/data/fixtureSource';
import type { GatedFetch } from '@/net/gate';

import { FIXTURE_NOW, fixtureAppData } from './support/appData';
import { TEST_KEY, jsonResponse, makeController, memoryRepo, replyBody, withCoach } from './support/coach';

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
import CoachHistoryScreen from '@/app/coach/history';
import CoachScreen from '@/app/coach/index';
import CoachMemoryScreen from '@/app/coach/memory';
import CoachSettingsScreen from '@/app/coach/settings';
import PrivacyScreen from '@/app/settings/privacy';

const days = createFixtureDays(FIXTURE_NOW);
const latest = days[days.length - 1];
const NETWORK_ON = { enabled: true, features: { coach: true, maps: false, labs: false, strava: false } };

function userData(network = NETWORK_ON, coach = defaultCoachPrefs()) {
  return { ...fixtureAppData().userData, network, coach };
}

async function pressAlertButton(label: string): Promise<void> {
  const spy = jest.mocked(Alert.alert);
  const buttons: AlertButton[] = spy.mock.calls[spy.mock.calls.length - 1]?.[2] ?? [];
  await act(async () => {
    buttons.find((b) => b.text === label)?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockParams.value = {};
});

describe('coach pre-fill from a term', () => {
  it('puts the question in the draft without sending it', async () => {
    mockParams.value = { term: 'hrv' };
    const { controller, send } = makeController();
    await controller.load();
    await render(withCoach(<CoachScreen />, controller));
    expect(screen.getByTestId('coach-input').props.value).toBe('Explain this to me with my own numbers: HRV.');
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores an unknown term', async () => {
    mockParams.value = { term: 'bogus' };
    const { controller } = makeController();
    await controller.load();
    await render(withCoach(<CoachScreen />, controller));
    expect(screen.getByTestId('coach-input').props.value).toBe('');
  });
});

describe('coach chat', () => {
  it('shows an honest off state and never calls the API when the network is off', async () => {
    const { controller, send } = makeController();
    await controller.load();
    await render(withCoach(<CoachScreen />, controller));
    expect(screen.getByTestId('coach-state-network-off')).toBeTruthy();
    expect(screen.getByTestId('coach-chips')).toBeTruthy();
    expect(screen.queryByTestId('coach-send')).toBeNull();
    expect(screen.getByTestId('coach-input').props.editable).toBe(false);
    await fireEvent.press(screen.getByText('Open privacy settings'));
    expect(router.push).toHaveBeenCalledWith('/settings/privacy');
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the header in view while there is no conversation yet', async () => {
    const scrollToEnd = jest.fn();
    const proto = ScrollView.prototype as unknown as { scrollToEnd?: () => void };
    const before = proto.scrollToEnd;
    proto.scrollToEnd = scrollToEnd;
    try {
      const { controller } = makeController();
      await controller.load();
      await render(withCoach(<CoachScreen />, controller));
      await fireEvent(screen.getByTestId('screen-scroll'), 'contentSizeChange', 360, 1400);
      expect(scrollToEnd).not.toHaveBeenCalled();
      expect(screen.getByTestId('coach-settings-link')).toBeTruthy();
    } finally {
      proto.scrollToEnd = before;
    }
  });

  it('asks for a key when the network is on but no key is saved', async () => {
    const { controller } = makeController({ key: null });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    expect(screen.getByTestId('coach-state-no-key')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add a key'));
    expect(router.push).toHaveBeenCalledWith('/coach/settings');
  });

  it('sends a question and shows the reply with its numbers first', async () => {
    if (!latest) throw new Error('fixture has no days');
    const send = jest.fn<ReturnType<GatedFetch>, Parameters<GatedFetch>>(async () =>
      jsonResponse(200, replyBody({ chips: [{ metric: 'readiness', day: latest.day }], text: 'Readiness looks fine.' })),
    );
    const { controller } = makeController({ send });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    expect(screen.getByTestId('coach-empty')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('coach-input'), 'How am I doing?');
    await fireEvent.press(screen.getByTestId('coach-send'));
    await waitFor(() => expect(screen.getByText('Readiness looks fine.')).toBeTruthy());
    expect(screen.getAllByText('How am I doing?').length).toBeGreaterThan(0);
    const replyId = controller.getState().messages[1]?.id;
    expect(screen.getByTestId(`coach-reply-chips-${replyId}`)).toBeTruthy();
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('explains an invalid key, keeps the question and links to a new key', async () => {
    const { controller } = makeController({ send: async () => jsonResponse(401, { type: 'error' }) });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    await fireEvent.changeText(screen.getByTestId('coach-input'), 'Hello?');
    await fireEvent.press(screen.getByTestId('coach-send'));
    await waitFor(() => expect(screen.getByTestId('coach-error')).toBeTruthy());
    expect(screen.getByText(/did not accept the API key/)).toBeTruthy();
    expect(screen.getByTestId('coach-input').props.value).toBe('Hello?');
    await fireEvent.press(screen.getByTestId('coach-error-action'));
    expect(router.push).toHaveBeenCalledWith('/coach/settings');
  });

  it('shows a rate limit message', async () => {
    const { controller } = makeController({ send: async () => jsonResponse(429, {}) });
    await controller.load();
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    await fireEvent.changeText(screen.getByTestId('coach-input'), 'Hi');
    await fireEvent.press(screen.getByTestId('coach-send'));
    await waitFor(() => expect(screen.getByText(/Too many requests/)).toBeTruthy());
  });

  it('opens a conversation from the history link parameter', async () => {
    const repo = memoryRepo();
    const id = await repo.appendExchange(null, 'Old chat', [{ role: 'user', text: 'Old question', chips: '[]' }, { role: 'coach', text: 'Old answer', chips: '[]' }], 1);
    const { controller } = makeController({ repo });
    await controller.load();
    mockParams.value = { conversation: String(id) };
    await render(withCoach(<CoachScreen />, controller, { userData: userData() }));
    await waitFor(() => expect(screen.getByText('Old answer')).toBeTruthy());
    await fireEvent.press(screen.getByText('New conversation'));
    await waitFor(() => expect(screen.getByTestId('coach-empty')).toBeTruthy());
  });
});

describe('coach history', () => {
  it('lists, filters, opens and deletes conversations', async () => {
    const repo = memoryRepo();
    const sleep = await repo.appendExchange(null, 'Sleep question', [{ role: 'user', text: 'a', chips: '[]' }], 1);
    await repo.appendExchange(null, 'HRV question', [{ role: 'user', text: 'b', chips: '[]' }], 2);
    const { controller } = makeController({ repo });
    await controller.load();
    await render(withCoach(<CoachHistoryScreen />, controller));
    expect(screen.getByText('Sleep question')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('coach-history-search'), 'hrv');
    expect(screen.queryByText('Sleep question')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('coach-history-search'), 'nothing');
    expect(screen.getByTestId('coach-history-no-match')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('coach-history-search'), '');
    await fireEvent.press(screen.getByTestId(`coach-history-delete-${sleep}`));
    await pressAlertButton('Delete');
    await waitFor(() => expect(screen.queryByText('Sleep question')).toBeNull());
    await fireEvent.press(screen.getByText('HRV question'));
    expect(router.push).toHaveBeenCalledWith('/coach');
  });

  it('says when there are no conversations', async () => {
    const { controller } = makeController();
    await controller.load();
    await render(withCoach(<CoachHistoryScreen />, controller));
    expect(screen.getByTestId('coach-history-empty')).toBeTruthy();
    expect(screen.getByTestId('coach-history-note')).not.toHaveTextContent(/bin/);
    await fireEvent.press(screen.getByText('Start a conversation'));
    expect(router.push).toHaveBeenCalledWith('/coach');
  });
});

describe('coach memory', () => {
  it('adds, validates, edits and deletes notes', async () => {
    const { controller } = makeController();
    await controller.load();
    await render(withCoach(<CoachMemoryScreen />, controller));
    expect(screen.getByTestId('coach-memory-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('coach-memory-add-lifestyle'));
    await fireEvent.press(screen.getByTestId('coach-memory-add'));
    expect(screen.getByText(/between 1 and 200/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('coach-memory-input'), 'I train on Tuesdays');
    await fireEvent.press(screen.getByTestId('coach-memory-add'));
    await waitFor(() => expect(screen.getByText('I train on Tuesdays')).toBeTruthy());
    const id = controller.getState().memory[0]?.id;
    await fireEvent.press(screen.getByTestId(`coach-memory-edit-button-${id}`));
    await fireEvent.changeText(screen.getByTestId('coach-memory-edit-input'), 'I train on Fridays');
    await fireEvent.press(screen.getByTestId('coach-memory-edit-save'));
    await waitFor(() => expect(screen.getByText('I train on Fridays')).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`coach-memory-delete-${id}`));
    await waitFor(() => expect(screen.getByTestId('coach-memory-empty')).toBeTruthy());
  });

  it('switches memory off through user data', async () => {
    const updateUserData = jest.fn(async () => true);
    const { controller } = makeController();
    await render(withCoach(<CoachMemoryScreen />, controller, { updateUserData }));
    fireEvent(screen.getByTestId('coach-memory-toggle'), 'valueChange', false);
    expect(updateUserData).toHaveBeenCalledWith({ coach: { ...defaultCoachPrefs(), memory: false } });
  });
});

describe('coach check-ins', () => {
  it('are off by default and can be switched on', async () => {
    const updateUserData = jest.fn(async () => true);
    const { controller } = makeController();
    await render(withCoach(<CoachCheckInScreen />, controller, { updateUserData }));
    expect(screen.getByText('Check-ins are off.')).toBeTruthy();
    fireEvent(screen.getByTestId('coach-check-in-toggle'), 'valueChange', true);
    expect(updateUserData).toHaveBeenCalledWith({ coach: { ...defaultCoachPrefs(), checkIns: true, proactivity: 'patterns' } });
  });

  it('show a clear change with ask and dismiss when on', async () => {
    if (!latest) throw new Error('fixture has no days');
    const changed = [...days.slice(0, -1), { ...latest, hrv: { ...latest.hrv, value: 5 } }];
    const updateUserData = jest.fn(async () => true);
    const { controller } = makeController();
    await render(withCoach(<CoachCheckInScreen />, controller, { days: changed, updateUserData, userData: userData(NETWORK_ON, { ...defaultCoachPrefs(), checkIns: true }) }));
    const id = `${latest.day}:hrv`;
    expect(screen.getByTestId(`check-in-${id}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`check-in-ask-${id}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/coach', params: { ask: id } });
    await fireEvent.press(screen.getByTestId(`check-in-dismiss-${id}`));
    expect(updateUserData).toHaveBeenCalledWith({ coach: expect.objectContaining({ dismissedCheckIns: [id] }) });
  });
});

describe('coach settings', () => {
  it('rejects a malformed key and saves a valid one', async () => {
    const { controller, keys } = makeController({ key: null });
    await controller.load();
    await render(withCoach(<CoachSettingsScreen />, controller));
    expect(screen.getByText('No key saved.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('coach-key-input'), 'not-a-key');
    await fireEvent.press(screen.getByTestId('coach-key-save'));
    expect(screen.getByText(/does not look like an Anthropic API key/)).toBeTruthy();
    expect(keys.current()).toBeNull();
    await fireEvent.changeText(screen.getByTestId('coach-key-input'), TEST_KEY);
    await fireEvent.press(screen.getByTestId('coach-key-save'));
    await waitFor(() => expect(screen.getByText(/A key is saved/)).toBeTruthy());
    expect(keys.current()).toBe(TEST_KEY);
    expect(screen.queryByText(TEST_KEY)).toBeNull();
    await fireEvent.press(screen.getByTestId('coach-key-remove'));
    await pressAlertButton('Remove key');
    await waitFor(() => expect(screen.getByText('No key saved.')).toBeTruthy());
  });

  it('shows exactly what the coach sees, without the name', async () => {
    const repo = memoryRepo();
    await repo.addMemory('Runs on Sunday', 'user', 1);
    const { controller } = makeController({ repo });
    await controller.load();
    const base = fixtureAppData();
    await render(withCoach(<CoachSettingsScreen />, controller, { userData: { ...base.userData, name: 'Alexandra' } }));
    const sees = screen.getByTestId('coach-sees');
    const text = String(sees.props.children);
    expect(text).toContain('day | readiness | sleepScore | load | hrv | restingHr');
    expect(text).toContain('- Runs on Sunday');
    expect(text).not.toContain('Alexandra');
  });

  it('picks a model and deletes all coach data after confirming', async () => {
    const updateUserData = jest.fn(async () => true);
    const { controller, keys } = makeController();
    await controller.load();
    await render(withCoach(<CoachSettingsScreen />, controller, { updateUserData }));
    await fireEvent.press(screen.getByTestId('coach-model-claude-haiku-5-5'));
    expect(updateUserData).toHaveBeenCalledWith({ coach: { ...defaultCoachPrefs(), model: 'claude-haiku-5-5' } });
    await fireEvent.press(screen.getByTestId('coach-delete-all'));
    await pressAlertButton('Delete');
    await waitFor(() => expect(keys.current()).toBeNull());
  });
});

describe('privacy network settings', () => {
  it('shows everything off by default with what the coach would send', async () => {
    const updateUserData = jest.fn(async () => true);
    const { controller } = makeController();
    await render(withCoach(<PrivacyScreen />, controller, { updateUserData }));
    expect(screen.getByTestId('local-only-toggle').props.value).toBe(true);
    expect(screen.getByTestId('network-feature-coach').props.value).toBe(false);
    expect(screen.getByTestId('network-feature-coach').props.disabled).toBe(true);
    expect(screen.getAllByText(/api\.anthropic\.com/)).toHaveLength(2);
    expect(screen.getByTestId('network-feature-labs').props.value).toBe(false);
    expect(screen.getByText('Read lab reports with Claude')).toBeTruthy();
    fireEvent(screen.getByTestId('local-only-toggle'), 'valueChange', false);
    expect(updateUserData).toHaveBeenCalledWith({ network: { enabled: true, features: { coach: false, maps: false, labs: false, strava: false } } });
  });

  it('switches the coach feature on once network features are on', async () => {
    const updateUserData = jest.fn(async () => true);
    const { controller } = makeController();
    await render(withCoach(<PrivacyScreen />, controller, { updateUserData, userData: userData({ enabled: true, features: { coach: false, maps: false, labs: false, strava: false } }) }));
    fireEvent(screen.getByTestId('network-feature-coach'), 'valueChange', true);
    expect(updateUserData).toHaveBeenCalledWith({ network: { enabled: true, features: { coach: true, maps: false, labs: false, strava: false } } });
  });
});
