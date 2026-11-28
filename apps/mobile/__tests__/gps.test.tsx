import type { ActivityRow } from '@openhoop/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { LocationObject } from 'expo-location';

import type { RoutePoint } from '@/data/route';
import type { ActivityDraft } from '@/data/types';
import { createFixtureDays } from '@/data/fixtureSource';
import { defaultUserData } from '@/data/userData';
import { setNetworkPrefs } from '@/net';
import { defaultNetworkPrefs, type NetworkPrefs } from '@/net/features';

import { FIXTURE_NOW, fixtureBandActions, withAppData } from './support/appData';

type Permission = { granted: boolean; status: string; android?: { accuracy: 'fine' | 'coarse' | 'none' } };

let mockParams: Record<string, string> = {};
let mockPermission: Permission = { granted: true, status: 'granted', android: { accuracy: 'fine' } };
let mockWatchFails = false;
let mockOnLocation: ((location: LocationObject) => void) | null = null;
const mockRemove = jest.fn();
const mockWatch = jest.fn();
const mockRequest = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: async () => {
    mockRequest();
    return mockPermission;
  },
  watchPositionAsync: async (options: object, callback: (location: LocationObject) => void) => {
    mockWatch(options);
    if (mockWatchFails) throw new Error('location services off');
    mockOnLocation = callback;
    return { remove: mockRemove };
  },
}));

import ActivityDetailsScreen from '@/app/activity/details';
import GpsActivityScreen from '@/app/activity/gps';
import StartActivityScreen from '@/app/activity/start';
import PrivacyScreen from '@/app/settings/privacy';

const LAT = 51.05;
const LON = 3.72;
const M_PER_DEG = 111_195;
const MAPS_ON: NetworkPrefs = { enabled: true, features: { coach: false, maps: true, labs: false, strava: false } };

function location(tMs: number, northM: number, accuracy = 5): LocationObject {
  return {
    timestamp: tMs,
    coords: { latitude: LAT + northM / M_PER_DEG, longitude: LON, altitude: 12, accuracy, altitudeAccuracy: null, heading: null, speed: null },
  };
}

function routeLine(count: number, stepM: number): RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({ tMs: 1_000_000 + i * 30_000, lat: LAT + (i * stepM) / M_PER_DEG, lon: LON, altM: 10 + (i % 2) * 5, accuracyM: 5, segment: 0 }));
}

function activity(over: Partial<ActivityRow> = {}): ActivityRow {
  const days = createFixtureDays(FIXTURE_NOW);
  const day = days[days.length - 1];
  const start = (day?.start ?? 0) + 3600;
  return {
    id: 7,
    deviceId: 1,
    source: 'live',
    detectedStart: null,
    type: 'running',
    start,
    end: start + 1500,
    paused: [],
    note: null,
    deletedAt: null,
    metrics: { activeS: 1500, load: 6.2, loadReason: null, zoneSeconds: [0, 300, 600, 600, 0, 0], avgHr: 141, maxHr: 172, hrSeconds: 1500, activeMinutes: null },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

async function layout(testID: string): Promise<void> {
  await fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 220 } } });
}

