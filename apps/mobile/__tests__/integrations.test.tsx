import type { BodyMeasurement } from '@openhoop/core';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import BodyCompositionScreen from '@/app/health/body-composition';
import WelcomeScreen from '@/app/onboarding/index';
import IntegrationsScreen from '@/app/settings/integrations';
import { defaultHealthConnectState, type HealthConnectState } from '@/data/healthConnectState';
import type { HealthConnectView } from '@/data/types';

import { FIXTURE_NOW, fixtureAppData, withAppData } from './support/appData';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const NOW_S = Math.floor(FIXTURE_NOW.getTime() / 1000);

function view(patch: Partial<HealthConnectView> = {}, state: Partial<HealthConnectState> = {}): HealthConnectView {
  return { availability: 'available', granted: [], syncing: false, ...patch, state: { ...defaultHealthConnectState(), ...state } };
}

function bandSettings() {
  return { ...fixtureAppData().settings, dataSource: 'band' as const };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Integrations (M4) with Health Connect', () => {
  it('starts with every type off, nothing to sync, Strava off and the partner providers explained', async () => {
    await render(withAppData(<IntegrationsScreen />, 'en', { settings: bandSettings() }));
    expect(within(screen.getByTestId('hc-status')).getByText('Off')).toBeTruthy();
    expect(screen.getByTestId('hc-toggle-sleep').props.value).toBe(false);
    expect(screen.getByTestId('hc-sync').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Not synced yet')).toBeTruthy();
    expect(within(screen.getByTestId('strava-status')).getByText('Off')).toBeTruthy();
    expect(screen.getByTestId('integrations-others')).toBeTruthy();
    expect(screen.queryByTestId('not-built-integrations')).toBeNull();
    expect(screen.queryByTestId('hc-demo-note')).toBeNull();
  });

  it('turns a type on through the data layer, which asks Health Connect for that one permission', async () => {
    const setHealthConnectType = jest.fn(async () => true);
    await render(withAppData(<IntegrationsScreen />, 'en', { setHealthConnectType }));
    await fireEvent(screen.getByTestId('hc-toggle-sleep'), 'valueChange', true);
    expect(setHealthConnectType).toHaveBeenCalledWith('sleep', true);
  });

  it('offers steps as its own read switch and reports what the last sync imported', async () => {
    const setHealthConnectType = jest.fn(async () => true);
    const healthConnect = view(
      { granted: ['read:Steps'] },
      { import: { weight: false, bodyFat: false, steps: true }, lastSync: { at: NOW_S, results: { steps: { status: 'ok', count: 12 } } } },
    );
    await render(withAppData(<IntegrationsScreen />, 'en', { healthConnect, setHealthConnectType }));
    expect(screen.getByTestId('hc-toggle-steps').props.value).toBe(true);
    expect(screen.queryByTestId('hc-denied-steps')).toBeNull();
    expect(within(screen.getByTestId('hc-result-steps')).getByText('12 new or changed')).toBeTruthy();
    await fireEvent(screen.getByTestId('hc-toggle-steps'), 'valueChange', false);
    expect(setHealthConnectType).toHaveBeenCalledWith('steps', false);
  });

  it('keeps body fat off until weight is read', async () => {
    await render(withAppData(<IntegrationsScreen />));
    expect(screen.getByTestId('hc-toggle-bodyFat').props.disabled).toBe(true);
  });

  it('flags enabled types that Health Connect does not allow and offers to ask again', async () => {
    const requestHealthConnectAccess = jest.fn(async () => undefined);
    const state = defaultHealthConnectState();
    state.export.hrv = true;
    state.export.sleep = true;
    await render(
      withAppData(<IntegrationsScreen />, 'en', {
        healthConnect: view({ granted: ['write:SleepSession'] }, state),
        requestHealthConnectAccess,
      }),
    );
    expect(screen.getByTestId('hc-denied-hrv')).toBeTruthy();
    expect(screen.queryByTestId('hc-denied-sleep')).toBeNull();
    expect(within(screen.getByTestId('hc-status')).getByText('On')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('hc-allow'));
    expect(requestHealthConnectAccess).toHaveBeenCalled();
  });

  it('syncs on demand and shows the last sync with per-type counts and failures', async () => {
    const syncHealthConnect = jest.fn(async () => undefined);
    const state = defaultHealthConnectState();
    state.export.sleep = true;
    state.import.weight = true;
    state.lastSync = {
      at: NOW_S - 120,
      results: { sleep: { status: 'ok', count: 4 }, weight: { status: 'ok', count: 2 }, hrv: { status: 'error', step: 'write' }, spo2: { status: 'denied' } },
    };
    await render(withAppData(<IntegrationsScreen />, 'en', { healthConnect: view({}, state), syncHealthConnect, settings: bandSettings() }));
    await fireEvent.press(screen.getByTestId('hc-sync'));
    expect(syncHealthConnect).toHaveBeenCalled();
    expect(screen.getByText('Last sync 2 min ago')).toBeTruthy();
    expect(within(screen.getByTestId('hc-result-sleep')).getByText('4 written')).toBeTruthy();
    expect(within(screen.getByTestId('hc-result-weight')).getByText('2 new or changed')).toBeTruthy();
    expect(within(screen.getByTestId('hc-result-hrv')).getByText('Could not write')).toBeTruthy();
    expect(within(screen.getByTestId('hc-result-spo2')).getByText('Permission missing')).toBeTruthy();
  });

  it('disables sync while it runs', async () => {
    const state = defaultHealthConnectState();
    state.export.sleep = true;
    await render(withAppData(<IntegrationsScreen />, 'en', { healthConnect: view({ syncing: true }, state) }));
    expect(screen.getByTestId('hc-sync').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Syncing…')).toBeTruthy();
  });

  it('says that demo data is never written', async () => {
    await render(withAppData(<IntegrationsScreen />));
    expect(screen.getByTestId('hc-demo-note')).toBeTruthy();
  });

  it('turns sync after band sync on and opens Health Connect to manage access', async () => {
    const setHealthConnectAfterSync = jest.fn(async () => undefined);
    const openHealthConnectSettings = jest.fn();
    await render(withAppData(<IntegrationsScreen />, 'en', { setHealthConnectAfterSync, openHealthConnectSettings }));
    await fireEvent(screen.getByTestId('hc-toggle-after-sync'), 'valueChange', true);
    expect(setHealthConnectAfterSync).toHaveBeenCalledWith(true);
    await fireEvent.press(screen.getByTestId('hc-manage'));
    expect(openHealthConnectSettings).toHaveBeenCalled();
  });

  it('links to the Play Store when Health Connect is missing or outdated', async () => {
    const installHealthConnect = jest.fn(async () => undefined);
    const refreshHealthConnect = jest.fn(async () => undefined);
    await render(withAppData(<IntegrationsScreen />, 'en', { healthConnect: view({ availability: 'not-installed' }), installHealthConnect, refreshHealthConnect }));
    expect(screen.queryByTestId('hc-panel')).toBeNull();
    await fireEvent.press(screen.getByTestId('hc-not-installed-action'));
    expect(installHealthConnect).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('hc-not-installed-recheck'));
    expect(refreshHealthConnect).toHaveBeenCalled();
    await render(withAppData(<IntegrationsScreen />, 'nl', { healthConnect: view({ availability: 'update-required' }) }));
    expect(screen.getByText('Health Connect bijwerken')).toBeTruthy();
  });

  it('shows Android only on other phones', async () => {
    await render(withAppData(<IntegrationsScreen />, 'en', { healthConnect: view({ availability: 'unsupported' }) }));
    expect(screen.getByTestId('hc-unsupported')).toBeTruthy();
    expect(within(screen.getByTestId('hc-status')).getByText('Android only')).toBeTruthy();
    expect(screen.queryByTestId('hc-sync')).toBeNull();
  });
});

