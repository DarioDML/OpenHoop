import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createFixtureDays, createFixtureDevice } from '@/data/fixtureSource';
import { loadTargetBuzzAt, loadTargetBuzzDue } from '@/data/liveSession';
import { gpsByDefault } from '@/data/route';
import { bandLink } from '@/ui/activity/bandLink';

import { FIXTURE_NOW, withAppData } from './support/appData';

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import LiveActivityScreen from '@/app/activity/live';
import StartActivityScreen from '@/app/activity/start';

const days = createFixtureDays(FIXTURE_NOW);
const device = createFixtureDevice(FIXTURE_NOW);
const idle = { active: false, heartRate: null, lastRrMs: null, updatedAt: null };

beforeEach(() => {
  mockParams = {};
  jest.clearAllMocks();
});

describe('start helpers', () => {
  it('turns GPS on by default only for outdoor activities', () => {
    expect(gpsByDefault('running')).toBe(true);
    expect(gpsByDefault('cycling')).toBe(true);
    expect(gpsByDefault('hiking')).toBe(true);
    expect(gpsByDefault('yoga')).toBe(false);
    expect(gpsByDefault('strength')).toBe(false);
  });

  it('buzzes once, only when the projected Load crosses the target upward', () => {
    expect(loadTargetBuzzDue(6.9, 7.1, 7)).toBe(true);
    expect(loadTargetBuzzDue(7, 7.4, 7)).toBe(false);
    expect(loadTargetBuzzDue(7.4, 6.9, 7)).toBe(false);
    expect(loadTargetBuzzDue(null, 7.1, 7)).toBe(false);
    expect(loadTargetBuzzDue(6.9, null, 7)).toBe(false);
    expect(loadTargetBuzzDue(6.9, 7.1, null)).toBe(false);
  });

  it('takes the target from the low end of the aim range and has none without history', () => {
    const target = loadTargetBuzzAt(days);
    expect(target).not.toBeNull();
    expect(target).toBeGreaterThanOrEqual(0);
    expect(target).toBeLessThanOrEqual(21);
    expect(loadTargetBuzzAt([])).toBeNull();
    expect(loadTargetBuzzAt(days.slice(-1))).toBeNull();
  });

  it('describes the band link, live first', () => {
    expect(bandLink(device, { ...idle, active: true, heartRate: 72 })).toEqual({ kind: 'live', bpm: 72 });
    expect(bandLink(device, idle)).toEqual({ kind: 'connected' });
    expect(bandLink({ ...device, connection: 'disconnected' }, idle)).toEqual({ kind: 'disconnected' });
    expect(bandLink({ ...device, name: null, connection: 'disconnected' }, idle)).toEqual({ kind: 'unpaired' });
  });
});

