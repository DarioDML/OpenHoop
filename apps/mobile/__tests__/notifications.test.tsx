import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createFixtureDays } from '@/data/fixtureSource';
import type { NotificationPrefs } from '@/data/userData';
import type { InboxEntry } from '@/lib/notificationPlan';

import { FIXTURE_NOW, fixtureAppData, withAppData } from './support/appData';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import NotificationsScreen from '@/app/home/notifications';
import PermissionsScreen from '@/app/onboarding/permissions';
import AppSettingsScreen from '@/app/settings/app';
import { HomeHeader } from '@/ui/daily/HomeHeader';

const NOW_MS = Date.now();
const ON: NotificationPrefs = { enabled: true, morningDigest: true, syncProblems: true, goals: true, quietStart: '22:00', quietEnd: '07:00' };

const INBOX: InboxEntry[] = [
  { kind: 'syncFailed', id: 'sync:2', at: NOW_MS - 3_600_000, read: false },
  { kind: 'digest', id: 'digest:2026-11-25', at: NOW_MS - 7_200_000, day: '2026-11-25', readiness: 64, sleepScore: 78, load: null, read: true },
];

function granted(prefs: NotificationPrefs = ON) {
  const base = fixtureAppData();
  return { notificationPermission: 'granted' as const, userData: { ...base.userData, notifications: prefs } };
}

beforeEach(() => {
  mockPush.mockClear();
});

describe('Notification inbox', () => {
  it('lists what was sent, marks it read and filters by kind', async () => {
    const markInboxRead = jest.fn(async () => undefined);
    const refreshNotifications = jest.fn(async () => undefined);
    await render(withAppData(<NotificationsScreen />, 'en', { ...granted(), inbox: INBOX, markInboxRead, refreshNotifications }));
    expect(screen.getByText('Sync failed')).toBeTruthy();
    expect(screen.getByText('Readiness 64% · Sleep score 78')).toBeTruthy();
    expect(screen.getByTestId('unread-sync:2')).toBeTruthy();
    expect(screen.queryByTestId('unread-digest:2026-11-25')).toBeNull();
    expect(screen.queryByTestId('notifications-off')).toBeNull();
    await waitFor(() => expect(refreshNotifications).toHaveBeenCalled());
    expect(markInboxRead).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('mark-all-read'));
    expect(markInboxRead).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('filter-insights'));
    expect(screen.queryByText('Sync failed')).toBeNull();
    expect(screen.getByText('Morning digest')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('filter-device'));
    expect(screen.getByText('Sync failed')).toBeTruthy();
    expect(screen.queryByText('Morning digest')).toBeNull();
  });

  it('clears the inbox on request', async () => {
    const clearInbox = jest.fn(async () => undefined);
    await render(withAppData(<NotificationsScreen />, 'en', { ...granted(), inbox: INBOX, clearInbox }));
    await fireEvent.press(screen.getByTestId('inbox-clear'));
    expect(clearInbox).toHaveBeenCalled();
  });

  it('shows the quiet hours and an honest empty state while notifications are off', async () => {
    await render(withAppData(<NotificationsScreen />, 'nl'));
    expect(screen.getByTestId('notifications-off')).toBeTruthy();
    expect(screen.getByTestId('inbox-empty')).toBeTruthy();
    expect(screen.getByText('Tussen 22:00 en 07:00 wordt niets verstuurd. Meldingen die in die tijd vallen, wachten tot het voorbij is.')).toBeTruthy();
    expect(screen.queryByTestId('inbox-clear')).toBeNull();
    await fireEvent.press(screen.getByText('Aanzetten'));
    expect(mockPush).toHaveBeenCalledWith('/settings/app');
  });
});