describe('Welcome (A1) "I already have data"', () => {
  it('opens Integrations, where both Health Connect and file import live', async () => {
    await render(withAppData(<WelcomeScreen />));
    await fireEvent.press(screen.getByTestId('welcome-have-data'));
    expect(router.push).toHaveBeenCalledWith('/settings/integrations');
  });
});

describe('Body log source labels', () => {
  it('labels imported entries with Health Connect and the app they came from', async () => {
    const entries: BodyMeasurement[] = [
      { id: 1, day: '2026-11-20', weightKg: 80, bodyFatPct: null, createdAt: 1, source: 'manual', origin: null },
      { id: 2, day: '2026-11-21', weightKg: 79.5, bodyFatPct: null, createdAt: 2, source: 'health_connect', origin: 'com.example.scale' },
      { id: 3, day: '2026-11-22', weightKg: 79.4, bodyFatPct: null, createdAt: 3, source: 'health_connect', origin: null },
    ];
    await render(withAppData(<BodyCompositionScreen />, 'en', { bodyMeasurements: entries }));
    expect(screen.queryByTestId('body-source-1')).toBeNull();
    expect(screen.getByTestId('body-source-2')).toHaveTextContent('From Health Connect (com.example.scale)');
    expect(screen.getByTestId('body-source-3')).toHaveTextContent('From Health Connect');
  });
});