describe('start activity screen', () => {
  it('starts a GPS activity with the target buzz on by default', async () => {
    mockParams = { type: 'running' };
    await render(withAppData(<StartActivityScreen />));
    expect(screen.getByTestId('start-type').props.children).toBe('Running');
    expect(screen.getByTestId('start-gps').props.value).toBe(true);
    expect(screen.getByTestId('start-gps-note')).toHaveTextContent(/only while this activity records/);
    await fireEvent.press(screen.getByTestId('start-begin'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/gps', params: { type: 'running', start: '1', buzz: '1' } });
  });

  it('records without a route when GPS is switched off, and without a buzz when it is off', async () => {
    mockParams = { type: 'running' };
    await render(withAppData(<StartActivityScreen />));
    await fireEvent(screen.getByTestId('start-gps'), 'valueChange', false);
    await fireEvent(screen.getByTestId('start-buzz'), 'valueChange', false);
    expect(screen.queryByTestId('start-gps-note')).toBeNull();
    await fireEvent.press(screen.getByTestId('start-begin'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/live', params: { type: 'running', start: '1' } });
  });

  it('changes the activity with the Change link and its type picker', async () => {
    mockParams = { type: 'running' };
    await render(withAppData(<StartActivityScreen />));
    expect(screen.queryByTestId('start-picker')).toBeNull();
    await fireEvent.press(screen.getByTestId('start-change'));
    await fireEvent.press(screen.getByTestId('start-type-yoga'));
    expect(screen.getByTestId('start-type').props.children).toBe('Yoga');
    expect(screen.queryByTestId('start-picker')).toBeNull();
    expect(screen.getByTestId('start-gps').props.value).toBe(false);
  });

  it('shows the live heart rate of the band and hands the running preview to the live screen', async () => {
    mockParams = { type: 'yoga' };
    const startLive = jest.fn(async () => undefined);
    const stopLive = jest.fn(async () => undefined);
    const view = await render(withAppData(<StartActivityScreen />, 'en', { startLive, stopLive, live: idle }));
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('start-band-status')).toHaveTextContent('Connected');
    await act(async () => {
      await view.rerender(withAppData(<StartActivityScreen />, 'en', { startLive, stopLive, live: { active: true, heartRate: 72, lastRrMs: 800, updatedAt: 1 } }));
    });
    expect(screen.getByTestId('start-band-status')).toHaveTextContent(/Live · 72 bpm/);
    await fireEvent.press(screen.getByTestId('start-begin'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/live', params: expect.objectContaining({ type: 'yoga', start: '1', live: '1' }) });
    await view.unmount();
    expect(stopLive).not.toHaveBeenCalled();
  });

  it('stops its heart-rate preview when the screen closes without starting', async () => {
    const startLive = jest.fn(async () => undefined);
    const stopLive = jest.fn(async () => undefined);
    const view = await render(withAppData(<StartActivityScreen />, 'en', { startLive, stopLive }));
    await waitFor(() => expect(startLive).toHaveBeenCalled());
    await view.unmount();
    expect(stopLive).toHaveBeenCalled();
  });

  it('does not connect by itself when the band is not connected, and offers to connect', async () => {
    const startLive = jest.fn(async () => undefined);
    await render(withAppData(<StartActivityScreen />, 'en', { startLive, device: { ...device, connection: 'disconnected' } }));
    expect(screen.getByTestId('start-band-status')).toHaveTextContent('Not connected');
    expect(startLive).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('start-band-connect'));
    expect(startLive).toHaveBeenCalled();
  });

  it('switches the heart-rate broadcast on the band', async () => {
    const setHeartRateBroadcast = jest.fn(async () => true);
    const bandActions = { buzz: async () => true, stopBuzz: async () => true, setHeartRateBroadcast, writeConfig: async () => true, restoreConfig: async () => true };
    await render(withAppData(<StartActivityScreen />, 'en', { bandActions }));
    expect(screen.getByTestId('start-broadcast').props.value).toBe(false);
    await fireEvent(screen.getByTestId('start-broadcast'), 'valueChange', true);
    await waitFor(() => expect(setHeartRateBroadcast).toHaveBeenCalledWith(true));
    expect(screen.queryByTestId('start-broadcast-failed')).toBeNull();
  });

  it('says when the broadcast change failed', async () => {
    const bandActions = { buzz: async () => true, stopBuzz: async () => true, setHeartRateBroadcast: async () => false, writeConfig: async () => true, restoreConfig: async () => true };
    await render(withAppData(<StartActivityScreen />, 'en', { bandActions }));
    await fireEvent(screen.getByTestId('start-broadcast'), 'valueChange', true);
    expect(await screen.findByTestId('start-broadcast-failed')).toHaveTextContent(/did not take the change/);
  });

  it('offers no broadcast without a paired band and no buzz without a target', async () => {
    await render(withAppData(<StartActivityScreen />, 'en', { days: days.slice(-1), device: { ...device, name: null, connection: 'disconnected' } }));
    expect(screen.getByTestId('start-broadcast').props.disabled).toBe(true);
    expect(screen.getByText('Pair a band to broadcast its heart rate.')).toBeTruthy();
    expect(screen.getByTestId('start-buzz').props.disabled).toBe(true);
    expect(screen.getByTestId('start-buzz').props.value).toBe(false);
    expect(screen.getByText(/No target yet/)).toBeTruthy();
    expect(screen.getByTestId('start-band-status')).toHaveTextContent('No band paired');
  });

  it('shows the buzz target in Dutch', async () => {
    await render(withAppData(<StartActivityScreen />, 'nl'));
    expect(screen.getByText(/^Trilt bij \d/)).toBeTruthy();
  });
});

describe('hand-off from the start screen', () => {
  it('starts recording right away and stops the adopted heart-rate stream when the live screen closes', async () => {
    mockParams = { type: 'running', start: '1', live: '1' };
    const startLive = jest.fn(async () => undefined);
    const stopLive = jest.fn(async () => undefined);
    const view = await render(withAppData(<LiveActivityScreen />, 'en', { startLive, stopLive, live: { active: true, heartRate: 120, lastRrMs: 500, updatedAt: 1 } }));
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('live-begin')).toBeNull();
    await view.unmount();
    expect(stopLive).toHaveBeenCalled();
  });

  it('waits for Start when opened without the start flag', async () => {
    mockParams = { type: 'running' };
    const startLive = jest.fn(async () => undefined);
    await render(withAppData(<LiveActivityScreen />, 'en', { startLive }));
    expect(screen.getByTestId('live-begin')).toBeTruthy();
    expect(startLive).not.toHaveBeenCalled();
  });
});
