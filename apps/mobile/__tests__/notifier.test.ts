import * as Notifications from 'expo-notifications';

import { expoNotifier } from '@/data/notifier';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
}));

const mocked = jest.mocked(Notifications);

function status(granted: boolean, canAskAgain: boolean): Notifications.NotificationPermissionsStatus {
  return { granted, canAskAgain, expires: 'never', status: granted ? Notifications.PermissionStatus.GRANTED : Notifications.PermissionStatus.DENIED };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('expo notifier', () => {
  it('maps the permission status', async () => {
    mocked.getPermissionsAsync.mockResolvedValueOnce(status(true, true));
    expect(await expoNotifier.permission()).toBe('granted');
    mocked.getPermissionsAsync.mockResolvedValueOnce(status(false, true));
    expect(await expoNotifier.permission()).toBe('undetermined');
    mocked.getPermissionsAsync.mockResolvedValueOnce(status(false, false));
    expect(await expoNotifier.permission()).toBe('denied');
  });

  it('asks for permission only when requested', async () => {
    mocked.requestPermissionsAsync.mockResolvedValueOnce(status(true, true));
    expect(await expoNotifier.request('Alerts')).toBe('granted');
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('replaces every scheduled notification with local date triggers', async () => {
    const now = Date.UTC(2026, 10, 25, 12);
    await expoNotifier.replaceAll(
      [
        { id: 'digest:2026-11-26', at: now + 3_600_000, title: 'Morning digest', body: 'No data' },
        { id: 'sync:1', at: now - 1, title: 'Sync failed', body: 'Try again' },
      ],
      'Alerts',
      now,
    );
    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const [first, second] = mocked.scheduleNotificationAsync.mock.calls.map((call) => call[0]);
    expect(first).toMatchObject({ identifier: 'digest:2026-11-26', content: { title: 'Morning digest', body: 'No data' }, trigger: { type: 'date', date: now + 3_600_000 } });
    expect(second?.identifier).toBe('sync:1');
    expect(second?.trigger === null || (second?.trigger !== undefined && !('type' in second.trigger))).toBe(true);
    expect(mocked.setNotificationHandler).toHaveBeenCalled();
  });
});