describe('Notification groups and goals', () => {
  it('groups today and earlier, filters goals and opens the settings from the gear', async () => {
    const today = new Date();
    const morning = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 30).getTime();
    const goal: InboxEntry = { kind: 'goal', id: 'goal:sleep:2026-11-23', at: morning - 3 * 86_400_000, goal: 'sleep', week: '2026-11-23', count: 4, target: 4, scoreMin: 80, read: true };
    const fresh: InboxEntry = { kind: 'syncFailed', id: 'sync:9', at: morning, read: false };
    await render(withAppData(<NotificationsScreen />, 'en', { ...granted(), inbox: [fresh, goal] }));
    expect(within(screen.getByTestId('group-today')).getByText('Sync failed')).toBeTruthy();
    expect(within(screen.getByTestId('group-earlier')).getByText('Sleep goal reached')).toBeTruthy();
    expect(screen.getByTestId('mark-all-read')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('filter-goals'));
    expect(screen.queryByText('Sync failed')).toBeNull();
    expect(screen.getByText('Weekly plan: 4 of 4 nights at 80%+.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('notifications-settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings/app');
  });

  it('keeps mark all read reachable when the chosen filter is empty', async () => {
    const markInboxRead = jest.fn(async () => undefined);
    await render(withAppData(<NotificationsScreen />, 'en', { ...granted(), inbox: INBOX, markInboxRead }));
    await fireEvent.press(screen.getByTestId('filter-goals'));
    expect(screen.getByTestId('inbox-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('mark-all-read'));
    expect(markInboxRead).toHaveBeenCalled();
  });

  it('marks one row read and opens what it is about', async () => {
    const markInboxRead = jest.fn(async () => undefined);
    await render(withAppData(<NotificationsScreen />, 'en', { ...granted(), inbox: INBOX, markInboxRead }));
    await fireEvent.press(screen.getByTestId('inbox-sync:2'));
    expect(markInboxRead).toHaveBeenCalledWith(['sync:2']);
    expect(mockPush).toHaveBeenCalledWith('/settings/device');
    markInboxRead.mockClear();
    await fireEvent.press(screen.getByTestId('inbox-digest:2026-11-25'));
    expect(markInboxRead).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/home/morning-brief');
  });

  it('hides mark all read when nothing is unread', async () => {
    await render(withAppData(<NotificationsScreen />, 'en', { ...granted(), inbox: INBOX.map((entry) => ({ ...entry, read: true })) }));
    expect(screen.queryByTestId('mark-all-read')).toBeNull();
  });

  it('turns weekly goal alerts off in the app settings', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<AppSettingsScreen />, 'en', { ...granted(), updateUserData }));
    await fireEvent(screen.getByTestId('toggle-goals'), 'valueChange', false);
    expect(updateUserData).toHaveBeenLastCalledWith({ notifications: { ...ON, goals: false } });
  });
});

describe('Bell on Home', () => {
  const days = createFixtureDays(FIXTURE_NOW);

  it('shows the unread count', async () => {
    await render(withAppData(<HomeHeader days={days} index={days.length - 1} />, 'en', { inbox: INBOX }));
    expect(screen.getByTestId('bell-badge')).toBeTruthy();
    expect(screen.getByLabelText('Notifications, 1 unread')).toBeTruthy();
  });

  it('shows no badge when everything is read', async () => {
    await render(withAppData(<HomeHeader days={days} index={days.length - 1} />, 'en', { inbox: INBOX.map((entry) => ({ ...entry, read: true })) }));
    expect(screen.queryByTestId('bell-badge')).toBeNull();
  });
});

describe('Notification settings', () => {
  it('asks the phone for permission only through the main switch', async () => {
    const setNotificationsEnabled = jest.fn(async () => 'granted' as const);
    await render(withAppData(<AppSettingsScreen />, 'en', { setNotificationsEnabled }));
    expect(screen.getByTestId('toggle-morning-digest').props.disabled).toBe(true);
    await fireEvent(screen.getByTestId('toggle-notifications'), 'valueChange', true);
    expect(setNotificationsEnabled).toHaveBeenCalledWith(true);
  });

  it('stores the digest, sync and quiet-hour preferences', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<AppSettingsScreen />, 'en', { ...granted(), updateUserData }));
    await fireEvent(screen.getByTestId('toggle-morning-digest'), 'valueChange', false);
    expect(updateUserData).toHaveBeenLastCalledWith({ notifications: { ...ON, morningDigest: false } });
    await fireEvent(screen.getByTestId('toggle-sync-problems'), 'valueChange', false);
    expect(updateUserData).toHaveBeenLastCalledWith({ notifications: { ...ON, syncProblems: false } });

    await fireEvent.changeText(screen.getByTestId('quiet-end'), '25:00');
    await fireEvent(screen.getByTestId('quiet-end'), 'endEditing');
    expect(screen.getByText('Not a valid time. Use HH:MM.')).toBeTruthy();
    expect(updateUserData).toHaveBeenCalledTimes(2);

    await fireEvent.changeText(screen.getByTestId('quiet-end'), '08:30');
    await fireEvent(screen.getByTestId('quiet-end'), 'endEditing');
    expect(updateUserData).toHaveBeenLastCalledWith({ notifications: { ...ON, quietEnd: '08:30' } });
    expect(screen.queryByTestId('not-built-notifications')).toBeNull();
  });

  it('explains when the phone blocks notifications', async () => {
    await render(withAppData(<AppSettingsScreen />, 'en', { notificationPermission: 'denied' }));
    expect(screen.getByTestId('notifications-blocked')).toBeTruthy();
  });
});

describe('Permissions during onboarding', () => {
  it('turns notifications on from the permissions step', async () => {
    const setNotificationsEnabled = jest.fn(async () => 'granted' as const);
    await render(withAppData(<PermissionsScreen />, 'en', { setNotificationsEnabled }));
    expect(screen.queryByTestId('not-built-notifications')).toBeNull();
    await fireEvent(screen.getByTestId('permission-notifications-toggle'), 'valueChange', true);
    expect(setNotificationsEnabled).toHaveBeenCalledWith(true);
  });

  it('says so when the phone blocks notifications', async () => {
    await render(withAppData(<PermissionsScreen />, 'en', { notificationPermission: 'denied' }));
    expect(screen.getByTestId('permission-notifications-blocked')).toBeTruthy();
  });
});