beforeEach(() => {
  mockParams = {};
  mockPermission = { granted: true, status: 'granted', android: { accuracy: 'fine' } };
  mockWatchFails = false;
  mockOnLocation = null;
  setNetworkPrefs(defaultNetworkPrefs());
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('start screen', () => {
  it('offers a start with a route through the GPS switch', async () => {
    mockParams = { type: 'yoga' };
    await render(withAppData(<StartActivityScreen />));
    expect(screen.getByTestId('start-gps').props.value).toBe(false);
    await fireEvent(screen.getByTestId('start-gps'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('start-begin'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/gps', params: expect.objectContaining({ type: 'yoga', start: '1' }) });
  });
});

describe('live GPS activity', () => {
  it('asks for location only on start, records a filtered route and saves it with the activity', async () => {
    let nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockParams = { type: 'running' };
    const startLive = jest.fn(async () => undefined);
    const stopLive = jest.fn(async () => undefined);
    const saveActivity = jest.fn(async (_draft: ActivityDraft): Promise<number | null> => 42);
    await render(withAppData(<GpsActivityScreen />, 'en', { startLive, stopLive, saveActivity }));
    expect(screen.getByTestId('gps-rationale')).toHaveTextContent(/only while this activity records/);
    expect(mockRequest).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('gps-begin'));
    await waitFor(() => expect(startLive).toHaveBeenCalled());
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockWatch).toHaveBeenCalledWith(expect.objectContaining({ accuracy: 4 }));
    const start = Math.floor(nowMs / 1000);
    expect(screen.getByTestId('gps-waiting')).toHaveTextContent('Waiting for a GPS fix…');

    for (let i = 0; i < 40; i++) {
      nowMs += 2000;
      await act(async () => mockOnLocation?.(location(nowMs, i * 10)));
    }
    nowMs += 2000;
    await act(async () => mockOnLocation?.(location(nowMs, 400, 80)));
    nowMs += 2000;
    await act(async () => mockOnLocation?.(location(nowMs, 5000)));

    expect(screen.getByTestId('gps-distance')).toHaveTextContent(/0\.39\s*km/);
    await fireEvent.press(screen.getByTestId('gps-pause'));
    expect(screen.getByTestId('gps-pace')).toHaveTextContent(/\d:\d\d\s*\/km/);
    await fireEvent.press(screen.getByTestId('gps-resume'));
    expect(screen.getByTestId('gps-skipped')).toHaveTextContent('2 unreliable GPS fixes skipped');
    expect(screen.getByTestId('gps-accuracy')).toHaveTextContent(/±\d+ m/);
    await layout('gps-map');
    expect(screen.queryByTestId('route-tile')).toBeNull();

    await fireEvent.press(screen.getByTestId('gps-stop'));
    await waitFor(() => expect(saveActivity).toHaveBeenCalled());
    expect(mockRemove).toHaveBeenCalled();
    expect(stopLive).toHaveBeenCalled();
    const draft = saveActivity.mock.calls[0]?.[0];
    expect(draft).toMatchObject({ source: 'live', type: 'running', start });
    const route = draft?.route ?? [];
    expect(route).toHaveLength(40);
    expect(route.every((p) => p.segment === 0 && p.accuracyM === 5)).toBe(true);
    expect(await screen.findByTestId('gps-saved')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('gps-view'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/details', params: { id: '42' } });
  });

  it('shows the GPS signal and the latest splits, per mile with imperial units', async () => {
    let nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockParams = { type: 'running', start: '1' };
    const settings = { language: 'en' as const, dataSource: 'demo' as const, ownerSince: null, units: 'imperial' as const };
    await render(withAppData(<GpsActivityScreen />, 'en', { settings }));
    await waitFor(() => expect(screen.getByTestId('gps-pause')).toBeTruthy());
    expect(screen.getByTestId('gps-signal').props.accessibilityLabel).toBe('No GPS signal');
    expect(screen.getByTestId('gps-pace')).toHaveTextContent(/Needs 330 ft/);
    for (let i = 0; i < 170; i++) {
      nowMs += 2000;
      await act(async () => mockOnLocation?.(location(nowMs, i * 10)));
    }
    expect(screen.getByTestId('gps-signal').props.accessibilityLabel).toMatch(/^Good GPS signal · GPS accuracy ±5 m$/);
    expect(screen.getByTestId('gps-distance')).toHaveTextContent(/1\.05\s*mi/);
    await fireEvent.press(screen.getByTestId('gps-pause'));
    expect(screen.getByTestId('gps-pace')).toHaveTextContent(/\d:\d\d\s*\/mi/);
    expect(screen.getByTestId('gps-splits')).toHaveTextContent(/mi 1/);
    expect(screen.queryByText(/mi 2/)).toBeNull();
  });

  it('shows the saved buzz state and never buzzes the band itself', async () => {
    const nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockParams = { type: 'running', start: '1' };
    const buzz = jest.fn(async () => true);
    const userData = { ...defaultUserData(), onboardingDone: true, loadBuzz: { atTarget: true, overTop: false, lastTarget: null, lastTop: null } };
    await render(withAppData(<GpsActivityScreen />, 'en', { userData, bandActions: { ...fixtureBandActions(), buzz } }));
    await waitFor(() => expect(screen.getByTestId('gps-pause')).toBeTruthy());
    for (let i = 0; i < 5; i++) await act(async () => mockOnLocation?.(location(nowMs + i * 2000, i * 10)));
    expect(screen.getByTestId('gps-buzz')).toHaveTextContent(/^Buzz at \d/);
    expect(buzz).not.toHaveBeenCalled();
  });

  it('lists the newest kilometre splits first', async () => {
    let nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockParams = { type: 'running', start: '1' };
    await render(withAppData(<GpsActivityScreen />));
    await waitFor(() => expect(screen.getByTestId('gps-pause')).toBeTruthy());
    expect(screen.queryByTestId('gps-splits')).toBeNull();
    for (let i = 0; i < 205; i++) {
      nowMs += 2000;
      await act(async () => mockOnLocation?.(location(nowMs, i * 10)));
    }
    expect(screen.getAllByText(/^km \d$/).map((node) => node.props.children)).toEqual(['km 2', 'km 1']);
  }, 30_000);

  it('starts a new segment after a pause and ignores fixes while paused', async () => {
    let nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    const saveActivity = jest.fn(async (_draft: ActivityDraft): Promise<number | null> => 43);
    await render(withAppData(<GpsActivityScreen />, 'en', { saveActivity }));
    await fireEvent.press(screen.getByTestId('gps-begin'));
    await waitFor(() => expect(screen.getByTestId('gps-pause')).toBeTruthy());
    for (let i = 0; i < 5; i++) {
      nowMs += 2000;
      await act(async () => mockOnLocation?.(location(nowMs, i * 10)));
    }
    await fireEvent.press(screen.getByTestId('gps-pause'));
    nowMs += 2000;
    await act(async () => mockOnLocation?.(location(nowMs, 500)));
    await fireEvent.press(screen.getByTestId('gps-resume'));
    for (let i = 0; i < 5; i++) {
      nowMs += 2000;
      await act(async () => mockOnLocation?.(location(nowMs, 2000 + i * 10)));
    }
    nowMs += 60_000;
    await fireEvent.press(screen.getByTestId('gps-stop'));
    await waitFor(() => expect(saveActivity).toHaveBeenCalled());
    expect((saveActivity.mock.calls[0]?.[0].route ?? []).map((p) => p.segment)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it('does not save a route when too few fixes came in', async () => {
    let nowMs = FIXTURE_NOW.getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    const saveActivity = jest.fn(async (_draft: ActivityDraft): Promise<number | null> => 44);
    await render(withAppData(<GpsActivityScreen />, 'en', { saveActivity }));
    await fireEvent.press(screen.getByTestId('gps-begin'));
    await waitFor(() => expect(screen.getByTestId('gps-stop')).toBeTruthy());
    nowMs += 90_000;
    await fireEvent.press(screen.getByTestId('gps-stop'));
    await waitFor(() => expect(saveActivity).toHaveBeenCalled());
    expect(saveActivity.mock.calls[0]?.[0]).not.toHaveProperty('route');
  });

  it.each([
    ['denied', { granted: false, status: 'denied' }, /not allowed/],
    ['approximate', { granted: true, status: 'granted', android: { accuracy: 'coarse' as const } }, /Precise location is off/],
  ])('explains a %s permission and offers heart rate only', async (state, permission, text) => {
    mockPermission = permission;
    mockParams = { type: 'walking' };
    const startLive = jest.fn(async () => undefined);
    await render(withAppData(<GpsActivityScreen />, 'en', { startLive }));
    await fireEvent.press(screen.getByTestId('gps-begin'));
    expect(await screen.findByTestId(`gps-${state}`)).toHaveTextContent(text);
    expect(startLive).not.toHaveBeenCalled();
    expect(mockWatch).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('gps-without-route'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/activity/live', params: { type: 'walking', start: '1' } });
  });

  it('says so when GPS cannot start', async () => {
    mockWatchFails = true;
    const startLive = jest.fn(async () => undefined);
    await render(withAppData(<GpsActivityScreen />, 'en', { startLive }));
    await fireEvent.press(screen.getByTestId('gps-begin'));
    expect(await screen.findByTestId('gps-unavailable')).toHaveTextContent(/could not be started/);
    expect(startLive).not.toHaveBeenCalled();
  });

  it('stops watching the location when the screen closes', async () => {
    const view = await render(withAppData(<GpsActivityScreen />));
    await fireEvent.press(screen.getByTestId('gps-begin'));
    await waitFor(() => expect(mockWatch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('gps-stop')).toBeTruthy());
    await view.unmount();
    expect(mockRemove).toHaveBeenCalled();
  });

  it('shows Dutch text', async () => {
    await render(withAppData(<GpsActivityScreen />, 'nl'));
    expect(screen.getByTestId('gps-rationale')).toHaveTextContent(/alleen terwijl deze activiteit loopt/);
  });
});

describe('route on the activity details', () => {
  it('draws the route without network, hides the ends and shows distance, pace, elevation and splits', async () => {
    mockParams = { id: '7' };
    const routeFor = jest.fn(async () => routeLine(31, 100));
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()], routeFor, updateUserData }));
    expect(await screen.findByTestId('detail-route')).toBeTruthy();
    expect(routeFor).toHaveBeenCalledWith(7);
    expect(screen.getByTestId('route-distance')).toHaveTextContent(/3\.00\s*km/);
    expect(screen.getByTestId('route-pace')).toHaveTextContent(/8:20\s*\/km/);
    expect(screen.getByTestId('route-elevation')).toHaveTextContent(/75\s*m/);
    expect(screen.getByTestId('route-hidden')).toBeTruthy();
    expect(screen.getByTestId('route-splits')).toHaveTextContent(/1 km/);
    expect(screen.getByTestId('route-map-off')).toBeTruthy();
    await layout('route-map');
    expect(screen.queryByTestId('route-tile')).toBeNull();
    expect(screen.queryByTestId('route-attribution')).toBeNull();
    await fireEvent(screen.getByTestId('route-hide-toggle'), 'valueChange', false);
    expect(updateUserData).toHaveBeenCalledWith({ hideRouteEnds: false });
    await fireEvent.press(screen.getByTestId('route-privacy'));
    expect(router.push).toHaveBeenCalledWith('/settings/privacy');
  });

  it('loads OpenStreetMap tiles with attribution only when Maps is on in both the settings and the gate', async () => {
    mockParams = { id: '7' };
    const routeFor = jest.fn(async () => routeLine(31, 100));
    const userData = { ...defaultUserData(), onboardingDone: true, network: MAPS_ON };
    const view = await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()], routeFor, userData }));
    await screen.findByTestId('route-map');
    await layout('route-map');
    expect(screen.queryByTestId('route-tile')).toBeNull();

    setNetworkPrefs(MAPS_ON);
    await view.rerender(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()], routeFor, userData: { ...userData } }));
    await layout('route-map');
    const tiles = screen.getAllByTestId('route-tile');
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(12);
    for (const tile of tiles) {
      const source = tile.props.source as { uri: string; headers: Record<string, string> };
      expect(source.uri).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
      expect(source.headers).toEqual({ 'User-Agent': expect.stringMatching(/^OpenHoop\/\S+ \(\+https:\/\/github\.com\/DarioDML\/OpenHoop\)$/) });
    }
    expect(screen.getByTestId('route-attribution')).toHaveTextContent('© OpenStreetMap contributors');
    expect(screen.queryByTestId('route-map-off')).toBeNull();
  });

  it('says when nothing is left with the ends hidden', async () => {
    mockParams = { id: '7' };
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity()], routeFor: async () => routeLine(4, 100) }));
    expect(await screen.findByTestId('route-too-short')).toBeTruthy();
  });

  it('shows that an activity has no route', async () => {
    mockParams = { id: '7' };
    await render(withAppData(<ActivityDetailsScreen />, 'en', { activities: [activity({ source: 'manual' })] }));
    expect(await screen.findByTestId('detail-no-route')).toHaveTextContent(/No route/);
  });
});

describe('privacy settings', () => {
  it('lists what the maps feature sends and to whom, off by default', async () => {
    await render(withAppData(<PrivacyScreen />));
    expect(screen.getByTestId('network-feature-maps').props.value).toBe(false);
    expect(screen.getByTestId('network-feature-maps').props.disabled).toBe(true);
    expect(screen.getByText(/map tiles around a saved route/)).toBeTruthy();
    expect(screen.getByText(/tile\.openstreetmap\.org/)).toBeTruthy();
  });
});
