import {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  cancelAllScheduledNotificationsAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
  type NotificationPermissionsStatus,
} from 'expo-notifications';
import { Platform } from 'react-native';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface ScheduledText {
  id: string;
  at: number;
  title: string;
  body: string;
}

export interface Notifier {
  permission(): Promise<PermissionState>;
  request(channelName: string): Promise<PermissionState>;
  replaceAll(items: readonly ScheduledText[], channelName: string, now: number): Promise<void>;
  cancelAll(): Promise<void>;
  onReceived(listener: () => void): () => void;
  onOpened(listener: () => void): () => void;
}

const CHANNEL_ID = 'openhoop-alerts';

function toState(status: NotificationPermissionsStatus): PermissionState {
  if (status.granted) return 'granted';
  const ios = status.ios?.status;
  if (ios !== undefined && ios >= 2) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

async function ensureChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await setNotificationChannelAsync(CHANNEL_ID, { name, importance: AndroidImportance.DEFAULT, showBadge: true });
}

let handlerSet = false;

function ensureHandler(): void {
  if (handlerSet) return;
  handlerSet = true;
  setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export const expoNotifier: Notifier = {
  async permission() {
    return toState(await getPermissionsAsync());
  },
  async request(channelName) {
    await ensureChannel(channelName);
    return toState(await requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } }));
  },
  async replaceAll(items, channelName, now) {
    ensureHandler();
    await ensureChannel(channelName);
    await cancelAllScheduledNotificationsAsync();
    for (const item of items) {
      await scheduleNotificationAsync({
        identifier: item.id,
        content: { title: item.title, body: item.body },
        trigger: item.at <= now ? (Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null) : { type: SchedulableTriggerInputTypes.DATE, date: item.at, channelId: CHANNEL_ID },
      });
    }
  },
  async cancelAll() {
    await cancelAllScheduledNotificationsAsync();
  },
  onReceived(listener) {
    ensureHandler();
    const subscription = addNotificationReceivedListener(() => listener());
    return () => subscription.remove();
  },
  onOpened(listener) {
    const subscription = addNotificationResponseReceivedListener(() => listener());
    return () => subscription.remove();
  },
};
