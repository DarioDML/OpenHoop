import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';

import StravaSettingsScreen from '@/app/settings/strava';
import type { ActivityEntry } from '@/data/activities';
import { defaultUserData } from '@/data/userData';
import type { AppData } from '@/data/types';
import { StravaUploadCard } from '@/ui/strava/StravaUploadCard';

import { withAppData } from './support/appData';
import { CLIENT, NOW_S, STRAVA_ON, StravaHost, fakeStrava, json, makeStrava, memoryVault, tokens } from './support/strava';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const ENTRY: ActivityEntry = {
  key: 'a:7',
  kind: 'manual',
  id: 7,
  detectedStart: null,
  type: 'running',
  label: null,
  start: NOW_S - 3_600,
  end: NOW_S - 1_800,
  note: 'private note',
  metrics: { activeS: 1_800, load: null, loadReason: null, zoneSeconds: [], avgHr: null, maxHr: null, activeMinutes: null },
  hasLoad: false,
};

function withStrava(children: ReactNode, strava: ReturnType<typeof makeStrava>, overrides: Partial<AppData> = {}) {
  return withAppData(<StravaHost controller={strava.controller}>{children}</StravaHost>, 'en', overrides);
}

function stravaOn(): Partial<AppData> {
  return { userData: { ...defaultUserData(), network: STRAVA_ON } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Strava settings', () => {
  it('explains the network switch and the own-app setup, and keeps the secret out of view after saving', async () => {
    const strava = makeStrava();
    await strava.controller.load();
    await render(withStrava(<StravaSettingsScreen />, strava));
    expect(screen.getByTestId('strava-network-off')).toBeTruthy();
    expect(screen.getByText('2. Set Authorization Callback Domain to: localhost')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('strava-open-privacy'));
    expect(router.push).toHaveBeenCalledWith('/settings/privacy');
    await fireEvent.changeText(screen.getByTestId('strava-client-id'), CLIENT.clientId);
    await fireEvent.changeText(screen.getByTestId('strava-client-secret'), CLIENT.clientSecret);
    expect(screen.getByTestId('strava-client-secret').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByTestId('strava-save-client'));
    await waitFor(() => expect(screen.getByTestId('strava-connection')).toBeTruthy());
    expect(strava.vault.client).toEqual(CLIENT);
    expect(screen.queryByDisplayValue(CLIENT.clientSecret)).toBeNull();
    expect(screen.getByTestId('strava-connect').props.accessibilityState.disabled).toBe(true);
  });

  it('rejects details that are not a Strava client ID and secret', async () => {
    const strava = makeStrava();
    await render(withStrava(<StravaSettingsScreen />, strava, stravaOn()));
    await fireEvent.changeText(screen.getByTestId('strava-client-id'), 'abc');
    await fireEvent.changeText(screen.getByTestId('strava-client-secret'), 'nope');
    await fireEvent.press(screen.getByTestId('strava-save-client'));
    expect(screen.getByText(/does not look like a Strava Client ID/)).toBeTruthy();
    expect(strava.vault.client).toBeNull();
  });

  it('connects through the browser and shows the reconnect state honestly', async () => {
    const strava = makeStrava({ vault: memoryVault(CLIENT), redirect: { type: 'cancel' } });
    await strava.controller.load();
    await render(withStrava(<StravaSettingsScreen />, strava, stravaOn()));
    await fireEvent.press(screen.getByTestId('strava-connect'));
    await waitFor(() => expect(screen.getByTestId('strava-error')).toBeTruthy());
    expect(screen.getByText('Sign-in was closed before it finished.')).toBeTruthy();
    expect(strava.opened[0]).toMatch(/^https:\/\/www\.strava\.com\/oauth\/mobile\/authorize\?/);
  });

  it('shows the connected state with the upload count and a disconnect button', async () => {
    const strava = makeStrava({ vault: memoryVault(CLIENT, tokens()) });
    await strava.controller.load();
    await render(withStrava(<StravaSettingsScreen />, strava, stravaOn()));
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByTestId('strava-uploaded')).toBeTruthy();
    expect(screen.getByTestId('strava-disconnect')).toBeTruthy();
  });
});

describe('Upload to Strava on an activity', () => {
  it('points to the setup while Strava is not connected', async () => {
    const strava = makeStrava();
    await render(withStrava(<StravaUploadCard entry={ENTRY} title="Running" tzOffsetS={0} />, strava, stravaOn()));
    await fireEvent.press(screen.getByTestId('strava-upload-setup'));
    expect(router.push).toHaveBeenCalledWith('/settings/strava');
    expect(screen.queryByTestId('strava-upload')).toBeNull();
  });

  it('says exactly what is sent, hides the route ends by default and uploads once', async () => {
    const { send, sent } = fakeStrava([json(201, { id: 99, name: 'Running' })]);
    const strava = makeStrava({ vault: memoryVault(CLIENT, tokens()), send });
    await strava.controller.load();
    await render(withStrava(<StravaUploadCard entry={ENTRY} title="Running" tzOffsetS={0} />, strava, stravaOn()));
    await fireEvent.press(screen.getByTestId('strava-upload'));
    await waitFor(() => expect(screen.getByTestId('strava-upload-manual')).toBeTruthy());
    expect(screen.getByTestId('strava-upload-sends').props.children).toContain('type Run');
    expect(screen.getByText('No band heart rate during this activity.')).toBeTruthy();
    expect(screen.getByText('Your notes are never sent.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('strava-upload-confirm'));
    await waitFor(() => expect(screen.getByTestId('strava-upload-done')).toBeTruthy());
    expect(sent).toHaveLength(1);
    expect(sent[0]?.init.body).not.toContain('private');
    expect(screen.queryByTestId('strava-upload')).toBeNull();
  });
});
